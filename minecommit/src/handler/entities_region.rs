use anyhow::{Context, Result};
use simdnbt::owned::{NbtCompound, NbtList, NbtTag};
use std::io::Cursor;

use super::Handler;
use crate::odb::{OdbReader, OdbWriter};
use crate::utils::nbt::{load_nbt, sort_nbt};
use crate::utils::region::{parse_xz, read_region, write_region};

const FLATTEN_PATTERNS: &[&str] = &["**/entities/r.*.*.mca"];

const UNFLATTEN_PATTERNS: &[&str] = &["**/entities/r.*.*.mca/timestamp-header"];

/// Promote each entity's `Motion`, `Pos`, `Rotation` fields to top-level
/// flattened arrays `Motions` (double[n*3]), `Pos` (double[n*3]),
/// `Rotation` (float[n*2]), and remove them from the individual entities.
fn promote_entity_fields(nbt: &mut NbtCompound) -> Result<()> {
    let (motions, positions, rotations) = {
        let entities = nbt
            .list("Entities")
            .and_then(|l| l.compounds())
            .ok_or_else(|| anyhow::anyhow!("'Entities' list not found in chunk"))?;
        let n = entities.len();
        let mut motions = Vec::with_capacity(n * 3);
        let mut positions = Vec::with_capacity(n * 3);
        let mut rotations = Vec::with_capacity(n * 2);
        for (i, entity) in entities.iter().enumerate() {
            let m = entity
                .list("Motion")
                .and_then(|l| l.doubles())
                .ok_or_else(|| anyhow::anyhow!("'Entities.{i}' missing Motion field"))?;
            anyhow::ensure!(m.len() == 3, "'Entities.{i}.Motion' length is not 3");
            motions.extend(m);
            let p = entity
                .list("Pos")
                .and_then(|l| l.doubles())
                .ok_or_else(|| anyhow::anyhow!("Entity missing Pos field"))?;
            anyhow::ensure!(p.len() == 3, "'Entities.{i}.Pos' length is not 3");
            positions.extend(p);
            let r = entity
                .list("Rotation")
                .and_then(|l| l.floats())
                .ok_or_else(|| anyhow::anyhow!("Entity missing Rotation field"))?;
            anyhow::ensure!(r.len() == 2, "'Entities.{i}.Rotation' length is not 2");
            rotations.extend(r);
        }
        (motions, positions, rotations)
    };
    // Remove original fields from each entity
    if let Some(NbtList::Compound(entities)) = nbt.list_mut("Entities") {
        for entity in entities {
            entity.remove("Motion");
            entity.remove("Pos");
            entity.remove("Rotation");
        }
    }
    // Insert flattened arrays at top level
    nbt.insert("Motions", NbtTag::List(NbtList::Double(motions)));
    nbt.insert("Pos", NbtTag::List(NbtList::Double(positions)));
    nbt.insert("Rotation", NbtTag::List(NbtList::Float(rotations)));
    Ok(())
}

/// Reverse of `promote_entity_fields`: take top-level `Motions`, `Pos`,
/// `Rotation` flattened arrays and redistribute them back into each entity's
/// `Motion` (double[3]), `Pos` (double[3]), `Rotation` (float[2]) fields,
/// and remove the flattened arrays from the top level.
/// If the flattened fields are absent (e.g. data was not promoted by an older
/// version), this is a no-op.
fn demote_entity_fields(nbt: &mut NbtCompound) -> Result<()> {
    // Check if promoted fields exist; if not, nothing to do
    let (motions, positions, rotations) = match (
        nbt.remove("Motions")
            .and_then(|t| t.into_list())
            .and_then(|l| l.into_doubles()),
        nbt.remove("Pos")
            .and_then(|t| t.into_list())
            .and_then(|l| l.into_doubles()),
        nbt.remove("Rotation")
            .and_then(|t| t.into_list())
            .and_then(|l| l.into_floats()),
    ) {
        (Some(m), Some(p), Some(r)) => (m, p, r),
        _ => return Ok(()),
    };

    let entities = match nbt.list_mut("Entities") {
        Some(NbtList::Compound(compounds)) => compounds,
        _ => return Err(anyhow::anyhow!("Entities list not found in chunk")),
    };

    let n = entities.len();
    anyhow::ensure!(
        motions.len() == n * 3,
        "Motions length {} does not match {} entities * 3",
        motions.len(),
        n
    );
    anyhow::ensure!(
        positions.len() == n * 3,
        "Pos length {} does not match {} entities * 3",
        positions.len(),
        n
    );
    anyhow::ensure!(
        rotations.len() == n * 2,
        "Rotation length {} does not match {} entities * 2",
        rotations.len(),
        n
    );

    for (i, entity) in entities.iter_mut().enumerate() {
        let m = Vec::from(&motions[i * 3..i * 3 + 3]);
        entity.insert("Motion", NbtTag::List(NbtList::Double(m)));
        let p = Vec::from(&positions[i * 3..i * 3 + 3]);
        entity.insert("Pos", NbtTag::List(NbtList::Double(p)));
        let r = Vec::from(&rotations[i * 2..i * 2 + 2]);
        entity.insert("Rotation", NbtTag::List(NbtList::Float(r)));
    }

    Ok(())
}

/// Sort the `attributes` list within each entity in the `Entities` field by the `id` string field.
/// Called after `sort_nbt` (which handles key ordering and general recursion), so this function
/// does NOT re-sort keys.
fn sort_entity_attributes_by_id(nbt: &mut NbtCompound) {
    if let Some(NbtList::Compound(entities)) = nbt.list_mut("Entities") {
        for entity in entities {
            if let Some(NbtList::Compound(attributes)) = entity.list_mut("attributes") {
                attributes.sort_by(|a, b| {
                    a.string("id")
                        .map(|s| s.as_bytes())
                        .cmp(&b.string("id").map(|s| s.as_bytes()))
                });
            }
        }
    }
}

pub(crate) struct EntitiesRegionHandler;

impl Handler for EntitiesRegionHandler {
    fn workspace(&self) -> &'static str {
        "entities-region"
    }

    fn flatten(self, save: &impl OdbReader, storage: &mut impl OdbWriter) -> Result<Vec<String>> {
        let mut processed = Vec::new();
        for pattern in FLATTEN_PATTERNS {
            for key in save.glob(pattern)? {
                log::info!("Process entities region file {key}");
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
                storage.put(&format!("{key}/timestamp-header"), &timestamp_header)?;

                // Parse and sort all chunk NBTs
                let mut result: Vec<(i32, i32, NbtCompound)> = chunks
                    .into_iter()
                    .map(|(chunk_x, chunk_z, raw_bytes)| {
                        let mut nbt = load_nbt(Cursor::new(&raw_bytes))
                            .context("failed to load chunk nbt")?
                            .as_compound();
                        promote_entity_fields(&mut nbt)?;
                        sort_entity_attributes_by_id(&mut nbt);
                        Ok((chunk_x, chunk_z, nbt))
                    })
                    .collect::<Result<Vec<_>>>()?;

                // Sort by (cz, cx) for deterministic ordering
                result
                    .sort_unstable_by(|(cx1, cz1, ..), (cx2, cz2, ..)| (cz1, cx1).cmp(&(cz2, cx2)));

                // Build and write entities.nbt (all chunk NBTs in one compound)
                {
                    let mut entities_compound = NbtCompound::new();
                    for (chunk_x, chunk_z, nbt) in &mut result {
                        let key_str = format!("c.{}.{}", chunk_x, chunk_z);
                        entities_compound.insert(
                            key_str,
                            NbtTag::Compound(std::mem::replace(nbt, NbtCompound::default())),
                        );
                    }
                    let entities_nbt = simdnbt::owned::BaseNbt::new("", entities_compound);
                    let entities_nbt = sort_nbt(entities_nbt);
                    let mut entities_buf = Vec::new();
                    entities_nbt.write(&mut entities_buf);
                    storage.put(&format!("{key}/entities.nbt"), &entities_buf)?;
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
                log::info!("Process entities region file (timestamp header) {ts_key}");
                let Some(region_key) = ts_key.strip_suffix("/timestamp-header") else {
                    continue;
                };
                let filename = region_key.split('/').next_back().unwrap_or("");
                let (region_x, region_z) = parse_xz(filename)
                    .with_context(|| format!("failed to parse region coordinates from {ts_key}"))?;
                let timestamp_header = storage.get(&ts_key)?;

                // Read entities.nbt (all chunk NBTs in one compound)
                let entities_key = format!("{region_key}/entities.nbt");
                let entities_data = storage
                    .get(&entities_key)
                    .with_context(|| format!("failed to read {entities_key}"))?;
                let entities_nbt = load_nbt(std::io::Cursor::new(&entities_data))
                    .context("failed to load entities nbt")?;
                let mut entities_compound = entities_nbt.as_compound();

                // Extract coordinates from compound keys
                let mut coords: Vec<(i32, i32)> = entities_compound
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

                // Reconstruct chunks from compound
                let mut chunks = Vec::new();
                for (chunk_x, chunk_z) in coords {
                    let key_str = format!("c.{}.{}", chunk_x, chunk_z);
                    let nbt_tag = entities_compound
                        .remove(&key_str)
                        .ok_or_else(|| anyhow::anyhow!("missing '{}' in entities nbt", key_str))?;
                    let mut nbt_compound = nbt_tag
                        .into_compound()
                        .ok_or_else(|| anyhow::anyhow!("expect '{}' is NBT Compound", key_str))?;
                    demote_entity_fields(&mut nbt_compound)?;
                    let mut buf = Vec::new();
                    simdnbt::owned::BaseNbt::new("", nbt_compound).write(&mut buf);
                    chunks.push((chunk_x, chunk_z, buf));
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
                .with_context(|| format!("failed to write region for {ts_key}"))?;
                save.put(region_key, &mca_buf)?;

                processed.push(ts_key);
                processed.push(entities_key);
            }
        }
        Ok(processed)
    }
}
