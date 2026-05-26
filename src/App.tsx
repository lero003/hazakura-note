import { useCallback, useEffect, useMemo, useState } from "react";
import EditorPane from "./components/EditorPane";
import PreviewPane from "./components/PreviewPane";
import {
  confirmDiscardUnsavedChanges,
  openTextFile,
  pickMarkdownFile,
  saveTextFile,
  type SavedFileState,
  type TextFileDocument,
} from "./tauri";

const WELCOME_MARKDOWN = `# hazakura-note

安全に開く。静かに書く。差分で確かめる。

左上の Open からMarkdownファイルを選んでください。

- Markdownを編集できます
- 右側でプレビューできます
- Cmd+S または Save で保存できます
`;

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export default function App() {
  const [activeFile, setActiveFile] = useState<TextFileDocument | null>(null);
  const [contents, setContents] = useState(WELCOME_MARKDOWN);
  const [lastSavedContents, setLastSavedContents] = useState(WELCOME_MARKDOWN);
  const [status, setStatus] = useState("Ready");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty = contents !== lastSavedContents;
  const documentKey = activeFile?.path ?? "welcome";

  const title = useMemo(() => {
    if (!activeFile) {
      return "Untitled preview";
    }

    return `${activeFile.name}${dirty ? " *" : ""}`;
  }, [activeFile, dirty]);

  const openFile = useCallback(async () => {
    setError(null);
    setStatus("Choosing file...");

    try {
      if (dirty) {
        const shouldDiscard = await confirmDiscardUnsavedChanges();

        if (!shouldDiscard) {
          setStatus("Open cancelled");
          return;
        }
      }

      const path = await pickMarkdownFile();

      if (!path) {
        setStatus("Open cancelled");
        return;
      }

      const file = await openTextFile(path);
      setActiveFile(file);
      setContents(file.contents);
      setLastSavedContents(file.contents);
      setSaveStatus("idle");
      setStatus(
        file.large_file_warning
          ? "Opened with large-file warning"
          : "Opened safely",
      );
    } catch (err) {
      setError(String(err));
      setStatus("Open failed");
    }
  }, [dirty]);

  const saveFile = useCallback(async () => {
    if (!activeFile || !dirty) {
      return;
    }

    setError(null);
    setSaveStatus("saving");
    setStatus("Saving...");

    try {
      const saved: SavedFileState = await saveTextFile(
        activeFile.path,
        contents,
        activeFile.fingerprint,
      );
      setActiveFile((current) =>
        current
          ? {
              ...current,
              size: saved.size,
              modified_ms: saved.modified_ms,
              fingerprint: saved.fingerprint,
              large_file_warning: saved.size >= 5 * 1024 * 1024,
            }
          : current,
      );
      setLastSavedContents(contents);
      setSaveStatus("saved");
      setStatus("Saved");
    } catch (err) {
      const message = String(err);
      setError(message);

      if (message.includes("Save conflict")) {
        setSaveStatus("conflict");
        setStatus("Save stopped");
      } else {
        setSaveStatus("error");
        setStatus("Save failed");
      }
    }
  }, [activeFile, contents, dirty]);

  const handleEditorChange = useCallback((nextValue: string) => {
    setContents(nextValue);
    setSaveStatus("idle");
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-block">
          <span className="app-name">hazakura-note</span>
          <span className="app-subtitle">Markdown-safe editor prototype</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="File actions">
          <button type="button" onClick={openFile}>
            Open
          </button>
          <button type="button" onClick={saveFile} disabled={!activeFile || !dirty}>
            Save
          </button>
        </div>
      </header>

      <section className="document-bar" aria-label="Document status">
        <div className="document-title">{title}</div>
        <div className="document-meta">
          {activeFile ? formatBytes(activeFile.size) : "Preview only"}
          {activeFile?.large_file_warning ? " · large file" : ""}
          {dirty ? " · unsaved" : " · clean"}
        </div>
      </section>

      <div className="message-row">
        {error ? (
          <div
            className={
              saveStatus === "conflict" ? "conflict-banner" : "error-banner"
            }
          >
            {error}
          </div>
        ) : null}
      </div>

      <section className="workspace">
        <div className="pane editor-pane" aria-label="Editor">
          <EditorPane
            documentKey={documentKey}
            value={contents}
            onChange={handleEditorChange}
          />
        </div>
        <div className="pane preview-pane" aria-label="Markdown preview">
          <PreviewPane source={contents} />
        </div>
      </section>

      <footer className="status-bar">
        <span>{status}</span>
        <span>{saveStatusLabel(saveStatus, dirty)}</span>
      </footer>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function saveStatusLabel(status: SaveStatus, dirty: boolean): string {
  if (status === "saving") {
    return "Saving";
  }

  if (status === "saved") {
    return "Saved";
  }

  if (status === "error") {
    return "Save error";
  }

  if (status === "conflict") {
    return "External change detected";
  }

  return dirty ? "Unsaved changes" : "No unsaved changes";
}
