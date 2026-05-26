import { useCallback, useEffect, useMemo, useState } from "react";
import EditorPane from "./components/EditorPane";
import PreviewPane from "./components/PreviewPane";
import {
  listWorkspaceTree,
  openTextFile,
  pickMarkdownFile,
  pickWorkspaceFolder,
  saveTextFile,
  type SavedFileState,
  type TextFileDocument,
  type WorkspaceTreeEntry,
} from "./tauri";

const WELCOME_MARKDOWN = `# hazakura-note

安全に開く。静かに書く。差分で確かめる。

左上の Open からMarkdownファイルを選んでください。

- Markdownを編集できます
- 右側でプレビューできます
- Cmd+S または Save で保存できます
`;

const THEME_STORAGE_KEY = "hazakura-note-theme";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

type EditorTab = TextFileDocument & {
  id: string;
  contents: string;
  lastSavedContents: string;
  saveStatus: SaveStatus;
  error: string | null;
};

export default function App() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] =
    useState<WorkspaceTreeEntry | null>(null);
  const [welcomeContents, setWelcomeContents] = useState(WELCOME_MARKDOWN);
  const [status, setStatus] = useState("Ready");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(
    null,
  );
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readStoredThemePreference(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    readSystemTheme(),
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const pendingCloseTab = useMemo(
    () => tabs.find((tab) => tab.id === pendingCloseTabId) ?? null,
    [pendingCloseTabId, tabs],
  );
  const resolvedTheme: ResolvedTheme =
    themePreference === "system" ? systemTheme : themePreference;
  const activeContents = activeTab?.contents ?? welcomeContents;
  const activeDirty = activeTab ? isDirty(activeTab) : false;
  const activeError = activeTab?.error ?? globalError;
  const documentKey = activeTab?.path ?? "welcome";

  const openFilePath = useCallback(
    async (path: string) => {
      setGlobalError(null);

      const existingTab = tabs.find((tab) => tab.path === path);

      if (existingTab) {
        setActiveTabId(existingTab.id);
        setStatus("Tab focused");
        return;
      }

      setStatus("Opening file...");

      try {
        const file = await openTextFile(path);
        const nextTab = createEditorTab(file);

        setTabs((currentTabs) => [...currentTabs, nextTab]);
        setActiveTabId(nextTab.id);
        setStatus(
          file.large_file_warning
            ? "Opened with large-file warning"
            : "Opened safely",
        );
      } catch (err) {
        setGlobalError(String(err));
        setStatus("Open failed");
      }
    },
    [tabs],
  );

  const openFile = useCallback(async () => {
    setGlobalError(null);
    setStatus("Choosing file...");

    try {
      const path = await pickMarkdownFile();

      if (!path) {
        setStatus("Open cancelled");
        return;
      }

      await openFilePath(path);
    } catch (err) {
      setGlobalError(String(err));
      setStatus("Open failed");
    }
  }, [openFilePath]);

  const openWorkspace = useCallback(async () => {
    setGlobalError(null);
    setStatus("Choosing folder...");

    try {
      const path = await pickWorkspaceFolder();

      if (!path) {
        setStatus("Folder open cancelled");
        return;
      }

      setStatus("Reading folder...");
      const tree = await listWorkspaceTree(path);
      setWorkspaceTree(tree);
      setStatus("Folder opened");
    } catch (err) {
      setGlobalError(String(err));
      setStatus("Folder open failed");
    }
  }, []);

  const saveTabById = useCallback(
    async (tabId: string): Promise<boolean> => {
      const tab = tabs.find((candidate) => candidate.id === tabId);

      if (!tab || !isDirty(tab)) {
        return true;
      }

      setTabs((currentTabs) =>
        currentTabs.map((candidate) =>
          candidate.id === tabId
            ? { ...candidate, saveStatus: "saving", error: null }
            : candidate,
        ),
      );
      setStatus("Saving...");

      try {
        const saved: SavedFileState = await saveTextFile(
          tab.path,
          tab.contents,
          tab.fingerprint,
        );

        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  size: saved.size,
                  modified_ms: saved.modified_ms,
                  fingerprint: saved.fingerprint,
                  large_file_warning: saved.size >= 5 * 1024 * 1024,
                  lastSavedContents: tab.contents,
                  saveStatus: "saved",
                  error: null,
                }
              : candidate,
          ),
        );
        setStatus("Saved");
        return true;
      } catch (err) {
        const message = String(err);

        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  saveStatus: message.includes("Save conflict")
                    ? "conflict"
                    : "error",
                  error: message,
                }
              : candidate,
          ),
        );
        setStatus(message.includes("Save conflict") ? "Save stopped" : "Save failed");
        return false;
      }
    },
    [tabs],
  );

  const saveActiveTab = useCallback(async () => {
    if (!activeTabId) {
      return;
    }

    await saveTabById(activeTabId);
  }, [activeTabId, saveTabById]);

  const closeTabNow = useCallback(
    (tabId: string) => {
      setTabs((currentTabs) => {
        const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId);
        const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);

        if (activeTabId === tabId) {
          const nextActive =
            nextTabs[Math.min(closingIndex, nextTabs.length - 1)] ?? null;
          setActiveTabId(nextActive?.id ?? null);
        }

        return nextTabs;
      });
      setPendingCloseTabId(null);
      setStatus("Tab closed");
    },
    [activeTabId],
  );

  const requestCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId);

      if (!tab) {
        return;
      }

      if (isDirty(tab)) {
        setPendingCloseTabId(tabId);
        return;
      }

      closeTabNow(tabId);
    },
    [closeTabNow, tabs],
  );

  const saveAndClosePendingTab = useCallback(async () => {
    if (!pendingCloseTabId) {
      return;
    }

    const saved = await saveTabById(pendingCloseTabId);

    if (saved) {
      closeTabNow(pendingCloseTabId);
    }
  }, [closeTabNow, pendingCloseTabId, saveTabById]);

  const handleEditorChange = useCallback(
    (nextValue: string) => {
      if (!activeTabId) {
        setWelcomeContents(nextValue);
        return;
      }

      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === activeTabId
            ? {
                ...tab,
                contents: nextValue,
                saveStatus: "idle",
                error: null,
              }
            : tab,
        ),
      );
    },
    [activeTabId],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = themePreference;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveTab();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveActiveTab]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-block">
          <span className="app-name">hazakura-note</span>
          <span className="app-subtitle">Markdown-safe editor prototype</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Workspace actions">
          <button type="button" onClick={openWorkspace}>
            Open Folder
          </button>
          <button type="button" onClick={openFile}>
            Open
          </button>
          <button
            type="button"
            onClick={saveActiveTab}
            disabled={!activeTab || !activeDirty}
          >
            Save
          </button>
          <label className="theme-control">
            <span>Theme</span>
            <select
              aria-label="Theme"
              value={themePreference}
              onChange={(event) =>
                setThemePreference(event.target.value as ThemePreference)
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>

      <section className="tabs-row" aria-label="Open files">
        <div className="tab-list" role="tablist" aria-label="Open file tabs">
          {tabs.length === 0 ? (
            <span className="empty-tabs">No open files</span>
          ) : (
            tabs.map((tab) => {
              const dirty = isDirty(tab);

              return (
                <div
                  className={`tab-item${tab.id === activeTabId ? " active" : ""}`}
                  key={tab.id}
                  role="presentation"
                >
                  <button
                    aria-selected={tab.id === activeTabId}
                    className="tab-button"
                    onClick={() => setActiveTabId(tab.id)}
                    role="tab"
                    type="button"
                  >
                    <span>{tab.name}</span>
                    {dirty ? <span aria-label="unsaved"> *</span> : null}
                  </button>
                  <button
                    aria-label={`Close ${tab.name}`}
                    className="tab-close"
                    onClick={() => requestCloseTab(tab.id)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="document-meta">
          {activeTab ? formatBytes(activeTab.size) : "Preview only"}
          {activeTab?.large_file_warning ? " · large file" : ""}
          {activeTab ? (activeDirty ? " · unsaved" : " · clean") : ""}
        </div>
      </section>

      <div className="message-row">
        {activeError ? (
          <div
            className={
              activeTab?.saveStatus === "conflict"
                ? "conflict-banner"
                : "error-banner"
            }
          >
            {activeError}
          </div>
        ) : null}
      </div>

      <section className="workspace">
        <aside className="file-tree-pane" aria-label="Workspace file tree">
          {workspaceTree ? (
            <WorkspaceTree
              activePath={activeTab?.path ?? null}
              entry={workspaceTree}
              onOpenFile={openFilePath}
            />
          ) : (
            <div className="workspace-empty">
              <span>No folder open</span>
            </div>
          )}
        </aside>
        <div className="editor-preview-grid">
          <div className="pane editor-pane" aria-label="Editor">
            <EditorPane
              documentKey={`${documentKey}:${resolvedTheme}`}
              onChange={handleEditorChange}
              theme={resolvedTheme}
              value={activeContents}
            />
          </div>
          <div className="pane preview-pane" aria-label="Markdown preview">
            <PreviewPane source={activeContents} />
          </div>
        </div>
      </section>

      <footer className="status-bar">
        <span>{status}</span>
        <span>{saveStatusLabel(activeTab, activeDirty)}</span>
      </footer>

      {pendingCloseTab ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="close-tab-title"
            aria-modal="true"
            className="close-dialog"
            role="dialog"
          >
            <h2 id="close-tab-title">Unsaved changes</h2>
            <p>{pendingCloseTab.name} has unsaved changes.</p>
            <div className="dialog-actions">
              <button type="button" onClick={saveAndClosePendingTab}>
                Save
              </button>
              <button
                type="button"
                onClick={() => closeTabNow(pendingCloseTab.id)}
              >
                Discard
              </button>
              <button type="button" onClick={() => setPendingCloseTabId(null)}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function WorkspaceTree({
  activePath,
  entry,
  onOpenFile,
}: {
  activePath: string | null;
  entry: WorkspaceTreeEntry;
  onOpenFile: (path: string) => void | Promise<void>;
}) {
  return (
    <div className="workspace-tree">
      <TreeEntry activePath={activePath} entry={entry} onOpenFile={onOpenFile} />
    </div>
  );
}

function TreeEntry({
  activePath,
  entry,
  onOpenFile,
}: {
  activePath: string | null;
  entry: WorkspaceTreeEntry;
  onOpenFile: (path: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = entry.kind === "directory";

  if (!isDirectory) {
    return (
      <button
        className={`tree-file${entry.path === activePath ? " active" : ""}`}
        onClick={() => void onOpenFile(entry.path)}
        title={entry.path}
        type="button"
      >
        {entry.name}
      </button>
    );
  }

  return (
    <div className="tree-directory">
      <button
        aria-expanded={expanded}
        className="tree-directory-button"
        onClick={() => setExpanded((current) => !current)}
        title={entry.path}
        type="button"
      >
        <span aria-hidden="true">{expanded ? "v" : ">"}</span>
        <span>{entry.name}</span>
      </button>
      {expanded ? (
        <div className="tree-children">
          {entry.children.map((child) => (
            <TreeEntry
              activePath={activePath}
              entry={child}
              key={child.path}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function createEditorTab(file: TextFileDocument): EditorTab {
  return {
    ...file,
    id: file.path,
    contents: file.contents,
    lastSavedContents: file.contents,
    saveStatus: "idle",
    error: null,
  };
}

function isDirty(tab: EditorTab): boolean {
  return tab.contents !== tab.lastSavedContents;
}

function readStoredThemePreference(): ThemePreference {
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return "system";
}

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
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

function saveStatusLabel(tab: EditorTab | null, dirty: boolean): string {
  if (!tab) {
    return "No saved file";
  }

  if (tab.saveStatus === "saving") {
    return "Saving";
  }

  if (tab.saveStatus === "saved") {
    return "Saved";
  }

  if (tab.saveStatus === "error") {
    return "Save error";
  }

  if (tab.saveStatus === "conflict") {
    return "External change detected";
  }

  return dirty ? "Unsaved changes" : "No unsaved changes";
}
