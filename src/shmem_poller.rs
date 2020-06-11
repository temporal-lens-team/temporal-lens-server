use crate::string_collection::StringCollection;
use crate::stoppable_thread::StoppableThread;

use std::time::Duration;

use temporal_lens::shmem::SharedMemory;

static POLLER: StoppableThread = StoppableThread::new("shmem_poller");

pub fn start(shmem: SharedMemory, str_collection: StringCollection) {
    POLLER.start((shmem, str_collection), |(shmem, str_collection)| {
        //TODO: Extract data from the shared memory and put everything in a MemDB
        std::thread::sleep(Duration::from_millis(10));
    });
}

pub fn stop() -> bool {
    POLLER.stop()
}
