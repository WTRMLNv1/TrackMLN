use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("missing CARGO_MANIFEST_DIR"));
    let bundled_exe = manifest_dir.join("assets").join("app").join("TrackMLN.exe");

    println!("cargo:rerun-if-changed={}", bundled_exe.display());

    if !bundled_exe.is_file() {
        panic!(
            "Missing bundled payload at {}. Build the main TrackMLN release binary and stage it into installer/src-tauri/assets/app/TrackMLN.exe before building the installer.",
            bundled_exe.display()
        );
    }

    tauri_build::build()
}
