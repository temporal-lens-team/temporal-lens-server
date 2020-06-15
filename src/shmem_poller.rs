use crate::string_collection::{StringCollection, Key as SCKey};
use crate::stoppable_thread::StoppableThread;
use crate::memdb::{TimeData, MemDB};
use crate::common::LiteZoneData;

use std::time::{Instant, Duration};
use std::boxed::Box;
use std::mem::MaybeUninit;
use std::sync::atomic::{AtomicU64, Ordering};

use temporal_lens::shmem::{self, SharedMemory, FrameData, ZoneData};
use log::{info, warn};

static POLLER: StoppableThread = StoppableThread::new("shmem_poller");
static LAST_QUERY: AtomicU64 = AtomicU64::new(0);

pub fn start(mut shmem: SharedMemory, opt_start: Option<Instant>, mut str_collection: StringCollection, mut frame_db: MemDB<FrameData>, mut zone_db: MemDB<LiteZoneData>) {
    POLLER.start(move || {
        let mut frame_data: Box<MaybeUninit<[FrameData; shmem::NUM_ENTRIES]>> = Box::new_uninit();
        let mut zone_data: Box<MaybeUninit<[ZoneData; shmem::NUM_ENTRIES]>> = Box::new_uninit();
        let mut last_time: shmem::Time = 0.0;

        while POLLER.running() {
            if let Some(start) = opt_start {
                if start.elapsed().as_secs() - LAST_QUERY.load(Ordering::Relaxed) >= 30 {
                    info!("No keep-alive sent within the last 30 seconds. Shutting down server.");
                    drop(shmem);
                    std::process::exit(0);
                }
            }

            let (fd, count, missed) = unsafe {
                let (count, missed) = shmem.frame_data.retrieve_unchecked(frame_data.get_mut().as_mut_ptr());
                (frame_data.get_ref(), count, missed)
            };

            if missed > 0 {
                warn!("Server is too slow! Missed {} FrameData entries!", missed);
            }

            for i in 0..count {
                let fdi = &fd[i];

                frame_db.push(TimeData {
                    time: fdi.end,
                    data: *fdi
                });
            }

            let (zd, count, missed) = unsafe {
                let (count, missed) = shmem.zone_data.retrieve_unchecked(zone_data.get_mut().as_mut_ptr());
                (zone_data.get_ref(), count, missed)
            };

            if missed > 0 {
                warn!("Server is too slow! Missed {} ZoneData entries!", missed);
            }

            for i in 0..count {
                let zdi = &zd[i];

                if let Some(s) = zdi.name.make_str() {
                    str_collection.insert(SCKey::StaticString(zdi.name.get_key()), s);
                }

                if let Some(s) = zdi.thread.make_str() {
                    str_collection.insert(SCKey::ThreadName(zdi.thread.get_key()), s);
                }

                let entry = TimeData {
                    time: if zdi.end < last_time { last_time } else { zdi.end },
                    data: LiteZoneData {
                        uid     : zdi.uid,
                        color   : zdi.color,
                        duration: zdi.duration,
                        depth   : zdi.depth,
                        name    : zdi.name.get_key(),
                        thread  : zdi.thread.get_key()
                    }
                };

                last_time = zdi.end;
                zone_db.push(entry); //Is that good or is it better to do it all at once?
            }

            frame_db.unload_old_chunks();
            zone_db.unload_old_chunks();
            std::thread::sleep(Duration::from_millis(10));
        }
    });
}

pub fn stop() -> bool {
    POLLER.stop()
}

pub fn update_keep_alive(t: u64) {
    LAST_QUERY.store(t, Ordering::Relaxed);
}
