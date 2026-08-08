use serde_json::json;
use std::path::PathBuf;

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
fn tool_run_command(command: String, folder: String, timeout: Option<u64>) -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let mut child = Command::new("sh")
        .arg("-c")
        .arg(&command)
        .current_dir(&folder)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn command: {e}"))?;

    let limit = timeout.unwrap_or(30).clamp(1, 600);
    let deadline = Instant::now() + Duration::from_secs(limit);

    let stdout_thread = {
        let out = child.stdout.take();
        std::thread::spawn(move || {
            let mut s = String::new();
            if let Some(mut o) = out {
                let _ = o.read_to_string(&mut s);
            }
            s
        })
    };
    let stderr_thread = {
        let err = child.stderr.take();
        std::thread::spawn(move || {
            let mut s = String::new();
            if let Some(mut e) = err {
                let _ = e.read_to_string(&mut s);
            }
            s
        })
    };

    let mut timed_out = false;
    let mut exit_status = None;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                exit_status = Some(status);
                break;
            }
            None if Instant::now() >= deadline => {
                timed_out = true;
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = stderr_thread.join().unwrap_or_default();

    if timed_out {
        return Err(format!("command timed out after {limit}s: {command}"));
    }

    let code = exit_status
        .and_then(|s| s.code())
        .map(|c| c.to_string())
        .unwrap_or_else(|| "?".into());
    let mut text = format!("exit code: {code}\n");
    if !stdout.is_empty() {
        text.push_str(&stdout);
        if !stdout.ends_with('\n') {
            text.push('\n');
        }
    }
    if !stderr.is_empty() {
        text.push_str(&stderr);
    }
    if text.len() > 20000 {
        text.truncate(20000);
        text.push_str("\n...[truncated]");
    }
    Ok(text)
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
            tool_search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
