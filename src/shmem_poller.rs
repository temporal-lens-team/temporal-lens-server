use crate::string_collection::{StringCollection, Key as SCKey};
use crate::stoppable_thread::StoppableThread;

use std::time::Duration;
use std::boxed::Box;
use std::mem::MaybeUninit;

use temporal_lens::shmem::{SharedMemory, ZoneData, NUM_ENTRIES};
use log::{warn};

static POLLER: StoppableThread = StoppableThread::new("shmem_poller");

pub fn start(mut shmem: SharedMemory, mut str_collection: StringCollection) {
    POLLER.start(move || {
        let mut zone_data: Box<MaybeUninit<[ZoneData; NUM_ENTRIES]>> = Box::new_uninit();

        while POLLER.running() {
            let (zd, count, missed) = unsafe {
                let (count, missed) = shmem.zone_data.retrieve_unchecked(zone_data.get_mut().as_mut_ptr());
                (zone_data.get_ref(), count, missed)
            };

            if missed > 0 {
                warn!("Server is too slow! Missed {} ZoneData entries!", missed);
            }

            for i in 0..count {
                if let Some(s) = zd[i].name.make_str() {
                    str_collection.insert(SCKey::StaticString(zd[i].name.get_key()), s);
                }

                if let Some(s) = zd[i].thread.make_str() {
                    str_collection.insert(SCKey::ThreadName(zd[i].thread.get_key()), s);
                }

                //TODO: Sort & insert into memdb
            }

            std::thread::sleep(Duration::from_millis(10));
        }
    });
}

pub fn stop() -> bool {
    POLLER.stop()
}
