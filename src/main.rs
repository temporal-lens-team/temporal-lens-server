#![feature(proc_macro_hygiene)]
#![feature(decl_macro)]
#![feature(maybe_uninit_extra)]
#![feature(maybe_uninit_ref)]
#![feature(new_uninit)]

mod stoppable_thread;
mod shmem_poller;
mod string_collection;
mod memdb;

use log::{info, error, debug, warn};
use clap::{App, Arg};
use temporal_lens::shmem::SharedMemory;
use rocket::{get, routes};
use rocket::config::{Config as RocketConfig, Environment as RocketEnv};
use rocket_contrib::{json, json::JsonValue};
use string_collection::StringCollection;

const TEMPORAL_LENS_VERSION: u32 = 0x00_01_0000;
const REST_PROTCOL_VERSION: u32 = 0x00_01_0000;

fn version_string(version: u32) -> String {
    let major = (version & 0xFF_00_0000) >> 24;
    let minor = (version & 0x00_FF_0000) >> 16;
    let patch = version & 0x00_00_FFFF;

    format!("{}.{}.{}", major, minor, patch)
}

fn shutdown() {
    //Since there's not way to shutdown Rocket gracefully...
    if shmem_poller::stop() {
        info!("Shutting down, goodbye.");
        std::process::exit(0);
    }
}

#[get("/")]
fn info_endpoint() -> JsonValue {
    json!({
        "motd": "Welcome to the Temporal Lens Server!",
        "version": version_string(TEMPORAL_LENS_VERSION),
        "lib-protocol-version": version_string(temporal_lens::shmem::PROTOCOL_VERSION),
        "rest-protocol-version": version_string(REST_PROTCOL_VERSION)
    })
}

#[get("/serverctl/shutdown")]
fn shutdown_endpoint() -> JsonValue {
    std::thread::spawn(|| {
        //I know how bad this looks, but I'm trying to work around Rocket's limitations...
        std::thread::sleep(std::time::Duration::from_secs(5));
        shutdown();
    });

    json!({
        "status": "ok",
        "info": "Server will shut down in 5 seconds."
    })
}

fn port_validator(s: String) -> Result<(), String> {
    match s.parse::<u16>() {
        Ok(_)  => Ok(()),
        Err(_) => Err("Not a valid port number".to_string())
    }
}

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
        .arg(
            Arg::with_name("port")
            .long("port")
            .short("p")
            .help("Overrides the port used by the server")
            .takes_value(true)
            .validator(port_validator)
            .default_value("61234")
        )
        .get_matches();

    log4rs::init_file(arg_matches.value_of("logger_config").unwrap(), Default::default()).expect("Failed to load log4rs configuration");
    info!("Starting up...");

    let shmem = match SharedMemory::create() {
        Ok(x) => x,
        Err(err) => {
            error!("Failed to create shared memory: {:?}. Perhaps a temporal-lens-server instance is already running?", err);
            return;
        }
    };

    unsafe {
        //Safe because we do it before instantiating any MemDB
        memdb::init();
    }

    let str_collection = StringCollection::new();
    let sc_accessor = str_collection.new_accessor();

    shmem_poller::start(shmem, str_collection);
    
    if let Err(err) = ctrlc::set_handler(shutdown) {
        warn!("Failed to set Ctrl-C handler: {:?}. Please use the `/shutdown` route to shutdown the server gracefully.", err);
    }

    //TODO: At some point, we might want to make more of these things configurable
    let rocket_cfg = RocketConfig::build(RocketEnv::Production)
        .address("127.0.0.1")
        .port(arg_matches.value_of("port").unwrap().parse().unwrap())
        .workers(4)
        .unwrap();

    debug!("Initialization complete. Igniting rocket...");
    rocket::custom(rocket_cfg)
        .mount("/", routes![info_endpoint, shutdown_endpoint])
        .manage(sc_accessor)
        .launch();
}
