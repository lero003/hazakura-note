import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EditorPane, {
  type EditorPaneHandle,
  type EditorSelectionInfo,
} from "./components/EditorPane";
import PreviewPane from "./components/PreviewPane";
import {
  closeCurrentWindow,
  createTextFile,
  getFileMetadata,
  listWorkspaceDirectory,
  listWorkspaceTree,
  onCurrentWindowCloseRequested,
  openTextFile,
  pickMarkdownFile,
  pickNewMarkdownFilePath,
  pickSaveAsTextFilePath,
  pickWorkspaceFolder,
  saveTextFile,
  saveTextFileAs,
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
const PREVIEW_VISIBLE_STORAGE_KEY = "hazakura-note-preview-visible";
const EDITOR_SETTINGS_STORAGE_KEY = "hazakura-note-editor-settings";
const DRAFT_STATE_STORAGE_KEY = "hazakura-note-unsaved-drafts";
const MAX_RESTORED_TABS = 12;
const MAX_STORED_DRAFTS = 20;

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
type EditableLineEnding = "lf" | "crlf";
type LineEndingKind = EditableLineEnding | "mixed" | "none";

type EditorTab = TextFileDocument & {
  id: string;
  contents: string;
  lastSavedContents: string;
  lastSavedLineEnding: EditableLineEnding;
  ignoredExternalFingerprint: string | null;
  externalFingerprint: string | null;
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

type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

type EditorSettings = {
  wrapLines: boolean;
  showInvisibles: boolean;
  fontSize: number;
  tabSize: number;
};

type DraftRecord = {
  path: string;
  contents: string;
  line_ending: EditableLineEnding;
  savedFingerprint: string;
  updatedAt: number;
};

type TextDocumentStats = {
  bytes: number;
  characters: number;
  lineEnding: LineEndingKind;
  hasFinalNewline: boolean;
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
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [goToLineValue, setGoToLineValue] = useState("");
  const [selectionInfo, setSelectionInfo] = useState<EditorSelectionInfo>({
    line: 1,
    column: 1,
    selectedCharacters: 0,
    selectedLines: 0,
  });
  const [pendingDrafts, setPendingDrafts] = useState<DraftRecord[]>([]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readStoredThemePreference(),
  );
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() =>
    readStoredEditorSettings(),
  );
  const [previewVisible, setPreviewVisible] = useState(() =>
    readStoredPreviewVisible(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    readSystemTheme(),
  );
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorPaneRef = useRef<EditorPaneHandle | null>(null);
  const closeTabCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const appCloseCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabsRef = useRef<EditorTab[]>([]);

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
  const activeDocumentStats = useMemo(
    () => analyzeTextDocument(activeContents, activeTab?.line_ending),
    [activeContents, activeTab?.line_ending],
  );
  const documentKey = activeTab?.path ?? "welcome";
  const findMatches = useMemo(
    () => findTextMatches(activeContents, findQuery, searchOptions),
    [activeContents, findQuery, searchOptions],
  );
  const activeDraft = useMemo(
    () =>
      activeTab
        ? pendingDrafts.find((draft) => draft.path === activeTab.path) ?? null
        : null,
    [activeTab, pendingDrafts],
  );
  const invalidRegex =
    searchOptions.regex && findQuery.trim().length > 0
      ? !canCompileRegex(findQuery)
      : false;
  const allowWindowCloseRef = useRef(false);
  const modalOpen = pendingCloseTab !== null || pendingAppClose;

  const focusEditorSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      editorPaneRef.current?.focus();
    });
  }, []);

  const cancelPendingTabClose = useCallback(() => {
    setPendingCloseTabId(null);
    setStatus("Close cancelled");
    focusEditorSoon();
  }, [focusEditorSoon]);

  const cancelPendingAppClose = useCallback(() => {
    setPendingAppClose(false);
    setStatus("Close cancelled");
    focusEditorSoon();
  }, [focusEditorSoon]);

  const refreshWorkspaceTree = useCallback(async () => {
    if (!workspaceRootPath) {
      return;
    }

    const tree = await listWorkspaceTree(workspaceRootPath);
    setWorkspaceTree(tree);
  }, [workspaceRootPath]);

  const loadWorkspaceDirectory = useCallback(
    async (directoryPath: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGlobalError(null);
      setStatus("Reading folder...");

      try {
        const directory = await listWorkspaceDirectory(
          workspaceRootPath,
          directoryPath,
        );

        setWorkspaceTree((currentTree) =>
          currentTree
            ? replaceWorkspaceTreeEntry(currentTree, directory)
            : currentTree,
        );
        setStatus(
          directory.children_truncated
            ? "Folder partially loaded"
            : "Folder loaded",
        );
      } catch (err) {
        setGlobalError(String(err));
        setStatus("Folder load failed");
        throw err;
      }
    },
    [workspaceRootPath],
  );

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
        const draft = readStoredDrafts().find(
          (candidate) =>
            candidate.path === path &&
            candidate.savedFingerprint === file.fingerprint &&
            candidate.contents !== nextTab.contents,
        );

        setTabs((currentTabs) =>
          currentTabs.some((tab) => tab.path === path)
            ? currentTabs
            : [...currentTabs, nextTab],
        );
        if (draft) {
          setPendingDrafts((currentDrafts) =>
            upsertDraftRecord(currentDrafts, draft),
          );
        }
        setActiveTabId(path);
        setStatus(
          draft
            ? "Opened with recoverable draft"
            : file.large_file_warning
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
                  lastSavedLineEnding: saved.line_ending,
                  ignoredExternalFingerprint: null,
                  externalFingerprint: null,
                  saveStatus: "saved",
                  error: null,
                }
              : candidate,
          ),
        );
        setStatus("Saved");
        removeStoredDraft(tab.path);
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

  const saveActiveTabAs = useCallback(async () => {
    if (!activeTab) {
      setStatus("No active tab to save");
      return;
    }

    setGlobalError(null);
    setStatus("Choosing Save As path...");

    try {
      const path = await pickSaveAsTextFilePath(suggestedSaveAsPath(activeTab.path));

      if (!path) {
        setStatus("Save As cancelled");
        return;
      }

      if (tabs.some((tab) => tab.path === path && tab.id !== activeTab.id)) {
        setGlobalError("A tab is already open at the selected Save As path.");
        setStatus("Save As stopped");
        return;
      }

      setStatus("Saving as...");

      const savedFile = await saveTextFileAs(
        path,
        activeTab.contents,
        activeTab.line_ending,
      );
      const nextTab = createEditorTab(savedFile);

      setTabs((currentTabs) =>
        currentTabs.map((tab) => (tab.id === activeTab.id ? nextTab : tab)),
      );
      setActiveTabId(nextTab.id);
      removeStoredDraft(activeTab.path);

      if (workspaceRootPath) {
        try {
          await refreshWorkspaceTree();
        } catch (err) {
          setGlobalError(String(err));
          setStatus("Saved as; folder refresh failed");
          return;
        }
      }

      setStatus("Saved as");
    } catch (err) {
      const message = String(err);

      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                saveStatus: "error",
                error: message,
              }
            : tab,
        ),
      );
      setStatus("Save As failed");
    }
  }, [activeTab, refreshWorkspaceTree, tabs, workspaceRootPath]);

  const convertActiveLineEnding = useCallback(
    (lineEnding: EditableLineEnding) => {
      if (!activeTab) {
        setStatus("No active tab to convert");
        return;
      }

      const nextContents = normalizeTextLineEndings(
        activeTab.contents,
        "lf",
      );

      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                contents: nextContents,
                line_ending: lineEnding,
                saveStatus: "idle",
                error: null,
              }
            : tab,
        ),
      );
      setStatus(`Line endings set to ${formatLineEndingKind(lineEnding)}`);
    },
    [activeTab],
  );

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
      return;
    }

    setPendingCloseTabId(null);
    setStatus("Close stopped");
    focusEditorSoon();
  }, [closeTabNow, focusEditorSoon, pendingCloseTabId, saveTabById]);

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
        tab.id === tabId
          ? {
              ...tab,
              ignoredExternalFingerprint:
                tab.externalFingerprint ?? tab.ignoredExternalFingerprint,
              saveStatus: "idle",
              error: null,
            }
          : tab,
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

  const restoreDraft = useCallback((draft: DraftRecord) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.path === draft.path
          ? {
              ...tab,
              contents: draft.contents,
              line_ending: draft.line_ending,
              saveStatus: "idle",
              error: null,
            }
          : tab,
      ),
    );
    setPendingDrafts((currentDrafts) =>
      currentDrafts.filter((candidate) => candidate.path !== draft.path),
    );
    setStatus("Draft restored");
    focusEditorSoon();
  }, [focusEditorSoon]);

  const discardDraft = useCallback((draftPath: string) => {
    setPendingDrafts((currentDrafts) =>
      currentDrafts.filter((candidate) => candidate.path !== draftPath),
    );
    removeStoredDraft(draftPath);
    setStatus("Draft discarded");
  }, []);

  const goToLine = useCallback(() => {
    const requestedLine = Number(goToLineValue);

    if (!Number.isFinite(requestedLine) || requestedLine < 1) {
      setStatus("Enter a valid line number");
      return;
    }

    editorPaneRef.current?.goToLine(requestedLine);
    setStatus(`Moved to line ${Math.trunc(requestedLine)}`);
  }, [goToLineValue]);

  const checkTabForExternalChange = useCallback(
    async (tabId: string) => {
      const tab = tabsRef.current.find((candidate) => candidate.id === tabId);

      if (!tab) {
        return;
      }

      try {
        const metadata = await getFileMetadata(tab.path);

        if (metadata.fingerprint === tab.fingerprint) {
          setTabs((currentTabs) =>
            currentTabs.map((candidate) =>
              candidate.id === tabId
                ? {
                    ...candidate,
                    ignoredExternalFingerprint: null,
                    externalFingerprint: null,
                  }
                : candidate,
            ),
          );
          return;
        }

        if (metadata.fingerprint === tab.ignoredExternalFingerprint) {
          return;
        }

        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  externalFingerprint: metadata.fingerprint,
                  saveStatus: "conflict",
                  error:
                    "External change detected. The file changed on disk since it was opened; saving is stopped until you choose what to do.",
                }
              : candidate,
          ),
        );
        setStatus("External change detected");
      } catch (err) {
        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  saveStatus: "error",
                  error: `Metadata check failed: ${String(err)}`,
                }
              : candidate,
          ),
        );
        setStatus("Metadata check failed");
      }
    },
    [],
  );

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
      if (isImeComposing(event.nativeEvent)) {
        return;
      }

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
    tabsRef.current = tabs;
  }, [tabs]);

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
        const storedDrafts = readStoredDrafts();
        const recoverableDrafts = restoredTabs.flatMap((tab) => {
          const draft = storedDrafts.find(
            (candidate) =>
              candidate.path === tab.path &&
              candidate.savedFingerprint === tab.fingerprint &&
              candidate.contents !== tab.contents,
          );

          return draft ? [draft] : [];
        });

        if (!cancelled) {
          setTabs(restoredTabs);
          setPendingDrafts(recoverableDrafts);
          setActiveTabId(
            restoredTabs.some(
              (tab) => tab.path === persistedState.activeTabPath,
            )
              ? persistedState.activeTabPath
              : restoredTabs[0]?.id ?? null,
          );
          setStatus(
            recoverableDrafts.length > 0
              ? "Workspace restored with drafts"
              : restoredTabs.length > 0
                ? "Workspace restored"
                : "Ready",
          );
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
    if (!restoreComplete) {
      return;
    }

    const dirtyDrafts = tabs.filter(isDirty).map((tab) => ({
      path: tab.path,
      contents: tab.contents,
      line_ending: tab.line_ending,
      savedFingerprint: tab.fingerprint,
      updatedAt: Date.now(),
    }));
    writeStoredDrafts(
      [...pendingDrafts, ...dirtyDrafts].reduce<DraftRecord[]>(
        (records, draft) => upsertDraftRecord(records, draft),
        [],
      ),
    );
  }, [pendingDrafts, restoreComplete, tabs]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [documentKey, findQuery, searchOptions]);

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
    window.localStorage.setItem(
      PREVIEW_VISIBLE_STORAGE_KEY,
      previewVisible ? "true" : "false",
    );
  }, [previewVisible]);

  useEffect(() => {
    window.localStorage.setItem(
      EDITOR_SETTINGS_STORAGE_KEY,
      JSON.stringify(editorSettings),
    );
  }, [editorSettings]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    void checkTabForExternalChange(activeTabId);
  }, [activeTabId, checkTabForExternalChange]);

  useEffect(() => {
    const checkActiveTab = () => {
      if (!activeTabId || document.visibilityState === "hidden") {
        return;
      }

      void checkTabForExternalChange(activeTabId);
    };

    window.addEventListener("focus", checkActiveTab);
    document.addEventListener("visibilitychange", checkActiveTab);

    return () => {
      window.removeEventListener("focus", checkActiveTab);
      document.removeEventListener("visibilitychange", checkActiveTab);
    };
  }, [activeTabId, checkTabForExternalChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isImeComposing(event)) {
        return;
      }

      if (modalOpen) {
        if (event.key === "Escape") {
          event.preventDefault();

          if (pendingCloseTabId !== null) {
            cancelPendingTabClose();
          } else if (pendingAppClose) {
            cancelPendingAppClose();
          }
        }

        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        void saveActiveTabAs();
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
    cancelPendingAppClose,
    cancelPendingTabClose,
    createNewFile,
    modalOpen,
    openFile,
    openWorkspace,
    pendingAppClose,
    pendingCloseTabId,
    requestCloseTab,
    saveActiveTabAs,
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
          <button
            type="button"
            onClick={() => void saveActiveTabAs()}
            disabled={!activeTab}
          >
            Save As
          </button>
          <label className="line-ending-control">
            <span>Line</span>
            <select
              aria-label="Line endings"
              value={activeTab?.line_ending ?? "lf"}
              disabled={!activeTab}
              onChange={(event) =>
                convertActiveLineEnding(
                  event.target.value as EditableLineEnding,
                )
              }
            >
              <option value="lf">LF</option>
              <option value="crlf">CRLF</option>
            </select>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={previewVisible}
              onChange={(event) => setPreviewVisible(event.target.checked)}
            />
            <span>Preview</span>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={editorSettings.wrapLines}
              onChange={(event) =>
                setEditorSettings((current) => ({
                  ...current,
                  wrapLines: event.target.checked,
                }))
              }
            />
            <span>Wrap</span>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={editorSettings.showInvisibles}
              onChange={(event) =>
                setEditorSettings((current) => ({
                  ...current,
                  showInvisibles: event.target.checked,
                }))
              }
            />
            <span>Invisibles</span>
          </label>
          <label className="number-control">
            <span>Font</span>
            <input
              aria-label="Editor font size"
              type="number"
              min="12"
              max="22"
              value={editorSettings.fontSize}
              onChange={(event) =>
                setEditorSettings((current) => ({
                  ...current,
                  fontSize: clampNumber(Number(event.target.value), 12, 22, 14),
                }))
              }
            />
          </label>
          <label className="line-ending-control">
            <span>Tab</span>
            <select
              aria-label="Tab size"
              value={editorSettings.tabSize}
              onChange={(event) =>
                setEditorSettings((current) => ({
                  ...current,
                  tabSize: clampNumber(Number(event.target.value), 2, 8, 2),
                }))
              }
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={8}>8</option>
            </select>
          </label>
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
                    <span className="tab-name">{tab.name}</span>
                    {dirty ? (
                      <span className="tab-dirty" aria-label="unsaved">
                        *
                      </span>
                    ) : null}
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
          {activeTab
            ? formatDocumentMeta(activeDocumentStats, activeTab.name)
            : previewVisible
              ? "Preview only"
              : "No file open"}
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
              ? invalidRegex
                ? "Invalid regex"
                : findMatches.length > 0
                ? `${activeMatchIndex + 1} / ${findMatches.length}`
                : "No matches"
              : "No search"}
          </span>
        </div>
        <div className="find-options" aria-label="Find options">
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={searchOptions.caseSensitive}
              onChange={(event) =>
                setSearchOptions((current) => ({
                  ...current,
                  caseSensitive: event.target.checked,
                }))
              }
            />
            <span>Case</span>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={searchOptions.wholeWord}
              onChange={(event) =>
                setSearchOptions((current) => ({
                  ...current,
                  wholeWord: event.target.checked,
                }))
              }
            />
            <span>Word</span>
          </label>
          <label className="toggle-control">
            <input
              type="checkbox"
              checked={searchOptions.regex}
              onChange={(event) =>
                setSearchOptions((current) => ({
                  ...current,
                  regex: event.target.checked,
                }))
              }
            />
            <span>Regex</span>
          </label>
        </div>
        <label className="goto-control">
          <span>Line</span>
          <input
            aria-label="Go to line"
            type="number"
            min="1"
            value={goToLineValue}
            onChange={(event) => setGoToLineValue(event.target.value)}
            onKeyDown={(event) => {
              if (isImeComposing(event.nativeEvent)) {
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                goToLine();
              }
            }}
          />
          <button type="button" onClick={goToLine}>
            Go
          </button>
        </label>
        <span className="shortcut-hint">
          Cmd+N new · Cmd+O open · Cmd+Shift+O folder · Cmd+W close · Cmd+F find · Cmd+S save
          · Cmd+Shift+S save as
        </span>
      </section>

      <div className="message-row">
        {activeDraft && activeTab ? (
          <div className="draft-banner">
            <span className="message-copy">
              Unsaved draft available for {activeTab.name}.
              <span className="message-detail">
                Saved locally {formatTimestamp(activeDraft.updatedAt)}.
              </span>
            </span>
            <div className="message-actions" aria-label="Draft actions">
              <button type="button" onClick={() => restoreDraft(activeDraft)}>
                Restore draft
              </button>
              <button
                type="button"
                onClick={() => discardDraft(activeDraft.path)}
              >
                Discard draft
              </button>
            </div>
          </div>
        ) : null}
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
              onLoadDirectory={loadWorkspaceDirectory}
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
        <div
          className={`editor-preview-grid${previewVisible ? "" : " preview-hidden"}`}
        >
          <div className="pane editor-pane" aria-label="Editor">
            <EditorPane
              ref={editorPaneRef}
              activeSearchMatchIndex={activeMatchIndex}
              documentKey={documentKey}
              fontSize={editorSettings.fontSize}
              onChange={handleEditorChange}
              onSelectionChange={setSelectionInfo}
              searchMatches={findMatches}
              showInvisibles={editorSettings.showInvisibles}
              tabSize={editorSettings.tabSize}
              theme={resolvedTheme}
              value={activeContents}
              wrapLines={editorSettings.wrapLines}
            />
          </div>
          {previewVisible ? (
            <div className="pane preview-pane" aria-label="Markdown preview">
              <PreviewPane source={activeContents} />
            </div>
          ) : null}
        </div>
      </section>

      <footer className="status-bar">
        <span>{status}</span>
        <span>
          {formatSelectionInfo(selectionInfo)} ·{" "}
          {saveStatusLabel(activeTab, activeDirty)}
        </span>
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
                onClick={cancelPendingTabClose}
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
                onClick={cancelPendingAppClose}
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
  onLoadDirectory,
  onOpenFile,
}: {
  activePath: string | null;
  entry: WorkspaceTreeEntry;
  onLoadDirectory: (path: string) => Promise<void>;
  onOpenFile: (path: string) => void | Promise<void>;
}) {
  return (
    <div className="workspace-tree">
      <TreeEntry
        activePath={activePath}
        defaultExpanded
        entry={entry}
        onLoadDirectory={onLoadDirectory}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}

function TreeEntry({
  activePath,
  defaultExpanded = false,
  entry,
  onLoadDirectory,
  onOpenFile,
}: {
  activePath: string | null;
  defaultExpanded?: boolean;
  entry: WorkspaceTreeEntry;
  onLoadDirectory: (path: string) => Promise<void>;
  onOpenFile: (path: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const isDirectory = entry.kind === "directory";

  if (!isDirectory) {
    return (
      <button
        className={`tree-file${entry.path === activePath ? " active" : ""}`}
        onClick={() => void onOpenFile(entry.path)}
        title={entry.path}
        type="button"
      >
        <span className="tree-name">{entry.name}</span>
      </button>
    );
  }

  const toggleDirectory = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    if (!entry.children_loaded) {
      setLoading(true);

      try {
        await onLoadDirectory(entry.path);
      } finally {
        setLoading(false);
      }
    }

    setExpanded(true);
  };

  return (
    <div className="tree-directory">
      <button
        aria-expanded={expanded}
        className="tree-directory-button"
        disabled={loading}
        onClick={() => void toggleDirectory()}
        title={entry.path}
        type="button"
      >
        <span aria-hidden="true">{expanded ? "v" : ">"}</span>
        <span className="tree-name">{entry.name}</span>
        {loading ? <span className="tree-meta">Loading...</span> : null}
      </button>
      {expanded ? (
        <div className="tree-children">
          {entry.children.map((child) => (
            <TreeEntry
              activePath={activePath}
              entry={child}
              key={child.path}
              onLoadDirectory={onLoadDirectory}
              onOpenFile={onOpenFile}
            />
          ))}
          {entry.children_truncated ? (
            <div className="tree-partial" role="note">
              Some entries are hidden by the per-folder limit.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function createEditorTab(file: TextFileDocument): EditorTab {
  const editorContents = normalizeTextLineEndings(file.contents, "lf");

  return {
    ...file,
    id: file.path,
    contents: editorContents,
    lastSavedContents: editorContents,
    lastSavedLineEnding: file.line_ending,
    ignoredExternalFingerprint: null,
    externalFingerprint: null,
    saveStatus: "idle",
    error: null,
  };
}

function replaceWorkspaceTreeEntry(
  tree: WorkspaceTreeEntry,
  replacement: WorkspaceTreeEntry,
): WorkspaceTreeEntry {
  if (tree.path === replacement.path) {
    return replacement;
  }

  return {
    ...tree,
    children: tree.children.map((child) =>
      replaceWorkspaceTreeEntry(child, replacement),
    ),
  };
}

function isDirty(tab: EditorTab): boolean {
  return (
    tab.contents !== tab.lastSavedContents ||
    tab.line_ending !== tab.lastSavedLineEnding
  );
}

function readStoredThemePreference(): ThemePreference {
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return "system";
}

function readStoredPreviewVisible(): boolean {
  return window.localStorage.getItem(PREVIEW_VISIBLE_STORAGE_KEY) !== "false";
}

function readStoredEditorSettings(): EditorSettings {
  const defaults: EditorSettings = {
    wrapLines: true,
    showInvisibles: false,
    fontSize: 14,
    tabSize: 2,
  };
  const value = window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);

  if (!value) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(value) as Partial<EditorSettings>;

    return {
      wrapLines:
        typeof parsed.wrapLines === "boolean"
          ? parsed.wrapLines
          : defaults.wrapLines,
      showInvisibles:
        typeof parsed.showInvisibles === "boolean"
          ? parsed.showInvisibles
          : defaults.showInvisibles,
      fontSize: clampNumber(parsed.fontSize, 12, 22, defaults.fontSize),
      tabSize: [2, 4, 8].includes(Number(parsed.tabSize))
        ? Number(parsed.tabSize)
        : defaults.tabSize,
    };
  } catch {
    return defaults;
  }
}

function readStoredDrafts(): DraftRecord[] {
  const value = window.localStorage.getItem(DRAFT_STATE_STORAGE_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isDraftRecord)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_DRAFTS);
  } catch {
    return [];
  }
}

function writeStoredDrafts(drafts: DraftRecord[]) {
  const normalizedDrafts = drafts
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_DRAFTS);

  if (normalizedDrafts.length === 0) {
    window.localStorage.removeItem(DRAFT_STATE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    DRAFT_STATE_STORAGE_KEY,
    JSON.stringify(normalizedDrafts),
  );
}

function removeStoredDraft(path: string) {
  writeStoredDrafts(
    readStoredDrafts().filter((draft) => draft.path !== path),
  );
}

function upsertDraftRecord(
  drafts: DraftRecord[],
  nextDraft: DraftRecord,
): DraftRecord[] {
  return [
    nextDraft,
    ...drafts.filter((draft) => draft.path !== nextDraft.path),
  ].slice(0, MAX_STORED_DRAFTS);
}

function isDraftRecord(value: unknown): value is DraftRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DraftRecord>;

  return (
    typeof candidate.path === "string" &&
    typeof candidate.contents === "string" &&
    (candidate.line_ending === "lf" || candidate.line_ending === "crlf") &&
    typeof candidate.savedFingerprint === "string" &&
    typeof candidate.updatedAt === "number"
  );
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

function findTextMatches(
  source: string,
  query: string,
  options: SearchOptions,
): TextMatch[] {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  if (options.regex) {
    return findRegexMatches(source, normalizedQuery, options);
  }

  const haystack = options.caseSensitive ? source : source.toLowerCase();
  const needle = options.caseSensitive
    ? normalizedQuery
    : normalizedQuery.toLowerCase();
  const matches: TextMatch[] = [];
  let cursor = 0;

  while (matches.length < 999) {
    const foundAt = haystack.indexOf(needle, cursor);

    if (foundAt === -1) {
      break;
    }

    const to = foundAt + needle.length;

    if (
      !options.wholeWord ||
      isWordBoundary(source, foundAt, to)
    ) {
      matches.push({ from: foundAt, to });
    }

    cursor = foundAt + Math.max(needle.length, 1);
  }

  return matches;
}

function findRegexMatches(
  source: string,
  query: string,
  options: SearchOptions,
): TextMatch[] {
  const matches: TextMatch[] = [];

  try {
    const flags = options.caseSensitive ? "gu" : "giu";
    const regex = new RegExp(query, flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) && matches.length < 999) {
      const from = match.index;
      const to = from + match[0].length;

      if (match[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }

      if (!options.wholeWord || isWordBoundary(source, from, to)) {
        matches.push({ from, to });
      }
    }
  } catch {
    return [];
  }

  return matches;
}

function canCompileRegex(query: string): boolean {
  try {
    new RegExp(query, "u");
    return true;
  } catch {
    return false;
  }
}

function isWordBoundary(source: string, from: number, to: number): boolean {
  const before = from > 0 ? source[from - 1] : "";
  const after = to < source.length ? source[to] : "";

  return !isWordCharacter(before) && !isWordCharacter(after);
}

function isWordCharacter(char: string): boolean {
  return /^[\p{L}\p{N}_]$/u.test(char);
}

function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === "Process";
}

function analyzeTextDocument(
  contents: string,
  savedLineEnding?: EditableLineEnding,
): TextDocumentStats {
  const counts = countLineEndings(contents);
  const byteContents = savedLineEnding
    ? normalizeTextLineEndings(contents, savedLineEnding)
    : contents;

  return {
    bytes: new TextEncoder().encode(byteContents).length,
    characters: Array.from(contents).length,
    lineEnding: savedLineEnding ?? summarizeLineEndings(counts),
    hasFinalNewline: contents.endsWith("\n") || contents.endsWith("\r"),
  };
}

function countLineEndings(contents: string) {
  let crlf = 0;
  let lf = 0;
  let cr = 0;

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index];
    const nextChar = contents[index + 1];

    if (char === "\r" && nextChar === "\n") {
      crlf += 1;
      index += 1;
    } else if (char === "\n") {
      lf += 1;
    } else if (char === "\r") {
      cr += 1;
    }
  }

  return { crlf, lf, cr };
}

function summarizeLineEndings({
  crlf,
  lf,
  cr,
}: {
  crlf: number;
  lf: number;
  cr: number;
}): LineEndingKind {
  const usedKinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;

  if (usedKinds === 0) {
    return "none";
  }

  if (usedKinds > 1 || cr > 0) {
    return "mixed";
  }

  return crlf > 0 ? "crlf" : "lf";
}

function normalizeTextLineEndings(
  contents: string,
  lineEnding: EditableLineEnding,
): string {
  const lfContents = contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (lineEnding === "lf") {
    return lfContents;
  }

  return lfContents.replace(/\n/g, "\r\n");
}

function formatDocumentMeta(stats: TextDocumentStats, fileName: string): string {
  return [
    formatFileType(fileName),
    formatBytes(stats.bytes),
    `${stats.characters.toLocaleString()} chars`,
    formatLineEndingKind(stats.lineEnding),
    stats.hasFinalNewline ? "final newline" : "no final newline",
  ].join(" · ");
}

function formatFileType(fileName: string): string {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";

  switch (extension) {
    case "md":
    case "markdown":
    case "mdown":
      return "Markdown";
    case "txt":
    case "text":
    case "log":
      return "Text";
    case "json":
    case "jsonl":
      return "JSON";
    case "yaml":
    case "yml":
      return "YAML";
    case "toml":
      return "TOML";
    case "csv":
    case "tsv":
      return "Delimited text";
    case "html":
    case "xml":
      return "Markup";
    case "css":
      return "CSS";
    case "ini":
    case "conf":
      return "Config";
    default:
      return extension ? extension.toUpperCase() : "Plain text";
  }
}

function formatLineEndingKind(lineEnding: LineEndingKind): string {
  if (lineEnding === "crlf") {
    return "CRLF";
  }

  if (lineEnding === "mixed") {
    return "Mixed";
  }

  if (lineEnding === "none") {
    return "No line endings";
  }

  return "LF";
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

function formatSelectionInfo(selection: EditorSelectionInfo): string {
  const selectionText =
    selection.selectedCharacters > 0
      ? ` · ${selection.selectedCharacters.toLocaleString()} selected / ${selection.selectedLines.toLocaleString()} lines`
      : "";

  return `Ln ${selection.line.toLocaleString()}, Col ${selection.column.toLocaleString()}${selectionText}`;
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return "recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(numberValue), min), max);
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

function suggestedSaveAsPath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex === -1 ? "" : path.slice(0, slashIndex + 1);
  const fileName = slashIndex === -1 ? path : path.slice(slashIndex + 1);
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex <= 0) {
    return `${directory}${fileName}-copy`;
  }

  return `${directory}${fileName.slice(0, dotIndex)}-copy${fileName.slice(dotIndex)}`;
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
