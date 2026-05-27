use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

const LARGE_FILE_WARNING_BYTES: u64 = 5 * 1024 * 1024;
const MAX_EDITABLE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
const BINARY_SNIFF_BYTES: u64 = 8192;
const MAX_WORKSPACE_ENTRIES: usize = 2000;
const MENU_ACTION_EVENT: &str = "hazakura-note://menu-action";
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
const MENU_PREFERENCES: &str = "preferences";
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppMenuState {
    has_active_tab: bool,
    active_dirty: bool,
    preview_visible: bool,
    wrap_lines: bool,
    show_invisibles: bool,
    theme_preference: String,
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

    let mime_type = image_mime_type(&image_path)
        .ok_or_else(|| "Selected image type is not supported.".to_string())?;
    let bytes = fs::read(&image_path).map_err(|err| format!("Cannot read image: {err}"))?;
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

fn image_mime_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
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
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, MENU_NEW_FILE, "New File", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(app, MENU_OPEN_FILE, "Open...", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_FOLDER,
                "Open Folder...",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &recent_submenu(
                app,
                "Recent Files",
                MENU_RECENT_FILE_PREFIX,
                state
                    .map(|state| state.recent_files.as_slice())
                    .unwrap_or(&[]),
            )?,
            &recent_submenu(
                app,
                "Recent Folders",
                MENU_RECENT_FOLDER_PREFIX,
                state
                    .map(|state| state.recent_folders.as_slice())
                    .unwrap_or(&[]),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, MENU_SAVE, "Save", active_dirty, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(
                app,
                MENU_SAVE_AS,
                "Save As...",
                has_active_tab,
                Some("CmdOrCtrl+Shift+S"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_CLOSE_WINDOW,
                "Close Window",
                true,
                Some("CmdOrCtrl+Shift+W"),
            )?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_PREVIEW,
                "Preview",
                true,
                preview_visible,
                Some("CmdOrCtrl+Option+P"),
            )?,
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_WRAP,
                "Wrap Lines",
                true,
                wrap_lines,
                Some("CmdOrCtrl+Option+W"),
            )?,
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_INVISIBLES,
                "Show Invisibles",
                true,
                show_invisibles,
                Some("CmdOrCtrl+Option+I"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &Submenu::with_items(
                app,
                "Theme",
                true,
                &[
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SYSTEM,
                        "System",
                        true,
                        theme_preference == "system",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_LIGHT,
                        "Light",
                        true,
                        theme_preference == "light",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_DARK,
                        "Dark",
                        true,
                        theme_preference == "dark",
                        None::<&str>,
                    )?,
                ],
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_PREFERENCES,
                "Preferences...",
                true,
                Some("CmdOrCtrl+,"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        menu.remove_at(1)?;
        menu.insert(&file_menu, 1)?;
        menu.remove_at(3)?;
        menu.insert(&view_menu, 3)?;
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
    id_prefix: &str,
    items: &[AppMenuRecentItem],
) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, title, true)?;

    if items.is_empty() {
        submenu.append(&MenuItem::new(app, "No Recent Items", false, None::<&str>)?)?;
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
                | MENU_PREFERENCES
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
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

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
            save_text_file,
            save_text_file_as,
            update_app_menu_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

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
}
