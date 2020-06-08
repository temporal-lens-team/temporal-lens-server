use std::thread;
use std::mem::MaybeUninit;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use log::{debug, error};
use temporal_lens::shmem::SharedMemory;

static POLLER_RUNNING: AtomicBool = AtomicBool::new(false);
static mut POLLER_HANDLE: MaybeUninit<thread::JoinHandle<()>> = MaybeUninit::uninit();

fn thread_func(shmem: SharedMemory) {
    debug!("Shared memory poller up & running!");

    while POLLER_RUNNING.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(10));
    }

    debug!("Shared memory poller shut down gracefully, that's good.");
}

pub fn start(shmem: SharedMemory) {
    if POLLER_RUNNING.compare_and_swap(false, true, Ordering::SeqCst) {
        panic!("Can't start shmem_poller because it's already running");
    }

    let thread = thread::spawn(move || thread_func(shmem));

    unsafe {
        POLLER_HANDLE.write(thread);
    }
}

//Stop is unsafe because it assume start() has been completed first
pub unsafe fn stop() -> bool {
    if POLLER_RUNNING.compare_and_swap(true, false, Ordering::SeqCst) {
        //More hacking around Rust static limitations. sorry.
        let mut handle: MaybeUninit<thread::JoinHandle<()>> = MaybeUninit::uninit();
        std::ptr::copy_nonoverlapping(POLLER_HANDLE.as_ptr(), handle.as_mut_ptr(), 1);

        if let Err(err) = handle.assume_init().join() {
            error!("Failed to stop shmem_poller: {:?}. Shared memory might be left open.", err);
        }

        true
    } else {
        false
    }
}
