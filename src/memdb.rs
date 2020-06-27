use std::time::Instant;
use std::sync::{RwLock, Arc, Mutex, RwLockReadGuard};
use std::sync::atomic::{AtomicU64, Ordering};
use std::mem::MaybeUninit;
use std::path::PathBuf;
use std::io::Error as IOResult;
use std::fs;

use bincode::Error as BincodeError;
use serde::{Serialize, Deserialize, de::DeserializeOwned};
use log::{error, warn, debug};

#[derive(Serialize, Deserialize, Copy, Clone)]
pub struct TimeData<T> {
    pub time: f64,
    pub data: T
}

struct Chunk<T> {
    data: Option<Vec<TimeData<T>>>, //None if unloaded
    min: f64,
    max: f64,
    last_access: AtomicU64
}

struct Shared<T>
{
    old_chunks: Vec<Chunk<T>>,
    current_chunk: Vec<TimeData<T>>,
    max: f64
}

struct Contents<T>
{
    shared: RwLock<Shared<T>>,
    loaded_chunks: Mutex<Vec<usize>>,
    save_path: PathBuf
}

pub struct Accessor<T>
{
    contents: Arc<Contents<T>>
}

pub struct MemDB<T> {
    contents: Arc<Contents<T>>,
    unload_list: Vec<usize>
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

#[derive(Debug)]
enum ChunkLoadError
{
    FileOpenError(IOResult),
    DeserializeError(BincodeError)
}

impl<T: Serialize + DeserializeOwned> Chunk<T> {
    fn try_saving_to(&mut self, path: PathBuf) -> Result<(), ChunkSaveError> {
        if path.exists() {
            //Already saved! We're good!
            self.data = None;
            return Ok(());
        }

        let data = self.data.as_ref().unwrap();
        let file = fs::File::create(path.as_path()).map_err(ChunkSaveError::FileCreateError)?;
        bincode::serialize_into(&file, &data).map_err(ChunkSaveError::SerializeError)?;

        if let Err(err) = file.sync_all() {
            drop(file); //Make sure its closed otherwise we won't be able to delete it
            
            if let Err(remove_err) = fs::remove_file(path) {
                warn!("Failed to sync chunk contents to disk, and then failed to remove it!! Things will go wrong... error: {}", remove_err);
            }
            
            Err(ChunkSaveError::FileSyncError(err))
        } else {
            self.data = None;
            Ok(())
        }
    }

    fn try_loading_from(&mut self, path: PathBuf) -> Result<(), ChunkLoadError> {
        let file = fs::File::open(path.as_path()).map_err(ChunkLoadError::FileOpenError)?;
        let data = bincode::deserialize_from(&file).map_err(ChunkLoadError::DeserializeError)?;
        drop(file);

        self.data = Some(data);
        Ok(())
    }
}

///MemDB is just a fancy name for "huge vec". It can store a lot
///of data indexed by a "time" field. It can then perform queries
///based on this field.
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
impl<T: Serialize + DeserializeOwned> MemDB<T> {
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
            contents: Arc::new(Contents {
                shared: RwLock::new(Shared {
                    old_chunks: Vec::new(),
                    current_chunk: Vec::new(),
                    max: 0.0
                }),

                loaded_chunks: Mutex::new(Vec::new()),
                save_path
            }),

            unload_list: Vec::new()
        }
    }

    pub fn push(&self, entry: TimeData<T>) {
        let mut contents = self.contents.shared.write().unwrap();
        
        if entry.time < contents.max {
            error!("Dropping entry that is older than the last entry inserted!");
            return;
        }

        contents.max = entry.time;
        contents.current_chunk.push(entry);

        let current_chunk_size = contents.current_chunk.len();

        if current_chunk_size % 1000 == 0 {
            debug!("Current chunk contains {} elements", current_chunk_size);
        }

        if current_chunk_size >= SWAP_THRESHOLD {
            //Exchange with a new vec
            let mut vec = Vec::new();
            std::mem::swap(&mut contents.current_chunk, &mut vec);

            //Store it into the chunk list
            let chunk = Chunk {
                min: vec.first().unwrap().time,
                max: vec.last().unwrap().time,
                data: Some(vec),
                last_access: AtomicU64::new(unsafe { START_INSTANT.get_ref().elapsed().as_secs() }) //The 'unsafe' part was the call to new()
            };

            let index = contents.old_chunks.len();
            contents.old_chunks.push(chunk);
            drop(contents);

            //Mark it as loaded
            self.contents.loaded_chunks.lock().unwrap().push(index);
        }
    }

    pub fn unload_old_chunks(&mut self) {
        let now = unsafe { START_INSTANT.get_ref().elapsed().as_secs() };
        let contents = self.contents.shared.read().unwrap();
        let mut loaded_chunks = self.contents.loaded_chunks.lock().unwrap();

        for i in (0..loaded_chunks.len()).rev() {
            let index = loaded_chunks[i];

            if now - contents.old_chunks[index].last_access.load(Ordering::Relaxed) >= UNLOAD_THRESHOLD {
                self.unload_list.push(index);
                loaded_chunks.remove(i);
            }
        }

        drop(contents);

        if self.unload_list.len() > 0 {
            let mut contents = self.contents.shared.write().unwrap();

            for &i in &self.unload_list {
                let chunk = &mut contents.old_chunks[i];
                let mut path = self.contents.save_path.clone();
                path.push(i.to_string());

                if let Err(err) = chunk.try_saving_to(path) {
                    //Failed to save the chunk! Oh noes!
                    error!("Could not save chunk: {:?}", err);
                    loaded_chunks.push(i);
                }
            }

            debug!("Saved {} chunks onto disk", self.unload_list.len());
            self.unload_list.clear();
        }
    }

    pub fn new_accessor(&self) -> Accessor<T> {
        Accessor {
            contents: self.contents.clone()
        }
    }
}

impl<T: Serialize + DeserializeOwned> Accessor<T> {
    fn prepare_query(&self, min: f64, max: Option<f64>, lookup_list: &mut Vec<usize>) -> (f64, f64, RwLockReadGuard<Shared<T>>) {
        //Load all unloaded chunks that are potentially needed
        let shared = self.contents.shared.read().unwrap();
        let now = unsafe { START_INSTANT.get_ref().elapsed().as_secs() };
        let mut should_load = false;

        let min = if min < 0.0 { min + shared.max } else { min };
        let max = max.unwrap_or(shared.max);

        for i in 0..shared.old_chunks.len() { //FIXME: Replace this for loop with binary search!!
            let chunk = &shared.old_chunks[i];

            if chunk.min <= max && chunk.max >= min {
                if chunk.data.is_none() {
                    should_load = true;
                }

                lookup_list.push(i);
                chunk.last_access.store(now, Ordering::Relaxed);
            }
        }

        if should_load {
            drop(shared);
            let mut shared = self.contents.shared.write().unwrap();
            let mut num_reloaded = 0;

            for &i in &*lookup_list {
                let chunk = &mut shared.old_chunks[i];

                if chunk.data.is_none() {
                    let mut path = self.contents.save_path.clone();
                    path.push(i.to_string());

                    if let Err(err) = chunk.try_loading_from(path) {
                        error!("Could not reload chunk: {:?}", err);
                    } else {
                        self.contents.loaded_chunks.lock().unwrap().push(i);
                        num_reloaded += 1;
                    }
                }
            }

            drop(shared);
            debug!("Reloaded {} chunks from disk", num_reloaded);
            (min, max, self.contents.shared.read().unwrap()) //TODO: Switch to parking_lot and use downgrade
        } else {
            (min, max, shared)
        }
    }

    ///Returns i such that data[i].time >= min and data[i - 1].time < min
    ///Careful, as it assumes that min > data[0].time
    fn binary_search(data: &[TimeData<T>], min: f64) -> usize {
        let mut a = 0;
        let mut b = data.len();

        loop {
            let half = (a + b) >> 1;

            if data[half].time >= min {
                if data[half - 1].time < min {
                    return half;
                }

                b = half;
            } else {
                a = half;
            }
        }
    }

    pub fn query<Func: FnMut(u64, &TimeData<T>)>(&self, min: f64, max: Option<f64>, mut callback: Func) {
        let mut lookup_list = Vec::new(); //TODO: It sucks having to allocate everytime...
        let (min, max, access) = self.prepare_query(min, max, &mut lookup_list);

        for &i in &lookup_list {
            let chunk = &access.old_chunks[i];

            if let Some(data) = chunk.data.as_ref() {
                let k_base = (i as u64) << 32;
                let start = if chunk.min < min { Self::binary_search(data.as_slice(), min) } else { 0 };

                if chunk.max < max {
                    for j in start..data.len() {
                        callback(k_base | (j as u64), &data[j]);
                    }
                } else {
                    for j in start..data.len() {
                        let entry = &data[j];
                        if entry.time > max {
                            return;
                        }

                        callback(k_base | (j as u64), entry);
                    }
                }
            } else {
                warn!("Query will be incomplete since, for some reason, some chunk were unloaded");
            }
        }

        //If we haven't left this function by now, that means we also need to check the current chunk
        let chunk = &access.current_chunk;
        
        if chunk.last().map(|c| min <= c.time).unwrap_or(false) {
            let k_base = (access.old_chunks.len() as u64) << 32;
            let start = if chunk[0].time < min { Self::binary_search(chunk.as_slice(), min) } else { 0 };

            for i in start..chunk.len() {
                let entry = &chunk[i];
                if entry.time > max {
                    break;
                }

                callback(k_base | (i as u64), entry);
            }
        }
    }

    pub fn get_stats(&self) -> (usize, usize) {
        let loaded = self.contents.loaded_chunks.lock().unwrap().len() + 1;
        let total = self.contents.shared.read().unwrap().old_chunks.len() + 1;

        (loaded, total)
    }
}

impl<T> Clone for Accessor<T> {
    fn clone(&self) -> Self {
        Self {
            contents: self.contents.clone()
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

#[test]
fn binary_search_test() {
    use rand::Rng;
    let mut array = [TimeData { time: 0.0, data: () }; 32];
    let mut rng = rand::thread_rng();

    for _ in 0..10000 {
        let mut prev = 0.0;

        for i in 0..array.len() {
            let val = prev + rng.gen::<f64>();
            array[i].time = val;
            prev = val;
        }

        let min = array[0].time + f64::EPSILON;
        let max = prev;

        for j in 0..1000 {
            let query = match j {
                0   => min,
                999 => array.last().unwrap().time,
                _   => rng.gen_range(min, max)
            };

            assert!(query > array[0].time); //Can't be too sure

            let result = Accessor::binary_search(&array, query);
            assert!(array[result].time >= query && array[result - 1].time < query);
        }
    }
}
