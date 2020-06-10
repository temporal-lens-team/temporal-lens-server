use crate::string_collection::StringCollection;
use crate::stoppable_thread::StoppableThread;

use std::thread;
use std::time::Duration;

use temporal_lens::shmem::SharedMemory;

static POLLER: StoppableThread = StoppableThread::new();

pub fn start(shmem: SharedMemory, str_collection: StringCollection) {
    POLLER.start((shmem, str_collection), |(shmem, str_collection)| {
        //TODO: Extract data from the shared memory and put everything in a MemDB
        thread::sleep(Duration::from_millis(10));
    });
}

pub fn stop() -> bool {
    POLLER.stop()
}
