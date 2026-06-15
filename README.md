English | [中文](/README-CN.md)

<div align="center">

![logo](./minecommit-gui/src-tauri/icons/128x128@2x.png)

# MineCommit

**Git-powered version control for Minecraft Java Edition saves**

[![License: Apache-2.0 OR MIT](https://img.shields.io/badge/License-Apache--2.0%20OR%20MIT-blue.svg)](#-license)
[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20MasOS-lightgrey?logo=github)](https://github.com/HairlessVillager/minecommit/releases)

</div>

---

MineCommit converts Minecraft Java Edition saves into a **Git-friendly** format. By leveraging Git's mature version control and delta compression algorithms, MineCommit achieves:

- 🗜️ **Extreme Space Efficiency**: Each incremental backup averages only a fraction of the original save size
- ⚡ **Fast Backup and Restore**: Streaming parallelism via [`rayon`](https://github.com/rayon-rs/rayon), NBT parsing via [`simdnbt`](https://github.com/azalea-rs/simdnbt), and Git I/O via [`gitoxide`](https://github.com/GitoxideLabs/gitoxide)

Any question? Please read [FAQ.md](docs/FAQ.md) or feel free to open an issue.

## 🚀 Quick Start

### Prerequisites

MineCommit depends on an external `git` binary for the `commit` and `checkout` commands. If Git is not installed, please [install Git](https://git-scm.com/install/) first.

### Using the GUI

> [!NOTE]
> Still in development, comming soon.

We provide a GUI build for Windows and Linux. Download the `minecommit-gui` executable from the [GitHub Release](https://github.com/HairlessVillager/minecommit/releases) page.

The GUI is built with [Tauri](https://tauri.app/) (Rust backend) + [React](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/) (frontend), providing a WYSIWYG interface for basic backup and restore workflows.

### Using the CLI

The CLI provides fine-grained control over execution details. You can get it from [GitHub Release](https://github.com/HairlessVillager/minecommit/releases) or build it yourself:

```sh
cargo install --path . --bin minecommit
```

> [!NOTE]
> Building from source requires a recent **Rust Nightly** toolchain (due to `simdnbt`). Install via [rustup](https://rustup.rs/): `rustup toolchain install nightly`.

#### Step 1: Prepare

You need to define the following two paths:

1. **Save Path (`$SAVE_DIR`)**: The specific world directory under `.minecraft/saves/` (containing `level.dat`).
2. **Git Repo Path (`$GIT_DIR`)**: A bare Git repository to store backup data.

#### Step 2: Initialize Git Repository

For the first backup, create a bare Git repository:

```sh
git init --initial-branch main --bare $GIT_DIR
git --git-dir $GIT_DIR config gc.auto 0
git --git-dir $GIT_DIR config core.logAllRefUpdates true
```

Ensure your Git commit identity is set:

```sh
git config user.name
git config user.email
```

If nothing is displayed, set your global Git identity:

```sh
git config --global user.name $YOUR_USER_NAME
git config --global user.email $YOUR_USER_EMAIL
```

#### Step 3: Execute Backup

```sh
minecommit commit $SAVE_DIR $GIT_DIR --branch main --init --message "Your backup note" --repack
```

This reads the save at `$SAVE_DIR`, creates an initial commit on the `main` branch of the bare repository at `$GIT_DIR`, and automatically repacks loose objects.

<details>
<summary><code>minecommit commit --help</code></summary>

```text
Flatten save and commit to Git

Usage: minecommit commit [OPTIONS] --branch <BRANCH> --message <MESSAGE> <SAVE_DIR> <GIT_DIR>

Arguments:
  <SAVE_DIR>  Path to your save
  <GIT_DIR>   Path to the bare Git repository

Options:
  -b, --branch <BRANCH>                    Commit to this branch
  -v, --verbose...                         Increase logging verbosity
      --init                               Commit as initial commit
  -q, --quiet...                           Decrease logging verbosity
  -m, --message <MESSAGE>                  Commit message
      --repack                             Automatically repack loose objects
  -p, --extra-patterns <EXTRA_PATTERNS>    Glob patterns to additionally include
  -i, --ignore-patterns <IGNORE_PATTERNS>  Glob patterns to explicit ignore
  -h, --help                               Print help
```

</details>

#### Step 4: Restore Backup

If `$SAVE_DIR` already exists, MineCommit will rename it to `$SAVE_DIR.bak` before restoring.

```sh
minecommit checkout $SAVE_DIR $GIT_DIR --commit "main~1"
# Restores to the previous commit on the main branch
```

<details>
<summary><code>minecommit checkout --help</code></summary>

```text
Restore save from commit

Usage: minecommit checkout --commit <COMMIT> <SAVE_DIR> <GIT_DIR>

Arguments:
  <SAVE_DIR>  Path to your save
  <GIT_DIR>   Path to the bare Git repository

Options:
  -c, --commit <COMMIT>  Commit-ish to checkout (commit ID or revision expression, e.g. HEAD~1, branch~2)
  -h, --help             Print help
```

</details>

### Additional Commands

<details>
<summary>Flatten / Unflatten (without Git)</summary>

If you want to flatten a save to a plain filesystem directory (without Git integration), use `flatten` and `unflatten`:

```sh
# Deconstruct save into a flattened format
minecommit flatten $SAVE_DIR $FLATTENED_DIR

# Reconstruct save from the flattened format
minecommit unflatten $SAVE_DIR $FLATTENED_DIR
```

</details>

<details>
<summary>Utils (debugging)</summary>

```sh
# Dump chunk NBT data to stdout
minecommit utils chunk $REGION_FILE --chunk-x 0 --chunk-z 0
```

</details>

## 🔬 How It Works

MineCommit's design is based on a core insight: most of a Minecraft save's volume is concentrated in `region/*.mca` files, which contain substantial spatial redundancy (duplicate blocks and biomes across chunks) and temporal redundancy (minimal differences between adjacent backups).

MineCommit "flattens" the complex `.mca` binary format into small, Git-diffable files through a handler pipeline:

| Handler                 | Input Pattern           | Description                                             |
| ----------------------- | ----------------------- | ------------------------------------------------------- |
| `ChunkRegionHandler`    | `**/region/r.*.*.mca`   | Splits chunk NBT into per-chunk sections and other data |
| `EntitiesRegionHandler` | `**/entities/r.*.*.mca` | Flattens entity region files                            |
| `PoiRegionHandler`      | `**/poi/r.*.*.mca`      | Flattens point-of-interest region files                 |
| `GzipNbtHandler`        | `**/*.dat`              | Decompresses and processes Gzip-compressed NBT files    |
| `RawHandler`            | user-defined            | Copies arbitrary files as-is                            |
| `IgnoreHandler`         | user-defined            | Explicitly ignores matching files                       |

Each handler operates within its own namespaced workspace. The ODB (Object Database) abstraction layer decouples storage from handler logic, supporting both local filesystem backends (`LocalFsOdb`) and Git-backed storage (`LocalGitOdb`) with parallel read/write operations via `rayon`.

## 🗺️ Roadmap

- [x] `minecommit flatten`: Deconstruct save files into a flattened format
- [x] `minecommit unflatten`: Reconstruct save files from the flattened format
- [x] `minecommit commit`: Stream-flatten and commit to Git
- [x] `minecommit checkout`: Checkout from Git and stream-restore the save
- [x] Handler pipeline: `ChunkRegion`, `EntitiesRegion`, `PoiRegion`, `GzipNbt`, `Raw`, `Ignore`
- [x] ODB abstraction supporting filesystem and Git backends with parallel I/O
- [x] Basic GUI scaffold (Tauri + React + shadcn/ui)
- [x] CI/CD pipeline for automated builds (Windows, Linux, macOS)
- [x] Mod data handler for popular mods (e.g., SDMEconomy, CosArmor)
- [ ] GUI full implementation
    - [ ] Commit / Restore integration with backend
    - [ ] Push / Pull to remote repositories
    - [ ] Commit history browser
    - [ ] Save size analytics dashboard
- [ ] Blob object textification
    - [ ] `minecommit merge`: Chunk-level and game-semantic level merging
    - [ ] `minecommit diff`: Quickly view differences between two commits
    - [ ] `minecommit blame`: Block-level history tracking
- [ ] Chunk de-duplication based on Minecraft terrain generation algorithms

## 🤝 Contributing

The easiest way to contribute is just using MineCommit. You can use it on your saves during gaming.

If you encounter problems, feel free to open an issue.

For developing guide, please read [CONTRIBUTING.md](CONTRIBUTING.md).

## 🙏 Credits

Special thanks to the [`gitoxide` project](https://github.com/GitoxideLabs/gitoxide) (licensed under MIT / Apache-2.0) for providing a highly efficient and modern Git-compatible implementation.

Thanks to the [`simdnbt` project](https://github.com/azalea-rs/simdnbt) (licensed under MIT) for providing an extremely impressive NBT serialization/deserialization implementation.

Thanks to Lewis for providing the 4.6 GiB real-world test save. In the early stages of development, we lacked a large amount of real experimental data.

Thanks to everyone who followed this project in its early stages. Your questions and feedback are the fuel that drives this project forward.

## 📄 License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](./LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](./LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
