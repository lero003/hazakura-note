use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::{CStr, OsStr, OsString};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{
    AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
    WINDOW_SUBMENU_ID,
};
use tauri::{Emitter, Manager};

#[cfg(unix)]
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
#[cfg(unix)]
use std::os::raw::{c_char, c_ulong};

const LARGE_FILE_WARNING_BYTES: u64 = 5 * 1024 * 1024;
const MAX_EDITABLE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
const BINARY_SNIFF_BYTES: u64 = 8192;
const MAX_WORKSPACE_ENTRIES: usize = 2000;
const AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS: usize = 500;
const AGENT_PROVIDER_CODEX: &str = "codex";
const AGENT_PROVIDER_OPENCODE: &str = "opencode";
const AGENT_PROVIDER_GUI_SEARCH_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];
#[cfg(target_os = "macos")]
const O_RDWR_FLAG: i32 = 0x0002;
#[cfg(target_os = "macos")]
const O_NOCTTY_FLAG: i32 = 0x00020000;
const MENU_ACTION_EVENT: &str = "hazakura-note://menu-action";
const OPENED_FILES_EVENT: &str = "hazakura-note://opened-files";
const MENU_NEW_FILE: &str = "new-file";
const MENU_OPEN_FILE: &str = "open-file";
const MENU_OPEN_FOLDER: &str = "open-folder";
const MENU_SAVE: &str = "save";
const MENU_SAVE_AS: &str = "save-as";
const MENU_CLOSE_WINDOW: &str = "close-window";
const MENU_TOGGLE_PREVIEW: &str = "toggle-preview";
const MENU_TOGGLE_WRAP: &str = "toggle-wrap";
const MENU_TOGGLE_INVISIBLES: &str = "toggle-invisibles";
const MENU_THEME_SYSTEM: &str = "theme-system";
const MENU_THEME_LIGHT: &str = "theme-light";
const MENU_THEME_DARK: &str = "theme-dark";
const MENU_THEME_SAKURA: &str = "theme-sakura";
const MENU_THEME_HAZAKURA_NEXUS: &str = "theme-hazakura-nexus";
const MENU_THEME_YAKOU: &str = "theme-yakou";
const MENU_THEME_SHOKOU: &str = "theme-shokou";
const MENU_PREFERENCES: &str = "preferences";
const MENU_AGENT_WORKBENCH: &str = "agent-workbench";
const MENU_RECENT_FILE_PREFIX: &str = "recent-file-";
const MENU_RECENT_FOLDER_PREFIX: &str = "recent-folder-";
const EXCLUDED_WORKSPACE_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".turbo",
    "node_modules",
    "target",
    "dist",
    "build",
    ".cache",
];

#[derive(Debug, Serialize)]
struct TextFileDocument {
    path: String,
    name: String,
    contents: String,
    line_ending: String,
    size: u64,
    modified_ms: Option<u64>,
    fingerprint: String,
    large_file_warning: bool,
}

#[derive(Debug, Serialize)]
struct SavedFileState {
    path: String,
    line_ending: String,
    size: u64,
    modified_ms: Option<u64>,
    fingerprint: String,
}

#[derive(Debug, Serialize)]
struct FileMetadataState {
    path: String,
    size: u64,
    modified_ms: Option<u64>,
    fingerprint: String,
    large_file_warning: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImagePreviewDocument {
    path: String,
    name: String,
    data_url: String,
    size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentWorkbenchPreflight {
    provider: String,
    workspace_root: String,
    provider_available: bool,
    provider_path: Option<String>,
    launch_implemented: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum AgentRuntimeStatus {
    Running,
    Stopped,
    Exited,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRuntimeHandle {
    provider: String,
    workspace_root: String,
    provider_path: String,
    status: AgentRuntimeStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum AgentWorkbenchSessionStatus {
    Active,
    Stopped,
    Exited,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentWorkbenchSession {
    provider: String,
    workspace_root: String,
    provider_path: String,
    created_at_ms: u64,
    status: AgentWorkbenchSessionStatus,
    runtime: AgentRuntimeHandle,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum AgentWorkbenchOutputStream {
    Stdout,
    Stderr,
    System,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentWorkbenchOutputChunk {
    seq: u64,
    stream: AgentWorkbenchOutputStream,
    text: String,
    received_at_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentWorkbenchSessionStartResult {
    preflight: AgentWorkbenchPreflight,
    session: Option<AgentWorkbenchSession>,
    output: Vec<AgentWorkbenchOutputChunk>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentWorkbenchSessionState {
    session: Option<AgentWorkbenchSession>,
    output: Vec<AgentWorkbenchOutputChunk>,
}

struct AgentWorkbenchSessionStore {
    session: Mutex<Option<AgentWorkbenchSession>>,
    runtime: Mutex<Option<AgentRuntimeProcess>>,
    output: Arc<Mutex<Vec<AgentWorkbenchOutputChunk>>>,
    next_output_seq: Arc<Mutex<u64>>,
}

#[derive(Default)]
struct OpenedFileStore(Mutex<Vec<String>>);

impl Default for AgentWorkbenchSessionStore {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            runtime: Mutex::new(None),
            output: Arc::new(Mutex::new(Vec::new())),
            next_output_seq: Arc::new(Mutex::new(1)),
        }
    }
}

impl Drop for AgentWorkbenchSessionStore {
    fn drop(&mut self) {
        if let Ok(mut runtime) = self.runtime.lock() {
            if let Some(mut process) = runtime.take() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }
}

struct AgentRuntimeProcess {
    child: Child,
    stdin: Option<Box<dyn Write + Send>>,
    pty_control: Option<File>,
}

#[derive(Clone, Copy)]
struct AgentRuntimeLaunchRequest<'a> {
    provider: &'a str,
    workspace_root: &'a str,
    provider_path: &'a str,
    path_env: Option<&'a OsStr>,
    terminal_columns: Option<u16>,
    terminal_rows: Option<u16>,
}

trait AgentRuntimeAdapter {
    fn start(&self, request: AgentRuntimeLaunchRequest<'_>) -> Result<AgentRuntimeHandle, String>;
    fn stop(&self, handle: &AgentRuntimeHandle) -> Result<AgentRuntimeHandle, String>;
}

struct RealAgentRuntimeAdapter<'a> {
    session_store: &'a AgentWorkbenchSessionStore,
    terminal_mode: AgentRuntimeTerminalMode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
enum AgentRuntimeTerminalMode {
    Pipe,
    Pty,
}

impl<'a> RealAgentRuntimeAdapter<'a> {
    fn new(session_store: &'a AgentWorkbenchSessionStore) -> Self {
        Self {
            session_store,
            terminal_mode: AgentRuntimeTerminalMode::Pty,
        }
    }

    #[cfg(test)]
    fn new_piped_for_tests(session_store: &'a AgentWorkbenchSessionStore) -> Self {
        Self {
            session_store,
            terminal_mode: AgentRuntimeTerminalMode::Pipe,
        }
    }
}

impl AgentRuntimeAdapter for RealAgentRuntimeAdapter<'_> {
    fn start(&self, request: AgentRuntimeLaunchRequest<'_>) -> Result<AgentRuntimeHandle, String> {
        let mut runtime = self
            .session_store
            .runtime
            .lock()
            .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;

        if runtime.is_some() {
            return Err("Agent Workbench runtime is already active.".to_string());
        }

        append_agent_output(
            &self.session_store.output,
            &self.session_store.next_output_seq,
            AgentWorkbenchOutputStream::System,
            format!(
                "Starting {} in {}\n",
                request.provider, request.workspace_root
            ),
        );

        let runtime_process = match self.terminal_mode {
            AgentRuntimeTerminalMode::Pipe => {
                start_agent_pipe_process(request, self.session_store)?
            }
            AgentRuntimeTerminalMode::Pty => start_agent_pty_process(request, self.session_store)?,
        };

        *runtime = Some(runtime_process);

        Ok(AgentRuntimeHandle {
            provider: request.provider.to_string(),
            workspace_root: request.workspace_root.to_string(),
            provider_path: request.provider_path.to_string(),
            status: AgentRuntimeStatus::Running,
        })
    }

    fn stop(&self, handle: &AgentRuntimeHandle) -> Result<AgentRuntimeHandle, String> {
        let mut runtime = self
            .session_store
            .runtime
            .lock()
            .map_err(|_| "Agent Workbench runtime state is unavailable.".to_string())?;

        if let Some(mut process) = runtime.take() {
            process.stdin.take();
            match process
                .child
                .try_wait()
                .map_err(|err| format!("Cannot inspect provider process: {err}"))?
            {
                Some(status) => {
                    append_agent_output(
                        &self.session_store.output,
                        &self.session_store.next_output_seq,
                        AgentWorkbenchOutputStream::System,
                        format!("Provider process already exited: {status}\n"),
                    );
                }
                None => {
                    process
                        .child
                        .kill()
                        .map_err(|err| format!("Cannot stop provider process: {err}"))?;
                    let _ = process.child.wait();
                    append_agent_output(
                        &self.session_store.output,
                        &self.session_store.next_output_seq,
                        AgentWorkbenchOutputStream::System,
                        "Provider process stopped by user.\n".to_string(),
                    );
                }
            }
        }

        Ok(AgentRuntimeHandle {
            provider: handle.provider.clone(),
            workspace_root: handle.workspace_root.clone(),
            provider_path: handle.provider_path.clone(),
            status: AgentRuntimeStatus::Stopped,
        })
    }
}

fn build_agent_runtime_command(request: AgentRuntimeLaunchRequest<'_>) -> Command {
    let mut command = Command::new(request.provider_path);
    command.current_dir(request.workspace_root);

    if let Some(path_env) = request.path_env {
        command.env("PATH", path_env);
    }

    command.env("TERM", "xterm-256color");
    command
}

fn start_agent_pipe_process(
    request: AgentRuntimeLaunchRequest<'_>,
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentRuntimeProcess, String> {
    let mut command = build_agent_runtime_command(request);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|err| format!("Cannot start allowlisted provider CLI: {err}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Cannot open provider stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot open provider stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cannot open provider stderr.".to_string())?;

    spawn_agent_output_reader(
        stdout,
        AgentWorkbenchOutputStream::Stdout,
        Arc::clone(&session_store.output),
        Arc::clone(&session_store.next_output_seq),
    );
    spawn_agent_output_reader(
        stderr,
        AgentWorkbenchOutputStream::Stderr,
        Arc::clone(&session_store.output),
        Arc::clone(&session_store.next_output_seq),
    );

    Ok(AgentRuntimeProcess {
        child,
        stdin: Some(Box::new(stdin)),
        pty_control: None,
    })
}

#[cfg(unix)]
fn start_agent_pty_process(
    request: AgentRuntimeLaunchRequest<'_>,
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentRuntimeProcess, String> {
    let pty = open_agent_pty()?;
    if let (Some(columns), Some(rows)) = (request.terminal_columns, request.terminal_rows) {
        resize_agent_pty(&pty.master, columns, rows)?;
    }
    let input = pty
        .master
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY input: {err}"))?;
    let output = pty
        .master
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY output: {err}"))?;
    let pty_control = pty
        .master
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY control: {err}"))?;
    let stdin = pty
        .slave
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY stdin: {err}"))?;
    let stdout = pty
        .slave
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY stdout: {err}"))?;
    let stderr = pty
        .slave
        .try_clone()
        .map_err(|err| format!("Cannot clone provider PTY stderr: {err}"))?;

    let mut command = build_agent_runtime_command(request);
    command
        .stdin(Stdio::from(stdin))
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));

    let child = command
        .spawn()
        .map_err(|err| format!("Cannot start allowlisted provider CLI with PTY: {err}"))?;

    drop(pty.slave);
    spawn_agent_output_reader(
        output,
        AgentWorkbenchOutputStream::Stdout,
        Arc::clone(&session_store.output),
        Arc::clone(&session_store.next_output_seq),
    );

    Ok(AgentRuntimeProcess {
        child,
        stdin: Some(Box::new(input)),
        pty_control: Some(pty_control),
    })
}

#[cfg(not(unix))]
fn start_agent_pty_process(
    request: AgentRuntimeLaunchRequest<'_>,
    session_store: &AgentWorkbenchSessionStore,
) -> Result<AgentRuntimeProcess, String> {
    start_agent_pipe_process(request, session_store)
}

#[cfg(unix)]
struct AgentPty {
    master: File,
    slave: File,
}

#[cfg(unix)]
fn open_agent_pty() -> Result<AgentPty, String> {
    let master_fd = unsafe { posix_openpt(O_RDWR_FLAG | O_NOCTTY_FLAG) };
    if master_fd < 0 {
        return Err("Cannot open provider PTY master.".to_string());
    }

    if unsafe { grantpt(master_fd) } != 0 {
        close_fd(master_fd);
        return Err("Cannot grant provider PTY.".to_string());
    }

    if unsafe { unlockpt(master_fd) } != 0 {
        close_fd(master_fd);
        return Err("Cannot unlock provider PTY.".to_string());
    }

    let slave_name = unsafe {
        let raw_name = ptsname(master_fd);
        if raw_name.is_null() {
            close_fd(master_fd);
            return Err("Cannot resolve provider PTY slave.".to_string());
        }
        CStr::from_ptr(raw_name).to_string_lossy().to_string()
    };

    let slave = OpenOptions::new()
        .read(true)
        .write(true)
        .open(slave_name)
        .map_err(|err| {
            close_fd(master_fd);
            format!("Cannot open provider PTY slave: {err}")
        })?;
    let master = unsafe { File::from_raw_fd(master_fd) };

    Ok(AgentPty { master, slave })
}

#[cfg(unix)]
fn close_fd(fd: RawFd) {
    let _ = unsafe { close(fd) };
}

#[cfg(all(unix, target_os = "macos"))]
const TIOCSWINSZ_REQUEST: c_ulong = 0x8008_7467;

#[cfg(all(unix, target_os = "linux"))]
const TIOCSWINSZ_REQUEST: c_ulong = 0x5414;

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
const TIOCSWINSZ_REQUEST: c_ulong = 0x5414;

#[cfg(unix)]
#[repr(C)]
struct AgentPtyWindowSize {
    ws_row: u16,
    ws_col: u16,
    ws_xpixel: u16,
    ws_ypixel: u16,
}

#[cfg(unix)]
fn resize_agent_pty(pty: &File, columns: u16, rows: u16) -> Result<(), String> {
    let size = AgentPtyWindowSize {
        ws_row: rows,
        ws_col: columns,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let result = unsafe { ioctl(pty.as_raw_fd(), TIOCSWINSZ_REQUEST, &size) };
    if result != 0 {
        return Err(format!(
            "Cannot resize provider PTY: {}",
            std::io::Error::last_os_error()
        ));
    }

    Ok(())
}

#[cfg(not(unix))]
fn resize_agent_pty(_pty: &File, _columns: u16, _rows: u16) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
extern "C" {
    fn posix_openpt(oflag: i32) -> RawFd;
    fn grantpt(fd: RawFd) -> i32;
    fn unlockpt(fd: RawFd) -> i32;
    fn ptsname(fd: RawFd) -> *mut c_char;
    fn close(fd: RawFd) -> i32;
    fn ioctl(fd: RawFd, request: c_ulong, ...) -> i32;
}

fn spawn_agent_output_reader<R>(
    mut reader: R,
    stream: AgentWorkbenchOutputStream,
    output: Arc<Mutex<Vec<AgentWorkbenchOutputChunk>>>,
    next_output_seq: Arc<Mutex<u64>>,
) where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(bytes_read) => {
                    let text = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
                    append_agent_output(&output, &next_output_seq, stream.clone(), text);
                }
                Err(err) => {
                    append_agent_output(
                        &output,
                        &next_output_seq,
                        AgentWorkbenchOutputStream::System,
                        format!("Provider output read failed: {err}\n"),
                    );
                    break;
                }
            }
        }
    });
}

fn append_agent_output(
    output: &Arc<Mutex<Vec<AgentWorkbenchOutputChunk>>>,
    next_output_seq: &Arc<Mutex<u64>>,
    stream: AgentWorkbenchOutputStream,
    text: String,
) {
    if text.is_empty() {
        return;
    }

    let Ok(mut seq) = next_output_seq.lock() else {
        return;
    };
    let chunk = AgentWorkbenchOutputChunk {
        seq: *seq,
        stream,
        text,
        received_at_ms: current_time_ms(),
    };
    *seq += 1;

    if let Ok(mut chunks) = output.lock() {
        chunks.push(chunk);
        if chunks.len() > AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS {
            let overflow = chunks.len() - AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS;
            chunks.drain(0..overflow);
        }
    }
}

fn snapshot_agent_output(
    session_store: &AgentWorkbenchSessionStore,
) -> Result<Vec<AgentWorkbenchOutputChunk>, String> {
    session_store
        .output
        .lock()
        .map(|chunks| chunks.clone())
        .map_err(|_| "Agent Workbench output state is unavailable.".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppMenuState {
    has_active_tab: bool,
    active_dirty: bool,
    preview_visible: bool,
    wrap_lines: bool,
    show_invisibles: bool,
    theme_preference: String,
    menu_language: String,
    recent_files: Vec<AppMenuRecentItem>,
    recent_folders: Vec<AppMenuRecentItem>,
}

#[derive(Debug, Deserialize)]
struct AppMenuRecentItem {
    label: String,
}

#[derive(Debug, Serialize)]
struct WorkspaceTreeEntry {
    name: String,
    path: String,
    kind: WorkspaceEntryKind,
    children: Vec<WorkspaceTreeEntry>,
    children_loaded: bool,
    children_truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum WorkspaceEntryKind {
    Directory,
    File,
}

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

fn readable_text_metadata(path: &Path) -> Result<fs::Metadata, String> {
    let metadata = fs::metadata(path).map_err(|err| format!("Cannot read file: {err}"))?;

    if !metadata.is_file() {
        return Err("Selected path is not a file.".to_string());
    }

    if metadata.len() > MAX_EDITABLE_BYTES {
        return Err("File is larger than the prototype editing limit of 10 MB.".to_string());
    }

    if looks_binary(path)? {
        return Err("Binary-looking files are not opened by this editor.".to_string());
    }

    Ok(metadata)
}

fn image_mime_type(path: &Path, bytes: &[u8]) -> Option<&'static str> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase());

    match extension.as_deref() {
        Some("png") if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("image/png"),
        Some("jpg") | Some("jpeg") if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Some("image/jpeg"),
        Some("gif") if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => {
            Some("image/gif")
        }
        Some("webp")
            if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" =>
        {
            Some("image/webp")
        }
        _ => None,
    }
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        encoded.push(TABLE[(first >> 2) as usize] as char);
        encoded.push(TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);

        if chunk.len() > 1 {
            encoded.push(TABLE[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char);
        } else {
            encoded.push('=');
        }

        if chunk.len() > 2 {
            encoded.push(TABLE[(third & 0b0011_1111) as usize] as char);
        } else {
            encoded.push('=');
        }
    }

    encoded
}

fn ensure_workspace_root(root_path: &Path) -> Result<PathBuf, String> {
    let metadata =
        fs::metadata(root_path).map_err(|err| format!("Cannot read workspace folder: {err}"))?;

    if !metadata.is_dir() {
        return Err("Selected workspace path is not a folder.".to_string());
    }

    fs::canonicalize(root_path).map_err(|err| format!("Cannot read workspace folder: {err}"))
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

    if !matches!(provider, AGENT_PROVIDER_CODEX | AGENT_PROVIDER_OPENCODE) {
        return Err("Agent provider is not allowlisted.".to_string());
    }

    let workspace_root_path = PathBuf::from(workspace_root);
    let canonical_workspace = ensure_workspace_root(&workspace_root_path)?;

    Ok(canonical_workspace)
}

fn find_allowlisted_agent_provider_in_path_env(
    provider: &str,
    path_var: &OsStr,
) -> Option<PathBuf> {
    if !matches!(provider, AGENT_PROVIDER_CODEX | AGENT_PROVIDER_OPENCODE) {
        return None;
    }

    env::split_paths(path_var).find_map(|directory| {
        let candidate = directory.join(provider);

        if is_executable_file(&candidate) {
            Some(candidate)
        } else {
            None
        }
    })
}

fn agent_provider_app_search_path() -> Option<OsString> {
    build_agent_provider_search_path(
        env::var_os("PATH").as_deref(),
        env::var_os("HOME").as_deref(),
    )
}

fn build_agent_provider_search_path(
    path_var: Option<&OsStr>,
    home_var: Option<&OsStr>,
) -> Option<OsString> {
    let mut paths = Vec::new();

    if let Some(path_var) = path_var {
        for path in env::split_paths(path_var) {
            push_unique_existing_directory(&mut paths, path);
        }
    }

    if let Some(home_var) = home_var {
        let home = PathBuf::from(home_var);
        for directory in [".local/bin", ".cargo/bin", ".npm-global/bin", "bin"] {
            push_unique_existing_directory(&mut paths, home.join(directory));
        }
    }

    for directory in AGENT_PROVIDER_GUI_SEARCH_DIRS {
        push_unique_existing_directory(&mut paths, PathBuf::from(directory));
    }

    env::join_paths(paths).ok()
}

fn push_unique_existing_directory(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !path.is_dir() || paths.iter().any(|candidate| candidate == &path) {
        return;
    }

    paths.push(path);
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };

    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

fn build_workspace_directory(path: &Path) -> Result<WorkspaceTreeEntry, String> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| path.to_str().unwrap_or("workspace"))
        .to_string();
    let mut children = Vec::new();
    let mut children_truncated = false;

    let mut entries = fs::read_dir(path)
        .map_err(|err| format!("Cannot list workspace folder contents: {err}"))?
        .map(|entry| {
            let entry =
                entry.map_err(|err| format!("Cannot list workspace folder contents: {err}"))?;
            let file_type = entry
                .file_type()
                .map_err(|err| format!("Cannot inspect workspace entry: {err}"))?;
            Ok((entry, file_type))
        })
        .collect::<Result<Vec<_>, String>>()?;

    entries.sort_by(|(left, left_type), (right, right_type)| {
        let left_is_dir = left_type.is_dir();
        let right_is_dir = right_type.is_dir();

        right_is_dir
            .cmp(&left_is_dir)
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });

    for (entry, file_type) in entries {
        let child_path = entry.path();
        let child_name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_dir() && should_skip_workspace_dir(&child_name) {
            continue;
        }

        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }

        if children.len() >= MAX_WORKSPACE_ENTRIES {
            children_truncated = true;
            continue;
        }

        children.push(WorkspaceTreeEntry {
            name: child_name,
            path: child_path.to_string_lossy().to_string(),
            kind: if file_type.is_dir() {
                WorkspaceEntryKind::Directory
            } else {
                WorkspaceEntryKind::File
            },
            children: Vec::new(),
            children_loaded: file_type.is_file(),
            children_truncated: false,
        });
    }

    Ok(WorkspaceTreeEntry {
        name,
        path: path.to_string_lossy().to_string(),
        kind: WorkspaceEntryKind::Directory,
        children,
        children_loaded: true,
        children_truncated,
    })
}

fn should_skip_workspace_dir(name: &str) -> bool {
    name.starts_with('.') || EXCLUDED_WORKSPACE_DIRS.contains(&name)
}

fn has_external_change(metadata: &fs::Metadata, expected_fingerprint: &str) -> bool {
    metadata_fingerprint(metadata) != expected_fingerprint
}

fn looks_binary(path: &Path) -> Result<bool, String> {
    let mut file = File::open(path).map_err(|err| format!("Cannot inspect file: {err}"))?;
    let mut buffer = Vec::new();
    std::io::Read::by_ref(&mut file)
        .take(BINARY_SNIFF_BYTES)
        .read_to_end(&mut buffer)
        .map_err(|err| format!("Cannot inspect file contents: {err}"))?;

    Ok(buffer.contains(&0))
}

fn detect_line_ending(bytes: &[u8]) -> String {
    let mut crlf_count = 0;
    let mut lf_count = 0;
    let mut previous = None;

    for byte in bytes {
        if *byte == b'\n' {
            lf_count += 1;

            if previous == Some(b'\r') {
                crlf_count += 1;
            }
        }

        previous = Some(*byte);
    }

    let lone_lf_count = lf_count - crlf_count;

    if crlf_count > lone_lf_count {
        "crlf".to_string()
    } else {
        "lf".to_string()
    }
}

fn normalize_line_endings(contents: &str, requested_line_ending: &str) -> String {
    let line_ending = line_ending_for_save(requested_line_ending);

    if line_ending == "lf" {
        return contents.replace("\r\n", "\n");
    }

    let lf_contents = contents.replace("\r\n", "\n");
    lf_contents.replace('\n', "\r\n")
}

fn line_ending_for_save(requested_line_ending: &str) -> &'static str {
    if requested_line_ending == "crlf" {
        "crlf"
    } else {
        "lf"
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot save a file without a parent directory.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Cannot save a file with an invalid name.".to_string())?;
    let temp_path = parent.join(format!(".{file_name}.hazakura-note.tmp"));

    let mut temp_created = false;
    let write_result = (|| -> Result<(), String> {
        let mut temp_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|err| format!("Cannot create temp file: {err}"))?;
        temp_created = true;
        temp_file
            .write_all(bytes)
            .map_err(|err| format!("Cannot write temp file: {err}"))?;
        temp_file
            .sync_all()
            .map_err(|err| format!("Cannot sync temp file: {err}"))?;

        fs::rename(&temp_path, path).map_err(|err| format!("Cannot replace saved file: {err}"))
    })();

    if write_result.is_err() && temp_created {
        let _ = fs::remove_file(&temp_path);
    }

    write_result?;

    Ok(())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|err| format!("Cannot create file: {err}"))?;

    file.write_all(bytes)
        .map_err(|err| format!("Cannot write file: {err}"))?;
    file.sync_all()
        .map_err(|err| format!("Cannot sync file: {err}"))?;

    Ok(())
}

fn modified_ms(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

#[cfg(desktop)]
fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    build_app_menu_with_state(app, None)
}

#[cfg(desktop)]
fn build_app_menu_with_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: Option<&AppMenuState>,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let has_active_tab = state.map(|state| state.has_active_tab).unwrap_or(false);
    let active_dirty = state.map(|state| state.active_dirty).unwrap_or(false);
    let preview_visible = state.map(|state| state.preview_visible).unwrap_or(true);
    let wrap_lines = state.map(|state| state.wrap_lines).unwrap_or(true);
    let show_invisibles = state.map(|state| state.show_invisibles).unwrap_or(false);
    let theme_preference = state
        .map(|state| state.theme_preference.as_str())
        .unwrap_or("system");
    let menu_is_japanese = state
        .map(|state| state.menu_language.as_str() == "ja")
        .unwrap_or(false);
    let label = |english: &'static str, japanese: &'static str| {
        if menu_is_japanese {
            japanese
        } else {
            english
        }
    };
    let file_menu = Submenu::with_items(
        app,
        label("File", "ファイル"),
        true,
        &[
            &MenuItem::with_id(
                app,
                MENU_NEW_FILE,
                label("New File", "新規ファイル"),
                true,
                Some("CmdOrCtrl+N"),
            )?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_FILE,
                label("Open...", "開く..."),
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_FOLDER,
                label("Open Folder...", "フォルダを開く..."),
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &recent_submenu(
                app,
                label("Recent Files", "最近使ったファイル"),
                label("No Recent Items", "最近使った項目はありません"),
                MENU_RECENT_FILE_PREFIX,
                state
                    .map(|state| state.recent_files.as_slice())
                    .unwrap_or(&[]),
            )?,
            &recent_submenu(
                app,
                label("Recent Folders", "最近使ったフォルダ"),
                label("No Recent Items", "最近使った項目はありません"),
                MENU_RECENT_FOLDER_PREFIX,
                state
                    .map(|state| state.recent_folders.as_slice())
                    .unwrap_or(&[]),
            )?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &MenuItem::with_id(
                app,
                MENU_PREFERENCES,
                label("Preferences...", "設定..."),
                true,
                Some("CmdOrCtrl+,"),
            )?,
            #[cfg(not(target_os = "macos"))]
            &MenuItem::with_id(
                app,
                MENU_AGENT_WORKBENCH,
                label("Agent Workbench...", "Agent Workbench..."),
                true,
                None::<&str>,
            )?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_SAVE,
                label("Save", "保存"),
                active_dirty,
                Some("CmdOrCtrl+S"),
            )?,
            &MenuItem::with_id(
                app,
                MENU_SAVE_AS,
                label("Save As...", "別名で保存..."),
                has_active_tab,
                Some("CmdOrCtrl+Shift+S"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_CLOSE_WINDOW,
                label("Close Window", "ウィンドウを閉じる"),
                true,
                Some("CmdOrCtrl+Shift+W"),
            )?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        label("View", "表示"),
        true,
        &[
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_PREVIEW,
                label("Preview", "プレビュー"),
                true,
                preview_visible,
                Some("CmdOrCtrl+Option+P"),
            )?,
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_WRAP,
                label("Wrap Lines", "行を折り返す"),
                true,
                wrap_lines,
                Some("CmdOrCtrl+Option+W"),
            )?,
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_INVISIBLES,
                label("Show Invisibles", "不可視文字を表示"),
                true,
                show_invisibles,
                Some("CmdOrCtrl+Option+I"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &Submenu::with_items(
                app,
                label("Theme", "テーマ"),
                true,
                &[
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SYSTEM,
                        label("System", "システム"),
                        true,
                        theme_preference == "system",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_LIGHT,
                        label("Light", "ライト"),
                        true,
                        theme_preference == "light",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_DARK,
                        label("Dark", "ダーク"),
                        true,
                        theme_preference == "dark",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SAKURA,
                        "Sakura",
                        true,
                        theme_preference == "sakura",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_HAZAKURA_NEXUS,
                        label("Hazakura Nexus", "葉桜ネクサス"),
                        true,
                        theme_preference == "hazakura-nexus",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_YAKOU,
                        label("Yakou", "夜光"),
                        true,
                        theme_preference == "yakou",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SHOKOU,
                        label("Shokou", "曙光"),
                        true,
                        theme_preference == "shokou",
                        None::<&str>,
                    )?,
                ],
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(
                app,
                Some(label("Enter Full Screen", "フルスクリーンにする")),
            )?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        label("Edit", "編集"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(label("Undo", "取り消す")))?,
            &PredefinedMenuItem::redo(app, Some(label("Redo", "やり直す")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(label("Cut", "カット")))?,
            &PredefinedMenuItem::copy(app, Some(label("Copy", "コピー")))?,
            &PredefinedMenuItem::paste(app, Some(label("Paste", "ペースト")))?,
            &PredefinedMenuItem::select_all(app, Some(label("Select All", "すべて選択")))?,
        ],
    )?;
    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        label("Window", "ウィンドウ"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(label("Minimize", "しまう")))?,
            &PredefinedMenuItem::maximize(app, Some(label("Zoom", "拡大/縮小")))?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(
                app,
                Some(label("Close Window", "ウィンドウを閉じる")),
            )?,
        ],
    )?;
    let help_menu =
        Submenu::with_id_and_items(app, HELP_SUBMENU_ID, label("Help", "ヘルプ"), true, &[])?;

    #[cfg(target_os = "macos")]
    {
        let package_info = app.package_info();
        let config = app.config();
        let about_metadata = AboutMetadata {
            name: Some(package_info.name.clone()),
            version: Some(package_info.version.to_string()),
            copyright: config.bundle.copyright.clone(),
            authors: config
                .bundle
                .publisher
                .clone()
                .map(|publisher| vec![publisher]),
            ..Default::default()
        };
        let app_menu = Submenu::with_items(
            app,
            package_info.name.clone(),
            true,
            &[
                &PredefinedMenuItem::about(
                    app,
                    Some(label("About hazakura-note", "hazakura-note について")),
                    Some(about_metadata),
                )?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(
                    app,
                    MENU_PREFERENCES,
                    label("Preferences...", "設定..."),
                    true,
                    Some("CmdOrCtrl+,"),
                )?,
                &MenuItem::with_id(
                    app,
                    MENU_AGENT_WORKBENCH,
                    label("Agent Workbench...", "Agent Workbench..."),
                    true,
                    None::<&str>,
                )?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, Some(label("Services", "サービス")))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(
                    app,
                    Some(label("Hide hazakura-note", "hazakura-note を隠す")),
                )?,
                &PredefinedMenuItem::hide_others(app, Some(label("Hide Others", "ほかを隠す")))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(
                    app,
                    Some(label("Quit hazakura-note", "hazakura-note を終了")),
                )?,
            ],
        )?;

        menu.remove_at(0)?;
        menu.insert(&app_menu, 0)?;
        menu.remove_at(1)?;
        menu.insert(&file_menu, 1)?;
        menu.remove_at(2)?;
        menu.insert(&edit_menu, 2)?;
        menu.remove_at(3)?;
        menu.insert(&view_menu, 3)?;
        menu.remove_at(4)?;
        menu.insert(&window_menu, 4)?;
        menu.remove_at(5)?;
        menu.insert(&help_menu, 5)?;
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )))]
    {
        menu.remove_at(0)?;
        menu.insert(&file_menu, 0)?;
        menu.insert(&view_menu, 2)?;
    }

    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    {
        menu.insert(&file_menu, 0)?;
        menu.insert(&view_menu, 2)?;
    }

    Ok(menu)
}

#[cfg(desktop)]
fn recent_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    title: &str,
    empty_label: &str,
    id_prefix: &str,
    items: &[AppMenuRecentItem],
) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, title, true)?;

    if items.is_empty() {
        submenu.append(&MenuItem::new(app, empty_label, false, None::<&str>)?)?;
        return Ok(submenu);
    }

    for (index, item) in items.iter().take(8).enumerate() {
        submenu.append(&MenuItem::with_id(
            app,
            format!("{id_prefix}{index}"),
            menu_label(&item.label),
            true,
            None::<&str>,
        )?)?;
    }

    Ok(submenu)
}

#[cfg(desktop)]
fn menu_label(label: &str) -> String {
    let trimmed = label.trim();

    if trimmed.is_empty() {
        return "Untitled".to_string();
    }

    trimmed.replace('&', "&&")
}

#[cfg(desktop)]
fn emit_app_menu_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    event: tauri::menu::MenuEvent,
) {
    let action = event.id().as_ref();

    if action.starts_with(MENU_RECENT_FILE_PREFIX)
        || action.starts_with(MENU_RECENT_FOLDER_PREFIX)
        || matches!(
            action,
            MENU_NEW_FILE
                | MENU_OPEN_FILE
                | MENU_OPEN_FOLDER
                | MENU_SAVE
                | MENU_SAVE_AS
                | MENU_CLOSE_WINDOW
                | MENU_TOGGLE_PREVIEW
                | MENU_TOGGLE_WRAP
                | MENU_TOGGLE_INVISIBLES
                | MENU_THEME_SYSTEM
                | MENU_THEME_LIGHT
                | MENU_THEME_DARK
                | MENU_THEME_SAKURA
                | MENU_THEME_HAZAKURA_NEXUS
                | MENU_THEME_YAKOU
                | MENU_THEME_SHOKOU
                | MENU_PREFERENCES
                | MENU_AGENT_WORKBENCH
        )
    {
        let _ = app.emit(MENU_ACTION_EVENT, action);
    }
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

fn metadata_fingerprint(metadata: &fs::Metadata) -> String {
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    format!("{}:{modified_ns}", metadata.len())
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
            update_app_menu_state
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[derive(Clone, Debug, PartialEq, Eq)]
    struct RuntimeAdapterCall {
        provider: String,
        workspace_root: String,
        provider_path: String,
        terminal_columns: Option<u16>,
        terminal_rows: Option<u16>,
    }

    struct FakeProviderFixture {
        dir: PathBuf,
        command_path: PathBuf,
        path_env: OsString,
    }

    impl FakeProviderFixture {
        fn workspace_root(&self) -> String {
            self.dir.to_str().expect("workspace path").to_string()
        }

        fn path_var(&self) -> &OsStr {
            self.path_env.as_os_str()
        }

        fn provider_path(&self) -> String {
            self.command_path.to_string_lossy().to_string()
        }

        fn cleanup(self) {
            let _ = fs::remove_dir_all(self.dir);
        }
    }

    #[derive(Default)]
    struct RecordingRuntimeAdapter {
        start_calls: Mutex<Vec<RuntimeAdapterCall>>,
        stop_calls: Mutex<Vec<AgentRuntimeHandle>>,
        fail_start: bool,
        fail_stop: bool,
    }

    impl RecordingRuntimeAdapter {
        fn failing_start() -> Self {
            Self {
                start_calls: Mutex::new(Vec::new()),
                stop_calls: Mutex::new(Vec::new()),
                fail_start: true,
                fail_stop: false,
            }
        }

        fn failing_stop() -> Self {
            Self {
                start_calls: Mutex::new(Vec::new()),
                stop_calls: Mutex::new(Vec::new()),
                fail_start: false,
                fail_stop: true,
            }
        }

        fn start_calls(&self) -> Vec<RuntimeAdapterCall> {
            self.start_calls
                .lock()
                .expect("read runtime start calls")
                .clone()
        }

        fn stop_calls(&self) -> Vec<AgentRuntimeHandle> {
            self.stop_calls
                .lock()
                .expect("read runtime stop calls")
                .clone()
        }
    }

    impl AgentRuntimeAdapter for RecordingRuntimeAdapter {
        fn start(
            &self,
            request: AgentRuntimeLaunchRequest<'_>,
        ) -> Result<AgentRuntimeHandle, String> {
            self.start_calls
                .lock()
                .expect("record runtime call")
                .push(RuntimeAdapterCall {
                    provider: request.provider.to_string(),
                    workspace_root: request.workspace_root.to_string(),
                    provider_path: request.provider_path.to_string(),
                    terminal_columns: request.terminal_columns,
                    terminal_rows: request.terminal_rows,
                });

            if self.fail_start {
                return Err("runtime adapter failed".to_string());
            }

            Ok(AgentRuntimeHandle {
                provider: request.provider.to_string(),
                workspace_root: request.workspace_root.to_string(),
                provider_path: request.provider_path.to_string(),
                status: AgentRuntimeStatus::Running,
            })
        }

        fn stop(&self, handle: &AgentRuntimeHandle) -> Result<AgentRuntimeHandle, String> {
            self.stop_calls
                .lock()
                .expect("record runtime stop call")
                .push(handle.clone());

            if self.fail_stop {
                return Err("runtime stop adapter failed".to_string());
            }

            Ok(AgentRuntimeHandle {
                provider: handle.provider.clone(),
                workspace_root: handle.workspace_root.clone(),
                provider_path: handle.provider_path.clone(),
                status: AgentRuntimeStatus::Stopped,
            })
        }
    }

    #[test]
    fn binary_detection_finds_nul_byte() {
        let dir = unique_test_dir("binary_detection");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("sample.bin");
        fs::write(&path, b"abc\0def").expect("write binary fixture");

        assert!(looks_binary(&path).expect("inspect file"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_launch_rejects_disabled_mode() {
        let error =
            validate_agent_workbench_launch(false, true, AGENT_PROVIDER_CODEX, "/tmp").unwrap_err();

        assert!(error.contains("disabled"));
    }

    #[test]
    fn agent_workbench_launch_rejects_unacknowledged_consent() {
        let dir = unique_test_dir("agent_consent");
        fs::create_dir_all(&dir).expect("create test dir");
        let error = validate_agent_workbench_launch(
            true,
            false,
            AGENT_PROVIDER_CODEX,
            dir.to_str().unwrap(),
        )
        .unwrap_err();

        assert!(error.contains("consent"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_launch_rejects_non_allowlisted_provider() {
        let dir = unique_test_dir("agent_provider");
        fs::create_dir_all(&dir).expect("create test dir");
        let error =
            validate_agent_workbench_launch(true, true, "zsh", dir.to_str().unwrap()).unwrap_err();

        assert!(error.contains("allowlisted"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_launch_rejects_invalid_workspace_root() {
        let dir = unique_test_dir("agent_invalid_workspace");
        let error = validate_agent_workbench_launch(
            true,
            true,
            AGENT_PROVIDER_CODEX,
            dir.to_str().unwrap(),
        )
        .unwrap_err();

        assert!(error.contains("workspace"));
    }

    #[test]
    fn agent_workbench_launch_validates_workspace_root_before_future_launch() {
        let dir = unique_test_dir("agent_workspace");
        fs::create_dir_all(&dir).expect("create test dir");

        let canonical_workspace = validate_agent_workbench_launch(
            true,
            true,
            AGENT_PROVIDER_CODEX,
            dir.to_str().unwrap(),
        )
        .expect("validate workspace root");

        assert_eq!(canonical_workspace, fs::canonicalize(&dir).unwrap());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_rejects_disabled_mode() {
        let store = AgentWorkbenchSessionStore::default();
        let dir = unique_test_dir("agent_command_disabled");
        fs::create_dir_all(&dir).expect("create test dir");
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let adapter = RecordingRuntimeAdapter::default();
        let error = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            false,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("disabled"));
        assert!(store.session.lock().unwrap().is_none());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_rejects_unacknowledged_consent() {
        let store = AgentWorkbenchSessionStore::default();
        let dir = unique_test_dir("agent_command_consent");
        fs::create_dir_all(&dir).expect("create test dir");
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let adapter = RecordingRuntimeAdapter::default();
        let error = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            false,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("consent"));
        assert!(store.session.lock().unwrap().is_none());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_rejects_non_allowlisted_provider() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command_provider");
        fs::create_dir_all(&dir).expect("create test dir");
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let error = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            "zsh".to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("allowlisted"));
        assert!(store.session.lock().unwrap().is_none());
        assert!(adapter.start_calls().is_empty());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_rejects_invalid_workspace_root() {
        let store = AgentWorkbenchSessionStore::default();
        let dir = unique_test_dir("agent_command_invalid_workspace");
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let adapter = RecordingRuntimeAdapter::default();
        let error = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("workspace"));
        assert!(store.session.lock().unwrap().is_none());
    }

    #[test]
    fn agent_workbench_start_without_provider_does_not_create_session() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command_provider_missing");
        fs::create_dir_all(&dir).expect("create test dir");
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let result = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("preflight missing provider");

        assert!(!result.preflight.provider_available);
        assert!(result.preflight.provider_path.is_none());
        assert!(result.session.is_none());
        assert!(store.session.lock().unwrap().is_none());
        assert!(adapter.start_calls().is_empty());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_calls_runtime_adapter_with_resolved_launch_request() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_OPENCODE);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let result = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start session");
        let session = result.session.expect("session");

        assert_eq!(result.preflight.provider, AGENT_PROVIDER_OPENCODE);
        assert!(result.preflight.provider_available);
        assert!(result.preflight.launch_implemented);
        assert_eq!(session.provider, AGENT_PROVIDER_OPENCODE);
        assert_eq!(
            session.workspace_root,
            fs::canonicalize(&dir).unwrap().to_string_lossy()
        );
        assert_eq!(session.provider_path, command_path.to_string_lossy());
        assert_eq!(session.status, AgentWorkbenchSessionStatus::Active);
        assert!(session.created_at_ms > 0);
        assert_eq!(session.runtime.provider, AGENT_PROVIDER_OPENCODE);
        assert_eq!(session.runtime.workspace_root, session.workspace_root);
        assert_eq!(session.runtime.provider_path, session.provider_path);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Running);
        assert_eq!(
            adapter.start_calls(),
            vec![RuntimeAdapterCall {
                provider: AGENT_PROVIDER_OPENCODE.to_string(),
                workspace_root: fs::canonicalize(&dir)
                    .unwrap()
                    .to_string_lossy()
                    .to_string(),
                provider_path: command_path.to_string_lossy().to_string(),
                terminal_columns: None,
                terminal_rows: None,
            }]
        );
        assert_eq!(
            store.session.lock().unwrap().as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Active
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_passes_initial_terminal_size_to_runtime_adapter() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command_terminal_size");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            Some(132),
            Some(38),
        )
        .expect("start session");

        let calls = adapter.start_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].terminal_columns, Some(132));
        assert_eq!(calls[0].terminal_rows, Some(38));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_terminal_resize_rejects_invalid_dimensions() {
        let store = AgentWorkbenchSessionStore::default();

        let zero_columns = resize_agent_workbench_terminal_with_store(&store, 0, 24).unwrap_err();
        let zero_rows = resize_agent_workbench_terminal_with_store(&store, 80, 0).unwrap_err();

        assert!(zero_columns.contains("terminal size"));
        assert!(zero_rows.contains("terminal size"));
        assert!(store.session.lock().unwrap().is_none());
    }

    #[test]
    fn agent_workbench_terminal_resize_without_session_is_noop_state() {
        let store = AgentWorkbenchSessionStore::default();

        let state =
            resize_agent_workbench_terminal_with_store(&store, 120, 36).expect("resize no session");

        assert!(state.session.is_none());
        assert!(state.output.is_empty());
        assert!(store.runtime.lock().unwrap().is_none());
    }

    #[test]
    fn agent_workbench_terminal_resize_preserves_active_session_state() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_resize_active_session");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            Some(100),
            Some(30),
        )
        .expect("start session");

        let state =
            resize_agent_workbench_terminal_with_store(&store, 132, 42).expect("resize terminal");

        let session = state.session.expect("session");
        assert_eq!(session.status, AgentWorkbenchSessionStatus::Active);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Running);
        assert_eq!(
            store.session.lock().unwrap().as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Active
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_start_rejects_second_active_session() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command_duplicate");
        let other_dir = unique_test_dir("agent_command_duplicate_other");
        fs::create_dir_all(&dir).expect("create test dir");
        fs::create_dir_all(&other_dir).expect("create other test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        let other_command_path = other_dir.join(AGENT_PROVIDER_OPENCODE);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        fs::write(&other_command_path, b"#!/bin/sh\n").expect("write other fake provider");
        make_executable(&command_path);
        make_executable(&other_command_path);
        let path_env =
            env::join_paths([dir.clone(), other_dir.clone()]).expect("join PATH fixture");

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("first session");
        let error = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            other_dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("already active"));
        assert_eq!(adapter.start_calls().len(), 1);

        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_dir_all(other_dir);
    }

    #[test]
    fn agent_workbench_start_allows_new_session_after_exit() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_restart_after_exit",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nprintf 'restart-marker\\n'\nexit 0\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start first fake provider");
        let first_exit_state = wait_for_agent_state(&store, |state| {
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
        });
        let first_exit_last_seq = first_exit_state
            .output
            .last()
            .expect("first session output")
            .seq;

        let second_start = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start second fake provider");

        assert_eq!(
            second_start.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Active
        );

        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.matches("restart-marker").count() >= 2
        });
        let combined_output = combined_agent_output(&final_state);

        assert_eq!(combined_output.matches("restart-marker").count(), 2);
        assert_agent_output_seq_strictly_increases(&final_state.output);
        assert!(
            final_state.output.last().unwrap().seq > first_exit_last_seq,
            "new session output should continue after the first session output sequence",
        );
        assert_eq!(
            final_state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_start_allows_new_session_after_stop() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_restart_after_stop");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        let first_start = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start first session");
        let first_session = first_start.session.expect("first session");

        let stopped =
            stop_agent_workbench_session_with_store(&store, &adapter).expect("stop first session");
        assert_eq!(
            stopped.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Stopped
        );

        let second_start = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            Some(120),
            Some(40),
        )
        .expect("start second session");
        let second_session = second_start.session.expect("second session");

        assert_eq!(second_session.status, AgentWorkbenchSessionStatus::Active);
        assert!(second_session.created_at_ms >= first_session.created_at_ms);
        assert_eq!(adapter.start_calls().len(), 2);
        assert_eq!(adapter.stop_calls(), vec![first_session.runtime]);
        assert_eq!(adapter.start_calls()[1].terminal_columns, Some(120));
        assert_eq!(adapter.start_calls()[1].terminal_rows, Some(40));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_adapter_failure_does_not_create_session() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::failing_start();
        let dir = unique_test_dir("agent_command_adapter_failure");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let error = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .unwrap_err();

        assert!(error.contains("runtime adapter failed"));
        assert_eq!(adapter.start_calls().len(), 1);
        assert!(store.session.lock().unwrap().is_none());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn runtime_handle_exposes_no_process_resources() {
        let handle = AgentRuntimeHandle {
            provider: AGENT_PROVIDER_CODEX.to_string(),
            workspace_root: "/tmp/workspace".to_string(),
            provider_path: "/tmp/bin/codex".to_string(),
            status: AgentRuntimeStatus::Running,
        };
        let stopped_handle = AgentRuntimeHandle {
            status: AgentRuntimeStatus::Stopped,
            ..handle.clone()
        };
        let exited_handle = AgentRuntimeHandle {
            status: AgentRuntimeStatus::Exited,
            ..handle.clone()
        };
        let debug = format!("{handle:?}");
        let stopped_debug = format!("{stopped_handle:?}");
        let exited_debug = format!("{exited_handle:?}");

        assert_eq!(handle.status, AgentRuntimeStatus::Running);
        assert_eq!(stopped_handle.status, AgentRuntimeStatus::Stopped);
        assert_eq!(exited_handle.status, AgentRuntimeStatus::Exited);
        assert!(!debug.contains("pid"));
        assert!(!debug.contains("stdio"));
        assert!(!debug.contains("pty"));
        assert!(!debug.contains("process"));
        assert!(!stopped_debug.contains("pid"));
        assert!(!stopped_debug.contains("stdio"));
        assert!(!stopped_debug.contains("pty"));
        assert!(!stopped_debug.contains("process"));
        assert!(!exited_debug.contains("pid"));
        assert!(!exited_debug.contains("stdio"));
        assert!(!exited_debug.contains("pty"));
        assert!(!exited_debug.contains("process"));
    }

    #[test]
    fn agent_workbench_stop_marks_session_stopped_through_runtime_adapter() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command_stop");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        let started = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start session");
        let started_session = started.session.expect("started session");
        let state =
            stop_agent_workbench_session_with_store(&store, &adapter).expect("stop session");
        let session = state.session.expect("stopped session");

        assert_eq!(adapter.stop_calls(), vec![started_session.runtime]);
        assert_eq!(session.status, AgentWorkbenchSessionStatus::Stopped);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Stopped);
        assert_eq!(session.runtime.provider, AGENT_PROVIDER_CODEX);
        assert_eq!(session.runtime.workspace_root, session.workspace_root);
        assert_eq!(session.runtime.provider_path, session.provider_path);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_second_stop_after_stopped_session_is_noop() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_command_second_stop");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        let started = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start session");
        let started_session = started.session.expect("started session");

        stop_agent_workbench_session_with_store(&store, &adapter).expect("first stop");
        let state = stop_agent_workbench_session_with_store(&store, &adapter).expect("second stop");
        let session = state.session.as_ref().expect("stopped session");

        assert_eq!(adapter.stop_calls(), vec![started_session.runtime]);
        assert_eq!(session.status, AgentWorkbenchSessionStatus::Stopped);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Stopped);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_stop_without_session_does_not_call_runtime_adapter() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();

        let state =
            stop_agent_workbench_session_with_store(&store, &adapter).expect("stop no session");

        assert!(state.session.is_none());
        assert!(adapter.stop_calls().is_empty());
    }

    #[test]
    fn agent_workbench_stop_after_exit_does_not_call_runtime_adapter() {
        let store = AgentWorkbenchSessionStore::default();
        let start_adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let stop_adapter = RecordingRuntimeAdapter::default();
        let provider = fake_provider_fixture(
            "agent_stop_after_exit",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nexit 0\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &start_adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start fake provider");
        let exited_state = wait_for_agent_state(&store, |state| {
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
        });
        let output_len_before = exited_state.output.len();

        let state = stop_agent_workbench_session_with_store(&store, &stop_adapter)
            .expect("stop exited session");
        let session = state.session.as_ref().expect("exited session");

        assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
        assert_eq!(state.output.len(), output_len_before);
        assert!(stop_adapter.stop_calls().is_empty());

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_stop_adapter_failure_keeps_session_active() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::failing_stop();
        let dir = unique_test_dir("agent_command_stop_failure");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        let started = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start session");
        let started_session = started.session.expect("started session");
        let error = stop_agent_workbench_session_with_store(&store, &adapter).unwrap_err();
        let stored = store
            .session
            .lock()
            .unwrap()
            .clone()
            .expect("stored session");

        assert!(error.contains("runtime stop adapter failed"));
        assert_eq!(adapter.stop_calls(), vec![started_session.runtime]);
        assert_eq!(stored.status, AgentWorkbenchSessionStatus::Active);
        assert_eq!(stored.runtime.status, AgentRuntimeStatus::Running);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_real_runtime_starts_provider_and_captures_output_and_input() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_real_runtime_io",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nprintf 'ready\\n'\nprintf 'warn\\n' >&2\nwhile IFS= read line; do\n  printf 'echo:%s\\n' \"$line\"\n  [ \"$line\" = 'exit' ] && exit 0\ndone\n",
        );

        let started = start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start real provider");
        let session = started.session.expect("running session");

        assert_eq!(session.status, AgentWorkbenchSessionStatus::Active);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Running);
        assert_eq!(session.provider_path, provider.provider_path());

        write_agent_workbench_session_input_with_store(
            &store,
            "hello from hazakura\nexit\n".to_string(),
        )
        .expect("write provider input");
        let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

        assert!(state
            .output
            .iter()
            .all(|chunk| chunk.text != "hello from hazakura\nexit\n"));

        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            combined_output.contains("ready")
                && combined_output.contains("warn")
                && combined_output.contains("echo:hello")
                && state
                    .session
                    .as_ref()
                    .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
        });

        let combined_output = combined_agent_output(&final_state);
        assert!(combined_output.contains("ready"));
        assert!(combined_output.contains("warn"));
        assert!(combined_output.contains("echo:hello from hazakura"));
        assert_eq!(
            final_state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );
        assert_eq!(
            final_state.session.as_ref().unwrap().runtime.status,
            AgentRuntimeStatus::Exited
        );
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stdout));
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stderr));
        assert!(final_state
            .output
            .iter()
            .all(|chunk| chunk.text != "hello from hazakura\nexit\n"));
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System));

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_real_runtime_accepts_input_burst() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_real_runtime_input_burst",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nwhile IFS= read line; do\n  printf 'burst:%s\\n' \"$line\"\n  [ \"$line\" = 'done' ] && exit 0\ndone\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start burst fake provider");

        for index in 0..20 {
            write_agent_workbench_session_input_with_store(&store, format!("line-{index}\n"))
                .expect("write burst input");
        }
        write_agent_workbench_session_input_with_store(&store, "done\n".to_string())
            .expect("write burst terminator");

        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.contains("burst:line-0")
                && combined_output.contains("burst:line-19")
                && combined_output.contains("burst:done")
        });
        let combined_output = combined_agent_output(&final_state);

        assert_eq!(combined_output.matches("burst:line-").count(), 20);
        assert_eq!(
            final_state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_real_runtime_stop_kills_running_provider() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_real_runtime_stop",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nprintf 'waiting\\n'\nwhile :; do read line || true; done\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start real provider");
        let state =
            stop_agent_workbench_session_with_store(&store, &adapter).expect("stop provider");
        let session = state.session.expect("stopped session");

        assert_eq!(session.status, AgentWorkbenchSessionStatus::Stopped);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Stopped);
        assert!(store.runtime.lock().unwrap().is_none());
        assert!(state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System
                && chunk.text.contains("stopped")));

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_fake_provider_large_stdout_prunes_oldest_output() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_fake_provider_large_stdout",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\ndd if=/dev/zero bs=4096 count=650 2>/dev/null | tr '\\000' 'x'\nprintf '\\ntail-marker\\n'\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start fake provider");
        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.contains("tail-marker")
        });
        let combined_output = combined_agent_output(&final_state);

        assert_eq!(final_state.output.len(), AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS);
        assert!(final_state.output.first().unwrap().seq > 1);
        assert_agent_output_seq_strictly_increases(&final_state.output);
        assert!(combined_output.contains("tail-marker\n"));
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stdout));

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_fake_provider_immediate_exit_sets_exited_state() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_fake_provider_immediate_exit",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nexit 0\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start fake provider");
        let final_state = wait_for_agent_state(&store, |state| {
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
        });
        let session = final_state.session.as_ref().expect("exited session");

        assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System
                && chunk.text.contains("Provider process exited")));

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_fake_provider_abnormal_exit_records_stderr_and_system_output() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_fake_provider_abnormal_exit",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nprintf 'boom\\n' >&2\nexit 7\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start fake provider");
        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.contains("boom")
        });
        let session = final_state.session.as_ref().expect("exited session");
        let combined_output = combined_agent_output(&final_state);

        assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::Stderr
                && chunk.text.contains("boom")));
        assert!(final_state
            .output
            .iter()
            .any(|chunk| chunk.stream == AgentWorkbenchOutputStream::System
                && chunk.text.contains("Provider process exited")));
        assert!(
            combined_output.contains("exit status: 7") || combined_output.contains("exit code")
        );

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_output_chunks_are_bounded_and_pruned_oldest_first() {
        let store = AgentWorkbenchSessionStore::default();

        for index in 0..(AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS + 3) {
            append_agent_output(
                &store.output,
                &store.next_output_seq,
                AgentWorkbenchOutputStream::Stdout,
                format!("chunk-{index}\n"),
            );
        }

        let output = snapshot_agent_output(&store).expect("snapshot output");

        assert_eq!(output.len(), AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS);
        assert_eq!(output.first().unwrap().text, "chunk-3\n");
        assert_eq!(output.first().unwrap().seq, 4);
        assert_agent_output_seq_strictly_increases(&output);
        assert_eq!(
            output.last().unwrap().text,
            format!("chunk-{}\n", AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS + 2)
        );
        assert_eq!(
            output.last().unwrap().seq as usize,
            AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS + 3
        );
    }

    #[test]
    fn agent_workbench_stopped_session_rejects_input_without_changing_state() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RecordingRuntimeAdapter::default();
        let dir = unique_test_dir("agent_input_stopped");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start session");
        stop_agent_workbench_session_with_store(&store, &adapter).expect("stop session");
        let error = write_agent_workbench_session_input_with_store(&store, "hello\n".to_string())
            .unwrap_err();
        let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

        assert!(error.contains("not active"));
        assert_eq!(
            state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Stopped
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_exited_session_rejects_input_without_changing_state() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_input_exited",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nexit 0\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start fake provider");
        let exited_state = wait_for_agent_state(&store, |state| {
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
        });
        let output_len_before = exited_state.output.len();

        let error = write_agent_workbench_session_input_with_store(&store, "hello\n".to_string())
            .unwrap_err();
        let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

        assert!(error.contains("not active"));
        assert_eq!(
            state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );
        assert_eq!(state.output.len(), output_len_before);

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_terminal_resize_after_exit_is_noop_state() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
        let provider = fake_provider_fixture(
            "agent_resize_exited_session",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nexit 0\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            Some(100),
            Some(30),
        )
        .expect("start fake provider");
        let exited_state = wait_for_agent_state(&store, |state| {
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
        });
        let output_len_before = exited_state.output.len();

        let state = resize_agent_workbench_terminal_with_store(&store, 140, 44)
            .expect("resize exited session");

        let session = state.session.as_ref().expect("exited session");
        assert_eq!(session.status, AgentWorkbenchSessionStatus::Exited);
        assert_eq!(session.runtime.status, AgentRuntimeStatus::Exited);
        assert_eq!(state.output.len(), output_len_before);

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_stdin_failure_keeps_session_state() {
        let store = AgentWorkbenchSessionStore::default();
        let dir = unique_test_dir("agent_input_failure");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(
            &command_path,
            b"#!/bin/sh\nwhile :; do read line || true; done\n",
        )
        .expect("write fake provider");
        make_executable(&command_path);
        let child = Command::new(&command_path)
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn fake provider");
        let provider_path = command_path.to_string_lossy().to_string();
        let workspace_root = fs::canonicalize(&dir)
            .unwrap()
            .to_string_lossy()
            .to_string();
        let runtime_handle = AgentRuntimeHandle {
            provider: AGENT_PROVIDER_CODEX.to_string(),
            workspace_root: workspace_root.clone(),
            provider_path: provider_path.clone(),
            status: AgentRuntimeStatus::Running,
        };

        *store.session.lock().unwrap() = Some(AgentWorkbenchSession {
            provider: AGENT_PROVIDER_CODEX.to_string(),
            workspace_root,
            provider_path,
            created_at_ms: current_time_ms(),
            status: AgentWorkbenchSessionStatus::Active,
            runtime: runtime_handle,
        });
        *store.runtime.lock().unwrap() = Some(AgentRuntimeProcess {
            child,
            stdin: None,
            pty_control: None,
        });

        let error = write_agent_workbench_session_input_with_store(&store, "hello\n".to_string())
            .unwrap_err();
        let state = get_agent_workbench_session_state_with_store(&store).expect("read state");

        assert!(error.contains("stdin"));
        assert_eq!(
            state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Active
        );
        assert!(state.output.is_empty());

        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn agent_workbench_store_drop_stops_running_provider() {
        let dir = unique_test_dir("agent_drop_cleanup");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(
            &command_path,
            b"#!/bin/sh\nwhile :; do read line || true; done\n",
        )
        .expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let pid = {
            let store = AgentWorkbenchSessionStore::default();
            let adapter = RealAgentRuntimeAdapter::new_piped_for_tests(&store);
            start_agent_workbench_session_with_store(
                &store,
                &adapter,
                true,
                true,
                AGENT_PROVIDER_CODEX.to_string(),
                dir.to_str().unwrap().to_string(),
                Some(path_env.as_os_str()),
                None,
                None,
            )
            .expect("start provider");
            let process_id = store.runtime.lock().unwrap().as_ref().unwrap().child.id();
            process_id
        };

        std::thread::sleep(Duration::from_millis(100));

        assert!(!process_exists(pid));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_session_state_is_in_memory_only() {
        let store = AgentWorkbenchSessionStore::default();
        let dir = unique_test_dir("agent_command_memory_only");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let adapter = RecordingRuntimeAdapter::default();

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(path_env.as_os_str()),
            None,
            None,
        )
        .expect("start session");
        let fresh_store = AgentWorkbenchSessionStore::default();
        let state = get_agent_workbench_session_state_with_store(&store).expect("read state");
        let fresh_state =
            get_agent_workbench_session_state_with_store(&fresh_store).expect("read fresh state");

        assert!(state.session.is_some());
        assert!(fresh_state.session.is_none());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_provider_lookup_finds_allowlisted_executable() {
        let dir = unique_test_dir("agent_provider_lookup");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");
        let found = find_allowlisted_agent_provider_in_path_env(AGENT_PROVIDER_CODEX, &path_env)
            .expect("find fake provider");

        assert_eq!(found, command_path);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_app_search_path_adds_home_provider_bins() {
        let dir = unique_test_dir("agent_provider_app_search_path");
        let path_dir = dir.join("path-bin");
        let home_dir = dir.join("home");
        let home_bin = home_dir.join(".local/bin");
        fs::create_dir_all(&path_dir).expect("create PATH dir");
        fs::create_dir_all(&home_bin).expect("create home provider dir");

        let path_env = env::join_paths([path_dir.clone()]).expect("join PATH fixture");
        let search_path = build_agent_provider_search_path(
            Some(path_env.as_os_str()),
            Some(home_dir.as_os_str()),
        )
        .expect("build app search path");
        let paths = env::split_paths(&search_path).collect::<Vec<_>>();

        assert!(paths.contains(&path_dir));
        assert!(paths.contains(&home_bin));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_provider_lookup_uses_app_search_path_home_bins() {
        let dir = unique_test_dir("agent_provider_app_lookup");
        let path_dir = dir.join("path-bin");
        let home_dir = dir.join("home");
        let home_bin = home_dir.join(".local/bin");
        fs::create_dir_all(&path_dir).expect("create PATH dir");
        fs::create_dir_all(&home_bin).expect("create home provider dir");
        let command_path = home_bin.join(AGENT_PROVIDER_CODEX);
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake provider");
        make_executable(&command_path);

        let path_env = env::join_paths([path_dir]).expect("join PATH fixture");
        let search_path = build_agent_provider_search_path(
            Some(path_env.as_os_str()),
            Some(home_dir.as_os_str()),
        )
        .expect("build app search path");
        let found = find_allowlisted_agent_provider_in_path_env(AGENT_PROVIDER_CODEX, &search_path)
            .expect("find home fake provider");

        assert_eq!(found, command_path);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn agent_workbench_real_runtime_passes_app_search_path_to_provider_process() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new(&store);
        let dir = unique_test_dir("agent_provider_runtime_path");
        let path_dir = dir.join("path-bin");
        let home_dir = dir.join("home");
        let home_bin = home_dir.join(".local/bin");
        fs::create_dir_all(&path_dir).expect("create PATH dir");
        fs::create_dir_all(&home_bin).expect("create home bin");

        let command_path = path_dir.join(AGENT_PROVIDER_CODEX);
        fs::write(
            &command_path,
            b"#!/usr/bin/env node\nconsole.log('provider script should run through node')\n",
        )
        .expect("write env-node fake provider");
        make_executable(&command_path);

        let node_path = home_bin.join("node");
        fs::write(&node_path, b"#!/bin/sh\nprintf 'node-shim:%s\\n' \"$1\"\n")
            .expect("write fake node");
        make_executable(&node_path);

        let path_env = env::join_paths([path_dir]).expect("join PATH fixture");
        let search_path = build_agent_provider_search_path(
            Some(path_env.as_os_str()),
            Some(home_dir.as_os_str()),
        )
        .expect("build app search path");

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            dir.to_str().unwrap().to_string(),
            Some(search_path.as_os_str()),
            None,
            None,
        )
        .expect("start env-node fake provider");
        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.contains("node-shim:")
        });
        let combined_output = combined_agent_output(&final_state);

        assert!(combined_output.contains("node-shim:"));
        assert_eq!(
            final_state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn agent_workbench_real_runtime_pty_gives_provider_terminal_stdin() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new(&store);
        let provider = fake_provider_fixture(
            "agent_provider_pty_stdin",
            AGENT_PROVIDER_OPENCODE,
            b"#!/bin/sh\nif [ -t 0 ]; then printf 'stdin-is-tty\\n'; else printf 'stdin-is-not-tty\\n'; fi\nwhile IFS= read line; do\n  printf 'pty-echo:%s\\n' \"$line\"\n  [ \"$line\" = 'exit' ] && exit 0\ndone\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_OPENCODE.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            None,
            None,
        )
        .expect("start pty fake provider");
        write_agent_workbench_session_input_with_store(&store, "hello pty\nexit\n".to_string())
            .expect("write pty provider input");
        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.contains("stdin-is-tty")
                && combined_output.contains("pty-echo:hello pty")
        });
        let combined_output = combined_agent_output(&final_state);

        assert!(combined_output.contains("stdin-is-tty"));
        assert!(combined_output.contains("pty-echo:hello pty"));
        assert_eq!(
            final_state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );

        provider.cleanup();
    }

    #[cfg(unix)]
    #[test]
    fn agent_workbench_real_runtime_pty_applies_terminal_size() {
        let store = AgentWorkbenchSessionStore::default();
        let adapter = RealAgentRuntimeAdapter::new(&store);
        let provider = fake_provider_fixture(
            "agent_provider_pty_size",
            AGENT_PROVIDER_CODEX,
            b"#!/bin/sh\nstty size\nwhile IFS= read line; do\n  [ \"$line\" = 'size' ] && stty size\n  [ \"$line\" = 'exit' ] && exit 0\ndone\n",
        );

        start_agent_workbench_session_with_store(
            &store,
            &adapter,
            true,
            true,
            AGENT_PROVIDER_CODEX.to_string(),
            provider.workspace_root(),
            Some(provider.path_var()),
            Some(123),
            Some(37),
        )
        .expect("start pty fake provider");
        let initial_state = wait_for_agent_state(&store, |state| {
            combined_agent_output(state).contains("37 123")
        });
        assert!(combined_agent_output(&initial_state).contains("37 123"));

        resize_agent_workbench_terminal_with_store(&store, 132, 42).expect("resize pty");
        write_agent_workbench_session_input_with_store(&store, "size\nexit\n".to_string())
            .expect("write pty provider input");
        let final_state = wait_for_agent_state(&store, |state| {
            let combined_output = combined_agent_output(state);
            state
                .session
                .as_ref()
                .is_some_and(|session| session.status == AgentWorkbenchSessionStatus::Exited)
                && combined_output.contains("42 132")
        });
        let combined_output = combined_agent_output(&final_state);

        assert!(combined_output.contains("37 123"));
        assert!(combined_output.contains("42 132"));
        assert_eq!(
            final_state.session.as_ref().unwrap().status,
            AgentWorkbenchSessionStatus::Exited
        );

        provider.cleanup();
    }

    #[test]
    fn agent_workbench_provider_lookup_ignores_non_allowlisted_commands() {
        let dir = unique_test_dir("agent_provider_lookup_reject");
        fs::create_dir_all(&dir).expect("create test dir");
        let command_path = dir.join("zsh");
        fs::write(&command_path, b"#!/bin/sh\n").expect("write fake command");
        make_executable(&command_path);
        let path_env = env::join_paths([dir.clone()]).expect("join PATH fixture");

        assert!(find_allowlisted_agent_provider_in_path_env("zsh", &path_env).is_none());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_text_file_rejects_binary_looking_file() {
        let dir = unique_test_dir("open_binary");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("sample.md");
        fs::write(&path, b"# Title\n\0binary tail").expect("write binary fixture");

        let err = open_text_file(path.to_string_lossy().to_string())
            .expect_err("binary-looking markdown should fail");

        assert!(err.contains("Binary-looking"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_text_file_opens_utf8_json() {
        let dir = unique_test_dir("open_json_text_file");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("settings.json");
        fs::write(&path, "{\n  \"enabled\": true\n}\n").expect("write json fixture");

        let document =
            open_text_file(path.to_string_lossy().to_string()).expect("open json text file");

        assert_eq!(document.name, "settings.json");
        assert!(document.contents.contains("\"enabled\": true"));
        assert_eq!(document.line_ending, "lf");
    }

    #[test]
    fn create_text_file_creates_empty_markdown_file() {
        let dir = unique_test_dir("create_text_file");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("fresh.md");

        let document =
            create_text_file(path.to_string_lossy().to_string()).expect("create markdown file");

        assert_eq!(document.name, "fresh.md");
        assert_eq!(document.contents, "");
        assert_eq!(document.line_ending, "lf");
        assert_eq!(document.size, 0);
        assert!(path.exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn create_text_file_rejects_existing_file() {
        let dir = unique_test_dir("create_existing_text_file");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("existing.md");
        fs::write(&path, "# Existing\n").expect("write fixture");

        let err = create_text_file(path.to_string_lossy().to_string())
            .expect_err("existing file should not be overwritten");

        assert!(err.contains("already exists"));
        assert_eq!(
            fs::read_to_string(&path).expect("read protected file"),
            "# Existing\n"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn atomic_write_replaces_text_file() {
        let dir = unique_test_dir("atomic_write");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        fs::write(&path, "# Old\n").expect("write fixture");

        atomic_write(&path, b"# New\n").expect("atomic write");

        assert_eq!(
            fs::read_to_string(&path).expect("read saved file"),
            "# New\n"
        );
        assert!(!dir.join(".note.md.hazakura-note.tmp").exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn atomic_write_removes_temp_file_after_replace_failure() {
        let dir = unique_test_dir("atomic_write_cleanup");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        fs::create_dir_all(&path).expect("create directory target");

        let err = atomic_write(&path, b"# New\n").expect_err("replace directory should fail");

        assert!(err.contains("Cannot replace saved file"));
        assert!(!dir.join(".note.md.hazakura-note.tmp").exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn atomic_write_does_not_clobber_existing_temp_file() {
        let dir = unique_test_dir("atomic_write_existing_temp");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        let temp_path = dir.join(".note.md.hazakura-note.tmp");
        fs::write(&path, "# Old\n").expect("write fixture");
        fs::write(&temp_path, "# Existing temp\n").expect("write existing temp fixture");

        let err = atomic_write(&path, b"# New\n").expect_err("existing temp should fail safely");

        assert!(err.contains("Cannot create temp file"));
        assert_eq!(
            fs::read_to_string(&path).expect("read protected file"),
            "# Old\n"
        );
        assert_eq!(
            fs::read_to_string(&temp_path).expect("read existing temp file"),
            "# Existing temp\n"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_rejects_external_change_before_write() {
        let dir = unique_test_dir("save_conflict");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        fs::write(&path, "# Original\n").expect("write fixture");
        let opened_metadata = fs::metadata(&path).expect("read opened metadata");
        let opened_fingerprint = metadata_fingerprint(&opened_metadata);

        fs::write(&path, "# External change\n\nDo not overwrite.\n")
            .expect("simulate external change");

        let result = save_text_file(
            path.to_string_lossy().to_string(),
            "# Editor change\n".to_string(),
            opened_fingerprint,
            "lf".to_string(),
        );

        assert!(result
            .expect_err("save should reject conflict")
            .contains("Save conflict"));
        assert_eq!(
            fs::read_to_string(&path).expect("read protected file"),
            "# External change\n\nDo not overwrite.\n"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_preserves_crlf_line_endings() {
        let dir = unique_test_dir("save_crlf");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        fs::write(&path, b"# Title\r\n\r\nBody\r\n").expect("write crlf fixture");

        let document =
            open_text_file(path.to_string_lossy().to_string()).expect("open crlf fixture");

        assert_eq!(document.line_ending, "crlf");

        save_text_file(
            path.to_string_lossy().to_string(),
            "# Changed\n\nBody\n".to_string(),
            document.fingerprint,
            document.line_ending,
        )
        .expect("save crlf document");

        assert_eq!(
            fs::read(&path).expect("read saved file"),
            b"# Changed\r\n\r\nBody\r\n"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_preserves_lf_trailing_newline_presence() {
        let dir = unique_test_dir("save_lf_trailing_newline");
        fs::create_dir_all(&dir).expect("create test dir");
        let with_newline_path = dir.join("with-newline.md");
        let without_newline_path = dir.join("without-newline.md");
        fs::write(&with_newline_path, b"# Title\n\nBody\n").expect("write lf fixture");
        fs::write(&without_newline_path, b"# Title\n\nBody").expect("write lf fixture");

        let with_newline_document = open_text_file(with_newline_path.to_string_lossy().to_string())
            .expect("open lf fixture with final newline");
        let without_newline_document =
            open_text_file(without_newline_path.to_string_lossy().to_string())
                .expect("open lf fixture without final newline");

        save_text_file(
            with_newline_path.to_string_lossy().to_string(),
            "# Changed\n\nBody\n".to_string(),
            with_newline_document.fingerprint,
            with_newline_document.line_ending,
        )
        .expect("save lf document with final newline");
        save_text_file(
            without_newline_path.to_string_lossy().to_string(),
            "# Changed\n\nBody".to_string(),
            without_newline_document.fingerprint,
            without_newline_document.line_ending,
        )
        .expect("save lf document without final newline");

        assert_eq!(
            fs::read(&with_newline_path).expect("read saved file"),
            b"# Changed\n\nBody\n"
        );
        assert_eq!(
            fs::read(&without_newline_path).expect("read saved file"),
            b"# Changed\n\nBody"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_preserves_crlf_without_trailing_newline() {
        let dir = unique_test_dir("save_crlf_no_trailing_newline");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        fs::write(&path, b"# Title\r\n\r\nBody").expect("write crlf fixture");

        let document =
            open_text_file(path.to_string_lossy().to_string()).expect("open crlf fixture");

        assert_eq!(document.line_ending, "crlf");

        save_text_file(
            path.to_string_lossy().to_string(),
            "# Changed\n\nBody".to_string(),
            document.fingerprint,
            document.line_ending,
        )
        .expect("save crlf document without final newline");

        assert_eq!(
            fs::read(&path).expect("read saved file"),
            b"# Changed\r\n\r\nBody"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_text_file_as_creates_new_text_extension_with_requested_line_endings() {
        let dir = unique_test_dir("save_as_text_extension");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.log");

        let document = save_text_file_as(
            path.to_string_lossy().to_string(),
            "First\nSecond\n".to_string(),
            "crlf".to_string(),
        )
        .expect("save as text file");

        assert_eq!(document.name, "note.log");
        assert_eq!(document.line_ending, "crlf");
        assert_eq!(
            fs::read(&path).expect("read saved-as file"),
            b"First\r\nSecond\r\n"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_text_file_as_rejects_existing_file() {
        let dir = unique_test_dir("save_as_existing");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("existing.txt");
        fs::write(&path, "Keep me\n").expect("write fixture");

        let err = save_text_file_as(
            path.to_string_lossy().to_string(),
            "Overwrite attempt\n".to_string(),
            "lf".to_string(),
        )
        .expect_err("save as should not overwrite existing file");

        assert!(err.contains("already exists"));
        assert_eq!(
            fs::read_to_string(&path).expect("read protected file"),
            "Keep me\n"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn metadata_rejects_oversized_files() {
        let dir = unique_test_dir("oversized");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("huge.md");
        let file = File::create(&path).expect("create large file");
        file.set_len(MAX_EDITABLE_BYTES + 1)
            .expect("resize large file");

        let err = readable_text_metadata(&path).expect_err("large file should fail");

        assert!(err.contains("10 MB"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_tree_skips_heavy_and_hidden_directories() {
        let dir = unique_test_dir("workspace_tree");
        fs::create_dir_all(dir.join("notes")).expect("create notes dir");
        fs::create_dir_all(dir.join("node_modules/pkg")).expect("create node_modules dir");
        fs::create_dir_all(dir.join(".git/objects")).expect("create git dir");
        fs::create_dir_all(dir.join("target/debug")).expect("create target dir");
        fs::create_dir_all(dir.join("dist/assets")).expect("create dist dir");
        fs::write(dir.join("notes/today.md"), "# Today\n").expect("write note");
        fs::write(dir.join("README.md"), "# Readme\n").expect("write readme");

        let tree = list_workspace_tree(dir.to_string_lossy().to_string()).expect("list workspace");
        let names = tree
            .children
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();

        assert!(names.contains(&"notes"));
        assert!(names.contains(&"README.md"));
        assert!(!names.contains(&"node_modules"));
        assert!(!names.contains(&".git"));
        assert!(!names.contains(&"target"));
        assert!(!names.contains(&"dist"));
        assert!(tree.children_loaded);
        assert!(!tree.children_truncated);

        let notes = tree
            .children
            .iter()
            .find(|entry| entry.name == "notes")
            .expect("notes dir");
        assert!(!notes.children_loaded);
        assert!(notes.children.is_empty());

        let notes_tree =
            list_workspace_directory(dir.to_string_lossy().to_string(), notes.path.to_string())
                .expect("list notes dir");
        assert_eq!(notes_tree.children[0].name, "today.md");
        assert!(notes_tree.children_loaded);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_tree_uses_per_directory_cap_without_failing_root() {
        let dir = unique_test_dir("workspace_tree_cap");
        fs::create_dir_all(&dir).expect("create test dir");

        for index in 0..(MAX_WORKSPACE_ENTRIES + 5) {
            fs::write(dir.join(format!("{index:04}.md")), "# Note\n").expect("write note");
        }

        let tree = list_workspace_tree(dir.to_string_lossy().to_string()).expect("list workspace");

        assert_eq!(tree.children.len(), MAX_WORKSPACE_ENTRIES);
        assert!(tree.children_truncated);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_directory_rejects_paths_outside_root() {
        let root = unique_test_dir("workspace_root");
        let outside = unique_test_dir("workspace_outside");
        fs::create_dir_all(&root).expect("create root dir");
        fs::create_dir_all(&outside).expect("create outside dir");

        let err = list_workspace_directory(
            root.to_string_lossy().to_string(),
            outside.to_string_lossy().to_string(),
        )
        .expect_err("outside folder should fail");

        assert!(err.contains("outside the workspace root"));

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn open_workspace_image_returns_data_url_for_supported_image() {
        let dir = unique_test_dir("workspace_image");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("tiny.png");
        fs::write(&path, b"\x89PNG\r\n\x1a\n").expect("write png fixture");

        let image = open_workspace_image(
            dir.to_string_lossy().to_string(),
            path.to_string_lossy().to_string(),
        )
        .expect("open workspace image");

        assert_eq!(image.name, "tiny.png");
        assert_eq!(image.data_url, "data:image/png;base64,iVBORw0KGgo=");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_workspace_image_accepts_supported_signatures_by_extension() {
        let dir = unique_test_dir("workspace_image_signatures");
        fs::create_dir_all(&dir).expect("create test dir");

        let cases = [
            (
                "tiny.jpeg",
                b"\xff\xd8\xff\xe0".as_slice(),
                "data:image/jpeg;base64,",
            ),
            ("tiny.gif", b"GIF89a".as_slice(), "data:image/gif;base64,"),
            (
                "tiny.webp",
                b"RIFF\x04\x00\x00\x00WEBP".as_slice(),
                "data:image/webp;base64,",
            ),
        ];

        for (file_name, bytes, expected_prefix) in cases {
            let path = dir.join(file_name);
            fs::write(&path, bytes).expect("write image fixture");

            let image = open_workspace_image(
                dir.to_string_lossy().to_string(),
                path.to_string_lossy().to_string(),
            )
            .expect("open workspace image");

            assert_eq!(image.name, file_name);
            assert!(
                image.data_url.starts_with(expected_prefix),
                "{}",
                image.data_url
            );
        }

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_workspace_image_rejects_paths_outside_root() {
        let root = unique_test_dir("workspace_image_root");
        let outside = unique_test_dir("workspace_image_outside");
        fs::create_dir_all(&root).expect("create root dir");
        fs::create_dir_all(&outside).expect("create outside dir");
        let outside_image = outside.join("outside.jpg");
        fs::write(&outside_image, b"fake jpg").expect("write outside image");

        let err = open_workspace_image(
            root.to_string_lossy().to_string(),
            outside_image.to_string_lossy().to_string(),
        )
        .expect_err("outside image should be rejected");

        assert!(err.contains("outside the workspace root"), "{err}");

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn open_workspace_image_rejects_supported_extension_with_non_image_bytes() {
        let dir = unique_test_dir("workspace_image_non_image");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("not-an-image.png");
        fs::write(&path, b"# Not an image\n").expect("write fake image");

        let err = open_workspace_image(
            dir.to_string_lossy().to_string(),
            path.to_string_lossy().to_string(),
        )
        .expect_err("non-image bytes should be rejected");

        assert!(
            err.contains("contents do not match a supported image type"),
            "{err}"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_workspace_image_rejects_extension_signature_mismatch() {
        let dir = unique_test_dir("workspace_image_mismatch");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("jpeg-bytes.png");
        fs::write(&path, b"\xff\xd8\xff\xe0").expect("write mismatched image");

        let err = open_workspace_image(
            dir.to_string_lossy().to_string(),
            path.to_string_lossy().to_string(),
        )
        .expect_err("mismatched extension and signature should be rejected");

        assert!(
            err.contains("contents do not match a supported image type"),
            "{err}"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_workspace_image_rejects_oversized_image_before_preview() {
        let dir = unique_test_dir("workspace_image_oversized");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("oversized.png");
        let file = File::create(&path).expect("create oversized image fixture");
        file.set_len(MAX_IMAGE_PREVIEW_BYTES + 1)
            .expect("resize oversized image fixture");

        let err = open_workspace_image(
            dir.to_string_lossy().to_string(),
            path.to_string_lossy().to_string(),
        )
        .expect_err("oversized image should be rejected");

        assert!(err.contains("preview limit of 20 MB"), "{err}");

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_tree_rejects_file_root() {
        let dir = unique_test_dir("workspace_file_root");
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("note.md");
        fs::write(&path, "# Not a folder\n").expect("write file");

        let err = list_workspace_tree(path.to_string_lossy().to_string())
            .expect_err("file root should fail");

        assert!(err.contains("not a folder"));

        let _ = fs::remove_dir_all(dir);
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();

        std::env::temp_dir().join(format!("hazakura-note-{name}-{}-{now}", std::process::id()))
    }

    fn fake_provider_fixture(name: &str, provider: &str, script: &[u8]) -> FakeProviderFixture {
        let dir = unique_test_dir(name);
        fs::create_dir_all(&dir).expect("create fake provider workspace");
        let command_path = dir.join(provider);
        fs::write(&command_path, script).expect("write fake provider");
        make_executable(&command_path);
        let mut paths = vec![dir.clone()];
        if let Some(parent_path) = env::var_os("PATH") {
            paths.extend(env::split_paths(&parent_path));
        }
        let path_env = env::join_paths(paths).expect("join fake provider PATH");

        FakeProviderFixture {
            dir,
            command_path,
            path_env,
        }
    }

    fn wait_for_agent_state(
        store: &AgentWorkbenchSessionStore,
        predicate: impl Fn(&AgentWorkbenchSessionState) -> bool,
    ) -> AgentWorkbenchSessionState {
        let mut state =
            get_agent_workbench_session_state_with_store(store).expect("read agent session state");

        for _ in 0..80 {
            if predicate(&state) {
                return state;
            }

            std::thread::sleep(Duration::from_millis(50));
            state = get_agent_workbench_session_state_with_store(store)
                .expect("read agent session state");
        }

        state
    }

    fn combined_agent_output(state: &AgentWorkbenchSessionState) -> String {
        state
            .output
            .iter()
            .map(|chunk| chunk.text.as_str())
            .collect::<String>()
    }

    fn assert_agent_output_seq_strictly_increases(output: &[AgentWorkbenchOutputChunk]) {
        assert!(
            output
                .windows(2)
                .all(|window| window[0].seq < window[1].seq),
            "agent output sequence numbers should strictly increase",
        );
    }

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(path)
            .expect("read fake command metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).expect("mark fake command executable");
    }

    #[cfg(not(unix))]
    fn make_executable(_path: &Path) {}

    #[cfg(unix)]
    fn process_exists(pid: u32) -> bool {
        Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}
