use std::time::Instant;
use std::sync::{RwLock, Mutex};
use std::path::PathBuf;

use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct TimeData<T> {
    pub time: u64,
    pub data: T
}

enum ChunkState<T> {
    Loaded(Vec<TimeData<T>>),
    Unloaded
}

struct Chunk<T> {
    data: ChunkState<T>,
    min: u64,
    max: u64,
    last_read: Instant
}

pub struct MemDB<T> {
    old_chunks: RwLock<Vec<Chunk<T>>>,
    current_chunk: Mutex<Vec<TimeData<T>>>,
    save_path: PathBuf
}

///MemDB is basically a huge collection of `TimeData<T>`
///
///Data is inserted but never deleted or modified. Internally,
///data is split into chunks, each one containing a maximum of
///`SWAP_THRESHOLD` entries. Each chunk keeps track of the last
///time they were queried. To save memory, they can decide to
///save themselves to disk (inside `save_path`) and unload
///themselves from the RAM, until they are queried again.
///
///Another restriction (in addition to the "insert-only"
///constraint) is that the `time` field inside the `TimeData`
///struct can only be increasing. This enables fast queries
///through the help of binary search algorithms.
impl<T> MemDB<T> {
    const SWAP_THRESHOLD: usize = 1024;

    pub fn new(save_path: PathBuf) -> Self {
        Self {
            old_chunks: RwLock::new(Vec::new()),
            current_chunk: Mutex::new(Vec::new()),
            save_path
        }
    }

    pub fn push(&self, entry: TimeData<T>) {
        let mut cc = self.current_chunk.lock().unwrap();
        cc.push(entry);

        if cc.len() >= Self::SWAP_THRESHOLD {
            let mut vec = Vec::new();
            std::mem::swap(&mut *cc, &mut vec);
            drop(cc);

            let chunk = Chunk {
                min: vec.first().unwrap().time,
                max: vec.last().unwrap().time,
                data: ChunkState::Loaded(vec),
                last_read: Instant::now()
            };

            self.old_chunks.write().unwrap().push(chunk);
        }
    }
}
