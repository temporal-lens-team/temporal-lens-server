use std::time::Instant;
use std::sync::{RwLock, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::mem::MaybeUninit;
use std::path::PathBuf;
use std::io::Error as IOResult;
use std::fs;

use bincode::Error as BincodeError;
use serde::{Serialize, Deserialize};
use log::{error, warn};

#[derive(Serialize, Deserialize)]
pub struct TimeData<T: Serialize> {
    pub time: f64,
    pub data: T
}

struct Chunk<T: Serialize> {
    data: Option<Vec<TimeData<T>>>, //None if unloaded
    min: f64,
    max: f64,
    last_access: AtomicU64
}

pub struct MemDB<T: Serialize> {
    //Shared across writer and readers
    old_chunks: RwLock<Vec<Chunk<T>>>,
    current_chunk: Mutex<Vec<TimeData<T>>>,

    //Writer thread only
    loaded_chunks: Vec<usize>,
    unload_list: Vec<usize>,
    save_path: PathBuf
}

const SWAP_THRESHOLD: usize = 32768;
const UNLOAD_THRESHOLD: u64 = 60; //In seconds
static mut START_INSTANT: MaybeUninit<Instant> = MaybeUninit::uninit();

#[derive(Debug)]
enum ChunkSaveError
{
    FileCreateError(IOResult),
    SerializeError(BincodeError),
    FileSyncError(IOResult)
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
impl<T: Serialize> MemDB<T> {
    ///Creates a MemDB instance
    ///
    ///Unsafe because it is the user's job to make sure he calls
    ///`memdb::init()` before creating any MemDB instance
    ///
    ///Also, `save_path` must point to an empty directory and
    ///this instance of MemDB should be the only entity able to
    ///write to this folder. It is the user's responsibility to
    ///erase all files contained in this folder before calling
    ///this function.
    pub unsafe fn new(save_path: PathBuf) -> Self {
        Self {
            old_chunks: RwLock::new(Vec::new()),
            current_chunk: Mutex::new(Vec::new()),

            loaded_chunks: Vec::new(),
            unload_list: Vec::new(),
            save_path
        }
    }

    pub fn push(&mut self, entry: TimeData<T>) {
        let mut cc = self.current_chunk.lock().unwrap();
        cc.push(entry);

        if cc.len() >= SWAP_THRESHOLD {
            //Exchange with a new vec
            let mut vec = Vec::new();
            std::mem::swap(&mut *cc, &mut vec);
            drop(cc);

            //Store it into the chunk list
            let chunk = Chunk {
                min: vec.first().unwrap().time,
                max: vec.last().unwrap().time,
                data: Some(vec),
                last_access: AtomicU64::new(unsafe { START_INSTANT.get_ref().elapsed().as_secs() }) //The 'unsafe' part was the call to new()
            };

            let mut old_chunks = self.old_chunks.write().unwrap();
            let index = old_chunks.len();
            old_chunks.push(chunk);
            drop(old_chunks);

            //Mark it as loaded
            self.loaded_chunks.push(index);
        }
    }

    pub fn unload_old_chunks(&mut self) {
        let now = unsafe { START_INSTANT.get_ref().elapsed().as_secs() };
        let chunks = self.old_chunks.read().unwrap();

        for i in (0..self.loaded_chunks.len()).rev() {
            let index = self.loaded_chunks[i];

            if now - chunks[index].last_access.load(Ordering::Relaxed) >= UNLOAD_THRESHOLD {
                self.unload_list.push(index);
                self.loaded_chunks.remove(i);
            }
        }

        drop(chunks);

        if self.unload_list.len() > 0 {
            let mut chunks = self.old_chunks.write().unwrap();

            for i in 0..self.unload_list.len() {
                let chunk = &mut chunks[i];
                let mut path = self.save_path.clone();
                path.push(i.to_string());

                if let Err(err) = Self::try_saving_chunk(chunk, path) {
                    //Failed to save the chunk! Oh noes!
                    error!("Could not save chunk: {:?}", err);
                    self.loaded_chunks.push(i);
                }
            }

            self.unload_list.clear();
        }
    }

    fn try_saving_chunk(chunk: &mut Chunk<T>, path: PathBuf) -> Result<(), ChunkSaveError> {
        if path.exists() {
            //Already saved! We're good!
            return Ok(());
        }

        let data = chunk.data.as_ref().unwrap();
        let file = fs::File::create(path.as_path()).map_err(ChunkSaveError::FileCreateError)?;
        bincode::serialize_into(&file, &data).map_err(ChunkSaveError::SerializeError)?;

        if let Err(err) = file.sync_all() {
            drop(file); //Make sure its closed otherwise we won't be able to delete it
            
            if let Err(remove_err) = fs::remove_file(path) {
                warn!("Failed to sync chunk contents to disk, and then failed to remove it!! Things will go wrong... error: {}", remove_err);
            }

            Err(ChunkSaveError::FileSyncError(err))
        } else {
            Ok(())
        }
    }
}

///Initializes the MemDB module
///
///Unsafe because it is the user's responsibility to call this
///method only once and before any call to `MemDB::new()`
pub unsafe fn init()
{
    START_INSTANT.write(Instant::now());
}
