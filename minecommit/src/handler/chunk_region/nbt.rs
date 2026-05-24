use anyhow::{Context, Result};
use simdnbt::borrow;
use simdnbt::owned::{self, BaseNbt, NbtCompound, NbtList};
use simdnbt::{Deserialize, Serialize};

use super::mapping::MinecraftDataMapping;
use super::palette::{dump_biome, dump_block, load_biome, load_block};

pub fn split_chunk(
    mapping: &MinecraftDataMapping,
    nbt: BaseNbt,
) -> Result<(BaseNbt, SectionsDump)> {
    let name = nbt.name().to_owned();
    let mut nbt = nbt.as_compound();
    let sections_dump = {
        let sections = nbt.remove("sections").ok_or_else(|| {
            anyhow::anyhow!(format!(
                "missing 'sections', all fields: {:#?}",
                nbt.keys().collect::<Vec<_>>()
            ))
        })?;
        let sections = sections
            .list()
            .ok_or(anyhow::anyhow!("expect sections is a NBT list"))?;
        dump_sections(mapping, sections)?
    };

    // TODO: extract block/sky light
    if let Some(is_light_on_idx) = nbt.byte_mut("isLightOn") {
        *is_light_on_idx = i8::from(false);
    } else {
        log::trace!("Missing field 'isLightOn', ignored and will be treated as false by game");
    }

    Ok((BaseNbt::new(name, nbt), sections_dump))
}

pub fn restore_chunk(
    mapping: &MinecraftDataMapping,
    other: BaseNbt,
    dump: SectionsDump,
) -> Result<BaseNbt> {
    let name = other.name().to_owned();
    let mut other = other.as_compound();
    other.insert("sections", load_sections(mapping, dump)?);
    Ok(BaseNbt::new(name, other))
}

fn dump_sections(mapping: &MinecraftDataMapping, sections: &NbtList) -> Result<SectionsDump> {
    let sections = sections
        .compounds()
        .context("expect sections is a NBT compound list, got: {sections:#?}")?;
    let sections_len = sections.len();
    let sections = sections
        .iter()
        .enumerate()
        .map(|(idx, section)| {
            let y = section.byte("Y").with_context(|| {
                format!("missing NBT byte 'sections.{idx}.Y', got: {section:#?}")
            })?;
            let (biome_dump, block_dump) = if let Some(biome) = section.compound("biomes")
                && let Some(block_states) = section.compound("block_states")
            {
                (
                    dump_biome(mapping, biome)?.as_flattened().as_flattened().into(),
                    dump_block(mapping, block_states)?
                        .as_flattened()
                        .as_flattened()
                        .into(),
                )
            } else {
                if idx == 0 || idx == sections_len - 1 {
                    // Some sections extend beyond the world boundary;
                    // they do not contain block and biome data, although they often contain light data.
                    log::trace!(
                        "Missing field 'biomes' or/and 'block_states' in 'sections.{idx}' (y={y}), all fields got: {:?}",
                        section.keys().map(|s|s.to_str()).collect::<Vec<_>>()
                    );
                    return Ok(None);
                } else {
                    anyhow::bail!(
                        "Missing field 'biomes' or/and 'block_states' in 'sections.{idx}' (y={y}), all fields got: {:?}",
                        section.keys().map(|s|s.to_str()).collect::<Vec<_>>()
                    );
                }
            };
            // TODO: extract block/sky light
            Ok(Some(Section {
                y,
                biome: biome_dump,
                block_state: block_dump,
            }))
        })
        .map(|e: Result<Option<Section>>| e.transpose())
        .filter_map(|e| e)
        .collect::<Result<_, _>>()?;
    Ok(SectionsDump { sections })
}

fn load_sections(mapping: &MinecraftDataMapping, dump: SectionsDump) -> Result<NbtList> {
    let list = dump
        .sections
        .into_iter()
        .map(|section| {
            let kvs = vec![
                ("Y".into(), owned::NbtTag::Byte(section.y)),
                (
                    "biomes".into(),
                    owned::NbtTag::Compound(load_biome(
                        mapping,
                        bytemuck::cast_box(
                            Box::<[u8; 64]>::try_from(section.biome.into_boxed_slice())
                                .map_err(|_| anyhow::anyhow!("vec length does not match S^3"))?,
                        ),
                    )?),
                ),
                (
                    "block_states".into(),
                    owned::NbtTag::Compound(load_block(
                        mapping,
                        bytemuck::cast_box(
                            Box::<[u16; 4096]>::try_from(section.block_state.into_boxed_slice())
                                .map_err(|_| anyhow::anyhow!("vec length does not match S^3"))?,
                        ),
                    )?),
                ),
            ];
            Ok(NbtCompound::from_values(kvs))
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(NbtList::from(list))
}

struct Section {
    y: i8,
    biome: Vec<u8>,
    block_state: Vec<u16>,
}

impl simdnbt::Serialize for Section {
    fn to_compound(self) -> simdnbt::owned::NbtCompound {
        let mut nbt = simdnbt::owned::NbtCompound::new();
        if let Some(item) = simdnbt::ToNbtTag::to_optional_nbt_tag(self.y) {
            nbt.insert("y", item);
        }
        nbt.insert("biome", to_nbt_tag_vec_u8(self.biome));
        nbt.insert("block_state", to_nbt_tag_vec_u16(self.block_state));
        nbt
    }
}

impl simdnbt::Deserialize for Section {
    fn from_compound(nbt: simdnbt::borrow::NbtCompound) -> Result<Self, simdnbt::DeserializeError> {
        let value = Self {
            y: simdnbt::FromNbtTag::from_optional_nbt_tag(nbt.get("y"))?.ok_or(
                simdnbt::DeserializeError::MismatchedFieldType("Section::y".to_owned()),
            )?,
            biome: {
                let x = nbt
                    .get("biome")
                    .ok_or(simdnbt::DeserializeError::MissingField)?;
                let x = from_nbt_tag_vec_u8(x).ok_or(
                    simdnbt::DeserializeError::MismatchedFieldType("Section::biome".to_owned()),
                )?;
                Ok(x)
            }?,
            block_state: {
                let x = nbt
                    .get("block_state")
                    .ok_or(simdnbt::DeserializeError::MissingField)?;
                let x = from_nbt_tag_vec_u16(x).ok_or(simdnbt::DeserializeError::MissingField)?;
                Ok(x)
            }?,
        };
        Ok(value)
    }
}

#[derive(Serialize, Deserialize)]
pub struct SectionsDump {
    sections: Vec<Section>,
}

fn to_nbt_tag_vec_u8(data: Vec<u8>) -> owned::NbtTag {
    owned::NbtTag::ByteArray(data)
}

fn from_nbt_tag_vec_u8(tag: borrow::NbtTag) -> Option<Vec<u8>> {
    tag.byte_array().map(|x| x.to_owned())
}

fn to_nbt_tag_vec_u16(data: Vec<u16>) -> owned::NbtTag {
    owned::NbtTag::List(NbtList::from(
        data.into_iter().map(|x| x as i16).collect::<Vec<_>>(),
    ))
}

fn from_nbt_tag_vec_u16(tag: borrow::NbtTag) -> Option<Vec<u16>> {
    Some(
        tag.list()?
            .shorts()?
            .into_iter()
            .map(|x| x as u16)
            .collect::<Vec<_>>(),
    )
}
