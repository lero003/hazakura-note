use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs::File;
use std::io::Write;
use std::process::Child;
use std::sync::{Arc, Mutex};

pub(crate) const LARGE_FILE_WARNING_BYTES: u64 = 5 * 1024 * 1024;
pub(crate) const MAX_EDITABLE_BYTES: u64 = 10 * 1024 * 1024;
pub(crate) const MAX_IMAGE_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
pub(crate) const BINARY_SNIFF_BYTES: u64 = 8192;
pub(crate) const MAX_WORKSPACE_ENTRIES: usize = 2000;
pub(crate) const AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS: usize = 500;
pub(crate) const AGENT_PROVIDER_CODEX: &str = "codex";
pub(crate) const AGENT_PROVIDER_OPENCODE: &str = "opencode";
pub(crate) const AGENT_PROVIDER_PI: &str = "pi";
pub(crate) const AGENT_PROVIDER_GUI_SEARCH_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];
#[cfg(target_os = "macos")]
pub(crate) const O_RDWR_FLAG: i32 = 0x0002;
#[cfg(target_os = "macos")]
pub(crate) const O_NOCTTY_FLAG: i32 = 0x00020000;
pub(crate) const MENU_ACTION_EVENT: &str = "hazakura-note://menu-action";
pub(crate) const OPENED_FILES_EVENT: &str = "hazakura-note://opened-files";
pub(crate) const MENU_NEW_FILE: &str = "new-file";
pub(crate) const MENU_OPEN_FILE: &str = "open-file";
pub(crate) const MENU_OPEN_FOLDER: &str = "open-folder";
pub(crate) const MENU_SAVE: &str = "save";
pub(crate) const MENU_SAVE_AS: &str = "save-as";
pub(crate) const MENU_CLOSE_WINDOW: &str = "close-window";
pub(crate) const MENU_TOGGLE_PREVIEW: &str = "toggle-preview";
pub(crate) const MENU_TOGGLE_WRAP: &str = "toggle-wrap";
pub(crate) const MENU_TOGGLE_INVISIBLES: &str = "toggle-invisibles";
pub(crate) const MENU_THEME_SYSTEM: &str = "theme-system";
pub(crate) const MENU_THEME_LIGHT: &str = "theme-light";
pub(crate) const MENU_THEME_DARK: &str = "theme-dark";
pub(crate) const MENU_THEME_SAKURA: &str = "theme-sakura";
pub(crate) const MENU_THEME_YAKOU: &str = "theme-yakou";
pub(crate) const MENU_THEME_SHOKOU: &str = "theme-shokou";
pub(crate) const MENU_THEME_KOUYOU: &str = "theme-kouyou";
pub(crate) const MENU_PREFERENCES: &str = "preferences";
pub(crate) const MENU_AGENT_WORKBENCH: &str = "agent-workbench";
pub(crate) const MENU_RECENT_FILE_PREFIX: &str = "recent-file-";
pub(crate) const MENU_RECENT_FOLDER_PREFIX: &str = "recent-folder-";
pub(crate) const EXCLUDED_WORKSPACE_DIRS: &[&str] = &[
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
pub(crate) struct TextFileDocument {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) contents: String,
    pub(crate) line_ending: String,
    pub(crate) size: u64,
    pub(crate) modified_ms: Option<u64>,
    pub(crate) fingerprint: String,
    pub(crate) large_file_warning: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct SavedFileState {
    pub(crate) path: String,
    pub(crate) line_ending: String,
    pub(crate) size: u64,
    pub(crate) modified_ms: Option<u64>,
    pub(crate) fingerprint: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct FileMetadataState {
    pub(crate) path: String,
    pub(crate) size: u64,
    pub(crate) modified_ms: Option<u64>,
    pub(crate) fingerprint: String,
    pub(crate) large_file_warning: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImagePreviewDocument {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) data_url: String,
    pub(crate) size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentWorkbenchPreflight {
    pub(crate) provider: String,
    pub(crate) workspace_root: String,
    pub(crate) provider_available: bool,
    pub(crate) provider_path: Option<String>,
    pub(crate) launch_implemented: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AgentRuntimeStatus {
    Running,
    Stopped,
    Exited,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRuntimeHandle {
    pub(crate) provider: String,
    pub(crate) workspace_root: String,
    pub(crate) provider_path: String,
    pub(crate) status: AgentRuntimeStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AgentWorkbenchSessionStatus {
    Active,
    Stopped,
    Exited,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentWorkbenchSession {
    pub(crate) provider: String,
    pub(crate) workspace_root: String,
    pub(crate) provider_path: String,
    pub(crate) created_at_ms: u64,
    pub(crate) status: AgentWorkbenchSessionStatus,
    pub(crate) runtime: AgentRuntimeHandle,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AgentWorkbenchOutputStream {
    Stdout,
    Stderr,
    System,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentWorkbenchOutputChunk {
    pub(crate) seq: u64,
    pub(crate) stream: AgentWorkbenchOutputStream,
    pub(crate) text: String,
    pub(crate) received_at_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentWorkbenchSessionStartResult {
    pub(crate) preflight: AgentWorkbenchPreflight,
    pub(crate) session: Option<AgentWorkbenchSession>,
    pub(crate) output: Vec<AgentWorkbenchOutputChunk>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentWorkbenchSessionState {
    pub(crate) session: Option<AgentWorkbenchSession>,
    pub(crate) output: Vec<AgentWorkbenchOutputChunk>,
}

pub(crate) struct AgentWorkbenchSessionStore {
    pub(crate) session: Mutex<Option<AgentWorkbenchSession>>,
    pub(crate) runtime: Mutex<Option<AgentRuntimeProcess>>,
    pub(crate) output: Arc<Mutex<Vec<AgentWorkbenchOutputChunk>>>,
    pub(crate) next_output_seq: Arc<Mutex<u64>>,
}

#[derive(Default)]
pub(crate) struct OpenedFileStore(pub(crate) Mutex<Vec<String>>);

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

pub(crate) struct AgentRuntimeProcess {
    pub(crate) child: Child,
    pub(crate) stdin: Option<Box<dyn Write + Send>>,
    pub(crate) pty_control: Option<File>,
}

#[derive(Clone, Copy)]
pub(crate) struct AgentRuntimeLaunchRequest<'a> {
    pub(crate) provider: &'a str,
    pub(crate) workspace_root: &'a str,
    pub(crate) provider_path: &'a str,
    pub(crate) path_env: Option<&'a OsStr>,
    pub(crate) terminal_columns: Option<u16>,
    pub(crate) terminal_rows: Option<u16>,
}

#[derive(Debug, Serialize)]
pub(crate) struct WorkspaceTreeEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: WorkspaceEntryKind,
    pub(crate) children: Vec<WorkspaceTreeEntry>,
    pub(crate) children_loaded: bool,
    pub(crate) children_truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum WorkspaceEntryKind {
    Directory,
    File,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct AppMenuState {
    pub(crate) has_active_tab: bool,
    pub(crate) active_dirty: bool,
    pub(crate) preview_visible: bool,
    pub(crate) wrap_lines: bool,
    pub(crate) show_invisibles: bool,
    pub(crate) theme_preference: String,
    pub(crate) menu_language: String,
    pub(crate) recent_files: Vec<AppMenuRecentItem>,
    pub(crate) recent_folders: Vec<AppMenuRecentItem>,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct AppMenuRecentItem {
    pub(crate) label: String,
}

pub(crate) trait AgentRuntimeAdapter {
    fn start(&self, request: AgentRuntimeLaunchRequest<'_>) -> Result<AgentRuntimeHandle, String>;
    fn stop(&self, handle: &AgentRuntimeHandle) -> Result<AgentRuntimeHandle, String>;
}

pub(crate) struct RealAgentRuntimeAdapter<'a> {
    pub(crate) session_store: &'a AgentWorkbenchSessionStore,
    pub(crate) terminal_mode: AgentRuntimeTerminalMode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) enum AgentRuntimeTerminalMode {
    Pipe,
    Pty,
}

impl<'a> RealAgentRuntimeAdapter<'a> {
    pub(crate) fn new(session_store: &'a AgentWorkbenchSessionStore) -> Self {
        Self {
            session_store,
            terminal_mode: AgentRuntimeTerminalMode::Pty,
        }
    }

    #[cfg(test)]
    pub(crate) fn new_piped_for_tests(session_store: &'a AgentWorkbenchSessionStore) -> Self {
        Self {
            session_store,
            terminal_mode: AgentRuntimeTerminalMode::Pipe,
        }
    }
}
