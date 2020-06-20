#![feature(proc_macro_hygiene)]
#![feature(decl_macro)]
#![feature(maybe_uninit_extra)]
#![feature(maybe_uninit_ref)]
#![feature(new_uninit)]

mod stoppable_thread;
mod shmem_poller;
mod string_collection;
mod memdb;
mod common;

use temporal_lens::shmem::{SharedMemory, FrameData};
use string_collection::{StringCollection, Accessor as SCAccessor, Key as SCKey};
use memdb::{MemDB, Accessor as MDBAccessor};
use common::LiteZoneData;

use std::path::PathBuf;
use std::time::Instant;

use rocket::{get, routes, State, Outcome};
use rocket::config::{Config as RocketConfig, Environment as RocketEnv};
use rocket::fairing::AdHoc;
use rocket::response::{Redirect, content};
use rocket_contrib::{json, json::JsonValue, serve::StaticFiles};

use log::{info, error, debug, warn};
use clap::{App, Arg};
use fxhash::FxHashMap;

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

struct Managed {
    frame_db: MDBAccessor<FrameData>,
    zone_db: MDBAccessor<LiteZoneData>,
    str_collection: SCAccessor,
    start: Instant
}

#[get("/")]
fn index() -> Redirect {
    Redirect::permanent("/public/")
}

#[get("/info")]
fn info_endpoint(state: State<Managed>) -> JsonValue {
    let (loaded, total) = state.zone_db.get_stats();
    let state = format!("{} chunks out of {} loaded", loaded, total);

    json!({
        "motd": "Welcome to the Temporal Lens Server!",
        "version": version_string(TEMPORAL_LENS_VERSION),
        "lib-protocol-version": version_string(temporal_lens::shmem::PROTOCOL_VERSION),
        "rest-protocol-version": version_string(REST_PROTCOL_VERSION),
        "state": state
    })
}

#[get("/serverctl/keep-alive")]
fn keep_alive_endpoint() -> content::Json<&'static str> {
    //Timer reset done in fairing
    content::Json("{\"status\":\"ok\"}")
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

#[get("/data/frame-times?<start>&<end>")]
fn query_frame_times(start: f64, end: f64, state: State<Managed>) -> JsonValue {
    let mut results = Vec::new();
    state.frame_db.query(start, end, |_, r| results.push(*r));

    json!({
        "status": "ok",
        "results": results
    })
}

#[get("/data/plots?<start>&<end>")]
fn query_plots_endpoint(start: f64, end: f64, state: State<Managed>) -> JsonValue {
    let mut strings: FxHashMap<usize, &str> = Default::default();
    let mut thread_names: FxHashMap<usize, &str> = Default::default();
    let mut results = Vec::new();

    state.zone_db.query(start, end, |k, r| {
        strings.entry(r.data.name).or_insert_with(|| state.str_collection.get(SCKey::StaticString(r.data.name)).unwrap_or("????"));
        thread_names.entry(r.data.thread).or_insert_with(|| state.str_collection.get(SCKey::ThreadName(r.data.thread)).unwrap_or("????"));

        results.push(r.data.reconstruct(r.time, k));
    });

    json!({
        "status": "ok",
        "strings": strings,
        "thread_names": thread_names,
        "results": results
    })
}

fn port_validator(s: String) -> Result<(), String> {
    match s.parse::<u16>() {
        Ok(_)  => Ok(()),
        Err(_) => Err("Not a valid port number".to_string())
    }
}

fn clean_or_create_dir(path: &PathBuf) -> bool {
    if path.exists() {
        if let Err(err) = std::fs::remove_dir_all(path) {
            error!("Failed to clean temporal-lens directory \"{}\": {}", path.to_str().unwrap_or("NON UTF-8 PATH"), err);
            return false;
        }
    }

    if let Err(err) = std::fs::create_dir(path) {
        error!("Failed to create temporal-lens directory \"{}\": {}", path.to_str().unwrap_or("NON UTF-8 PATH"), err);
        return false;
    }

    true
}

macro_rules! subdirs {
    ($original:ident, [$($others:literal),+]) => {
        ($({
            let mut tmp = $original.clone();
            tmp.push($others);

            tmp
        }),+)
    };
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
        .arg(
            Arg::with_name("forever")
            .long("forever")
            .short("f")
            .help("Disables keep-alive mechanism and never shut the server down automatically")
        )
        .get_matches();

    log4rs::init_file(arg_matches.value_of("logger_config").unwrap(), Default::default()).expect("Failed to load log4rs configuration");
    info!("Starting up...");

    let data_dir = temporal_lens::get_data_dir();
    let (frame_db_dir, zone_db_dir) = subdirs!(data_dir, ["frames", "zone-db"]);

    if !data_dir.exists() {
        if let Err(err) = std::fs::create_dir(&data_dir) {
            error!("Failed to create temporal-lens data directory \"{}\": {}", data_dir.to_str().unwrap_or("NON UTF-8 PATH"), err);
            return;
        }
    }

    if !clean_or_create_dir(&frame_db_dir) || !clean_or_create_dir(&zone_db_dir) {
        return;
    }

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
    let frame_db = unsafe { MemDB::new(frame_db_dir) };
    let zone_db = unsafe { MemDB::new(zone_db_dir) }; //Safe because we called it after `memdb::init()`
    let start_instant = Instant::now();

    let managed = Managed {
        frame_db: frame_db.new_accessor(),
        zone_db: zone_db.new_accessor(),
        str_collection: str_collection.new_accessor(),
        start: start_instant
    };

    let opt_start = if arg_matches.is_present("forever") { None } else { Some(start_instant) };
    shmem_poller::start(shmem, opt_start, str_collection, frame_db, zone_db);
    
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
        .mount("/", routes![index, info_endpoint, keep_alive_endpoint, shutdown_endpoint, query_frame_times, query_plots_endpoint])
        .mount("/public", StaticFiles::from("./public"))
        .manage(managed)
        .attach(AdHoc::on_request("Update keep-alive time", |r, _| {
            if let Outcome::Success(state) = r.guard::<State<Managed>>() {
                shmem_poller::update_keep_alive(state.start.elapsed().as_secs());
            } else {
                warn!("Couldn't reset keep-alive timer. Server might shut down unexpectedly.");
            }
        }))
        .launch();
}
