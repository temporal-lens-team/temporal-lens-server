use std::mem::MaybeUninit;
use std::sync::{RwLock, Arc};
use std::ops::Index;
use std::cell::UnsafeCell;

use fxhash::FxHashMap;

const POOL_SIZE: usize = 8192;

#[derive(Debug, Copy, Clone, Hash, Eq, PartialEq)]
pub enum Key
{
    StaticString(usize),
    ThreadName(usize)
}

#[derive(Copy, Clone)]
struct Entry
{
    ptr: *const u8,
    len: usize
}

struct Pool
{
    bytes: Box<MaybeUninit<[u8; POOL_SIZE]>>,
    pos: usize
}

struct Internal
{
    map: RwLock<FxHashMap<Key, Entry>>,
    pools: UnsafeCell<Vec<Pool>>
}

#[derive(Clone)]
pub struct Accessor(Arc<Internal>);
pub struct StringCollection(Arc<Internal>);

///A `StringCollection` is a map of read-only strings,
///indexed by a `usize` key.
///
///It was specifically designed for the needs of
///`temporal-lens-server` and thus, strings can only
///be inserted from one thread and never removed or
///updated afterwards. The benefit is that the strings
///can be read from any thread as long as `Accessor`
///exists.
impl StringCollection
{
    pub fn new() -> Self {
        let ret = Internal {
            map: RwLock::new(Default::default()),
            pools: UnsafeCell::new(Vec::new())
        };

        Self(Arc::new(ret))
    }

    #[inline]
    pub fn new_accessor(&self) -> Accessor {
        Accessor(self.0.clone())
    }

    fn get_or_create_pool(&mut self, needed: usize) -> &mut Pool {
        let pools = unsafe { &mut *self.0.pools.get() }; //Safe because only StringCollection writes in pools

        if pools.last().map(|pool| pool.pos + needed <= POOL_SIZE).unwrap_or(false) {
            pools.last_mut().unwrap()
        } else {
            pools.push(Pool { bytes: Box::new_uninit(), pos: 0 });
            pools.last_mut().unwrap()
        }
    }

    pub fn insert(&mut self, k: Key, v: &str) {
        let v_bytes = v.as_bytes();
        if v_bytes.len() >= POOL_SIZE {
            panic!("string is too long to be inserted in StringCollection");
        }

        if !self.0.map.read().unwrap().contains_key(&k) {
            let pool = self.get_or_create_pool(v_bytes.len());

            let result = unsafe {
                let dst = pool.bytes.get_mut().as_mut_ptr().offset(pool.pos as isize);
                std::ptr::copy_nonoverlapping(v_bytes.as_ptr(), dst, v_bytes.len());

                Entry {
                    ptr: dst, //We assume that a pool **NEVER** gets dropped, so it should be safe to pass a pointer to its contents
                    len: v_bytes.len()
                }
            };

            pool.pos += v_bytes.len();
            self.0.map.write().unwrap().insert(k, result);
        }
    }
}

unsafe impl Send for StringCollection {} //No problem whatsoever

impl Accessor {
    pub fn get(&self, k: Key) -> Option<&str> {
        let opt_entry = self.0.map.read().unwrap().get(&k).copied();
        
        opt_entry.map(|entry| {
            unsafe {
                let s = std::slice::from_raw_parts(entry.ptr, entry.len);
                std::str::from_utf8_unchecked(s)
            }
        })
    }
}

impl Index<Key> for Accessor {
    type Output = str;

    fn index(&self, index: Key) -> &str {
        match self.get(index) {
            Some(s) => s,
            None    => "???"
        }
    }
}

unsafe impl Send for Accessor {} //No problem whatsoever
unsafe impl Sync for Accessor {} //Accessor only touches map, which is a safe RwLock
