use chrono::Local;
use log::{LevelFilter, Log, Metadata, Record};
use minecommit::{
    utils::cmd::{git_cmd, git_count_objects, git_repack},
    Config,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("A save named \"{0}\" already exists")]
    DuplicateName(String),
    #[error("Save \"{0}\" not found")]
    SaveNotFound(String),
    #[error("Invalid path: {0}")]
    InvalidUTF8(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeriveSaveInfo {
    pub name: String,
    pub repo_path: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Save {
    pub name: String,
    pub path: String,
    pub repo_path: String,
    pub remote_repo_path: String,
    pub last_access: String,
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[derive(Default)]
pub struct CommitAuthor {
    pub name: String,
    pub email: String,
}

// ─── Logger for capturing commit logs ───────────────────────────────────────

static LOGGER: CaptureLogger = CaptureLogger { lines: Mutex::new(Vec::new()) };

struct CaptureLogger {
    lines: Mutex<Vec<String>>,
}

impl Log for CaptureLogger {
    fn enabled(&self, _: &Metadata) -> bool {
        true
    }

    fn log(&self, record: &Record) {
        if let Ok(mut lines) = self.lines.lock() {
            let line = format!("{} {}", record.level(), record.args());
            lines.push(line);
        }
    }

    fn flush(&self) {}
}

fn init_logger() {
    // Safe to call multiple times; only the first call takes effect.
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(LevelFilter::Info);
}

fn take_logs() -> Vec<String> {
    LOGGER.lines.lock().unwrap_or_else(|e| e.into_inner()).drain(..).collect()
}

// ─── Tauri commands ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformCommitResult {
    pub success: bool,
    pub logs: Vec<String>,
    pub error: Option<String>,
    pub size_before_mib: Option<f64>,
    pub size_after_mib: Option<f64>,
    pub size_change_pct: Option<f64>,
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn perform_commit(
    app: tauri::AppHandle,
    save_dir: String,
    git_dir: String,
    branch: String,
    message: String,
    extra_patterns: Vec<String>,
    ignore_patterns: Vec<String>,
    use_repack: bool,
) -> PerformCommitResult {
    init_logger();
    take_logs(); // drain stale logs from previous calls

    let emit = |line: &str| {
        if let Err(e) = app.emit("commit-log", line) {
            eprintln!("failed to emit commit-log event: {e}");
        }
    };

    let capture = |lines: &[String]| {
        for line in lines {
            emit(line);
        }
    };

    // 1. Resolve parents: auto-detect if it's the first commit on this branch
    let parents = {
        match git_cmd(&git_dir, ["rev-parse", &format!("{branch}^{{{{commit}}}}")]).output() {
            Ok(out) if out.status.success() => {
                let hash = String::from_utf8(out.stdout).unwrap_or_default().trim().to_owned();
                log::info!("Branch '{branch}' exists at {hash}, creating child commit");
                vec![hash]
            }
            // If the branch has no commits yet, create a root commit (init)
            _ => {
                log::info!("Branch '{branch}' has no commits yet, creating initial commit");
                vec![]
            }
        }
    };
    let r#ref = format!("refs/heads/{}", &branch);

    // 2. Count objects before
    let size_before = match git_count_objects(&git_dir) {
        Ok(s) => {
            let v = s.total_size_mib();
            log::info!("Repo size before: {v:.3} MiB");
            v
        }
        Err(e) => {
            log::warn!("Failed to count git objects: {e}");
            f64::NAN
        }
    };

    // 3. Run the commit
    let unprocessed = match Config::new(
        PathBuf::from(&save_dir),
        PathBuf::from(&git_dir),
        extra_patterns,
        ignore_patterns,
    )
    .commit(parents, &message, Some(r#ref))
    {
        Ok(u) => u,
        Err(e) => {
            let msg = format!("{e:#}");
            log::error!("{msg}");
            let logs = take_logs();
            capture(&logs);
            return PerformCommitResult {
                success: false,
                logs,
                error: Some(msg),
                size_before_mib: Some(size_before),
                size_after_mib: None,
                size_change_pct: None,
            };
        }
    };

    // 4. Check for unprocessed files
    if !unprocessed.is_empty() {
        for item in &unprocessed {
            log::error!("Skipped file: {item}");
        }
        let msg = format!(
            "Skipped {} files because they are not caught by any handler. Catch them via -p or ignore them via -i.",
            unprocessed.len()
        );
        log::error!("{msg}");
        let logs = take_logs();
        capture(&logs);
        return PerformCommitResult {
            success: false,
            logs,
            error: Some(msg),
            size_before_mib: Some(size_before),
            size_after_mib: None,
            size_change_pct: None,
        };
    }

    // 5. Optional repack
    if use_repack {
        if let Err(e) = git_repack(&git_dir) {
            log::warn!("Repack failed: {e}");
        }
    } else {
        log::warn!("--repack is not enabled, Git repository can get bloated");
    }

    // 6. Count objects after
    let size_after = match git_count_objects(&git_dir) {
        Ok(s) => {
            let v = s.total_size_mib();
            log::info!("Repo size after: {v:.3} MiB");
            v
        }
        Err(e) => {
            log::warn!("Failed to count git objects: {e}");
            f64::NAN
        }
    };

    let size_change_pct = if size_before.is_finite() && size_before > 0.0 {
        Some((size_after - size_before) / size_before * 100.0)
    } else {
        None
    };

    if let Some(pct) = size_change_pct {
        let sign = if pct >= 0.0 { '+' } else { '-' };
        log::info!(
            "Done. Total size: {size_after:.3} MiB ({sign}{pct:.4}% from {size_before:.3} MiB)"
        );
    } else {
        log::info!("Done. Total size: {size_after:.3} MiB");
    }

    let logs = take_logs();
    capture(&logs);
    let _ = app.emit("commit-finished", ());

    PerformCommitResult {
        success: true,
        logs,
        error: None,
        size_before_mib: Some(size_before),
        size_after_mib: Some(size_after),
        size_change_pct,
    }
}

#[tauri::command]
fn check_repo_exists(repo_path: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["--git-dir", &repo_path, "rev-parse", "--is-bare-repository"])
        .output()
        .map_err(|e| format!("Failed to check repository existence: {}", e))?;

    Ok(output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true")
}

#[tauri::command]
fn init_bare_repo(repo_path: String, default_branch: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&repo_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to make parent directory: {}", e))?;
    }

    let output = Command::new("git")
        .args([
            "init",
            "--bare",
            &format!("--initial-branch={}", default_branch),
            &repo_path,
        ])
        .output()
        .map_err(|e| format!("Failed to initialize repository: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to initialize repository: {}", stderr))
    }
}

struct AppState {
    saves: Mutex<Vec<Save>>,
    commit_author: Mutex<CommitAuthor>,
    data_dir: PathBuf,
}

fn saves_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join("saves.json")
}

fn commit_author_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join("commit_author.json")
}

fn load_saves(data_dir: &PathBuf) -> Result<Vec<Save>, AppError> {
    let path = saves_file_path(data_dir);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_else(|_| "[]".to_string());
        Ok(serde_json::from_str(&content).unwrap_or_else(|_| vec![]))
    } else {
        // Ensure the data directory exists
        fs::create_dir_all(data_dir)?;
        Ok(vec![])
    }
}

fn save_saves(data_dir: &PathBuf, saves: &[Save]) -> Result<(), AppError> {
    let path = saves_file_path(data_dir);
    fs::create_dir_all(data_dir)?;
    let content = serde_json::to_string_pretty(saves)?;
    fs::write(&path, content)?;
    Ok(())
}

fn load_commit_author(data_dir: &Path) -> CommitAuthor {
    let path = commit_author_file_path(data_dir);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        CommitAuthor::default()
    }
}

fn save_commit_author(data_dir: &PathBuf, author: &CommitAuthor) -> Result<(), AppError> {
    let path = commit_author_file_path(data_dir);
    fs::create_dir_all(data_dir)?;
    let content = serde_json::to_string_pretty(author)?;
    fs::write(&path, content)?;
    Ok(())
}

#[tauri::command]
fn list_saves(state: tauri::State<AppState>) -> Vec<Save> {
    state.saves.lock().unwrap().clone()
}

#[tauri::command]
fn get_commit_author(state: tauri::State<AppState>) -> CommitAuthor {
    state.commit_author.lock().unwrap().clone()
}

#[tauri::command]
fn set_commit_author(
    state: tauri::State<AppState>,
    name: String,
    email: String,
) -> Result<CommitAuthor, AppError> {
    let author = CommitAuthor { name, email };
    save_commit_author(&state.data_dir, &author)?;
    *state.commit_author.lock().unwrap() = author.clone();
    Ok(author)
}

#[tauri::command]
fn add_save(
    state: tauri::State<AppState>,
    name: String,
    path: String,
    repo_path: String,
    remote_repo_path: String,
    default_branch: String,
) -> Result<Save, AppError> {
    let mut saves = state.saves.lock().unwrap();

    // Check for duplicate name
    if saves.iter().any(|s| s.name == name) {
        return Err(AppError::DuplicateName(name));
    }

    let save = Save {
        name,
        path,
        repo_path,
        remote_repo_path,
        last_access: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        default_branch,
    };
    saves.push(save.clone());
    save_saves(&state.data_dir, &saves)?;
    Ok(save)
}

#[tauri::command]
fn access_save(state: tauri::State<AppState>, name: String) -> Result<(), AppError> {
    let mut saves = state.saves.lock().unwrap();
    let save = saves
        .iter_mut()
        .find(|s| s.name == name)
        .ok_or(AppError::SaveNotFound(name))?;
    save.last_access = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    save_saves(&state.data_dir, &saves)?;
    Ok(())
}

#[tauri::command]
fn list_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(["--git-dir", &repo_path, "branch", "--format=%(refname:short)"])
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list branches: {}", stderr));
    }

    let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(branches)
}

#[tauri::command]
fn get_head_ref(repo_path: String) -> Result<String, String> {
    let head_path = Path::new(&repo_path).join("HEAD");
    let content = fs::read_to_string(&head_path)
        .map_err(|e| format!("Failed to read HEAD file: {}", e))?;

    // HEAD file content is like "ref: refs/heads/main\n"
    let trimmed = content.trim();
    const PREFIX: &str = "ref: refs/heads/";
    if let Some(branch) = trimmed.strip_prefix(PREFIX) {
        Ok(branch.to_string())
    } else {
        // Detached HEAD — fall back to "main"
        Ok("main".to_string())
    }
}

#[tauri::command]
fn derive_save_info(path: String) -> Result<DeriveSaveInfo, AppError> {
    let canonical = Path::new(&path).canonicalize()?;

    let parts: Vec<&str> = canonical
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_str().ok_or_else(|| {
                AppError::InvalidUTF8(format!("non-UTF8 component in path: {:?}", path))
            })),
            _ => None,
        })
        .collect::<Result<Vec<_>, _>>()?;

    let name = match parts.as_slice() {
        [.., launcher, ".minecraft", "versions", version, "saves", save_name] => {
            format!("{} / {version} / {save_name}", launcher.to_uppercase())
        }
        [.., launcher, ".minecraft", "saves", save_name] => {
            format!("{} / {save_name}", launcher.to_uppercase())
        }
        [.., "saves", save_name] => save_name.to_string(),
        _ => {
            return Err(AppError::InvalidUTF8(format!(
                "path has no meaningful segments: {}",
                path
            )))
        }
    };
    let repo_path = match parts.as_slice() {
        [.., _, ".minecraft", "versions", _, "saves", save_name]
        | [.., _, ".minecraft", "saves", save_name] => {
            let mut p = canonical.parent().unwrap().parent().unwrap().to_path_buf();
            p.push("minecommit");
            p.push(format!("{save_name}.git"));
            p.to_str().unwrap().to_string()
        }
        [.., save_name] => {
            let mut p = canonical.parent().unwrap().to_path_buf();
            p.push(format!("{save_name}.git"));
            p.to_str().unwrap().to_string()
        }
        _ => {
            return Err(AppError::InvalidUTF8(format!(
                "path has no meaningful segments: {}",
                path
            )))
        }
    };

    Ok(DeriveSaveInfo { name, repo_path })
}

#[tauri::command]
fn delete_save(
    state: tauri::State<AppState>,
    name: String,
    delete_repo: bool,
) -> Result<(), AppError> {
    let mut saves = state.saves.lock().unwrap();
    let save = saves.iter().find(|s| s.name == name).cloned();
    let len_before = saves.len();
    saves.retain(|s| s.name != name);
    if saves.len() == len_before {
        return Err(AppError::SaveNotFound(name));
    }
    save_saves(&state.data_dir, &saves)?;
    drop(saves);

    if delete_repo {
        if let Some(save) = save {
            let repo_path = Path::new(&save.repo_path);
            if repo_path.exists() {
                fs::remove_dir_all(repo_path)?;
            }
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let saves = load_saves(&data_dir)?;
            let commit_author = load_commit_author(&data_dir);

            app.manage(AppState {
                saves: Mutex::new(saves),
                commit_author: Mutex::new(commit_author),
                data_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_saves,
            add_save,
            delete_save,
            derive_save_info,
            access_save,
            check_repo_exists,
            init_bare_repo,
            list_branches,
            get_head_ref,
            get_commit_author,
            set_commit_author,
            perform_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
