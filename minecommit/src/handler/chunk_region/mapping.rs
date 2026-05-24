use anyhow::Result;

pub struct MinecraftDataMapping;

impl MinecraftDataMapping {
    pub fn biome_id_from_name(&self, name: &str) -> Result<u8> {
        todo!()
    }
    pub fn biome_name_from_id(&self, id: u8) -> Result<String> {
        todo!()
    }
    pub fn block_state_id_from_name_and_props(
        &self,
        name: &str,
        props: &[(&str, &str)],
    ) -> Result<u16> {
        todo!()
    }
    pub fn block_name_and_props_from_state_id(
        &self,
        state_id: u16,
    ) -> Result<(String, Vec<(String, String)>)> {
        todo!()
    }
}
