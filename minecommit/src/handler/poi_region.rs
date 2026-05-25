use anyhow::{Context, Result};
use std::io::Cursor;

use super::Handler;
use crate::odb::{OdbReader, OdbWriter};
use crate::utils::nbt::{dump_nbt, load_nbt, sort_nbt};
use crate::utils::region::{parse_xz, read_region, write_region};

const FLATTEN_PATTERNS: &[&str] = &["**/poi/r.*.*.mca"];

const UNFLATTEN_PATTERNS: &[&str] = &["**/poi/r.*.*.mca/timestamp-header"];

pub(crate) struct PoiRegionHandler;

impl Handler for PoiRegionHandler {
    fn flatten(self, save: &impl OdbReader, storage: &mut impl OdbWriter) -> Result<Vec<String>> {
        let mut processed = Vec::new();
        for pattern in FLATTEN_PATTERNS {
            for key in save.glob(pattern)? {
                log::info!("Process poi region file {key}");
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
                for (chunk_x, chunk_z, raw_bytes) in chunks {
                    let nbt = {
                        let size = raw_bytes.len();
                        let raw_nbt = load_nbt(Cursor::new(&raw_bytes))
                            .context("failed to load chunk nbt")?;
                        let sorted_nbt = sort_nbt(raw_nbt);
                        let sorted_bytes =
                            dump_nbt(sorted_nbt, size).context("failed to dump chunk nbt")?;
                        debug_assert_eq!(
                            size,
                            sorted_bytes.len(),
                            "raw nbt length should equal to sorted"
                        );
                        sorted_bytes
                    };
                    storage.put(&format!("{key}/c.{chunk_x}.{chunk_z}.nbt"), &nbt)?;
                }
                processed.push(key);
            }
        }
        Ok(processed)
    }

    fn unflatten(self, save: &mut impl OdbWriter, storage: &impl OdbReader) -> Result<Vec<String>> {
        let mut processed = Vec::new();
        for pattern in UNFLATTEN_PATTERNS {
            for ts_key in storage.glob(pattern)? {
                log::info!("Process poi region file (timestamp header) {ts_key}");
                let Some(region_key) = ts_key.strip_suffix("/timestamp-header") else {
                    continue;
                };
                let filename = region_key.split('/').next_back().unwrap_or("");
                let (region_x, region_z) = parse_xz(filename)
                    .with_context(|| format!("failed to parse (x,z) from {ts_key}"))
                    .context("failed to parse region coordinates")?;
                let timestamp_header = storage.get(&ts_key)?;
                let chunk_pattern = format!("{region_key}/c.*.*.nbt");
                let mut chunks = Vec::new();
                for chunk_key in storage.glob(&chunk_pattern)? {
                    let chunk_filename = chunk_key.split('/').next_back().unwrap_or("");
                    let (chunk_x, chunk_z) = parse_xz(chunk_filename)
                        .with_context(|| format!("failed to parse (x,z) from {chunk_filename}"))
                        .context("failed to parse chunk coordinates")?;
                    let nbt = storage.get(&chunk_key)?;
                    chunks.push((chunk_x, chunk_z, nbt));
                    processed.push(chunk_key);
                }
                let mut mca_buf = Vec::with_capacity(200 * 1024); // 200KiB
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

                processed.push(ts_key);
            }
        }
        Ok(processed)
    }
}
