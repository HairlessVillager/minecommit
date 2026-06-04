mod nbt;
mod palette;

use anyhow::{Context, Result};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};
use simdnbt::borrow::read;
use simdnbt::owned::{BaseNbt, NbtCompound};
use simdnbt::{Deserialize, Serialize};
use std::io::Cursor;

use super::Handler;
use crate::odb::{OdbReader, OdbWriter};
use crate::utils::nbt::{dump_nbt, load_nbt, sort_nbt};
use crate::utils::region::{parse_xz, read_region, write_region};

use nbt::{SectionsDump, restore_chunk, split_chunk};

const FLATTEN_PATTERNS: &[&str] = &["**/region/r.*.*.mca"];
const UNFLATTEN_PATTERNS: &[&str] = &["**/region/r.*.*.mca/timestamps"]; // timestamps is sentry

pub(crate) struct ChunkRegionHandler;

impl Handler for ChunkRegionHandler {
    fn workspace(&self) -> &'static str {
        "chunk-region"
    }

    fn flatten(self, save: &impl OdbReader, storage: &mut impl OdbWriter) -> Result<Vec<String>> {
        let mut processed = Vec::new();
        for pattern in FLATTEN_PATTERNS {
            for key in save.glob(pattern)? {
                // Parse region file
                log::info!("Process chunk region file {key}");
                let data = save.get(&key)?;
                let filename = key.split('/').next_back().unwrap_or("");
                let (region_x, region_z) = parse_xz(filename)
                    .with_context(|| format!("failed to parse region coordinates from {key}"))?;
                let Some((timestamp_header, chunks)) =
                    read_region(Cursor::new(data), region_x, region_z)
                        .with_context(|| format!("failed to read region from {key}"))?
                else {
                    processed.push(key);
                    continue;
                };
                // Each section carries its own local palette, so chunks can be
                // processed independently in parallel without a global mapping pass.
                let mut result = chunks
                    .into_par_iter()
                    .map(|(chunk_x, chunk_z, nbt)| {
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
                        let (other, sections) = split_chunk(nbt).with_context(|| {
                            format!("failed to process chunk ({chunk_x}, {chunk_z}) at file {key}")
                        })?;

                        // Extract InhabitedTime and LastUpdate from other (will store in timestamps)
                        let name = other.name().to_owned();
                        let mut other_compound = other.as_compound();
                        let inhabited_time = other_compound
                            .remove("InhabitedTime")
                            .and_then(simdnbt::owned::NbtTag::into_long)
                            .context("missing 'InhabitedTime' field")?;
                        let last_update = other_compound
                            .remove("LastUpdate")
                            .and_then(simdnbt::owned::NbtTag::into_long)
                            .context("missing 'LastUpdate' field")?;
                        let other = simdnbt::owned::BaseNbt::new(name, other_compound);

                        let other = sort_nbt(other);
                        let mut sections_dump = Vec::with_capacity(200 * 1024);
                        sections.to_nbt().write(&mut sections_dump);
                        Ok(Some((
                            chunk_x,
                            chunk_z,
                            other,
                            sections_dump,
                            inhabited_time,
                            last_update,
                        )))
                    })
                    .collect::<Result<Vec<_>>>()
                    .context("failed to process chunks")?
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>();

                // Sort by (cz, cx) for deterministic ordering matching unflatten glob order
                result
                    .sort_unstable_by(|(cx1, cz1, ..), (cx2, cz2, ..)| (cz1, cx1).cmp(&(cz2, cx2)));

                // Build timestamps NBT with header byte array + InhabitedTime/LastUpdate long arrays
                {
                    let mut header_compound = simdnbt::owned::NbtCompound::new();
                    header_compound.insert(
                        "TimestampHeader",
                        simdnbt::owned::NbtTag::ByteArray(timestamp_header.to_vec()),
                    );
                    header_compound.insert(
                        "InhabitedTime",
                        simdnbt::owned::NbtTag::LongArray(
                            result.iter().map(|(_, _, _, _, it, _)| *it).collect(),
                        ),
                    );
                    header_compound.insert(
                        "LastUpdate",
                        simdnbt::owned::NbtTag::LongArray(
                            result.iter().map(|(_, _, _, _, _, lu)| *lu).collect(),
                        ),
                    );
                    let header_nbt = simdnbt::owned::BaseNbt::new("", header_compound);
                    let mut header_buf = Vec::with_capacity(4096 + 100);
                    header_nbt.write(&mut header_buf);
                    storage.put(&format!("{key}/timestamps"), &header_buf)?;
                }

                // Build and write others.nbt (all other NBTs in one compound)
                {
                    let mut others_compound = simdnbt::owned::NbtCompound::new();
                    for (chunk_x, chunk_z, other, _, _, _) in &mut result {
                        let key_str = format!("c.{}.{}", chunk_x, chunk_z);
                        others_compound.insert(
                            key_str,
                            simdnbt::owned::NbtTag::Compound(
                                std::mem::replace(other, BaseNbt::default()).as_compound(),
                            ),
                        );
                    }
                    let others_nbt = simdnbt::owned::BaseNbt::new("", others_compound);
                    let mut others_buf = Vec::new();
                    others_nbt.write(&mut others_buf);
                    storage.put(&format!("{key}/others.nbt"), &others_buf)?;
                }

                // Write individual sections dumps
                storage.put_par(
                    result
                        .iter()
                        .map(|(chunk_x, chunk_z, _, dump, ..)| {
                            (
                                format!("{key}/sections/c.{chunk_x}.{chunk_z}.dump"),
                                dump.as_slice(),
                            )
                        })
                        .collect::<Vec<_>>(),
                )?;

                processed.push(key);
            }
        }

        Ok(processed)
    }

    fn unflatten(self, save: &mut impl OdbWriter, storage: &impl OdbReader) -> Result<Vec<String>> {
        let mut processed = Vec::new();
        for pattern in UNFLATTEN_PATTERNS {
            for ts_key in storage.glob(pattern)? {
                log::info!("Process chunk region file (timestamps) {ts_key}");
                let Some(region_key) = ts_key.strip_suffix("/timestamps") else {
                    continue;
                };
                let filename = region_key.split('/').next_back().unwrap_or("");
                let (region_x, region_z) = parse_xz(filename)
                    .with_context(|| format!("failed to parse region coordinates from {ts_key}"))?;
                let ts_data = storage.get(&ts_key)?;
                let ts_nbt = load_nbt(std::io::Cursor::new(&ts_data))
                    .context("failed to load timestamp header nbt")?;
                let ts_compound = ts_nbt.as_compound();
                let timestamp_header: [u8; 4096] = ts_compound
                    .byte_array("TimestampHeader")
                    .context("missing 'TimestampHeader' in timestamp nbt")?
                    .try_into()
                    .context("timestamp header must be exactly 4096 bytes")?;
                let inhabited_times: Vec<i64> = ts_compound
                    .long_array("InhabitedTime")
                    .context("missing 'InhabitedTime' in timestamp nbt")?
                    .to_vec();
                let last_updates: Vec<i64> = ts_compound
                    .long_array("LastUpdate")
                    .context("missing 'LastUpdate' in timestamp nbt")?
                    .to_vec();

                // Read others.nbt (all other NBTs in one compound)
                let others_key = format!("{region_key}/others.nbt");
                let others_data = storage
                    .get(&others_key)
                    .with_context(|| format!("failed to read {others_key}"))?;
                let others_nbt = load_nbt(std::io::Cursor::new(&others_data))
                    .context("failed to load others nbt")?;
                let mut others_compound = others_nbt.as_compound();

                // Extract coordinates from compound keys
                let mut coords: Vec<(i32, i32)> = others_compound
                    .keys()
                    .filter_map(|key| {
                        let s = key.to_str();
                        s.strip_prefix("c.").and_then(|rest| {
                            let (x_str, z_str) = rest.split_once('.')?;
                            let x = x_str.parse::<i32>().ok()?;
                            let z = z_str.parse::<i32>().ok()?;
                            Some((x, z))
                        })
                    })
                    .collect();
                coords.sort_unstable_by(|(x1, z1), (x2, z2)| (z1, x1).cmp(&(z2, x2)));

                let dump_keys: Vec<String> = coords
                    .iter()
                    .map(|(cx, cz)| format!("{region_key}/sections/c.{cx}.{cz}.dump"))
                    .collect();

                let dump_data =
                    storage.get_par(&dump_keys.iter().map(|s| s.as_str()).collect::<Vec<_>>())?;

                // Build tasks: pair dump data with other data from compound
                let mut tasks: Vec<(i32, i32, NbtCompound, Vec<u8>)> = coords
                    .into_iter()
                    .zip(dump_data)
                    .map(|((cx, cz), dump)| {
                        let coord_key = format!("c.{}.{}", cx, cz);
                        let other = others_compound
                            .remove(&coord_key)
                            .ok_or_else(|| anyhow::anyhow!("missing '{}' in other", coord_key))?
                            .into_compound()
                            .ok_or_else(|| {
                                anyhow::anyhow!("expect '{}' is NBT Compound", coord_key)
                            })?;
                        Ok((cx, cz, other, dump))
                    })
                    .collect::<Result<Vec<_>>>()
                    .context("failed to build tasks")?;

                // Sort by (cz, cx) to match flatten order for InhabitedTime/LastUpdate indexing
                tasks
                    .sort_unstable_by(|(cx1, cz1, ..), (cx2, cz2, ..)| (cz1, cx1).cmp(&(cz2, cx2)));

                let chunks = tasks
                    .into_par_iter()
                    .enumerate()
                    .map(|(i, (chunk_x, chunk_z, nbt_data, dump_data))| {
                        use simdnbt::borrow::Nbt;

                        // Inject InhabitedTime and LastUpdate back into other
                        let mut compound = nbt_data;
                        compound.insert("InhabitedTime", inhabited_times[i]);
                        compound.insert("LastUpdate", last_updates[i]);
                        let other = simdnbt::owned::BaseNbt::new("", compound);

                        let Nbt::Some(nbt) = read(&mut Cursor::new(dump_data.as_slice()))
                            .context("failed to read sections dump as nbt")?
                        else {
                            anyhow::bail!("sections dump is empty");
                        };
                        let sections_dump: SectionsDump = SectionsDump::from_nbt(&nbt)
                            .context("failed to deserialize sections dump")?;
                        let nbt = dump_nbt(
                            restore_chunk(other, sections_dump)
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
                    &timestamp_header,
                    chunks,
                    Cursor::new(&mut mca_buf),
                )
                .with_context(|| format!("failed to write region for {ts_key}"))?;
                save.put(region_key, &mca_buf)?;

                processed.push(ts_key.to_owned());
                processed.push(others_key);
                processed.extend(dump_keys);
            }
        }
        Ok(processed)
    }
}
