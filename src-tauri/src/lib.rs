use std::env;
use std::ffi::OsStr;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, Manager};

pub(crate) mod types;
use crate::types::*;
pub(crate) mod util;
use crate::util::*;
pub(crate) mod agent;
use crate::agent::*;
pub(crate) mod menu;
use crate::menu::*;

#[cfg(test)]
pub(crate) mod tests;

#[tauri::command]
fn open_text_file(path: String) -> Result<TextFileDocument, String> {
    let path_buf = PathBuf::from(&path);
    let metadata = fs::metadata(&path_buf).map_err(|err| format!("Cannot read file: {err}"))?;

    if !metadata.is_file() {
        return Err("Selected path is not a file.".to_string());
    }

    if metadata.len() > MAX_EDITABLE_BYTES {
        return Err("File is larger than the prototype editing limit of 10 MB.".to_string());
    }

    if looks_binary(&path_buf)? {
        return Err("Binary-looking files are not opened by this editor.".to_string());
    }

    let bytes = fs::read(&path_buf).map_err(|err| format!("Cannot read file: {err}"))?;
    let line_ending = detect_line_ending(&bytes);
    let contents = String::from_utf8(bytes)
        .map_err(|err| format!("File is not readable as UTF-8 text: {err}"))?;
    let name = path_buf
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled")
        .to_string();

    Ok(TextFileDocument {
        path,
        name,
        contents,
        line_ending,
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
        fingerprint: metadata_fingerprint(&metadata),
        large_file_warning: metadata.len() >= LARGE_FILE_WARNING_BYTES,
    })
}

#[tauri::command]
fn reveal_path_in_file_manager(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    fs::metadata(&path_buf).map_err(|err| format!("Cannot reveal path: {err}"))?;

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("/usr/bin/open")
            .arg("-R")
            .arg(&path_buf)
            .status()
            .map_err(|err| format!("Cannot open Finder: {err}"))?;

        if status.success() {
            return Ok(());
        }

        return Err(format!("Finder reveal failed with status {status}."));
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("explorer")
            .arg("/select,")
            .arg(&path_buf)
            .status()
            .map_err(|err| format!("Cannot open file manager: {err}"))?;

        if status.success() {
            return Ok(());
        }

        return Err(format!("File manager reveal failed with status {status}."));
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let directory = if path_buf.is_dir() {
            path_buf.as_path()
        } else {
            path_buf
                .parent()
                .ok_or_else(|| "Cannot find containing folder.".to_string())?
        };
        let status = Command::new("xdg-open")
            .arg(directory)
            .status()
            .map_err(|err| format!("Cannot open file manager: {err}"))?;

        if status.success() {
            return Ok(());
        }

        Err(format!("File manager open failed with status {status}."))
    }
}

/// Open a temporary HTML file in the default browser for printing.
#[tauri::command]
fn open_temp_print_html(html_content: String, file_name: String) -> Result<String, String> {
    use std::io::Write;

    let temp_dir = std::env::temp_dir().join("hazakura-note-print");
    fs::create_dir_all(&temp_dir).map_err(|err| format!("Cannot create print temp dir: {err}"))?;

    let file_path = temp_dir.join(&file_name);
    let mut file = fs::File::create(&file_path)
        .map_err(|err| format!("Cannot create print temp file: {err}"))?;
    file.write_all(html_content.as_bytes())
        .map_err(|err| format!("Cannot write print temp file: {err}"))?;

    // Open in default browser
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("/usr/bin/open")
            .arg(&file_path)
            .status()
            .map_err(|err| format!("Cannot open file in browser: {err}"))?;

        if !status.success() {
            return Err(format!("Open failed with status {status}."));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&file_path)
            .status()
            .map_err(|err| format!("Cannot open file in browser: {err}"))?;

        if !status.success() {
            return Err(format!("Open failed with status {status}."));
        }
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let status = Command::new("xdg-open")
            .arg(&file_path)
            .status()
            .map_err(|err| format!("Cannot open file in browser: {err}"))?;

        if !status.success() {
            return Err(format!("Open failed with status {status}."));
        }
    }

    let path_str = file_path.to_string_lossy().to_string();
    Ok(path_str)
}

#[tauri::command]
fn create_text_file(path: String) -> Result<TextFileDocument, String> {
    let path_buf = PathBuf::from(&path);

    if path_buf.exists() {
        return Err("A file already exists at the selected path.".to_string());
    }

    let parent = path_buf
        .parent()
        .ok_or_else(|| "Cannot create a file without a parent directory.".to_string())?;

    if !parent.is_dir() {
        return Err("Selected folder does not exist.".to_string());
    }

    path_buf
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Cannot create a file with an invalid name.".to_string())?;

    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path_buf)
        .map_err(|err| format!("Cannot create file: {err}"))?;
    file.sync_all()
        .map_err(|err| format!("Cannot sync created file: {err}"))?;

    open_text_file(path)
}

#[tauri::command]
fn get_file_metadata(path: String) -> Result<FileMetadataState, String> {
    let path_buf = PathBuf::from(&path);
    let metadata = readable_text_metadata(&path_buf)?;

    Ok(FileMetadataState {
        path,
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
        fingerprint: metadata_fingerprint(&metadata),
        large_file_warning: metadata.len() >= LARGE_FILE_WARNING_BYTES,
    })
}

#[tauri::command]
fn save_text_file(
    path: String,
    contents: String,
    expected_fingerprint: String,
    line_ending: String,
) -> Result<SavedFileState, String> {
    let path_buf = PathBuf::from(&path);
    let metadata = readable_text_metadata(&path_buf)?;

    if has_external_change(&metadata, &expected_fingerprint) {
        return Err(
            "Save conflict: the file changed on disk after it was opened. Reopen the file before saving."
                .to_string(),
        );
    }

    let normalized_contents = normalize_line_endings(&contents, &line_ending);
    atomic_write(&path_buf, normalized_contents.as_bytes())?;

    let metadata =
        fs::metadata(&path_buf).map_err(|err| format!("Cannot verify saved file: {err}"))?;

    Ok(SavedFileState {
        path,
        line_ending: line_ending_for_save(&line_ending).to_string(),
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
        fingerprint: metadata_fingerprint(&metadata),
    })
}

#[tauri::command]
fn save_text_file_as(
    path: String,
    contents: String,
    line_ending: String,
) -> Result<TextFileDocument, String> {
    let path_buf = PathBuf::from(&path);

    if path_buf.exists() {
        return Err("A file already exists at the selected path.".to_string());
    }

    let parent = path_buf
        .parent()
        .ok_or_else(|| "Cannot save a file without a parent directory.".to_string())?;

    if !parent.is_dir() {
        return Err("Selected folder does not exist.".to_string());
    }

    path_buf
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Cannot save a file with an invalid name.".to_string())?;

    let normalized_contents = normalize_line_endings(&contents, &line_ending);
    write_new_file(&path_buf, normalized_contents.as_bytes())?;

    open_text_file(path)
}

#[tauri::command]
fn list_workspace_tree(root: String) -> Result<WorkspaceTreeEntry, String> {
    let root_path = PathBuf::from(&root);
    ensure_workspace_root(&root_path)?;

    build_workspace_directory(&root_path)
}

#[tauri::command]
fn list_workspace_directory(root: String, directory: String) -> Result<WorkspaceTreeEntry, String> {
    let root_path = PathBuf::from(&root);
    let directory_path = PathBuf::from(&directory);
    let canonical_root = ensure_workspace_root(&root_path)?;
    let canonical_directory = fs::canonicalize(&directory_path)
        .map_err(|err| format!("Cannot read workspace folder: {err}"))?;

    if !canonical_directory.starts_with(&canonical_root) {
        return Err("Selected folder is outside the workspace root.".to_string());
    }

    let metadata = fs::metadata(&directory_path)
        .map_err(|err| format!("Cannot read workspace folder: {err}"))?;

    if !metadata.is_dir() {
        return Err("Selected workspace path is not a folder.".to_string());
    }

    build_workspace_directory(&directory_path)
}

#[tauri::command]
fn open_workspace_image(root: String, path: String) -> Result<ImagePreviewDocument, String> {
    let root_path = PathBuf::from(&root);
    let image_path = PathBuf::from(&path);
    let canonical_root = ensure_workspace_root(&root_path)?;
    let canonical_image =
        fs::canonicalize(&image_path).map_err(|err| format!("Cannot read image: {err}"))?;

    if !canonical_image.starts_with(&canonical_root) {
        return Err("Selected image is outside the workspace root.".to_string());
    }

    let metadata = fs::metadata(&image_path).map_err(|err| format!("Cannot read image: {err}"))?;

    if !metadata.is_file() {
        return Err("Selected path is not an image file.".to_string());
    }

    if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
        return Err("Image is larger than the preview limit of 20 MB.".to_string());
    }

    let bytes = fs::read(&image_path).map_err(|err| format!("Cannot read image: {err}"))?;
    let mime_type = image_mime_type(&image_path, &bytes).ok_or_else(|| {
        "Selected image contents do not match a supported image type.".to_string()
    })?;
    let name = image_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image")
        .to_string();

    Ok(ImagePreviewDocument {
        path,
        name,
        data_url: format!("data:{mime_type};base64,{}", encode_base64(&bytes)),
        size: metadata.len(),
    })
}

/// Save a pasted image from the clipboard (base64) to the workspace assets folder.
#[tauri::command]
fn save_pasted_image(
    workspace_root: String,
    data_base64: String,
    file_name: String,
) -> Result<String, String> {
    let root = PathBuf::from(&workspace_root);
    let canonical_root = ensure_workspace_root(&root)?;

    // Create assets directory if it doesn't exist
    let assets_dir = canonical_root.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| format!("Cannot create assets folder: {e}"))?;
    let canonical_assets =
        fs::canonicalize(&assets_dir).map_err(|e| format!("Cannot verify assets folder: {e}"))?;

    if !canonical_assets.starts_with(&canonical_root) {
        return Err("Assets folder is outside the workspace root.".to_string());
    }

    // Sanitize filename: only allow safe characters
    let requested_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let safe_name: String = requested_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    let safe_name = safe_name.trim_matches('.').to_string();
    if safe_name.is_empty() {
        return Err("Invalid file name".to_string());
    }

    // Handle duplicate names by appending a counter
    let dest = canonical_assets.join(&safe_name);
    let final_path = if dest.exists() {
        let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let ext = dest.extension().and_then(|e| e.to_str()).unwrap_or("png");
        let mut counter = 1;
        loop {
            let candidate = canonical_assets.join(format!("{stem}_{counter}.{ext}"));
            if !candidate.exists() {
                break candidate;
            }
            counter += 1;
        }
    } else {
        dest
    };

    let bytes = decode_base64(&data_base64)?;
    image_mime_type(&final_path, &bytes)
        .ok_or_else(|| "Pasted image contents do not match a supported image type.".to_string())?;
    fs::write(&final_path, &bytes).map_err(|e| format!("Cannot write image file: {e}"))?;

    // Return the relative path (for markdown insertion)
    let relative = final_path
        .strip_prefix(&canonical_root)
        .unwrap_or(&final_path)
        .to_string_lossy()
        .replace(std::path::MAIN_SEPARATOR, "/");
    Ok(relative)
}

/// Import an image from an arbitrary file path into the workspace assets folder.
#[tauri::command]
fn import_image_from_path(workspace_root: String, source_path: String) -> Result<String, String> {
    let root = PathBuf::from(&workspace_root);
    let canonical_root = ensure_workspace_root(&root)?;

    let src = PathBuf::from(&source_path);
    let metadata = fs::metadata(&src).map_err(|e| format!("Cannot read source file: {e}"))?;
    if !metadata.is_file() {
        return Err("Source path is not a file".to_string());
    }
    if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
        return Err(format!(
            "File exceeds size limit of {} MB",
            MAX_IMAGE_PREVIEW_BYTES / (1024 * 1024)
        ));
    }

    let bytes = fs::read(&src).map_err(|e| format!("Cannot read source file: {e}"))?;
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    // Validate that it's an image
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp") {
        return Err(format!("Unsupported image format: .{ext}"));
    }
    if image_mime_type(&src, &bytes).is_none() {
        return Err("File contents do not match a supported image type.".to_string());
    }

    let assets_dir = canonical_root.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| format!("Cannot create assets folder: {e}"))?;
    let canonical_assets =
        fs::canonicalize(&assets_dir).map_err(|e| format!("Cannot verify assets folder: {e}"))?;

    if !canonical_assets.starts_with(&canonical_root) {
        return Err("Assets folder is outside the workspace root.".to_string());
    }

    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let safe_name = format!("{stem}.{ext}");
    let safe_name: String = safe_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    let safe_name = safe_name.trim_matches('.').to_string();
    if safe_name.is_empty() {
        return Err("Invalid file name".to_string());
    }

    // Handle duplicate names by appending a counter
    let dest = canonical_assets.join(&safe_name);
    let final_path = if dest.exists() {
        let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let mut counter = 1;
        loop {
            let candidate = canonical_assets.join(format!("{stem}_{counter}.{ext}"));
            if !candidate.exists() {
                break candidate;
            }
            counter += 1;
        }
    } else {
        dest
    };

    fs::write(&final_path, &bytes).map_err(|e| format!("Cannot write image file: {e}"))?;

    let relative = final_path
        .strip_prefix(&canonical_root)
        .unwrap_or(&final_path)
        .to_string_lossy()
        .replace(std::path::MAIN_SEPARATOR, "/");
    Ok(relative)
}

#[tauri::command]
fn start_agent_workbench_session(
    session_store: tauri::State<'_, AgentWorkbenchSessionStore>,
    agent_workbench_enabled: bool,
    consent_acknowledged: bool,
    provider: String,
    workspace_root: String,
    terminal_columns: Option<u16>,
    terminal_rows: Option<u16>,
) -> Result<AgentWorkbenchSessionStartResult, String> {
    let path_var = agent_provider_app_search_path();
    let adapter = RealAgentRuntimeAdapter::new(session_store.inner());

    start_agent_workbench_session_with_store(
        session_store.inner(),
        &adapter,
        agent_workbench_enabled,
        consent_acknowledged,
        provider,
        workspace_root,
        path_var.as_deref(),
        terminal_columns,
        terminal_rows,
    )
}

#[tauri::command]
fn stop_agent_workbench_session(
    session_store: tauri::State<'_, AgentWorkbenchSessionStore>,
) -> Result<AgentWorkbenchSessionState, String> {
    let adapter = RealAgentRuntimeAdapter::new(session_store.inner());

    stop_agent_workbench_session_with_store(session_store.inner(), &adapter)
}

#[tauri::command]
fn get_agent_workbench_session_state(
    session_store: tauri::State<'_, AgentWorkbenchSessionStore>,
) -> Result<AgentWorkbenchSessionState, String> {
    get_agent_workbench_session_state_with_store(session_store.inner())
}

#[tauri::command]
fn write_agent_workbench_session_input(
    session_store: tauri::State<'_, AgentWorkbenchSessionStore>,
    input: String,
) -> Result<(), String> {
    write_agent_workbench_session_input_with_store(session_store.inner(), input)
}

#[tauri::command]
fn resize_agent_workbench_terminal(
    session_store: tauri::State<'_, AgentWorkbenchSessionStore>,
    columns: u16,
    rows: u16,
) -> Result<AgentWorkbenchSessionState, String> {
    resize_agent_workbench_terminal_with_store(session_store.inner(), columns, rows)
}

fn start_agent_workbench_session_with_store(
    session_store: &AgentWorkbenchSessionStore,
    runtime_adapter: &dyn AgentRuntimeAdapter,
    agent_workbench_enabled: bool,
    consent_acknowledged: bool,
    provider: String,
    workspace_root: String,
    path_var: Option<&OsStr>,
    terminal_columns: Option<u16>,
    terminal_rows: Option<u16>,
) -> Result<AgentWorkbenchSessionStartResult, String> {
    refresh_agent_workbench_session_exit(session_store)?;

    let preflight = build_agent_workbench_preflight(
        agent_workbench_enabled,
        consent_acknowledged,
        provider,
        workspace_root,
        path_var,
    )?;

    let Some(provider_path) = preflight.provider_path.clone() else {
        return Ok(AgentWorkbenchSessionStartResult {
            preflight,
            session: None,
            output: snapshot_agent_output(session_store)?,
        });
    };

    let mut current_session = session_store
        .session
        .lock()
        .map_err(|_| "Agent Workbench session state is unavailable.".to_string())?;

    if current_session
        .as_ref()
        .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Active)
    {
        return Err("Agent Workbench session is already active.".to_string());
    }

    let runtime = runtime_adapter.start(AgentRuntimeLaunchRequest {
        provider: &preflight.provider,
        workspace_root: &preflight.workspace_root,
        provider_path: &provider_path,
        path_env: path_var,
        terminal_columns,
        terminal_rows,
    })?;

    let session = AgentWorkbenchSession {
        provider: preflight.provider.clone(),
        workspace_root: preflight.workspace_root.clone(),
        provider_path,
        created_at_ms: current_time_ms(),
        status: AgentWorkbenchSessionStatus::Active,
        runtime,
    };

    *current_session = Some(session.clone());

    Ok(AgentWorkbenchSessionStartResult {
        preflight,
        session: Some(session),
        output: snapshot_agent_output(session_store)?,
    })
}

fn stop_agent_workbench_session_with_store(
    session_store: &AgentWorkbenchSessionStore,
    runtime_adapter: &dyn AgentRuntimeAdapter,
) -> Result<AgentWorkbenchSessionState, String> {
    refresh_agent_workbench_session_exit(session_store)?;

    let mut current_session = session_store
        .session
        .lock()
        .map_err(|_| "Agent Workbench session state is unavailable.".to_string())?;

    if let Some(session) = current_session.as_mut() {
        if session.status == AgentWorkbenchSessionStatus::Active {
            let stopped_runtime = runtime_adapter.stop(&session.runtime)?;
            session.runtime = stopped_runtime;
            session.status = AgentWorkbenchSessionStatus::Stopped;
        }
    }

    Ok(AgentWorkbenchSessionState {
        session: current_session.clone(),
        output: snapshot_agent_output(session_store)?,
    })
}

fn get_agent_workbench_session_state_with_store(
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentWorkbenchSessionState, String> {
    refresh_agent_workbench_session_exit(session_store)?;

    let current_session = session_store
        .session
        .lock()
        .map_err(|_| "Agent Workbench session state is unavailable.".to_string())?;

    Ok(AgentWorkbenchSessionState {
        session: current_session.clone(),
        output: snapshot_agent_output(session_store)?,
    })
}

fn write_agent_workbench_session_input_with_store(
    session_store: &AgentWorkbenchSessionStore,
    input: String,
) -> Result<(), String> {
    refresh_agent_workbench_session_exit(session_store)?;

    if input.is_empty() {
        return Ok(());
    }

    let session_is_active = session_store
        .session
        .lock()
        .map_err(|_| "Agent Workbench session state is unavailable.".to_string())?
        .as_ref()
        .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Active);

    if !session_is_active {
        return Err("Agent Workbench session is not active.".to_string());
    }

    let mut runtime = session_store
        .runtime
        .lock()
        .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;
    let process = runtime
        .as_mut()
        .ok_or_else(|| "Agent Workbench runtime is not active.".to_string())?;
    let stdin = process
        .stdin
        .as_mut()
        .ok_or_else(|| "Agent Workbench stdin is unavailable.".to_string())?;

    stdin
        .write_all(input.as_bytes())
        .map_err(|err| format!("Cannot write to provider stdin: {err}"))?;
    stdin
        .flush()
        .map_err(|err| format!("Cannot flush provider stdin: {err}"))?;

    Ok(())
}

fn resize_agent_workbench_terminal_with_store(
    session_store: &AgentWorkbenchSessionStore,
    columns: u16,
    rows: u16,
) -> Result<AgentWorkbenchSessionState, String> {
    refresh_agent_workbench_session_exit(session_store)?;

    if columns == 0 || rows == 0 {
        return Err("Agent Workbench terminal size is invalid.".to_string());
    }

    let session_is_active = session_store
        .session
        .lock()
        .map_err(|_| "Agent Workbench session state is unavailable.".to_string())?
        .as_ref()
        .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Active);

    if session_is_active {
        let runtime = session_store
            .runtime
            .lock()
            .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;
        if let Some(process) = runtime.as_ref() {
            if let Some(pty_control) = process.pty_control.as_ref() {
                resize_agent_pty(pty_control, columns, rows)?;
                #[cfg(unix)]
                notify_agent_pty_resized(&process.child);
            }
        }
    }

    get_agent_workbench_session_state_with_store(session_store)
}

fn refresh_agent_workbench_session_exit(
    session_store: &AgentWorkbenchSessionStore,
) -> Result<(), String> {
    let exit_status = {
        let mut runtime = session_store
            .runtime
            .lock()
            .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;
        let Some(process) = runtime.as_mut() else {
            return Ok(());
        };

        match process
            .child
            .try_wait()
            .map_err(|err| format!("Cannot inspect provider process: {err}"))?
        {
            Some(status) => {
                runtime.take();
                Some(status.to_string())
            }
            None => None,
        }
    };

    if let Some(status) = exit_status {
        let mut current_session = session_store
            .session
            .lock()
            .map_err(|_| "Agent Workbench session state is unavailable.".to_string())?;

        if let Some(session) = current_session.as_mut() {
            if session.status == AgentWorkbenchSessionStatus::Active {
                session.status = AgentWorkbenchSessionStatus::Exited;
                session.runtime.status = AgentRuntimeStatus::Exited;
            }
        }

        append_agent_output(
            &session_store.output,
            &session_store.next_output_seq,
            AgentWorkbenchOutputStream::System,
            format!("Provider process exited: {status}\n"),
        );
    }

    Ok(())
}

fn build_agent_workbench_preflight(
    agent_workbench_enabled: bool,
    consent_acknowledged: bool,
    provider: String,
    workspace_root: String,
    path_var: Option<&OsStr>,
) -> Result<AgentWorkbenchPreflight, String> {
    let canonical_workspace = validate_agent_workbench_launch(
        agent_workbench_enabled,
        consent_acknowledged,
        &provider,
        &workspace_root,
    )?;
    let provider_path = path_var.and_then(|candidate_path| {
        find_allowlisted_agent_provider_in_path_env(&provider, candidate_path)
    });

    Ok(AgentWorkbenchPreflight {
        provider,
        workspace_root: canonical_workspace.to_string_lossy().to_string(),
        provider_available: provider_path.is_some(),
        provider_path: provider_path.map(|path| path.to_string_lossy().to_string()),
        launch_implemented: true,
    })
}

fn validate_agent_workbench_launch(
    agent_workbench_enabled: bool,
    consent_acknowledged: bool,
    provider: &str,
    workspace_root: &str,
) -> Result<PathBuf, String> {
    if !agent_workbench_enabled {
        return Err(
            "Agent Workbench is disabled. Enable it in Preferences and restart before launching an agent."
                .to_string(),
        );
    }

    if !consent_acknowledged {
        return Err("Agent Workbench consent is required before launching an agent.".to_string());
    }

    if !is_allowlisted_agent_provider(provider) {
        return Err("Agent provider is not allowlisted.".to_string());
    }

    let workspace_root_path = PathBuf::from(workspace_root);
    let canonical_workspace = ensure_workspace_root(&workspace_root_path)?;

    Ok(canonical_workspace)
}

#[cfg(desktop)]
#[tauri::command]
fn update_app_menu_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: AppMenuState,
) -> Result<(), String> {
    let menu = build_app_menu_with_state(&app, Some(&state))
        .map_err(|err| format!("Cannot build app menu: {err}"))?;
    app.set_menu(menu)
        .map_err(|err| format!("Cannot update app menu: {err}"))?;

    Ok(())
}

#[tauri::command]
fn update_theme_menu_state<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    theme_preference: String,
) -> Result<(), String> {
    crate::menu::sync_theme_menu_state(&app, &theme_preference)
}

#[tauri::command]
fn drain_opened_files(store: tauri::State<'_, OpenedFileStore>) -> Result<Vec<String>, String> {
    let mut paths = store
        .0
        .lock()
        .map_err(|_| "Cannot read pending opened files.".to_string())?;
    Ok(paths.drain(..).collect())
}

#[tauri::command]
fn request_app_restart<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.request_restart();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(AgentWorkbenchSessionStore::default())
        .manage(OpenedFileStore::default())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder
        .menu(build_app_menu)
        .on_menu_event(emit_app_menu_event);

    builder
        .invoke_handler(tauri::generate_handler![
            open_text_file,
            reveal_path_in_file_manager,
            create_text_file,
            get_file_metadata,
            list_workspace_directory,
            list_workspace_tree,
            open_workspace_image,
            start_agent_workbench_session,
            stop_agent_workbench_session,
            get_agent_workbench_session_state,
            write_agent_workbench_session_input,
            resize_agent_workbench_terminal,
            drain_opened_files,
            request_app_restart,
            save_text_file,
            save_text_file_as,
            update_app_menu_state,
            update_theme_menu_state,
            save_pasted_image,
            import_image_from_path,
            open_temp_print_html,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let paths = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .filter(|path| path.is_file())
                    .map(|path| path.to_string_lossy().to_string())
                    .collect::<Vec<_>>();

                if paths.is_empty() {
                    return;
                }

                if let Some(store) = app.try_state::<OpenedFileStore>() {
                    if let Ok(mut pending_paths) = store.0.lock() {
                        pending_paths.extend(paths.clone());
                    }
                }

                let _ = app.emit(OPENED_FILES_EVENT, paths);
            }
        });
}
