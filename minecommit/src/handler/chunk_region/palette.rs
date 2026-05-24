use std::borrow::Cow;

use anyhow::{Context, Result};
use simdnbt::{
    Mutf8String,
    owned::{NbtCompound, NbtList, NbtTag},
};

use super::mapping::MinecraftDataMapping;

type Cube<T, const SIZE: usize> = [[[T; SIZE]; SIZE]; SIZE];

#[inline]
fn fast_count_bits(n: usize) -> usize {
    let m = n.saturating_sub(1); // TODO: use if-branch when adjust perf
    usize::BITS as usize - m.leading_zeros() as usize
}

pub fn dump<T: Copy + Default + Eq, const SIZE: usize>(
    palette_rows: &[u64],
    palette_entries: &[T],
    count_bits: impl Fn(usize) -> usize,
) -> Box<Cube<T, SIZE>> {
    let bits = count_bits(palette_entries.len());
    let chunk_size = 64 / bits;
    let mask = (1u64 << bits) - 1;
    let mut cube = Box::new([[[T::default(); SIZE]; SIZE]; SIZE]); // TODO: use Vec::with_capacity() here

    let flattened_cube = cube.as_flattened_mut().as_flattened_mut();
    for (cube_chunk, row) in flattened_cube.chunks_mut(chunk_size).zip(palette_rows) {
        let mut row = *row;
        for cube_elem in cube_chunk.iter_mut() {
            let palette_index = (row & mask) as usize;
            let palette_entry = palette_entries[palette_index];
            *cube_elem = palette_entry;
            row >>= bits;
        }
    }

    cube
}

pub fn load<T: Copy + Default + Eq, const SIZE: usize>(
    cube: &Cube<T, SIZE>,
    count_bits: impl Fn(usize) -> usize,
) -> (Vec<u64>, Vec<T>) {
    let mut entries = Vec::with_capacity(32);
    let flattened_cube = cube.as_flattened().as_flattened();
    // TODO: linear + hash map hybrid search
    for cube_elem in flattened_cube {
        if !entries.contains(cube_elem) {
            entries.push(*cube_elem);
        }
    }
    let bits = count_bits(entries.len());
    let chunk_size = 64 / bits;
    let mut rows = vec![0u64; (SIZE * SIZE * SIZE).div_ceil(chunk_size)];

    for (cube_chunk, row) in flattened_cube.chunks(chunk_size).zip(rows.iter_mut()) {
        *row = 0;
        for cube_elem in cube_chunk.iter().rev() {
            let palette_index = entries.iter().position(|x| x == cube_elem).unwrap() as u64;
            *row <<= bits;
            *row |= palette_index;
        }
    }

    (rows, entries)
}

pub fn dump_biome(mapping: &MinecraftDataMapping, nbt: &NbtCompound) -> Result<Box<Cube<u8, 4>>> {
    let palette_rows = nbt.long_array("data");
    let palette_entries = nbt
        .list("palette")
        .with_context(|| format!("missing NBT list 'palette', got: {nbt:#?}"))?
        .strings()
        .with_context(|| format!("expect 'palette' is a NBT string list"))?
        .into_iter()
        .map(|entry| {
            let s = entry.to_string_lossy();
            let key = s.strip_prefix("minecraft:").unwrap_or(&s);
            mapping.biome_id_from_name(key)
        })
        .collect::<Result<Vec<_>>>()?;
    let cube = if let Some(rows) = palette_rows {
        dump::<u8, 4>(
            bytemuck::cast_slice(rows),
            &palette_entries,
            fast_count_bits,
        )
    } else {
        bytemuck::allocation::cast_box(Box::new([palette_entries[0]; 64]))
    };
    Ok(cube)
}

pub fn load_biome(mapping: &MinecraftDataMapping, cube: Box<Cube<u8, 4>>) -> Result<NbtCompound> {
    let first = cube[0][0][0];
    let is_homo = cube.iter().flatten().flatten().all(|item| *item == first);
    let kvs = if is_homo {
        let entries = vec![Mutf8String::from_string(format!(
            "minecraft:{}",
            mapping.biome_name_from_id(first)?
        ))];
        vec![("palette".into(), NbtTag::List(NbtList::from(entries)))]
    } else {
        let (rows, entries) = load::<u8, 4>(&cube, fast_count_bits);
        let entries = entries
            .iter()
            .map(|&id| {
                Ok(Mutf8String::from_string(format!(
                    "minecraft:{}",
                    mapping.biome_name_from_id(id)?
                )))
            })
            .collect::<Result<Vec<_>>>()?;
        vec![
            ("data".into(), NbtTag::LongArray(bytemuck::cast_vec(rows))),
            ("palette".into(), NbtTag::List(NbtList::from(entries))),
        ]
    };
    Ok(NbtCompound::from_values(kvs))
}

pub fn dump_block(mapping: &MinecraftDataMapping, nbt: &NbtCompound) -> Result<Box<Cube<u16, 16>>> {
    let palette_rows = nbt.long_array("data");
    let palette_entries = nbt
        .list("palette")
        .with_context(|| format!("missing NBT list 'palette', got: {nbt:#?}"))?
        .compounds()
        .with_context(|| format!("expect 'palette' is a NBT compound list"))?
        .into_iter()
        .enumerate()
        .map(|(idx, entry)| {
            let block_name = entry.string("Name").with_context(|| {
                format!("missing NBT string 'palette.{idx}.Name', got: {entry:#?}")
            })?;
            let name_binding = block_name.to_str();
            let name = name_binding
                .strip_prefix("minecraft:")
                .unwrap_or(name_binding.as_ref());
            if let Some(props) = entry.compound("Properties") {
                let props_map: Vec<(Cow<'_, str>, Cow<'_, str>)> = props
                    .iter()
                    .map(|(k, value)| {
                        let v = value.string().with_context(|| {
                            format!(
                                "expect 'palette.{idx}.Properties.{}' is a NBT string",
                                k.to_str()
                            )
                        })?;
                        Ok((k.to_str(), v.to_str()))
                    })
                    .collect::<Result<Vec<_>>>()?;
                mapping.block_state_id_from_name_and_props(
                    &name,
                    &props_map
                        .iter()
                        .map(|(k, v)| (k.as_ref(), v.as_ref()))
                        .collect::<Vec<_>>(),
                )
            } else {
                mapping.block_state_id_from_name_and_props(&name, &[])
            }
        })
        .collect::<Result<Vec<_>>>()?;
    let cube = if let Some(rows) = palette_rows {
        let count_bits = |n: usize| fast_count_bits(n).max(4);
        dump::<u16, 16>(bytemuck::cast_slice(rows), &palette_entries, count_bits)
    } else {
        bytemuck::allocation::cast_box(Box::new([palette_entries[0]; 4096]))
    };
    Ok(cube)
}

pub fn load_block(mapping: &MinecraftDataMapping, cube: Box<Cube<u16, 16>>) -> Result<NbtCompound> {
    let count_bits = |n: usize| fast_count_bits(n).max(4);
    let (rows, entries) = load::<u16, 16>(&cube, count_bits);
    let bits = count_bits(entries.len());

    let entries = entries
        .iter()
        .map(|&state_id| {
            let (name, props) = mapping.block_name_and_props_from_state_id(state_id)?;
            let kvs = if props.is_empty() {
                vec![(
                    "Name".into(),
                    NbtTag::String(Mutf8String::from_string(format!("minecraft:{name}"))),
                )]
            } else {
                let props_kvs = props
                    .into_iter()
                    .map(|(k, v)| {
                        (
                            Mutf8String::from_string(k.to_string()),
                            NbtTag::String(Mutf8String::from_string(v.to_string())),
                        )
                    })
                    .collect::<Vec<_>>();
                vec![
                    (
                        "Name".into(),
                        NbtTag::String(Mutf8String::from_string(format!("minecraft:{name}"))),
                    ),
                    (
                        "Properties".into(),
                        NbtTag::Compound(NbtCompound::from_values(props_kvs)),
                    ),
                ]
            };
            Ok(NbtTag::Compound(NbtCompound::from_values(kvs)))
        })
        .collect::<Result<Vec<_>>>()?;

    let kvs = if rows.is_empty() || bits == 0 {
        vec![("palette".into(), NbtTag::List(NbtList::from(entries)))]
    } else {
        vec![
            ("data".into(), NbtTag::LongArray(bytemuck::cast_vec(rows))),
            ("palette".into(), NbtTag::List(NbtList::from(entries))),
        ]
    };
    Ok(NbtCompound::from_values(kvs))
}
