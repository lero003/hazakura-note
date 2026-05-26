use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const LARGE_FILE_WARNING_BYTES: u64 = 5 * 1024 * 1024;
const MAX_EDITABLE_BYTES: u64 = 10 * 1024 * 1024;
const BINARY_SNIFF_BYTES: u64 = 8192;

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

    fn unique_test_dir(name: &str) -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();

        std::env::temp_dir().join(format!("hazakura-note-{name}-{}-{now}", std::process::id()))
    }
}
