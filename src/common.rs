
use serde::{Serialize, Deserialize};
use temporal_lens::shmem;

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct LiteZoneData
{
    pub uid     : usize,
    pub color   : shmem::Color,
    pub duration: shmem::Duration,
    pub depth   : u32,
    pub name    : usize,
    pub thread  : usize
}
