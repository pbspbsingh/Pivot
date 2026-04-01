use std::{env, process::Command};

fn main() {
    // Only build the client for release builds.
    let profile = env::var("PROFILE").unwrap_or_default();
    if profile != "release" {
        return;
    }

    println!("cargo:rerun-if-changed=../client/src");
    println!("cargo:rerun-if-changed=../client/index.html");
    println!("cargo:rerun-if-changed=../client/package.json");
    println!("cargo:rerun-if-changed=../client/vite.config.ts");

    let status = Command::new("npm")
        .args(["run", "build"])
        .current_dir("../client")
        .status()
        .expect("Failed to run `npm run build` — is npm installed?");

    if !status.success() {
        panic!("`npm run build` failed with status: {status}");
    }
}
