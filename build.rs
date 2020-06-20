use std::fs;
use std::path::Path;
use std::process::Command;

fn visit_dir(path: &Path) {
    if let Ok(entries) = fs::read_dir(path) {
        for opt_entry in entries {
            if let Ok(entry) = opt_entry {
                if let Ok(ty) = entry.file_type() {
                    let entry_path = entry.path();

                    if ty.is_dir() {
                        visit_dir(&entry_path);
                    } else if ty.is_file() {
                        if let Some(ext) = entry_path.extension() {
                            if ext == "ts" {
                                println!("cargo:rerun-if-changed={}", entry_path.to_string_lossy());
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn get_typescript_command_name() -> &'static str {
    "tsc.cmd"
}

#[cfg(not(target_os = "windows"))]
fn get_typescript_command_name() -> &'static str {
    "tsc"
}

fn main() {
    Command::new(get_typescript_command_name()).status().unwrap();
    visit_dir(Path::new("./public-ts"));
    println!("cargo:rerun-if-changed=./tsconfig.json");
}
