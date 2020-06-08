use std::sync::atomic::{AtomicBool, Ordering};

use log::{info, error, warn};
use clap::{App, Arg};
use temporal_lens::shmem;
use fxhash::FxHashMap;

static RUNNING: AtomicBool = AtomicBool::new(true);

fn main() {
    let arg_matches = App::new("temporal-lens-server")
        .version("0.1.0")
        .author("Nicolas Barbotin <nicolas@barbot.in>, Clément Poull")
        .about("Temporal Lens Rust server - Temporal Lens is a telemetry infrastructure for Rust")
        .arg(
            Arg::with_name("logger_config")
            .long("logger-config")
            .short("l")
            .help("Specifies the log4rs configuration file to use")
            .takes_value(true)
            .default_value("log4rs.toml")
        )
        .get_matches();

    log4rs::init_file(arg_matches.value_of("logger_config").unwrap(), Default::default()).expect("Failed to load log4rs configuration");
    info!("Hello world!");

    let mut shmem = match shmem::SharedMemory::create() {
        Ok(x) => x,
        Err(err) => {
            error!("Failed to create shared memory: {:?}. Perhaps a temporal-lens-server instance is already running?", err);
            return;
        }
    };

    ctrlc::set_handler(move || RUNNING.store(false, Ordering::SeqCst)).expect("Failed to set Ctrl-C handler");

    let mut zone_data: [shmem::ZoneData; shmem::NUM_ENTRIES] = unsafe { std::mem::MaybeUninit::uninit().assume_init() };
    let mut string_map: FxHashMap<usize, String> = Default::default();

    while RUNNING.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(10));

        let (retrieved, lost) = unsafe { shmem.zone_data.retrieve_unchecked(zone_data.as_mut_ptr()) };
        if lost > 0 {
            warn!("Lost {} ZoneData", lost);
        }

        for zd in &zone_data[0..retrieved] {
            if zd.name.has_contents() {
                let k = zd.name.get_key();
                let v = zd.name.make_string().unwrap();

                warn!("Got new string 0x{:016x} => {}", k, v);
                string_map.insert(k, v);
            }
            
            let name = string_map.get(&zd.name.get_key()).map(|s| s.as_str()).unwrap_or("????");
            info!("Received ZoneData 0x{:016x}: name=\"{}\" start={:.3} duration={} color=0x{:08x}", zd.uid, name, zd.start, zd.duration, zd.color);
        }
    }

    info!("Shutting down, goodbye.");
}
