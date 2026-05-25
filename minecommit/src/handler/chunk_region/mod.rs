mod mapping;
mod nbt;
mod palette;

use anyhow::{Context, Result};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use simdnbt::borrow::read;
use simdnbt::owned;
use simdnbt::{Deserialize, Serialize};
use std::io::Cursor;

use super::Handler;
use crate::odb::{OdbReader, OdbWriter};
use crate::utils::nbt::{dump_nbt, load_nbt, sort_nbt};
use crate::utils::region::{parse_xz, read_region, write_region};

use mapping::MinecraftDataMapping;
use nbt::{SectionsDump, restore_chunk, split_chunk};

const FLATTEN_PATTERNS: &[&str] = &["**/region/r.*.*.mca"];
const UNFLATTEN_PATTERNS: &[&str] = &["**/region/r.*.*.mca/timestamp-header"]; // timestamp-header is sentry
const BIOMES_MAPPING_PATTERN: &str = "minecommit/mapping/biome";
const BLOCK_STATES_MAPPING_PATTERN: &str = "minecommit/mapping/block_states";

pub(crate) struct ChunkRegionHandler;

impl Handler for ChunkRegionHandler {
    fn flatten(self, save: &impl OdbReader, storage: &mut impl OdbWriter) -> Result<Vec<String>> {
        let mut mapping = if let Ok(biomes) = storage.get(BIOMES_MAPPING_PATTERN)
            && let Ok(block_states) = storage.get(BLOCK_STATES_MAPPING_PATTERN)
        {
            let biomes_nbt = owned::read(&mut Cursor::new(&biomes))?;
            let block_states_nbt = owned::read(&mut Cursor::new(&block_states))?;
            MinecraftDataMapping::from_nbt(biomes_nbt.unwrap(), block_states_nbt.unwrap())
        } else {
            MinecraftDataMapping::default()
        };
        let mut processed = Vec::new();
        for pattern in FLATTEN_PATTERNS {
            for key in save.glob(pattern)? {
                // Parse region file
                log::info!("Process chunk region file {key}");
                let data = save.get(&key)?;
                let filename = key.split('/').next_back().unwrap_or("");
                let (region_x, region_z) = parse_xz(filename)
                    .with_context(|| format!("failed to parse (x,z) from {key}"))
                    .context("failed to parse region coordinates")?;
                let Some((timestamp_header, chunks)) =
                    read_region(Cursor::new(data), region_x, region_z)
                        .with_context(|| format!("failed to read region from {key}"))
                        .context("failed to read region")?
                else {
                    processed.push(key);
                    continue;
                };
                storage.put(&format!("{key}/timestamp-header"), &timestamp_header)?;

                // Populate mapping from all chunks' section palettes before parallel dump
                for (_, _, chunk_nbt) in &chunks {
                    let nbt = load_nbt(Cursor::new(chunk_nbt))?;
                    if nbt.string("Status").map(|s| s.to_string_lossy())
                        != Some("minecraft:full".into())
                    {
                        continue;
                    }
                    if let Some(sections_list) = nbt.list("sections")
                        && let Some(compounds) = sections_list.compounds()
                    {
                        for section in compounds {
                            if let Some(biomes) = section.compound("biomes")
                                && let Some(palette) = biomes.list("palette")
                                && let Some(strings) = palette.strings()
                            {
                                for entry in strings {
                                    mapping.register_biome(&entry.to_str());
                                }
                            }
                            if let Some(block_states) = section.compound("block_states")
                                && let Some(palette) = block_states.list("palette")
                                && let Some(compounds) = palette.compounds()
                            {
                                for entry in compounds {
                                    let block_name = entry
                                        .string("Name")
                                        .map(|s| s.to_string())
                                        .unwrap_or_default();
                                    if let Some(props) = entry.compound("Properties") {
                                        let props_vec: Vec<(String, String)> = props
                                            .iter()
                                            .map(|(k, v)| {
                                                (
                                                    k.to_string(),
                                                    v.string()
                                                        .map(|s| s.to_string())
                                                        .unwrap_or_default(),
                                                )
                                            })
                                            .collect();
                                        let props_refs: Vec<(&str, &str)> = props_vec
                                            .iter()
                                            .map(|(k, v)| (k.as_str(), v.as_str()))
                                            .collect();
                                        mapping.register_block_state(&block_name, &props_refs);
                                    } else {
                                        mapping.register_block_state(&block_name, &[]);
                                    }
                                }
                            }
                        }
                    }
                }

                // Build objects
                let result = chunks
                    .into_par_iter()
                    .map(|(chunk_x, chunk_z, nbt)| {
                        let other_size = nbt.len();
                        let nbt =
                            load_nbt(Cursor::new(&nbt)).context("failed to load chunk nbt")?;
                        if nbt
                            .string("Status")
                            .context("missing 'Status' field in chunk nbt")?
                            .to_string_lossy()
                            != "minecraft:full"
                        {
                            return Ok(None);
                        }
                        let (other, sections) = split_chunk(&mapping, nbt).with_context(|| {
                            format!("failed to process chunk ({chunk_x}, {chunk_z}) at file {key}")
                        })?;
                        let other_dump = dump_nbt(sort_nbt(other), other_size)?;
                        let mut sections_dump = Vec::with_capacity(200 * 1024);
                        sections.to_nbt().write(&mut sections_dump);
                        Ok(Some((chunk_x, chunk_z, other_dump, sections_dump)))
                    })
                    .collect::<Result<Vec<_>>>()
                    .context("failed to process chunks")?
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>();

                // Write objects
                storage.put_par(
                    result
                        .iter()
                        .flat_map(|(chunk_x, chunk_z, other, dump)| {
                            [
                                (
                                    format!("{key}/other/c.{chunk_x}.{chunk_z}.nbt"),
                                    other.as_ref(),
                                ),
                                (
                                    format!("{key}/sections/c.{chunk_x}.{chunk_z}.dump"),
                                    dump.as_slice(),
                                ),
                            ]
                        })
                        .collect::<Vec<_>>(),
                )?;

                processed.push(key);
            }
        }

        // Write mappings to storage
        let (biomes_nbt, block_states_nbt) = mapping.to_nbt();
        let biomes_dump = dump_nbt(biomes_nbt, 64 * 1024)?;
        let block_states_dump = dump_nbt(block_states_nbt, 64 * 1024)?;
        storage.put(BIOMES_MAPPING_PATTERN, &biomes_dump)?;
        storage.put(BLOCK_STATES_MAPPING_PATTERN, &block_states_dump)?;

        Ok(processed)
    }

    fn unflatten(self, save: &mut impl OdbWriter, storage: &impl OdbReader) -> Result<Vec<String>> {
        let mapping = if let Ok(biomes) = storage.get(BIOMES_MAPPING_PATTERN)
            && let Ok(block_states) = storage.get(BLOCK_STATES_MAPPING_PATTERN)
        {
            let biomes_nbt = owned::read(&mut Cursor::new(&biomes))?;
            let block_states_nbt = owned::read(&mut Cursor::new(&block_states))?;
            MinecraftDataMapping::from_nbt(biomes_nbt.unwrap(), block_states_nbt.unwrap())
        } else {
            MinecraftDataMapping::default()
        };
        let mut processed = Vec::new();
        for pattern in UNFLATTEN_PATTERNS {
            for ts_key in storage.glob(pattern)? {
                log::info!("Process chunk region file (timestamp header) {ts_key}");
                let Some(region_key) = ts_key.strip_suffix("/timestamp-header") else {
                    continue;
                };
                let filename = region_key.split('/').next_back().unwrap_or("");
                let (region_x, region_z) = parse_xz(filename)
                    .with_context(|| format!("failed to parse (x,z) from {ts_key}"))
                    .context("failed to parse region coordinates")?;
                let timestamp_header = storage.get(&ts_key)?;

                let other_pattern = format!("{region_key}/other/c.*.*.nbt");

                let other_keys: Vec<String> = storage.glob(&other_pattern)?;
                let coords: Vec<(i32, i32)> = other_keys
                    .iter()
                    .map(|k| {
                        parse_xz(k.split('/').next_back().unwrap_or(""))
                            .with_context(|| format!("failed to parse (x,z) from {k}"))
                    })
                    .collect::<Result<_>>()
                    .context("failed to parse chunk coordinates")?;
                let dump_keys: Vec<String> = coords
                    .iter()
                    .map(|(cx, cz)| format!("{region_key}/sections/c.{cx}.{cz}.dump"))
                    .collect();

                let all_keys: Vec<&str> = other_keys
                    .iter()
                    .map(|s| s.as_str())
                    .chain(dump_keys.iter().map(|s| s.as_str()))
                    .collect();
                let mut all_data = storage.get_par(&all_keys)?;
                let dump_data = all_data.split_off(other_keys.len());
                let nbt_data = all_data;

                let tasks: Vec<(i32, i32, Vec<u8>, Vec<u8>)> = coords
                    .into_iter()
                    .zip(nbt_data)
                    .zip(dump_data)
                    .map(|(((cx, cz), nbt), dump)| (cx, cz, nbt, dump))
                    .collect();

                let chunks = tasks
                    .into_par_iter()
                    .map(|(chunk_x, chunk_z, nbt_data, dump_data)| {
                        use simdnbt::borrow::Nbt;

                        let other =
                            load_nbt(Cursor::new(&nbt_data)).context("failed to load other nbt")?;
                        let Nbt::Some(nbt) = read(&mut Cursor::new(dump_data.as_slice()))
                            .context("failed to read sections dump as nbt")?
                        else {
                            anyhow::bail!("sections dump is empty");
                        };
                        let sections_dump: SectionsDump = SectionsDump::from_nbt(&nbt)
                            .context("failed to deserialize sections dump")?;
                        let nbt = dump_nbt(
                            restore_chunk(&mapping, other, sections_dump)
                                .with_context(|| format!("failed to restore chunk for {ts_key}"))
                                .context("failed to restore chunk")?,
                            300 * 1024, // 300 KiB
                        )
                        .context("failed to dump other nbt")?;
                        Ok((chunk_x, chunk_z, nbt))
                    })
                    .collect::<Result<Vec<_>>>()?;

                let mut mca_buf = Vec::with_capacity(8 * 1024 * 1024); // 8MiB
                write_region(
                    region_x,
                    region_z,
                    &timestamp_header[..4096]
                        .try_into()
                        .context("timestamp header must be at least 4096 bytes")?,
                    chunks,
                    Cursor::new(&mut mca_buf),
                )
                .with_context(|| format!("failed to write region for {ts_key}"))
                .context("failed to write region")?;
                save.put(region_key, &mca_buf)?;

                processed.push(ts_key.to_owned());
                processed.extend(dump_keys);
                processed.extend(other_keys);
            }
        }
        Ok(processed)
    }
}
