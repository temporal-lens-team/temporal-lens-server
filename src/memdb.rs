use temporal_lens::shmem::ShouldStopQuery;

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
    save_path: PathBuf,
    name: String
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
    pub unsafe fn new(name: String, save_path: PathBuf) -> Self {
        Self {
            contents: Arc::new(Contents {
                shared: RwLock::new(Shared {
                    old_chunks: Vec::new(),
                    current_chunk: Vec::new(),
                    max: 0.0
                }),

                loaded_chunks: Mutex::new(Vec::new()),
                save_path,
                name
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
            debug!("Current chunk of {} contains {} elements", self.contents.name, current_chunk_size);
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

impl<T: Serialize + DeserializeOwned + ShouldStopQuery> Accessor<T> {
    fn prepare_query(&self, min: f64, max: Option<f64>, lookup_list: &mut Vec<usize>) -> (f64, f64, RwLockReadGuard<Shared<T>>) {
        //Load all unloaded chunks that are potentially needed
        let shared = self.contents.shared.read().unwrap();
        let now = unsafe { START_INSTANT.get_ref().elapsed().as_secs() };
        let mut should_load = false;

        //Compute absolute min and max if needed
        let min = if min < 0.0 { min + shared.max } else { min };
        let max = max.unwrap_or(shared.max);

        //Determine first chunk
        let first_chunk;
        if shared.old_chunks.len() == 0 || min <= shared.old_chunks[0].max {
            first_chunk = 0;
        } else if min > shared.old_chunks.last().unwrap().max {
            first_chunk = shared.old_chunks.len();
        } else {
            first_chunk = Self::binary_search_chunk(&shared.old_chunks, min);
        }

        //Search into old_chunks, caller will take care of the current chunk
        for i in first_chunk..shared.old_chunks.len() {
            let chunk = &shared.old_chunks[i];

            if chunk.min > max {
                break;
            }

            if chunk.data.is_none() {
                should_load = true;
            }

            lookup_list.push(i);
            chunk.last_access.store(now, Ordering::Relaxed);
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

    ///Returns i such that data[i].max >= min and data[i - 1].max < min
    ///Careful, as it assumes that min > data[0].max
    fn binary_search_chunk(data: &[Chunk<T>], min: f64) -> usize {
        let mut a = 0;
        let mut b = data.len();

        loop {
            let half = (a + b) >> 1;

            if data[half].max >= min {
                if data[half - 1].max < min {
                    return half;
                }

                b = half;
            } else {
                a = half;
            }
        }
    }

    fn with_chunk<U, Func: FnOnce(&Vec<TimeData<T>>) -> U>(&self, cid: usize, func: Func) -> Option<U> {
        let now = unsafe { START_INSTANT.get_ref().elapsed().as_secs() };
        let shared = self.contents.shared.read().unwrap();

        if cid >= shared.old_chunks.len() {
            Some(func(&shared.current_chunk))
        } else if let Some(data) = shared.old_chunks[cid].data.as_ref() {
            shared.old_chunks[cid].last_access.store(now, Ordering::Relaxed);
            Some(func(data))
        } else {
            drop(shared);

            let mut shared = self.contents.shared.write().unwrap();
            let chunk = &mut shared.old_chunks[cid];

            if chunk.data.is_none() {
                let mut path = self.contents.save_path.clone();
                path.push(cid.to_string());

                if let Err(err) = chunk.try_loading_from(path) {
                    error!("Could not reload chunk: {:?}", err);
                    return None;
                }

                self.contents.loaded_chunks.lock().unwrap().push(cid);
            }

            chunk.last_access.store(now, Ordering::Relaxed);
            drop(chunk);
            drop(shared);

            let shared = self.contents.shared.read().unwrap();
            Some(func(shared.old_chunks[cid].data.as_ref().unwrap()))
        }
    }

    fn query_left(&self, cid: usize, t: f64, max: usize, dst: &mut Vec<TimeData<T>>) -> usize where T: Copy {
        self.with_chunk(cid, move |chunk| {
            if chunk.is_empty() || t <= chunk[0].time {
                return 0;
            }

            let chunk_sz = chunk.len();
            let end      = if t >= chunk[chunk_sz - 1].time { chunk_sz } else { Self::binary_search(chunk.as_slice(), t) };
            let cnt      = usize::min(end, max);
            let start    = end - cnt;

            for i in (start..end).rev() {
                dst.push(chunk[i]);
            }

            cnt
        }).unwrap_or(0)
    }

    fn query_right(&self, cid: usize, t: f64, max: usize, dst: &mut Vec<TimeData<T>>) -> usize where T: Copy {
        self.with_chunk(cid, move |chunk| {
            let chunk_sz = chunk.len();
            if chunk_sz <= 0 || t >= chunk[chunk_sz - 1].time {
                return 0;
            }

            let start = if t < chunk[0].time { 0 } else { Self::binary_search(chunk.as_slice(), t) };
            let cnt   = usize::min(chunk_sz - start, max);
            let end   = start + cnt;

            for i in start..end {
                dst.push(chunk[i]);
            }

            cnt
        }).unwrap_or(0)
    }

    pub fn query_count<Func: FnMut(&TimeData<T>)>(&self, t: f64, count: usize, mut callback: Func) where T: Copy {
        let shared = self.contents.shared.read().unwrap();
        let chunk_count = shared.old_chunks.len();

        let first_chunk;
        if chunk_count <= 0 || t <= shared.old_chunks[0].max {
            first_chunk = 0;
        } else if t > shared.old_chunks[chunk_count - 1].max {
            first_chunk = chunk_count;
        } else {
            first_chunk = Self::binary_search_chunk(&shared.old_chunks, t);
        }

        drop(shared);

        let mut remaining_left = count / 2;
        let mut remaining_right = count - remaining_left;
        let mut left = Vec::with_capacity(remaining_left);
        let mut right = Vec::with_capacity(remaining_right);
        let mut cid = first_chunk;
        let mut left_limit_hit = false;

        if remaining_left > 0 {
            loop {
                remaining_left -= self.query_left(cid as usize, t, remaining_left, &mut left);

                if remaining_left <= 0 {
                    break;
                }

                if cid <= 0 {
                    left_limit_hit = true;
                    break;
                }

                cid -= 1;
            }
        }

        remaining_right += remaining_left;
        cid = first_chunk;

        while remaining_right > 0 && cid <= chunk_count {
            remaining_right -= self.query_right(cid, t, remaining_right, &mut right);
            cid += 1;
        }

        if remaining_right > 0 && !left_limit_hit {
            left.clear(); //We have no choice but the rebuild the entire list because we cannot resume the search
            remaining_left = count - right.len();
            cid = first_chunk;

            loop {
                remaining_left -= self.query_left(cid as usize, t, remaining_left, &mut left);

                if remaining_left <= 0 {
                    break;
                }

                if cid <= 0 {
                    break;
                }

                cid -= 1;
            }
        }

        for i in (0..left.len()).rev() {
            callback(&left[i]);
        }

        for i in 0..right.len() {
            callback(&right[i]);
        }
    }

    pub fn query_previous<Func: FnMut(&TimeData<T>)>(&self, t: f64, mut callback: Func) {
        let shared = self.contents.shared.read().unwrap();
        let chunk_count = shared.old_chunks.len();

        let first_chunk;
        if chunk_count <= 0 || t <= shared.old_chunks[0].max {
            first_chunk = 0;
        } else if t > shared.old_chunks[chunk_count - 1].max {
            first_chunk = chunk_count;
        } else {
            first_chunk = Self::binary_search_chunk(&shared.old_chunks, t);
        }

        drop(shared);

        let last_of_prev_chunk = self.with_chunk(first_chunk, |chunk| {
            let chunk_sz = chunk.len();
            if chunk_sz <= 0 || t < chunk[0].time || t >= chunk[chunk_sz - 1].time {
                return false;
            }

            let i = Self::binary_search(chunk, t);

            if i > 0 {
                callback(&chunk[i - 1]);
                false
            } else {
                true
            }
        }).unwrap_or(false);

        if last_of_prev_chunk && first_chunk > 0 {
            self.with_chunk(first_chunk - 1, move |chunk| {
                let chunk_sz = chunk.len();

                if chunk_sz > 0 {
                    callback(&chunk[chunk_sz - 1]);
                }
            });
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
                        if entry.data.should_stop_query(entry.time, max) {
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
                if entry.data.should_stop_query(entry.time, max) {
                    break;
                }

                callback(k_base | (i as u64), entry);
            }
        }
    }

    pub fn get_max_time(&self) -> f64 {
        self.contents.shared.read().unwrap().max
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
