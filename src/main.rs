use log::info;
use clap::{App, Arg};

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
}
