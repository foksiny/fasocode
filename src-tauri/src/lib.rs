use serde_json::json;
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

const OUTPUT_CAP: usize = 20_000;

static COMMAND_ID: AtomicU64 = AtomicU64::new(1);
static RUNNING_COMMANDS: OnceLock<Mutex<HashMap<u64, Child>>> = OnceLock::new();

fn running_commands() -> &'static Mutex<HashMap<u64, Child>> {
    RUNNING_COMMANDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn resolve_in_folder(folder: &str, path: &str) -> Result<PathBuf, String> {
    let root = std::fs::canonicalize(folder).map_err(|e| format!("invalid folder: {e}"))?;
    let raw = root.join(path.trim_start_matches('/'));
    let target = if raw.exists() {
        raw.canonicalize().map_err(|e| format!("invalid path: {e}"))?
    } else {
        let parent = raw.parent().ok_or("invalid path")?;
        let canonical_parent = std::fs::canonicalize(parent).map_err(|e| format!("invalid path: {e}"))?;
        canonical_parent.join(raw.file_name().ok_or("invalid path")?)
    };
    if !target.starts_with(&root) {
        return Err("path is outside the project folder".into());
    }
    Ok(target)
}

#[tauri::command]
fn tool_read(folder: &str, path: &str) -> Result<String, String> {
    let target = resolve_in_folder(folder, path)?;
    let meta = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        let mut entries: Vec<String> = std::fs::read_dir(&target)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    format!("{name}/")
                } else {
                    name
                }
            })
            .collect();
        entries.sort();
        Ok(json!({ "type": "directory", "entries": entries }).to_string())
    } else {
        let content = std::fs::read_to_string(&target)
            .map_err(|e| format!("cannot read as text: {e}"))?;
        Ok(json!({ "type": "file", "content": content }).to_string())
    }
}

#[tauri::command]
fn tool_read_lines(folder: &str, path: &str, start: u32, end: u32) -> Result<String, String> {
    let target = resolve_in_folder(folder, path)?;
    let content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Ok("(empty file)".into());
    }
    let s = (start.max(1) as usize).min(lines.len());
    let e = (end.max(start) as usize).min(lines.len());
    let out = lines[s - 1..e].join("\n");
    Ok(json!({ "lines": out, "total_lines": lines.len() }).to_string())
}

#[tauri::command]
fn tool_write(folder: &str, path: &str, content: &str) -> Result<String, String> {
    let target = resolve_in_folder(folder, path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "written_bytes": content.len() }).to_string())
}

#[tauri::command]
fn tool_edit(folder: &str, path: &str, old: &str, new: &str) -> Result<String, String> {
    let target = resolve_in_folder(folder, path)?;
    let content = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
    if !content.contains(old) {
        return Err("old text not found in file".into());
    }
    let count = content.matches(old).count();
    let updated = content.replace(old, new);
    std::fs::write(&target, updated).map_err(|e| e.to_string())?;
    Ok(json!({ "replaced": count }).to_string())
}

#[tauri::command]
async fn tool_run_command(
    app: tauri::AppHandle,
    command: String,
    folder: String,
    timeout: Option<u64>,
    token: String,
) -> Result<u64, String> {
    let id = COMMAND_ID.fetch_add(1, Ordering::Relaxed);
    thread::spawn(move || run_command_worker(app, id, command, folder, timeout, token));
    Ok(id)
}

#[tauri::command]
fn tool_kill_command(id: u64) -> Result<(), String> {
    let mut map = running_commands().lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = map.remove(&id) {
        let _ = child.kill();
    }
    Ok(())
}

fn run_command_worker(
    app: tauri::AppHandle,
    id: u64,
    command: String,
    folder: String,
    timeout: Option<u64>,
    token: String,
) {
    let emit_finished = |exit_code: Option<i32>,
                         timed_out: bool,
                         error: Option<String>,
                         stdout: &str,
                         stderr: &str| {
        let mut text = String::new();
        if let Some(code) = exit_code {
            text.push_str(&format!("exit code: {code}\n"));
        }
        text.push_str(stdout);
        if !stdout.is_empty() && !stdout.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(stderr);
        if text.len() > OUTPUT_CAP {
            text.truncate(text.floor_char_boundary(OUTPUT_CAP));
            text.push_str("\n...[truncated]");
        }
        let _ = app.emit(
            "tool-command-finished",
            json!({
                "id": id,
                "token": token,
                "exit_code": exit_code,
                "timed_out": timed_out,
                "error": error,
                "output": text,
            }),
        );
    };

    if folder.trim().is_empty() {
        emit_finished(None, false, Some("no project folder is selected".into()), "", "");
        return;
    }

    let mut child = match Command::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(&folder)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            emit_finished(None, false, Some(format!("failed to spawn command: {e}")), "", "");
            return;
        }
    };
    let stdout = child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>);
    let stderr = child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>);
    running_commands().lock().unwrap().insert(id, child);

    let out_handle = spawn_stream_reader(app.clone(), id, token.clone(), "stdout", stdout);
    let err_handle = spawn_stream_reader(app.clone(), id, token.clone(), "stderr", stderr);

    let limit = timeout.unwrap_or(30).clamp(1, 600);
    let deadline = Instant::now() + Duration::from_secs(limit);
    let mut timed_out = false;
    let mut wait_error: Option<String> = None;
    let exit_code = loop {
        let status = {
            let mut map = match running_commands().lock() {
                Ok(m) => m,
                Err(e) => {
                    wait_error = Some(e.to_string());
                    break None;
                }
            };
            match map.get_mut(&id) {
                Some(c) => match c.try_wait() {
                    Ok(s) => s,
                    Err(e) => {
                        wait_error = Some(e.to_string());
                        break None;
                    }
                },
                None => break None,
            }
        };
        match status {
            Some(s) => break s.code(),
            None if Instant::now() >= deadline => {
                timed_out = true;
                if let Ok(mut map) = running_commands().lock() {
                    if let Some(c) = map.get_mut(&id) {
                        let _ = c.kill();
                    }
                }
                break None;
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    };
    running_commands().lock().unwrap().remove(&id);

    let stdout_text = out_handle.join().unwrap_or_default();
    let stderr_text = err_handle.join().unwrap_or_default();

    if let Some(err_msg) = wait_error {
        emit_finished(None, false, Some(err_msg), &stdout_text, &stderr_text);
    } else if timed_out {
        emit_finished(
            None,
            true,
            Some(format!("command timed out after {limit}s: {command}")),
            &stdout_text,
            &stderr_text,
        );
    } else {
        emit_finished(exit_code, false, None, &stdout_text, &stderr_text);
    }
}

fn spawn_stream_reader(
    app: tauri::AppHandle,
    id: u64,
    token: String,
    stream: &'static str,
    pipe: Option<Box<dyn Read + Send>>,
) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut acc = String::new();
        let Some(mut pipe) = pipe else { return acc };
        let mut buf = [0u8; 4096];
        loop {
            match pipe.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if acc.len() >= OUTPUT_CAP {
                        continue;
                    }
                    let room = OUTPUT_CAP - acc.len();
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    let emit_len = chunk.len().min(room);
                    let emit = &chunk[..chunk.floor_char_boundary(emit_len)];
                    acc.push_str(emit);
                    let _ = app.emit(
                        "tool-command-output",
                        json!({
                            "id": id,
                            "token": token,
                            "stream": stream,
                            "chunk": emit,
                        }),
                    );
                }
                Err(_) => break,
            }
        }
        acc
    })
}

#[tauri::command]
fn tool_search(folder: &str, query: &str, file_pattern: Option<String>) -> Result<String, String> {
    use std::fs;

    const SKIPPED: &[&str] = &[
        ".git", "node_modules", "target", "dist", "build", ".next", ".nuxt", "venv", ".venv",
        "__pycache__", ".idea", ".vscode", ".cache", ".mypy_cache", ".pytest_cache", "coverage",
    ];
    const MAX_FILES: usize = 20_000;
    const MAX_MATCHES: usize = 200;
    const MAX_FILE_BYTES: u64 = 1_000_000;

    let root = std::fs::canonicalize(folder).map_err(|e| format!("invalid folder: {e}"))?;
    let query_lc = query.to_lowercase();
    let pat_lc = file_pattern.as_ref().map(|p| p.to_lowercase());

    fn walk(
        dir: &std::path::Path,
        root: &std::path::Path,
        query_lc: &str,
        pat_lc: &Option<String>,
        results: &mut Vec<String>,
        file_count: &mut usize,
        depth: usize,
    ) {
        if depth > 20 || *file_count > MAX_FILES {
            return;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if SKIPPED.contains(&name.as_str()) || name.starts_with('.') {
                    continue;
                }
                walk(&entry.path(), root, query_lc, pat_lc, results, file_count, depth + 1);
                if *file_count > MAX_FILES {
                    return;
                }
                continue;
            }
            *file_count += 1;
            if let Some(p) = pat_lc {
                if !name.to_lowercase().contains(p) {
                    continue;
                }
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
                continue;
            }
            let content = match fs::read(entry.path()) {
                Ok(b) => b,
                Err(_) => continue,
            };
            if content.iter().take(4096).any(|&b| b == 0) {
                continue;
            }
            let text = String::from_utf8_lossy(&content);
            let rel = entry
                .path()
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|_| name.clone());
            for (i, line) in text.lines().enumerate() {
                if line.to_lowercase().contains(query_lc) {
                    let trimmed = line.trim().chars().take(200).collect::<String>();
                    results.push(format!("{rel}:{}: {trimmed}", i + 1));
                    if results.len() >= MAX_MATCHES {
                        return;
                    }
                }
            }
        }
    }

    let mut results: Vec<String> = Vec::new();
    let mut file_count = 0usize;
    walk(&root, &root, &query_lc, &pat_lc, &mut results, &mut file_count, 0);

    if results.is_empty() {
        return Ok(format!("No matches for \"{query}\""));
    }
    let mut out = results.join("\n");
    if results.len() >= MAX_MATCHES {
        out.push_str(&format!("\n...(showing first {MAX_MATCHES} matches)"));
    }
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            tool_read,
            tool_read_lines,
            tool_write,
            tool_edit,
            tool_run_command,
            tool_kill_command,
            tool_search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
