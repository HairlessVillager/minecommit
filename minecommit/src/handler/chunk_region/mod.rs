mod mapping;
mod nbt;
mod palette;

use anyhow::{Context, Result};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use simdnbt::borrow::read;
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

pub(crate) struct ChunkRegionHandler;

impl ChunkRegionHandler {
    fn build_mapping(save: &impl OdbReader) {
        todo!()
    }
}

impl Handler for ChunkRegionHandler {
    fn flatten(self, save: &impl OdbReader, storage: &mut impl OdbWriter) -> Result<()> {
        let mapping = MinecraftDataMapping;
        for pattern in FLATTEN_PATTERNS {
            for key in save.glob(pattern)? {
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
                    continue;
                };
                storage.put(&format!("{key}/timestamp-header"), &timestamp_header)?;

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
            }
        }
        Ok(())
    }

    fn unflatten(self, save: &mut impl OdbWriter, storage: &impl OdbReader) -> Result<()> {
        let mapping = MinecraftDataMapping;
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
            }
        }
        Ok(())
    }
}
