# AGENT.md — MineCommit

> AI coding agent instructions for the MineCommit project.
> Repository: <https://github.com/HairlessVillager/minecommit>

## Project Overview

MineCommit converts **Minecraft Java Edition saves** into a **Git-friendly** flat format. Instead of storing monolithic `.mca` region files, it deconstructs them into small, diffable files so that Git’s delta compression can efficiently store incremental backups.

- **Language**: Rust (Nightly required — `simdnbt` dependency)
- **CLI**: `clap` + `env_logger` + `clap-verbosity-flag`
- **GUI**: [Tauri](https://tauri.app/) (Rust backend) + [React](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/)
- **License**: Apache-2.0 OR MIT

## Workspace Structure

```
minecommit/                  ← workspace root
├── Cargo.toml               ← workspace manifest (resolver = "3", edition = "2024")
├── minecommit/              ← core library crate
│   └── src/
│       ├── lib.rs           ← public API: Config, module declarations
│       ├── handler/         ← file-type handlers (see §Handlers)
│       ├── odb/             ← Object Database abstraction (Fs + Git backends)
│       └── utils/           ← NBT, region, git command helpers
├── minecommit-cli/          ← CLI binary crate
│   ├── Cargo.toml
│   └── main.rs              ← clap CLI definition + main()
├── minecommit-gui/          ← Tauri + React GUI
│   ├── src/                 ← React frontend
│   ├── src-tauri/           ← Tauri Rust backend (also a workspace member)
│   └── package.json
├── docs/                    ← Documentation (e.g. FAQ.md)
├── scripts/                 ← Build / release scripts
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

## Core Architecture

### Config (public entry point)

`minecommit::Config` is the main public API. Construct with `Config::new(save_dir, storage_dir, extra_patterns, ignore_patterns)` and then call one of:

| Method | Description |
|---|---|
| `flatten()` | Deconstruct save → flat filesystem directory |
| `unflatten()` | Reconstruct save ← flat filesystem directory |
| `commit(parents, message, ref)` | Flatten + create Git commit, returns list of unprocessed files |
| `checkout(commit)` | Restore save from a Git commit |

### Handler Pipeline

Each file type encountered in a Minecraft save is processed by a dedicated **handler**. Handlers implement the `Handler` trait (defined in `minecommit/src/handler/mod.rs`):

- **`ChunkRegionHandler`** — `**/region/r.*.*.mca` — Splits chunk NBT into per-chunk sections, timestamp headers, and other data. This is the most complex handler; has its own subdirectory `chunk_region/`.
- **`EntitiesRegionHandler`** — `**/entities/r.*.*.mca` — Flattens entity region files.
- **`PoiRegionHandler`** — `**/poi/r.*.*.mca` — Flattens point-of-interest region files.
- **`GzipNbtHandler`** — `**/*.dat` — Decompresses & processes Gzip-compressed NBT files (e.g., `level.dat`, player data).
- **`RawHandler`** — user-defined glob patterns — Copies arbitrary files as-is.
- **`IgnoreHandler`** — user-defined glob patterns — Explicitly ignores matching files.

All handlers are registered in `CrafterImpl::get_crafters()` in `mod.rs`. Each handler operates in its own namespaced workspace and communicates with storage via the **ODB abstraction**.

### ODB (Object Database)

Located in `minecommit/src/odb/`. Decouples handler logic from storage. Two backends:

- **`LocalFsOdb`** — Plain filesystem directory (used for `flatten`/`unflatten`).
- **`LocalGitOdb`** — Bare Git repository via `gitoxide` (used for `commit`/`checkout`). Provides parallel read/write via `rayon`.

### Utils

Located in `minecommit/src/utils/`. Key modules:

- **`cmd`** — Wrappers around external `git` binary (spawned for `commit`, `checkout`, `update-ref`, `rev-parse`, `count-objects`, `repack`).
- **`region`** — Low-level `.mca` region file parsing (headers, chunk offsets, timestamps).
- **`nbt`** — NBT serialization/deserialization via `simdnbt`.

## Key Dependencies

| Crate | Purpose |
|---|---|
| `simdnbt` | SIMD-accelerated NBT parsing (requires Rust Nightly) |
| `gitoxide` | Pure-Rust Git implementation for ODB Git backend |
| `rayon` | Parallel iteration for handler flatten/unflatten |
| `clap` + `clap-verbosity-flag` | CLI argument parsing |
| `anyhow` | Error handling throughout |
| `log` + `env_logger` | Logging |

## External Dependency

The **`commit` and `checkout`** CLI commands require an external `git` binary on `$PATH`. The project spawns `git` for:
- `git update-ref` — updating branch pointers
- `git rev-parse` — resolving commit-ish expressions
- `git count-objects` — measuring repo size
- `git repack` — packing loose objects

## Build & Development

```bash
# Prerequisite: Rust Nightly toolchain
rustup toolchain install nightly

# Build CLI
cargo build --release --bin minecommit

# Run tests
cargo test

# Lint
cargo fmt --check
cargo clippy

# GUI development
cd minecommit-gui
bun install          # or npm install
bun run tauri dev
```

## Code Conventions

- Edition **2024** with workspace resolver `3`.
- Error handling via `anyhow::Result` and `.context()`.
- Logging via `log` crate macros (`info!`, `warn!`, `error!`).
- In `lib.rs`, `mod` declarations are private; only `pub mod odb` and `pub mod utils` are re-exported.
- GitHub repo: `git@github.com:HairlessVillager/minecommit.git`
