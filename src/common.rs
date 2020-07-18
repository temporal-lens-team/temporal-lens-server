
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

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct ReconstructedZoneData
{
    pub entry_id: u64,
    pub zone_uid: usize,
    pub color   : shmem::Color,
    pub end     : f64,
    pub duration: shmem::Duration,
    pub depth   : u32,
    pub name    : usize,
    pub thread  : usize
}

impl LiteZoneData {
    pub fn reconstruct(&self, end: f64, entry_id: u64) -> ReconstructedZoneData {
        ReconstructedZoneData {
            entry_id,
            zone_uid: self.uid,
            color: self.color,
            end,
            duration: self.duration,
            depth: self.depth,
            name: self.name,
            thread: self.thread
        }
    }
}

impl shmem::ShouldStopQuery for LiteZoneData {
    fn should_stop_query(&self, t: f64, query_max: f64) -> bool {
        self.depth == 0 && t - (self.duration as f64) * 1e-9 > query_max
    }
}
