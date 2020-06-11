use std::thread;
use std::mem::MaybeUninit;
use std::sync::atomic::{AtomicBool, Ordering};
use std::cell::UnsafeCell;

use log::debug;

pub struct StoppableThread {
    started: AtomicBool,
    running: AtomicBool,
    handle: UnsafeCell<MaybeUninit<thread::JoinHandle<()>>>,
    name: &'static str
}

unsafe impl Sync for StoppableThread {}

///A safe way to create threads based on a main-loop that can be stopped.
///This will only work if the `StoppableThread` is static.
///
///Safety is achieved with the help of two atomic booleans allowing only
///a single call to `start()` and `stop()`. There's one caveat: if, for
///some reason, you decide to call `start()` and `stop()` at the very same
///time (you'd need two threads for that), the call to `stop()` might return
///"already stopped" even though the thread just started. For this reason,
///it is recommanded to run `start()` from the main thread before any other
///thread is started.
impl StoppableThread {
    pub const fn new(name: &'static str) -> Self {
        Self {
            started: AtomicBool::new(false),
            running: AtomicBool::new(false),
            handle: UnsafeCell::new(MaybeUninit::uninit()),
            name
        }
    }

    pub fn start<ToSend: Send + 'static, Func: Fn(&mut ToSend) -> () + Send + 'static>(&'static self, to_send: ToSend, func: Func) -> bool {
        if self.started.compare_and_swap(false, true, Ordering::SeqCst) {
            //Already running
            false
        } else {
            let thread = thread::spawn(move || {
                let mut sent = to_send;

                while !self.running.load(Ordering::SeqCst) {
                    thread::yield_now();
                }

                debug!("Stoppable thread \"{}\" started", self.name);
                
                loop {
                    func(&mut sent);

                    if !self.running.load(Ordering::SeqCst) {
                        break;
                    }
                }

                debug!("Stoppable thread \"{}\" ended", self.name);
            });

            unsafe {
                (*self.handle.get()).write(thread);
            }

            self.running.store(true, Ordering::SeqCst);
            true
        }
    }

    pub fn stop(&self) -> bool {
        if self.running.compare_and_swap(true, false, Ordering::SeqCst) {
            unsafe {
                //More hacking around Rust static limitations. sorry.
                let mut handle: MaybeUninit<thread::JoinHandle<()>> = MaybeUninit::uninit();
                std::ptr::copy_nonoverlapping(self.handle.get(), &mut handle, 1);

                handle.assume_init().join().unwrap();
            }
    
            true
        } else {
            false
        }
    }
}
