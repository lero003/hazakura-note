use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const LARGE_FILE_WARNING_BYTES: u64 = 5 * 1024 * 1024;
const MAX_EDITABLE_BYTES: u64 = 10 * 1024 * 1024;
const BINARY_SNIFF_BYTES: u64 = 8192;
const MAX_WORKSPACE_DEPTH: usize = 6;
const MAX_WORKSPACE_ENTRIES: usize = 2000;
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
    size: u64,
    modified_ms: Option<u64>,
    fingerprint: String,
    large_file_warning: bool,
}

#[derive(Debug, Serialize)]
struct SavedFileState {
    path: String,
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
struct WorkspaceTreeEntry {
    name: String,
    path: String,
    kind: WorkspaceEntryKind,
    children: Vec<WorkspaceTreeEntry>,
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

    let contents = fs::read_to_string(&path_buf)
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
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
        fingerprint: metadata_fingerprint(&metadata),
        large_file_warning: metadata.len() >= LARGE_FILE_WARNING_BYTES,
    })
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
) -> Result<SavedFileState, String> {
    let path_buf = PathBuf::from(&path);
    let metadata = readable_text_metadata(&path_buf)?;

    if has_external_change(&metadata, &expected_fingerprint) {
        return Err(
            "Save conflict: the file changed on disk after it was opened. Reopen the file before saving."
                .to_string(),
        );
    }

    atomic_write(&path_buf, contents.as_bytes())?;

    let metadata =
        fs::metadata(&path_buf).map_err(|err| format!("Cannot verify saved file: {err}"))?;

    Ok(SavedFileState {
        path,
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
        fingerprint: metadata_fingerprint(&metadata),
    })
}

#[tauri::command]
fn list_workspace_tree(root: String) -> Result<WorkspaceTreeEntry, String> {
    let root_path = PathBuf::from(&root);
    let metadata =
        fs::metadata(&root_path).map_err(|err| format!("Cannot read workspace folder: {err}"))?;

    if !metadata.is_dir() {
        return Err("Selected workspace path is not a folder.".to_string());
    }

    let mut entry_count = 0;
    build_workspace_tree(&root_path, 0, &mut entry_count)
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

fn build_workspace_tree(
    path: &Path,
    depth: usize,
    entry_count: &mut usize,
) -> Result<WorkspaceTreeEntry, String> {
    if *entry_count >= MAX_WORKSPACE_ENTRIES {
        return Err(format!(
            "Workspace listing stopped after {MAX_WORKSPACE_ENTRIES} entries."
        ));
    }

    *entry_count += 1;

    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| path.to_str().unwrap_or("workspace"))
        .to_string();
    let mut children = Vec::new();

    if depth < MAX_WORKSPACE_DEPTH {
        let mut entries = fs::read_dir(path)
            .map_err(|err| format!("Cannot list workspace folder contents: {err}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| format!("Cannot list workspace folder contents: {err}"))?;

        entries.sort_by(|left, right| {
            let left_path = left.path();
            let right_path = right.path();
            let left_is_dir = left_path.is_dir();
            let right_is_dir = right_path.is_dir();

            right_is_dir
                .cmp(&left_is_dir)
                .then_with(|| left.file_name().cmp(&right.file_name()))
        });

        for entry in entries {
            let child_path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|err| format!("Cannot inspect workspace entry: {err}"))?;
            let child_name = entry.file_name().to_string_lossy().to_string();

            if file_type.is_dir() {
                if should_skip_workspace_dir(&child_name) {
                    continue;
                }

                children.push(build_workspace_tree(&child_path, depth + 1, entry_count)?);
            } else if file_type.is_file() {
                if *entry_count >= MAX_WORKSPACE_ENTRIES {
                    return Err(format!(
                        "Workspace listing stopped after {MAX_WORKSPACE_ENTRIES} entries."
                    ));
                }

                *entry_count += 1;
                children.push(WorkspaceTreeEntry {
                    name: child_name,
                    path: child_path.to_string_lossy().to_string(),
                    kind: WorkspaceEntryKind::File,
                    children: Vec::new(),
                });
            }
        }
    }

    Ok(WorkspaceTreeEntry {
        name,
        path: path.to_string_lossy().to_string(),
        kind: WorkspaceEntryKind::Directory,
        children,
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

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot save a file without a parent directory.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Cannot save a file with an invalid name.".to_string())?;
    let temp_path = parent.join(format!(".{file_name}.hazakura-note.tmp"));

    {
        let mut temp_file =
            File::create(&temp_path).map_err(|err| format!("Cannot create temp file: {err}"))?;
        temp_file
            .write_all(bytes)
            .map_err(|err| format!("Cannot write temp file: {err}"))?;
        temp_file
            .sync_all()
            .map_err(|err| format!("Cannot sync temp file: {err}"))?;
    }

    fs::rename(&temp_path, path).map_err(|err| format!("Cannot replace saved file: {err}"))?;

    Ok(())
}

fn modified_ms(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_text_file,
            get_file_metadata,
            list_workspace_tree,
            save_text_file
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

        let notes = tree
            .children
            .iter()
            .find(|entry| entry.name == "notes")
            .expect("notes dir");
        assert_eq!(notes.children[0].name, "today.md");

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
