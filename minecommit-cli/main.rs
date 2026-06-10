use std::path::PathBuf;

use anyhow::Context;
use clap::{Parser, Subcommand};
use clap_verbosity_flag::{InfoLevel, Verbosity};
use minecommit::{
    Config,
    utils::cmd::{git_cmd, git_count_objects, git_repack, git_repo_exists},
};

/// MineCommit - Commit your Minecraft world to Git
#[derive(Parser)]
#[command(version, about, long_about = None)]
struct Cli {
    #[command(flatten)]
    verbosity: Verbosity<InfoLevel>,
    #[command(subcommand)]
    action: CliSubcommand,
}

#[derive(Subcommand)]
enum CliSubcommand {
    /// Flatten save to the repo dir
    Flatten {
        /// Path to your save
        save_dir: PathBuf,
        /// Path to the flatten Git repository
        repo_dir: PathBuf,
    },
    /// Restore save from repo dir
    Unflatten {
        /// Path to your save
        save_dir: PathBuf,
        /// Path to the flatten Git repository
        repo_dir: PathBuf,
    },
    /// Flatten save and commit to Git
    Commit {
        /// Path to your save
        save_dir: PathBuf,
        /// Path to the bare Git repository
        #[arg(value_parser = git_repo_exists)]
        git_dir: PathBuf,
        /// Commit to this branch.
        #[arg(short, long)]
        branch: String,
        /// Commit as initial commit.
        #[arg(long)]
        init: bool,
        /// Commit message.
        #[arg(short, long)]
        message: String,
        /// Automatically repack loose objects.
        #[arg(long = "repack", default_value_t = false)]
        use_repack: bool,
        /// Glob patterns to additionally include
        #[arg(short = 'p', long)]
        extra_patterns: Vec<String>,
        /// Glob patterns to explicit ignore
        #[arg(short = 'i', long)]
        ignore_patterns: Vec<String>,
    },
    /// Restore save from commit
    Checkout {
        /// Path to your save
        save_dir: PathBuf,
        /// Path to the bare Git repository
        git_dir: PathBuf,
        /// Commit-ish to checkout (commit ID or revision expression, e.g. HEAD^1, branch~2)
        #[arg(short, long)]
        commit: String,
    },
    /// Utility tools for debug
    Utils {
        #[command(subcommand)]
        action: UtilsSubcommand,
    },
}

#[derive(Subcommand)]
enum UtilsSubcommand {
    /// Dump chunk nbt data to stdout
    Chunk {
        /// Path to region file
        region_path: PathBuf,
        /// Chunk X
        chunk_x: i32,
        /// Chunk Z
        chunk_z: i32,
    },
}

fn main() -> Result<(), anyhow::Error> {
    let cli = Cli::parse();
    env_logger::Builder::new()
        .filter_level(cli.verbosity.log_level_filter())
        .init();

    match cli.action {
        CliSubcommand::Flatten { save_dir, repo_dir } => {
            Config::new(save_dir, repo_dir, vec![], vec![]).flatten()
        }
        CliSubcommand::Unflatten { save_dir, repo_dir } => {
            Config::new(save_dir, repo_dir, vec![], vec![]).unflatten()
        }
        CliSubcommand::Commit {
            save_dir,
            git_dir,
            branch,
            init,
            message,
            use_repack,
            extra_patterns,
            ignore_patterns,
        } => {
            let parents = {
                let mut cmd = git_cmd(&git_dir, ["rev-parse", &format!("{branch}^{{commit}}")]);
                let out = cmd.output().context("failed to run git rev-parse")?;
                let branch_exists = out.status.success();
                match (branch_exists, init) {
                    (true, false) => {
                        vec![
                            String::from_utf8(out.stdout)
                                .context("git output is not valid UTF-8")?
                                .trim()
                                .to_owned(),
                        ]
                    }
                    (false, true) => vec![],
                    (true, true) => anyhow::bail!("branch '{branch}' exists, remove --init"),
                    (false, false) => anyhow::bail!(
                        "invalid branch name '{branch}'. Self-check via 'git --git-dir {:?} rev-parse {branch}^{{commit}}'",
                        git_dir.as_os_str()
                    ),
                }
            };
            let r#ref = format!("refs/heads/{}", &branch);

            let size_before = git_count_objects(&git_dir)
                .context("failed to count git objects")?
                .total_size_mib();
            let unprocessed = Config::new(
                save_dir,
                git_dir.to_owned(),
                extra_patterns,
                ignore_patterns,
            )
            .commit(parents, &message, Some(r#ref))?;
            if !unprocessed.is_empty() {
                for item in &unprocessed {
                    log::error!("Skipped file: {item}");
                }
                anyhow::bail!(
                    "Skipped {} files because they are not caught by any handler. Catch them via -p or ignore them via -i.",
                    unprocessed.len()
                );
            }

            if use_repack {
                git_count_objects(&git_dir).context("failed to count git objects")?;
                git_repack(&git_dir)?;
            } else {
                log::warn!("--repack is not enabled, Git repository can get bloated")
            }

            let size_after = git_count_objects(&git_dir)
                .context("failed to count git objects")?
                .total_size_mib();
            log::info!(
                "Done. Repo total size: {size_after:.3} MiB (up {:+.4}% from {size_before:.3} MiB)",
                (size_after - size_before) / size_before * 100.0
            );
            Ok(())
        }
        CliSubcommand::Checkout {
            save_dir,
            git_dir,
            commit,
        } => {
            if save_dir.exists() {
                let ts = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
                let bak = save_dir.with_extension(format!("{ts}.snapshot"));
                log::info!("save_dir {save_dir:?} already exists, renaming to {bak:?}");
                std::fs::rename(&save_dir, &bak).context("failed to rename save directory")?;
            }
            Config::new(save_dir, git_dir, vec![], vec![]).checkout(commit)?;
            log::info!("Done");
            Ok(())
        }

        CliSubcommand::Utils { action } => {
            let _: () = match action {
                UtilsSubcommand::Chunk {
                    region_path,
                    chunk_x,
                    chunk_z,
                } => {
                    use minecommit::utils::region::{parse_xz, read_region};
                    use std::fs;
                    use std::io::{self, Write};

                    let (region_x, region_z) = parse_xz(
                        region_path
                            .file_name()
                            .context("invalid region path")?
                            .to_str()
                            .context("region path contains invalid UTF-8")?,
                    )
                    .context("failed to parse region filename")?;
                    let (_, xz_nbts) = read_region(
                        fs::File::open(region_path).context("failed to open region file")?,
                        region_x,
                        region_z,
                    )
                    .context("failed to read region file")?
                    .context("region file is empty")?;
                    let (_, _, nbt) = xz_nbts
                        .iter()
                        .find(|(x, z, _)| *x == chunk_x && *z == chunk_z)
                        .with_context(|| {
                            format!(
                                "missing chunk, all chunk positions: {:#?}",
                                xz_nbts
                                    .iter()
                                    .map(|(x, z, _)| format!("({x}, {z})"))
                                    .collect::<Vec<_>>()
                            )
                        })
                        .context("chunk not found")?;
                    io::stdout()
                        .write_all(nbt)
                        .context("failed to write to stdout")?;
                }
            };
            Ok(())
        }
    }
}
