import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EditorPane, { type EditorPaneHandle } from "./components/EditorPane";
import PreviewPane from "./components/PreviewPane";
import {
  closeCurrentWindow,
  createTextFile,
  listWorkspaceTree,
  onCurrentWindowCloseRequested,
  openTextFile,
  pickMarkdownFile,
  pickNewMarkdownFilePath,
  pickWorkspaceFolder,
  saveTextFile,
  type SavedFileState,
  type TextFileDocument,
  type WorkspaceTreeEntry,
} from "./tauri";

const WELCOME_MARKDOWN = `# hazakura-note

安全に開く。静かに書く。差分で確かめる。

左上の New File で作成するか、Open からMarkdownファイルを選んでください。

- 新しいMarkdownファイルを作れます
- Markdownを編集できます
- 右側でプレビューできます
- Cmd+Oで開き、Cmd+Wでタブを閉じ、Cmd+Sで保存できます
`;

const THEME_STORAGE_KEY = "hazakura-note-theme";
const WORKSPACE_STATE_STORAGE_KEY = "hazakura-note-workspace-state";
const MAX_RESTORED_TABS = 12;

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

type PersistedWorkspaceState = {
  workspaceRootPath: string | null;
  tabPaths: string[];
  activeTabPath: string | null;
};

type TextMatch = {
  from: number;
  to: number;
};

export default function App() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] =
    useState<WorkspaceTreeEntry | null>(null);
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(
    null,
  );
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [welcomeContents, setWelcomeContents] = useState(WELCOME_MARKDOWN);
  const [status, setStatus] = useState("Ready");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(
    null,
  );
  const [pendingAppClose, setPendingAppClose] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readStoredThemePreference(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    readSystemTheme(),
  );
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorPaneRef = useRef<EditorPaneHandle | null>(null);
  const closeTabCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const appCloseCancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const pendingCloseTab = useMemo(
    () => tabs.find((tab) => tab.id === pendingCloseTabId) ?? null,
    [pendingCloseTabId, tabs],
  );
  const dirtyTabs = useMemo(() => tabs.filter(isDirty), [tabs]);
  const dirtyTabCount = dirtyTabs.length;
  const resolvedTheme: ResolvedTheme =
    themePreference === "system" ? systemTheme : themePreference;
  const activeContents = activeTab?.contents ?? welcomeContents;
  const activeDirty = activeTab ? isDirty(activeTab) : false;
  const activeError = activeTab?.error ?? globalError;
  const activeConflict = activeTab?.saveStatus === "conflict";
  const activeSaveError = isSaveFailureError(activeTab);
  const documentKey = activeTab?.path ?? "welcome";
  const findMatches = useMemo(
    () => findTextMatches(activeContents, findQuery),
    [activeContents, findQuery],
  );
  const allowWindowCloseRef = useRef(false);
  const modalOpen = pendingCloseTab !== null || pendingAppClose;

  const refreshWorkspaceTree = useCallback(async () => {
    if (!workspaceRootPath) {
      return;
    }

    const tree = await listWorkspaceTree(workspaceRootPath);
    setWorkspaceTree(tree);
  }, [workspaceRootPath]);

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

        setTabs((currentTabs) =>
          currentTabs.some((tab) => tab.path === path)
            ? currentTabs
            : [...currentTabs, nextTab],
        );
        setActiveTabId(path);
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

  const createNewFile = useCallback(async () => {
    setGlobalError(null);
    setStatus("Choosing new file path...");

    try {
      const path = await pickNewMarkdownFilePath(
        suggestedNewFilePath(workspaceRootPath),
      );

      if (!path) {
        setStatus("New file cancelled");
        return;
      }

      const existingTab = tabs.find((tab) => tab.path === path);

      if (existingTab) {
        setActiveTabId(existingTab.id);
        setStatus("Tab focused");
        return;
      }

      setStatus("Creating file...");

      const file = await createTextFile(path);
      const nextTab = createEditorTab(file);

      setTabs((currentTabs) =>
        currentTabs.some((tab) => tab.path === path)
          ? currentTabs
          : [...currentTabs, nextTab],
      );
      setActiveTabId(path);

      if (workspaceRootPath) {
        try {
          await refreshWorkspaceTree();
        } catch (err) {
          setGlobalError(String(err));
          setStatus("New file created; folder refresh failed");
          return;
        }
      }

      setStatus("New file created");
    } catch (err) {
      setGlobalError(String(err));
      setStatus("New file failed");
    }
  }, [refreshWorkspaceTree, tabs, workspaceRootPath]);

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
      setWorkspaceRootPath(path);
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
          tab.line_ending,
        );

        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  line_ending: saved.line_ending,
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
        setStatus(
          message.includes("Save conflict") ? "Save stopped" : "Save failed",
        );
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

  const saveAllAndCloseWindow = useCallback(async () => {
    if (dirtyTabs.length === 0) {
      allowWindowCloseRef.current = true;
      await closeCurrentWindow();
      return;
    }

    setStatus("Saving before close...");

    for (const tab of dirtyTabs) {
      const saved = await saveTabById(tab.id);

      if (!saved) {
        setPendingAppClose(false);
        setStatus("Close stopped");
        return;
      }
    }

    allowWindowCloseRef.current = true;
    await closeCurrentWindow();
  }, [dirtyTabs, saveTabById]);

  const discardAllAndCloseWindow = useCallback(async () => {
    allowWindowCloseRef.current = true;
    await closeCurrentWindow();
  }, []);

  const reopenTabFromDisk = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId);

      if (!tab) {
        return;
      }

      setStatus("Reopening from disk...");

      try {
        const file = await openTextFile(tab.path);
        const reopenedTab = createEditorTab(file);

        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId ? reopenedTab : candidate,
          ),
        );
        setActiveTabId(reopenedTab.id);
        setStatus("Reopened from disk");
      } catch (err) {
        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  error: `Reopen failed: ${String(err)}`,
                  saveStatus: "conflict",
                }
              : candidate,
          ),
        );
        setStatus("Reopen failed");
      }
    },
    [tabs],
  );

  const keepEditingAfterConflict = useCallback((tabId: string) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId ? { ...tab, saveStatus: "idle", error: null } : tab,
      ),
    );
    setStatus("Keeping local edits");
  }, []);

  const clearSaveError = useCallback((tabId: string) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId ? { ...tab, saveStatus: "idle", error: null } : tab,
      ),
    );
    setStatus("Keeping local edits");
  }, []);

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

  const showNextMatch = useCallback(() => {
    if (findMatches.length === 0) {
      return;
    }

    setActiveMatchIndex((current) => (current + 1) % findMatches.length);
  }, [findMatches.length]);

  const showPreviousMatch = useCallback(() => {
    if (findMatches.length === 0) {
      return;
    }

    setActiveMatchIndex(
      (current) => (current - 1 + findMatches.length) % findMatches.length,
    );
  }, [findMatches.length]);

  const closeFindAndFocusEditor = useCallback(() => {
    setFindQuery("");
    setActiveMatchIndex(0);
    editorPaneRef.current?.focus();
    setStatus("Find closed");
  }, []);

  const handleFindKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFindAndFocusEditor();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey) {
          showPreviousMatch();
        } else {
          showNextMatch();
        }
      }
    },
    [closeFindAndFocusEditor, showNextMatch, showPreviousMatch],
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreWorkspaceState() {
      const persistedState = readPersistedWorkspaceState();

      if (!persistedState) {
        setRestoreComplete(true);
        return;
      }

      setStatus("Restoring workspace...");

      try {
        if (persistedState.workspaceRootPath) {
          const tree = await listWorkspaceTree(persistedState.workspaceRootPath);

          if (!cancelled) {
            setWorkspaceTree(tree);
            setWorkspaceRootPath(persistedState.workspaceRootPath);
          }
        }

        const uniqueTabPaths = Array.from(new Set(persistedState.tabPaths)).slice(
          0,
          MAX_RESTORED_TABS,
        );
        const restoredTabs = (
          await Promise.allSettled(uniqueTabPaths.map((path) => openTextFile(path)))
        )
          .filter(
            (result): result is PromiseFulfilledResult<TextFileDocument> =>
              result.status === "fulfilled",
          )
          .map((result) => createEditorTab(result.value));

        if (!cancelled) {
          setTabs(restoredTabs);
          setActiveTabId(
            restoredTabs.some(
              (tab) => tab.path === persistedState.activeTabPath,
            )
              ? persistedState.activeTabPath
              : restoredTabs[0]?.id ?? null,
          );
          setStatus(restoredTabs.length > 0 ? "Workspace restored" : "Ready");
        }
      } catch (err) {
        if (!cancelled) {
          setGlobalError(String(err));
          setStatus("Workspace restore skipped");
        }
      } finally {
        if (!cancelled) {
          setRestoreComplete(true);
        }
      }
    }

    void restoreWorkspaceState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restoreComplete) {
      return;
    }

    writePersistedWorkspaceState({
      workspaceRootPath,
      tabPaths: tabs.map((tab) => tab.path),
      activeTabPath: activeTab?.path ?? null,
    });
  }, [activeTab, restoreComplete, tabs, workspaceRootPath]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [documentKey, findQuery]);

  useEffect(() => {
    if (activeMatchIndex >= findMatches.length) {
      setActiveMatchIndex(Math.max(findMatches.length - 1, 0));
    }
  }, [activeMatchIndex, findMatches.length]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void onCurrentWindowCloseRequested((event) => {
      if (allowWindowCloseRef.current || dirtyTabCount === 0) {
        return;
      }

      event.preventDefault();
      setPendingAppClose(true);
      setStatus("Close needs confirmation");
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dirtyTabCount]);

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
      if (modalOpen) {
        if (event.key === "Escape") {
          event.preventDefault();

          if (pendingCloseTabId !== null) {
            setPendingCloseTabId(null);
          } else if (pendingAppClose) {
            setPendingAppClose(false);
          }

          setStatus("Close cancelled");
        }

        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveTab();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void createNewFile();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        findInputRef.current?.focus();
        findInputRef.current?.select();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();

        if (event.shiftKey) {
          void openWorkspace();
        } else {
          void openFile();
        }

        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();

        if (activeTabId) {
          requestCloseTab(activeTabId);
        } else {
          setStatus("No active tab to close");
        }

        return;
      }

    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeTabId,
    createNewFile,
    modalOpen,
    openFile,
    openWorkspace,
    pendingAppClose,
    pendingCloseTabId,
    requestCloseTab,
    saveActiveTab,
  ]);

  useEffect(() => {
    if (pendingCloseTab) {
      closeTabCancelButtonRef.current?.focus();
      return;
    }

    if (pendingAppClose) {
      appCloseCancelButtonRef.current?.focus();
    }
  }, [pendingAppClose, pendingCloseTab]);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-block">
          <span className="app-name">hazakura-note</span>
          <span className="app-subtitle">Markdown-safe editor prototype</span>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Workspace actions">
          <button type="button" onClick={createNewFile}>
            New File
          </button>
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
                    title={tab.path}
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

      <section className="find-row" aria-label="Find in active file">
        <label className="find-control">
          <span>Find</span>
          <input
            ref={findInputRef}
            type="search"
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Search active file"
          />
        </label>
        <div className="find-actions">
          <button
            type="button"
            onClick={showPreviousMatch}
            disabled={findMatches.length === 0}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={showNextMatch}
            disabled={findMatches.length === 0}
          >
            Next
          </button>
          <span className="find-count">
            {findQuery
              ? findMatches.length > 0
                ? `${activeMatchIndex + 1} / ${findMatches.length}`
                : "No matches"
              : "No search"}
          </span>
        </div>
        <span className="shortcut-hint">
          Cmd+N new · Cmd+O open · Cmd+Shift+O folder · Cmd+W close · Cmd+F find · Cmd+S save
        </span>
      </section>

      <div className="message-row">
        {activeError ? (
          <div
            className={activeConflict ? "conflict-banner" : "error-banner"}
          >
            <span className="message-copy">
              {activeSaveError ? formatSaveFailureMessage() : activeError}
              {activeSaveError ? (
                <span className="message-detail">{activeError}</span>
              ) : null}
            </span>
            {activeConflict && activeTab ? (
              <div className="message-actions" aria-label="Conflict actions">
                <button
                  type="button"
                  onClick={() => reopenTabFromDisk(activeTab.id)}
                >
                  Reopen from disk
                </button>
                <button type="button" onClick={() => closeTabNow(activeTab.id)}>
                  Close without saving
                </button>
                <button
                  type="button"
                  onClick={() => keepEditingAfterConflict(activeTab.id)}
                >
                  Keep editing
                </button>
              </div>
            ) : activeSaveError && activeTab ? (
              <div className="message-actions" aria-label="Save error actions">
                <button
                  type="button"
                  onClick={() => void saveTabById(activeTab.id)}
                >
                  Try save again
                </button>
                <button
                  type="button"
                  onClick={() => clearSaveError(activeTab.id)}
                >
                  Keep editing
                </button>
              </div>
            ) : null}
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
              <button type="button" onClick={openWorkspace}>
                Open Folder
              </button>
            </div>
          )}
        </aside>
        <div className="editor-preview-grid">
          <div className="pane editor-pane" aria-label="Editor">
            <EditorPane
              ref={editorPaneRef}
              activeSearchMatchIndex={activeMatchIndex}
              documentKey={`${documentKey}:${resolvedTheme}`}
              onChange={handleEditorChange}
              searchMatches={findMatches}
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
            aria-describedby="close-tab-description"
            aria-labelledby="close-tab-title"
            aria-modal="true"
            className="close-dialog"
            role="dialog"
          >
            <h2 id="close-tab-title">Unsaved changes</h2>
            <p id="close-tab-description">
              {pendingCloseTab.name} has unsaved changes.
            </p>
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
              <button
                type="button"
                ref={closeTabCancelButtonRef}
                onClick={() => setPendingCloseTabId(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingAppClose ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="close-app-description"
            aria-labelledby="close-app-title"
            aria-modal="true"
            className="close-dialog"
            role="dialog"
          >
            <h2 id="close-app-title">Unsaved changes</h2>
            <p id="close-app-description">
              {formatDirtyTabCount(dirtyTabCount)} must be saved or discarded
              before closing hazakura-note.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={saveAllAndCloseWindow}>
                Save All
              </button>
              <button type="button" onClick={discardAllAndCloseWindow}>
                Discard All
              </button>
              <button
                type="button"
                ref={appCloseCancelButtonRef}
                onClick={() => setPendingAppClose(false)}
              >
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

function readPersistedWorkspaceState(): PersistedWorkspaceState | null {
  const value = window.localStorage.getItem(WORKSPACE_STATE_STORAGE_KEY);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PersistedWorkspaceState>;

    return {
      workspaceRootPath:
        typeof parsed.workspaceRootPath === "string"
          ? parsed.workspaceRootPath
          : null,
      tabPaths: Array.isArray(parsed.tabPaths)
        ? parsed.tabPaths.filter((path): path is string => typeof path === "string")
        : [],
      activeTabPath:
        typeof parsed.activeTabPath === "string" ? parsed.activeTabPath : null,
    };
  } catch {
    return null;
  }
}

function writePersistedWorkspaceState(state: PersistedWorkspaceState) {
  window.localStorage.setItem(WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(state));
}

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function findTextMatches(source: string, query: string): TextMatch[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const normalizedSource = source.toLowerCase();
  const matches: TextMatch[] = [];
  let cursor = 0;

  while (matches.length < 999) {
    const foundAt = normalizedSource.indexOf(normalizedQuery, cursor);

    if (foundAt === -1) {
      break;
    }

    matches.push({ from: foundAt, to: foundAt + normalizedQuery.length });
    cursor = foundAt + Math.max(normalizedQuery.length, 1);
  }

  return matches;
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

function formatDirtyTabCount(count: number): string {
  return count === 1 ? "1 unsaved tab" : `${count} unsaved tabs`;
}

function isSaveFailureError(tab: EditorTab | null): boolean {
  return tab?.saveStatus === "error";
}

function formatSaveFailureMessage(): string {
  return (
    "Save failed. Your edits are still in the editor. " +
    "Fix the file or folder issue, then try saving again."
  );
}

function suggestedNewFilePath(workspaceRootPath: string | null): string | null {
  return workspaceRootPath ? `${workspaceRootPath}/untitled.md` : "untitled.md";
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
