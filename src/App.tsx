import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import EditorPane, {
  type EditorPaneHandle,
  type MarkdownFormat,
  type EditorSelectionInfo,
} from "./components/EditorPane";
import PreviewPane from "./components/PreviewPane";
import {
  closeCurrentWindow,
  createTextFile,
  drainOpenedFiles,
  getFileMetadata,
  listWorkspaceDirectory,
  listWorkspaceTree,
  OPENED_FILES_EVENT,
  onCurrentWindowCloseRequested,
  openTextFile,
  openWorkspaceImage,
  pickMarkdownFile,
  pickNewMarkdownFilePath,
  pickSaveAsTextFilePath,
  pickWorkspaceFolder,
  requestAppRestart,
  revealPathInFileManager,
  saveTextFile,
  saveTextFileAs,
  setCurrentWindowTitle,
  getAgentWorkbenchSessionState,
  isTauriRuntime,
  resizeAgentWorkbenchTerminal,
  startAgentWorkbenchSession,
  stopAgentWorkbenchSession,
  writeAgentWorkbenchSessionInput,
  updateAppMenuState,
  type AppMenuRecentItem,
  type AgentWorkbenchOutputChunk,
  type AgentWorkbenchPreflight,
  type AgentWorkbenchProvider,
  type AgentWorkbenchSession,
  type SavedFileState,
  type TextFileDocument,
  type WorkspaceTreeEntry,
} from "./tauri";

const APP_MENU_ACTION_EVENT = "hazakura-note://menu-action";
const THEME_STORAGE_KEY = "hazakura-note-theme";
const WORKSPACE_STATE_STORAGE_KEY = "hazakura-note-workspace-state";
const PREVIEW_VISIBLE_STORAGE_KEY = "hazakura-note-preview-visible";
const EDITOR_SETTINGS_STORAGE_KEY = "hazakura-note-editor-settings";
const MENU_LANGUAGE_STORAGE_KEY = "hazakura-note-menu-language";
const DRAFT_STATE_STORAGE_KEY = "hazakura-note-unsaved-drafts";
const RECENT_FILES_STORAGE_KEY = "hazakura-note-recent-files";
const RECENT_FOLDERS_STORAGE_KEY = "hazakura-note-recent-folders";
const AGENT_WORKBENCH_ENABLED_STORAGE_KEY =
  "hazakura-note-agent-workbench-enabled";
const AGENT_WORKBENCH_CONSENT_STORAGE_KEY =
  "hazakura-note-agent-workbench-consent";
const AGENT_WORKBENCH_PROVIDER_STORAGE_KEY =
  "hazakura-note-agent-workbench-provider";
const AGENT_WORKBENCH_PROVIDERS: Array<{
  id: AgentWorkbenchProvider;
  label: string;
}> = [
  { id: "codex", label: "Codex CLI" },
  { id: "opencode", label: "OpenCode CLI" },
];
const AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS = 500;
const AGENT_WORKBENCH_SESSION_POLL_MS = 200;
const EXTERNAL_CHANGE_ACTIVE_POLL_MS = 1000;
const EXTERNAL_CHANGE_CONFLICT_MESSAGE =
  "The file changed on disk, possibly from another app or Agent provider. Saving is stopped until you choose how to continue.";
const MAX_RESTORED_TABS = 12;
const MAX_STORED_DRAFTS = 20;
const MAX_RECENT_ITEMS = 8;
const SCROLL_SYNC_TOLERANCE_PX = 10;
const DEFAULT_PREVIEW_COLUMN_PERCENT = 42;
const MIN_PREVIEW_COLUMN_PERCENT = 25;
const MAX_PREVIEW_COLUMN_PERCENT = 75;
const DIFF_MAX_LINE_PRODUCT = 1_000_000;
const MARKDOWN_OUTLINE_MAX_HEADINGS = 200;

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
type BaseTheme = "light" | "dark";
type ThemePreference = "system" | BaseTheme | "sakura" | "yakou" | "shokou";
type ResolvedTheme = BaseTheme | "sakura" | "yakou" | "shokou";
type EditableLineEnding = "lf" | "crlf";
type LineEndingKind = EditableLineEnding | "mixed" | "none";
type RightPaneMode = "preview" | "compare" | "outline" | "agent";
type MenuLanguage = "en" | "ja";
type PreferencesDialogMode = "settings" | "agent";

type MarkdownHeading = {
  level: number;
  line: number;
  text: string;
};
type MarkdownOutline = {
  headings: MarkdownHeading[];
  truncated: boolean;
};
type MarkdownHeadingContext = {
  previous: MarkdownHeading | null;
  current: MarkdownHeading | null;
  next: MarkdownHeading | null;
};

type AgentLaunchGateState = {
  kind: "idle" | "checking" | "passed" | "rejected";
  message: string;
  preflight: AgentWorkbenchPreflight | null;
};

type AgentTerminalSize = {
  columns: number;
  rows: number;
};

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

type RecentEntry = {
  path: string;
  label: string;
  openedAt: number;
};

type TextDocumentStats = {
  bytes: number;
  characters: number;
  lineEnding: LineEndingKind;
  hasFinalNewline: boolean;
};

type ImagePreviewState = {
  path: string;
  name: string;
  url: string;
  size: number;
};

type CompareAnchor = {
  path: string;
  name: string;
};

type WorkspaceContextMenuState = CompareAnchor & {
  x: number;
  y: number;
  canCompare: boolean;
};

type DiffLine = {
  kind: "equal" | "added" | "removed";
  leftLine: number | null;
  rightLine: number | null;
  text: string;
};

type DiffSplitCell = {
  kind: "equal" | "added" | "removed" | "blank";
  line: number | null;
  text: string;
};

type DiffSplitRow = {
  kind: "equal" | "added" | "removed" | "changed";
  left: DiffSplitCell;
  right: DiffSplitCell;
};

type DiffDisplayRow =
  | {
      kind: "section";
      key: string;
      label: string;
    }
  | {
      kind: "line";
      key: string;
      row: DiffSplitRow;
    };

type CompareViewState = {
  kind: "file" | "changes";
  leftPath: string;
  leftName: string;
  leftColumnLabel?: string;
  rightPath: string;
  rightName: string;
  rightColumnLabel?: string;
  lines: DiffLine[];
  additions: number;
  removals: number;
};

export default function App() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImagePreviewState | null>(
    null,
  );
  const [compareAnchor, setCompareAnchor] = useState<CompareAnchor | null>(null);
  const [compareTarget, setCompareTarget] = useState<CompareAnchor | null>(null);
  const [compareView, setCompareView] = useState<CompareViewState | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] =
    useState<WorkspaceContextMenuState | null>(null);
  const [imageReturnTabId, setImageReturnTabId] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] =
    useState<WorkspaceTreeEntry | null>(null);
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(
    null,
  );
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(
    null,
  );
  const [pendingAppClose, setPendingAppClose] = useState(false);
  const [preferencesDialogMode, setPreferencesDialogMode] =
    useState<PreferencesDialogMode | null>(null);
  const [agentWorkbenchActive] = useState(() =>
    readStoredAgentWorkbenchEnabled(),
  );
  const [agentWorkbenchPreference, setAgentWorkbenchPreference] = useState(
    () => readStoredAgentWorkbenchEnabled(),
  );
  const [agentWorkbenchConsent, setAgentWorkbenchConsent] = useState(() =>
    readStoredAgentWorkbenchConsent(),
  );
  const [agentWorkbenchProvider, setAgentWorkbenchProvider] =
    useState<AgentWorkbenchProvider>(() => readStoredAgentWorkbenchProvider());
  const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>("preview");
  const [agentLaunchGate, setAgentLaunchGate] = useState<AgentLaunchGateState>({
    kind: "idle",
    message: "Launch gate not checked.",
    preflight: null,
  });
  const [agentSession, setAgentSession] =
    useState<AgentWorkbenchSession | null>(null);
  const [agentOutput, setAgentOutput] = useState<AgentWorkbenchOutputChunk[]>(
    [],
  );
  const [agentTerminalSize, setAgentTerminalSize] =
    useState<AgentTerminalSize | null>(null);
  const [agentStopPending, setAgentStopPending] = useState(false);
  const [appRestartPending, setAppRestartPending] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findVisible, setFindVisible] = useState(false);
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
  const [scrollHud, setScrollHud] = useState({
    ratio: 0,
    visible: false,
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
  const [previewColumnPercent, setPreviewColumnPercent] = useState(
    DEFAULT_PREVIEW_COLUMN_PERCENT,
  );
  const [menuLanguage, setMenuLanguage] = useState<MenuLanguage>(() =>
    readStoredMenuLanguage(),
  );
  const [recentFiles, setRecentFiles] = useState<RecentEntry[]>(() =>
    readStoredRecentEntries(RECENT_FILES_STORAGE_KEY),
  );
  const [recentFolders, setRecentFolders] = useState<RecentEntry[]>(() =>
    readStoredRecentEntries(RECENT_FOLDERS_STORAGE_KEY),
  );
  const [systemTheme, setSystemTheme] = useState<BaseTheme>(() =>
    readSystemTheme(),
  );
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorPaneRef = useRef<EditorPaneHandle | null>(null);
  const closeTabDialogRef = useRef<HTMLElement | null>(null);
  const appCloseDialogRef = useRef<HTMLElement | null>(null);
  const preferencesDialogRef = useRef<HTMLElement | null>(null);
  const closeTabCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const appCloseCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const preferencesCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorPreviewGridRef = useRef<HTMLDivElement | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const previewScrollFrameRef = useRef<number | null>(null);
  const scrollHudHideTimerRef = useRef<number | null>(null);
  const scrollSyncSourceRef = useRef<"editor" | "preview" | null>(null);
  const agentUiSuspendedRef = useRef(false);
  const tabsRef = useRef<EditorTab[]>([]);
  const recentFilesRef = useRef<RecentEntry[]>(recentFiles);
  const recentFoldersRef = useRef<RecentEntry[]>(recentFolders);

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
  const agentWorkbenchRestartRequired =
    agentWorkbenchPreference !== agentWorkbenchActive;
  const resolvedTheme: ResolvedTheme =
    themePreference === "system" ? systemTheme : themePreference;
  const editorTheme: BaseTheme =
    resolvedTheme === "dark" || resolvedTheme === "yakou" ? "dark" : "light";
  const activeContents = activeTab?.contents ?? "";
  const activeDirty = activeTab ? isDirty(activeTab) : false;
  const activeError = activeTab?.error ?? globalError;
  const activeConflict = activeTab?.saveStatus === "conflict";
  const activeSaveError = isSaveFailureError(activeTab);
  const agentWorkbenchAvailable = agentWorkbenchActive && agentWorkbenchConsent;
  const safeEditorCopy =
    menuLanguage === "ja"
      ? {
          emptyTabs: "ファイル未選択",
          newFile: "新規ファイル",
          noFileOpen: "ファイル未選択",
          noFolderOpen: "フォルダ未選択",
          openFile: "ファイルを開く",
          openFolder: "フォルダを開く",
          openWorkspaceFolder: "ワークスペースフォルダを開く",
          recentFiles: "最近使ったファイル",
          startHeading: "静かに書き始める",
          startActions: "開始操作",
          workspace: "ワークスペース",
          workspaceFileTree: "ワークスペースのファイルツリー",
        }
      : {
          emptyTabs: "No open files",
          newFile: "New File",
          noFileOpen: "No file open",
          noFolderOpen: "No folder open",
          openFile: "Open File",
          openFolder: "Open Folder",
          openWorkspaceFolder: "Open workspace folder",
          recentFiles: "Recent files",
          startHeading: "Start writing quietly",
          startActions: "Start actions",
          workspace: "Workspace",
          workspaceFileTree: "Workspace file tree",
        };
  const sidePaneCopy =
    menuLanguage === "ja"
      ? {
          agentWorkbench: "エージェントワークベンチ",
          agentTab: "エージェント",
          diffTab: "Diff",
          fileComparison: "ファイル比較",
          imagePreview: "画像プレビュー",
          markdownPreview: "Markdown プレビュー",
          outlineEmpty: "このファイルに Markdown 見出しはありません。",
          outlineTruncated:
            "見出しが多いため、最初の200件まで表示しています。",
          outlineTab: "アウトライン",
          documentOutline: "文書アウトライン",
          openTextFileToPreview:
            "Markdown プレビューを表示するにはテキストファイルを開いてください。",
          previewDisabled: "プレビューは設定で無効です。",
          previewTab: "プレビュー",
          previewUnavailable: "プレビューを表示できません",
          resizeColumns: "エディタとサイドペインの幅を変更",
          resizeColumnsTitle:
            "ドラッグしてエディタとサイドペインの幅を変更",
          sidePaneMode: "サイドペイン表示",
        }
      : {
          agentWorkbench: "Agent Workbench",
          agentTab: "Agent",
          diffTab: "Diff",
          fileComparison: "File comparison",
          imagePreview: "Image Preview",
          markdownPreview: "Markdown preview",
          outlineEmpty: "This file has no Markdown headings.",
          outlineTruncated:
            "Showing the first 200 headings because this file has more.",
          outlineTab: "Outline",
          documentOutline: "Document outline",
          openTextFileToPreview: "Open a text file to show Markdown preview.",
          previewDisabled: "Preview pane is disabled in Preferences.",
          previewTab: "Preview",
          previewUnavailable: "Preview unavailable",
          resizeColumns: "Resize editor and side pane columns",
          resizeColumnsTitle: "Drag to resize editor and side pane",
          sidePaneMode: "Side pane mode",
        };
  const editorChromeCopy =
    menuLanguage === "ja"
      ? {
          caseSensitive: "大文字",
          closeSearch: "検索を閉じる",
          find: "検索",
          findInActiveFile: "アクティブファイル内を検索",
          findOptions: "検索オプション",
          go: "移動",
          goToLine: "指定行へ移動",
          inlineCode: "インラインコード",
          inlineCodeTitle: "インラインコード (Command+E)",
          invalidRegex: "正規表現が無効です",
          italic: "斜体",
          italicTitle: "斜体 (Command+I)",
          line: "行",
          lineEnding: "改行",
          lineEndings: "改行コード",
          link: "リンク",
          linkTitle: "リンク (Command+K)",
          markdownHelpers: "Markdown 補助",
          next: "次へ",
          noMatches: "一致なし",
          noSearch: "検索なし",
          previous: "前へ",
          regex: "正規表現",
          searchActiveFile: "アクティブファイルを検索",
          strong: "太字",
          strongTitle: "太字 (Command+B)",
          word: "単語",
        }
      : {
          caseSensitive: "Case",
          closeSearch: "Close search",
          find: "Find",
          findInActiveFile: "Find in active file",
          findOptions: "Find options",
          go: "Go",
          goToLine: "Go to line",
          inlineCode: "Inline code",
          inlineCodeTitle: "Inline code (Command+E)",
          invalidRegex: "Invalid regex",
          italic: "Italic",
          italicTitle: "Italic (Command+I)",
          line: "Line",
          lineEnding: "Line",
          lineEndings: "Line endings",
          link: "Link",
          linkTitle: "Link (Command+K)",
          markdownHelpers: "Markdown helpers",
          next: "Next",
          noMatches: "No matches",
          noSearch: "No search",
          previous: "Prev",
          regex: "Regex",
          searchActiveFile: "Search active file",
          strong: "Bold",
          strongTitle: "Bold (Command+B)",
          word: "Word",
        };
  const recoveryCopy =
    menuLanguage === "ja"
      ? {
          closeWithoutSaving: "保存せず閉じる",
          conflictActions: "外部変更の操作",
          conflictDetail:
            "ディスク上のファイルが別のアプリまたは Agent provider によって変更された可能性があります。続行方法を選ぶまで保存は停止されます。",
          conflictHeading: "ファイルが外部で変更されました",
          discardDraft: "下書きを破棄",
          draftActions: "下書きの操作",
          draftAvailable: (name: string) => `${name} の未保存下書きがあります。`,
          keepEditing: "編集を続ける",
          reopenFromDisk: "ディスクから再読み込み",
          reviewChanges: "変更を確認",
          restoreDraft: "下書きを復元",
          saveErrorActions: "保存エラーの操作",
          saveFailure:
            "保存に失敗しました。編集内容はエディタ内に残っています。ファイルやフォルダの問題を確認してから、もう一度保存してください。",
          savedLocally: (timestamp: number) =>
            `ローカル保存: ${formatTimestamp(timestamp)}`,
          trySaveAgain: "もう一度保存",
        }
      : {
          closeWithoutSaving: "Close without saving",
          conflictActions: "Conflict actions",
          conflictDetail: EXTERNAL_CHANGE_CONFLICT_MESSAGE,
          conflictHeading: "File changed outside hazakura",
          discardDraft: "Discard draft",
          draftActions: "Draft actions",
          draftAvailable: (name: string) =>
            `Unsaved draft available for ${name}.`,
          keepEditing: "Keep editing",
          reopenFromDisk: "Reopen from disk",
          reviewChanges: "Review changes",
          restoreDraft: "Restore draft",
          saveErrorActions: "Save error actions",
          saveFailure: formatSaveFailureMessage(),
          savedLocally: (timestamp: number) =>
            `Saved locally ${formatTimestamp(timestamp)}.`,
          trySaveAgain: "Try save again",
        };
  const preferencesCopy =
    menuLanguage === "ja"
      ? {
          application: "アプリケーション",
          dark: "ダーク",
          editor: "エディタ",
          editorDisplay: "エディタ表示",
          fontSize: "フォントサイズ",
          fontSizeControl: "エディタのフォントサイズ",
          light: "ライト",
          closeDialog: "ダイアログを閉じる",
          menuLanguage: "メニュー言語",
          previewPane: "プレビュー表示",
          sakura: "桜",
          yakou: "夜光",
          shokou: "曙光",
          settingsTitle: "設定",
          showInvisibles: "不可視文字を表示",
          system: "システム",
          tabSize: "タブ幅",
          theme: "テーマ",
          wrapLines: "行を折り返す",
        }
      : {
          application: "Application",
          dark: "Dark",
          editor: "Editor",
          editorDisplay: "Editor display",
          fontSize: "Font size",
          fontSizeControl: "Editor font size",
          light: "Light",
          closeDialog: "Close dialog",
          menuLanguage: "Menu language",
          previewPane: "Preview pane",
          sakura: "Sakura",
          yakou: "Yakou",
          shokou: "Shokou",
          settingsTitle: "Preferences",
          showInvisibles: "Show invisibles",
          system: "System",
          tabSize: "Tab size",
          theme: "Theme",
          wrapLines: "Wrap lines",
        };
  const agentWorkbenchCopy =
    menuLanguage === "ja"
      ? {
          title: "エージェントワークベンチ",
          modeHeading: "モード",
          modeSectionLabel: "エージェントモード",
          sessionHeading: "セッション",
          sessionSectionLabel: "エージェントセッション",
          boundaryHeading: "責任境界",
          boundarySectionLabel: "エージェントの責任境界",
          enableAfterRestart: "再起動後にエージェントワークベンチを有効化",
          activeSessionMode: "このアプリセッションではエージェントワークベンチが有効です。",
          safeSessionMode: "このアプリセッションでは Safe Editor モードが有効です。",
          restartRequired:
            "エージェント画面と CLI 起動の有効状態を切り替えるには、hazakura-note の再起動が必要です。",
          restartNow: "今すぐ再起動",
          restarting: "再起動中...",
          provider: "プロバイダー",
          session: "セッション",
          workspace: "ワークスペース",
          noWorkspace: "ワークスペース未選択",
          providerControl: "エージェントワークベンチのプロバイダー",
          boundaryItems: [
            "hazakura は汎用 shell prompt を提供しません。",
            "hazakura が直接起動できるのは許可リスト済みの agent CLI だけです。",
            "起動した CLI の挙動は CLI 側仕様とユーザー操作に依存します。",
            "エージェントワークベンチは信頼できる workspace でだけ使ってください。",
            "CLI が作った変更を採用するかはユーザーが判断します。",
          ],
          consent:
            "エージェントワークベンチの責任境界を理解しました。",
          modeBadgeActive: "エージェントモード",
          modeBadgePending: "エージェントモード: 再起動待ち",
          modeBadgeTitle:
            "エージェントワークベンチは Safe Editor モードとは別の trust boundary です。",
        }
      : {
          title: "Agent Workbench",
          modeHeading: "Mode",
          modeSectionLabel: "Agent mode",
          sessionHeading: "Session",
          sessionSectionLabel: "Agent session",
          boundaryHeading: "Boundary",
          boundarySectionLabel: "Agent responsibility boundary",
          enableAfterRestart: "Enable Agent Workbench after restart",
          activeSessionMode: "Agent Workbench mode is active for this app session.",
          safeSessionMode: "Safe Editor Mode is active for this app session.",
          restartRequired:
            "Restart hazakura-note before Agent Workbench UI or backend launch commands change.",
          restartNow: "Restart now",
          restarting: "Restarting...",
          provider: "Provider",
          session: "Session",
          workspace: "Workspace",
          noWorkspace: "No workspace selected",
          providerControl: "Agent Workbench provider",
          boundaryItems: [
            "hazakura does not provide a general-purpose shell prompt.",
            "hazakura can directly launch only allowlisted agent CLIs.",
            "The launched CLI behavior depends on the CLI and your actions inside it.",
            "Use Agent Workbench only in trusted workspaces.",
            "You review and decide what to do with CLI-made changes.",
          ],
          consent:
            "I understand the Agent Workbench responsibility boundary.",
          modeBadgeActive: "Agent Mode",
          modeBadgePending: "Agent Mode: restart pending",
          modeBadgeTitle:
            "Agent Workbench is a separate trust boundary from Safe Editor Mode.",
        };
  const agentWorkbenchModeBadge = agentWorkbenchRestartRequired
    ? agentWorkbenchCopy.modeBadgePending
    : agentWorkbenchActive
      ? agentWorkbenchCopy.modeBadgeActive
      : null;
  const activeAgentSession = isActiveAgentSession(agentSession);
  const effectiveRightPaneMode: RightPaneMode =
    agentWorkbenchAvailable && !activeTab && rightPaneMode === "preview"
      ? "agent"
      : rightPaneMode;
  const agentPaneVisible =
    agentWorkbenchAvailable && effectiveRightPaneMode === "agent";
  const outlinePaneVisible =
    effectiveRightPaneMode === "outline" && activeTab !== null;
  const previewPaneVisible =
    effectiveRightPaneMode === "preview" &&
    previewVisible &&
    activeTab !== null;
  const sidePaneMode = effectiveRightPaneMode === "compare"
    ? "compare"
    : agentPaneVisible
      ? "agent"
      : outlinePaneVisible
        ? "outline"
        : previewPaneVisible
          ? "preview"
          : null;
  const sidePaneVisible = sidePaneMode !== null;
  const hasWorkspaceSelection = Boolean(
    activeTab || selectedImage || compareView || agentPaneVisible,
  );
  const documentOutline = useMemo(
    () => (activeTab ? extractMarkdownOutline(activeContents) : null),
    [activeContents, activeTab],
  );
  const documentHeadings = documentOutline?.headings ?? [];
  const currentMarkdownHeading = useMemo(
    () => findCurrentMarkdownHeading(documentHeadings, selectionInfo.line),
    [documentHeadings, selectionInfo.line],
  );
  const activeDocumentLineCount = useMemo(
    () => countDocumentLines(activeContents),
    [activeContents],
  );
  const scrollHudLine = Math.min(
    activeDocumentLineCount,
    Math.max(1, Math.round(1 + scrollHud.ratio * (activeDocumentLineCount - 1))),
  );
  const scrollHudHeadingContext = useMemo(
    () => getMarkdownHeadingContext(documentHeadings, scrollHudLine),
    [documentHeadings, scrollHudLine],
  );
  const activeDocumentStats = useMemo(
    () => analyzeTextDocument(activeContents, activeTab?.line_ending),
    [activeContents, activeTab?.line_ending],
  );
  const compareDocumentMeta = sidePaneMode === "compare" && compareView
    ? menuLanguage === "ja"
      ? `${compareView.kind === "changes" ? "変更確認" : "比較"} · ${compareView.additions} 追加 · ${compareView.removals} 削除`
      : `${compareView.kind === "changes" ? "Change review" : "Comparison"} · ${compareView.additions} added · ${compareView.removals} removed`
    : null;
  const activeDocumentMeta = activeTab
    ? formatActiveDocumentMeta(
        activeDocumentStats,
        activeTab,
        activeDirty,
        menuLanguage,
      )
    : selectedImage
      ? menuLanguage === "ja"
        ? `画像 · ${formatBytes(selectedImage.size)} · ${selectedImage.name}`
        : `Image · ${formatBytes(selectedImage.size)} · ${selectedImage.name}`
      : safeEditorCopy.noFileOpen;
  const activeStatusDetail = compareDocumentMeta
    ? compareDocumentMeta
    : activeTab
    ? formatActiveEditorStatusDetail(
        activeDocumentMeta,
        selectionInfo,
        currentMarkdownHeading,
        menuLanguage,
      )
    : activeDocumentMeta;
  const documentKey = activeTab?.path ?? selectedImage?.path ?? "welcome";
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

  const applyAgentOutput = useCallback(
    (
      nextOutput: AgentWorkbenchOutputChunk[],
      options: { allowReset?: boolean } = {},
    ) => {
      setAgentOutput((currentOutput) => {
        if (options.allowReset) {
          return nextOutput;
        }

        if (nextOutput.length === 0 && currentOutput.length > 0) {
          return currentOutput;
        }

        const nextSeq = lastAgentOutputSeq(nextOutput);
        const currentSeq = lastAgentOutputSeq(currentOutput);

        if (
          nextSeq === currentSeq &&
          nextOutput.length === currentOutput.length
        ) {
          return currentOutput;
        }

        return nextSeq > currentSeq ? nextOutput : currentOutput;
      });
    },
    [],
  );
  const invalidRegex =
    searchOptions.regex && findQuery.trim().length > 0
      ? !canCompileRegex(findQuery)
      : false;
  const allowWindowCloseRef = useRef(false);
  const discardingWindowCloseRef = useRef(false);
  const preferencesOpen = preferencesDialogMode !== null;
  const modalOpen =
    pendingCloseTab !== null || pendingAppClose || preferencesOpen;
  const editorPreviewGridStyle =
    sidePaneVisible && sidePaneMode !== "compare"
      ? {
          gridTemplateColumns: `minmax(280px, ${100 - previewColumnPercent}%) 6px minmax(260px, ${previewColumnPercent}%)`,
        }
      : undefined;

  const focusEditorSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      editorPaneRef.current?.focus();
    });
  }, []);

  const suspendAgentUiRefresh = useCallback(() => {
    agentUiSuspendedRef.current = true;
  }, []);

  const resumeAgentUiRefresh = useCallback(() => {
    agentUiSuspendedRef.current = false;
  }, []);

  const togglePreviewPane = useCallback(() => {
    if (sidePaneMode === "preview") {
      setPreviewVisible(false);
      return;
    }

    setRightPaneMode("preview");
    setPreviewVisible(true);
  }, [sidePaneMode]);

  const toggleDiffPane = useCallback(() => {
    if (sidePaneMode === "compare") {
      setRightPaneMode("preview");
      return;
    }

    setRightPaneMode("compare");
  }, [sidePaneMode]);

  const toggleOutlinePane = useCallback(() => {
    if (!activeTab) {
      return;
    }

    if (sidePaneMode === "outline") {
      setRightPaneMode("preview");
      return;
    }

    setRightPaneMode("outline");
  }, [activeTab, sidePaneMode]);

  const toggleAgentPane = useCallback(() => {
    if (sidePaneMode === "agent") {
      setRightPaneMode("preview");
      return;
    }

    setRightPaneMode("agent");
  }, [sidePaneMode]);

  const showScrollPositionHud = useCallback(
    (ratio: number) => {
      if (
        !activeTab ||
        !isMarkdownDocumentPath(activeTab.path) ||
        documentHeadings.length === 0
      ) {
        return;
      }

      if (scrollHudHideTimerRef.current !== null) {
        window.clearTimeout(scrollHudHideTimerRef.current);
      }

      setScrollHud({
        ratio: clampScrollRatio(ratio),
        visible: true,
      });

      scrollHudHideTimerRef.current = window.setTimeout(() => {
        scrollHudHideTimerRef.current = null;
        setScrollHud((current) => ({ ...current, visible: false }));
      }, 1400);
    },
    [activeTab, documentHeadings.length],
  );

  const syncPreviewScroll = useCallback((ratio: number) => {
    if (scrollSyncSourceRef.current === "preview") {
      return;
    }

    showScrollPositionHud(ratio);

    if (previewScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(previewScrollFrameRef.current);
    }

    previewScrollFrameRef.current = window.requestAnimationFrame(() => {
      previewScrollFrameRef.current = null;

      const previewPane = previewPaneRef.current;

      if (!previewPane) {
        return;
      }

      const scrollableHeight = previewPane.scrollHeight - previewPane.clientHeight;
      const nextScrollTop = scrollableHeight <= 0 ? 0 : scrollableHeight * ratio;

      if (
        Math.abs(previewPane.scrollTop - nextScrollTop) >=
        SCROLL_SYNC_TOLERANCE_PX
      ) {
        scrollSyncSourceRef.current = "editor";
        previewPane.scrollTop = nextScrollTop;
        window.setTimeout(() => {
          if (scrollSyncSourceRef.current === "editor") {
            scrollSyncSourceRef.current = null;
          }
        }, 80);
      }
    });
  }, [showScrollPositionHud]);

  const syncEditorScroll = useCallback(() => {
    if (scrollSyncSourceRef.current === "editor") {
      return;
    }

    const previewPane = previewPaneRef.current;

    if (!previewPane) {
      return;
    }

    const scrollableHeight = previewPane.scrollHeight - previewPane.clientHeight;
    const ratio =
      scrollableHeight <= 0 ? 0 : previewPane.scrollTop / scrollableHeight;

    scrollSyncSourceRef.current = "preview";
    const didSync = editorPaneRef.current?.setScrollRatio(
      ratio,
      SCROLL_SYNC_TOLERANCE_PX,
    );

    if (didSync) {
      window.setTimeout(() => {
        if (scrollSyncSourceRef.current === "preview") {
          scrollSyncSourceRef.current = null;
        }
      }, 80);
      return;
    }

    scrollSyncSourceRef.current = null;
  }, []);

  const resizePreviewColumn = useCallback((clientX: number) => {
    const grid = editorPreviewGridRef.current;

    if (!grid) {
      return;
    }

    const rect = grid.getBoundingClientRect();
    const previewPercent = ((rect.right - clientX) / rect.width) * 100;

    setPreviewColumnPercent(
      clampNumber(
        previewPercent,
        MIN_PREVIEW_COLUMN_PERCENT,
        MAX_PREVIEW_COLUMN_PERCENT,
        DEFAULT_PREVIEW_COLUMN_PERCENT,
      ),
    );
  }, []);

  const handlePreviewResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      resizePreviewColumn(event.clientX);
    },
    [resizePreviewColumn],
  );

  const handlePreviewResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }

      resizePreviewColumn(event.clientX);
    },
    [resizePreviewColumn],
  );

  const handlePreviewResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      setPreviewColumnPercent((currentPercent) =>
        clampNumber(
          currentPercent + (event.key === "ArrowLeft" ? 5 : -5),
          MIN_PREVIEW_COLUMN_PERCENT,
          MAX_PREVIEW_COLUMN_PERCENT,
          currentPercent,
        ),
      );
    },
    [],
  );

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

  const rememberRecentFile = useCallback((path: string) => {
    setRecentFiles((currentEntries) =>
      upsertRecentEntry(currentEntries, path, fileNameFromPath(path)),
    );
  }, []);

  const rememberRecentFolder = useCallback((path: string) => {
    setRecentFolders((currentEntries) =>
      upsertRecentEntry(currentEntries, path, folderLabelFromPath(path)),
    );
  }, []);

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
        setSelectedImage(null);
        setImageReturnTabId(null);
        setCompareView(null);
        rememberRecentFile(path);
        setStatus("Tab focused");
        return true;
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
        setSelectedImage(null);
        setImageReturnTabId(null);
        setCompareView(null);
        rememberRecentFile(path);
        setStatus(
          draft
            ? "Opened with recoverable draft"
            : file.large_file_warning
            ? "Opened with large-file warning"
            : "Opened safely",
        );
        return true;
      } catch (err) {
        setGlobalError(String(err));
        setStatus("Open failed");
        return false;
      }
    },
    [rememberRecentFile, tabs],
  );

  const openExternalFilePaths = useCallback(
    async (paths: string[]) => {
      for (const path of Array.from(new Set(paths)).filter(Boolean)) {
        await openFilePath(path);
      }
    },
    [openFilePath],
  );

  const openWorkspaceFile = useCallback(
    async (path: string) => {
      if (isSupportedImageFile(path)) {
        if (!workspaceRootPath) {
          setGlobalError("Open a workspace before previewing an image.");
          setStatus("Image preview failed");
          return;
        }

        setGlobalError(null);
        setStatus("Opening image preview...");

        try {
          const image = await openWorkspaceImage(workspaceRootPath, path);
          setImageReturnTabId(activeTabId);
          setActiveTabId(null);
          setSelectedImage({
            path: image.path,
            name: image.name,
            url: image.dataUrl,
            size: image.size,
          });
          setCompareView(null);
          setStatus("Image preview opened");
        } catch (err) {
          setGlobalError(String(err));
          setStatus("Image preview failed");
        }
        return;
      }

      await openFilePath(path);
    },
    [activeTabId, openFilePath, workspaceRootPath],
  );

  const openPreviewMarkdownLink = useCallback(
    async (href: string) => {
      const targetPath =
        activeTab && workspaceRootPath
          ? resolveLocalMarkdownLinkTarget(
              href,
              activeTab.path,
              workspaceRootPath,
            )
          : null;

      if (!targetPath) {
        setStatus(
          menuLanguage === "ja"
            ? "workspace 内の相対テキストリンクだけ開けます"
            : "Only relative workspace text links can be opened",
        );
        return;
      }

      if (!isComparableTextFile(targetPath)) {
        setStatus(
          menuLanguage === "ja"
            ? "リンク先は対応テキストファイルではありません"
            : "Linked file is not a supported text file",
        );
        return;
      }

      const opened = await openFilePath(targetPath);

      if (opened) {
        setStatus(
          menuLanguage === "ja"
            ? "リンク先ファイルを開きました"
            : "Linked file opened",
        );
      }
    },
    [activeTab, menuLanguage, openFilePath, workspaceRootPath],
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
        setSelectedImage(null);
        setImageReturnTabId(null);
        setCompareView(null);
        rememberRecentFile(path);
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
      setSelectedImage(null);
      setImageReturnTabId(null);
      setCompareView(null);
      rememberRecentFile(path);

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
  }, [refreshWorkspaceTree, rememberRecentFile, tabs, workspaceRootPath]);

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

  const openWorkspacePath = useCallback(
    async (path: string) => {
      setGlobalError(null);
      setStatus("Reading folder...");

      try {
        const tree = await listWorkspaceTree(path);
        setWorkspaceTree(tree);
        setWorkspaceRootPath(path);
        setSelectedImage(null);
        setImageReturnTabId(null);
        setCompareView(null);
        setCompareAnchor(null);
        setCompareTarget(null);
        rememberRecentFolder(path);
        setStatus("Folder opened");
      } catch (err) {
        setGlobalError(String(err));
        setStatus("Folder open failed");
      }
    },
    [rememberRecentFolder],
  );

  const openWorkspace = useCallback(async () => {
    setGlobalError(null);
    setStatus("Choosing folder...");

    try {
      const path = await pickWorkspaceFolder();

      if (!path) {
        setStatus("Folder open cancelled");
        return;
      }

      await openWorkspacePath(path);
    } catch (err) {
      setGlobalError(String(err));
      setStatus("Folder open failed");
    }
  }, [openWorkspacePath]);

  const closeWorkspaceContextMenu = useCallback(() => {
    setWorkspaceContextMenu(null);
  }, []);

  const openWorkspaceContextMenu = useCallback(
    (
      entry: WorkspaceTreeEntry,
      event: ReactMouseEvent<HTMLButtonElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      setWorkspaceContextMenu({
        path: entry.path,
        name: entry.name,
        x: event.clientX,
        y: event.clientY,
        canCompare: isComparableTextFile(entry.name),
      });
    },
    [],
  );

  const setCompareSource = useCallback((file: CompareAnchor) => {
    setCompareAnchor(file);
    setCompareView(null);
    setCompareTarget((currentTarget) =>
      currentTarget?.path === file.path ? null : currentTarget,
    );
    setWorkspaceContextMenu(null);
    setGlobalError(null);
    setRightPaneMode("compare");
    setStatus(
      menuLanguage === "ja"
        ? `比較元に設定: ${file.name}`
        : `Compare source set: ${file.name}`,
    );
  }, [menuLanguage]);

  const setCompareTargetFile = useCallback((file: CompareAnchor) => {
    setCompareTarget(file);
    setCompareView(null);
    setWorkspaceContextMenu(null);
    setGlobalError(null);
    setRightPaneMode("compare");
    setStatus(
      menuLanguage === "ja"
        ? `比較先に設定: ${file.name}`
        : `Compare target set: ${file.name}`,
    );
  }, [menuLanguage]);

  const selectWorkspaceCompareFile = useCallback(
    (entry: WorkspaceTreeEntry) => {
      if (!isComparableTextFile(entry.name)) {
        setWorkspaceContextMenu(null);
        setStatus(
          menuLanguage === "ja"
            ? "このファイルは Diff 比較できるテキスト形式ではありません。"
            : "This file is not a comparable text document.",
        );
        return;
      }

      const file = { path: entry.path, name: entry.name };

      if (!compareAnchor || compareAnchor.path === entry.path) {
        setCompareSource(file);
        return;
      }

      setCompareTargetFile(file);
    },
    [compareAnchor, menuLanguage, setCompareSource, setCompareTargetFile],
  );

  const clearCompareSource = useCallback(() => {
    setCompareAnchor(null);
    setWorkspaceContextMenu(null);
    setStatus(
      menuLanguage === "ja" ? "比較元を解除しました" : "Compare source cleared",
    );
  }, [menuLanguage]);

  const clearCompareTarget = useCallback(() => {
    setCompareTarget(null);
    setWorkspaceContextMenu(null);
    setStatus(
      menuLanguage === "ja" ? "比較先を解除しました" : "Compare target cleared",
    );
  }, [menuLanguage]);

  const copyWorkspaceFullPath = useCallback(async (file: CompareAnchor) => {
    setWorkspaceContextMenu(null);
    setGlobalError(null);

    try {
      await writeTextToClipboard(file.path);
      setStatus(
        menuLanguage === "ja"
          ? `フルパスをコピー: ${file.name}`
          : `Copied full path: ${file.name}`,
      );
    } catch (err) {
      setGlobalError(
        menuLanguage === "ja"
          ? `パスのコピーに失敗しました: ${String(err)}`
          : `Copy path failed: ${String(err)}`,
      );
      setStatus(
        menuLanguage === "ja" ? "パスのコピーに失敗しました" : "Copy path failed",
      );
    }
  }, [menuLanguage]);

  const revealWorkspacePath = useCallback(async (file: CompareAnchor) => {
    setWorkspaceContextMenu(null);
    setGlobalError(null);

    try {
      await revealPathInFileManager(file.path);
      setStatus(
        menuLanguage === "ja"
          ? `Finderで表示: ${file.name}`
          : `Shown in Finder: ${file.name}`,
      );
    } catch (err) {
      setGlobalError(
        menuLanguage === "ja"
          ? `Finderで表示できませんでした: ${String(err)}`
          : `Show in Finder failed: ${String(err)}`,
      );
      setStatus(
        menuLanguage === "ja"
          ? "Finderで表示できませんでした"
          : "Show in Finder failed",
      );
    }
  }, [menuLanguage]);

  const closeCompareView = useCallback(() => {
    setCompareView(null);
    setStatus("Compare closed");
  }, []);

  const reviewTabAgainstDisk = useCallback(
    async (tab: EditorTab) => {
      setGlobalError(null);
      setStatus("Reviewing changes...");

      try {
        const diskDocument = await openTextFile(tab.path);
        const diff = buildLineDiff(diskDocument.contents, tab.contents);
        const diskLabel = menuLanguage === "ja" ? "ディスク" : "Disk";
        const editorLabel = menuLanguage === "ja" ? "エディタ" : "Editor";

        setCompareView({
          kind: "changes",
          leftPath: tab.path,
          leftName: `${tab.name} (${diskLabel})`,
          leftColumnLabel: diskLabel,
          rightPath: tab.path,
          rightName: `${tab.name} (${editorLabel})`,
          rightColumnLabel: editorLabel,
          ...diff,
        });
        setStatus("Change review ready");
      } catch (err) {
        const message = String(err);
        setGlobalError(
          menuLanguage === "ja"
            ? localizeCompareError(message)
            : message,
        );
        setStatus("Change review failed");
      }
    },
    [menuLanguage],
  );

  const reviewDraftAgainstDisk = useCallback(
    async (tab: EditorTab, draft: DraftRecord) => {
      setGlobalError(null);
      setStatus("Reviewing changes...");

      try {
        const diskDocument = await openTextFile(tab.path);
        const diff = buildLineDiff(diskDocument.contents, draft.contents);
        const diskLabel = menuLanguage === "ja" ? "ディスク" : "Disk";
        const draftLabel = menuLanguage === "ja" ? "下書き" : "Draft";

        setCompareView({
          kind: "changes",
          leftPath: tab.path,
          leftName: `${tab.name} (${diskLabel})`,
          leftColumnLabel: diskLabel,
          rightPath: tab.path,
          rightName: `${tab.name} (${draftLabel})`,
          rightColumnLabel: draftLabel,
          ...diff,
        });
        setStatus("Change review ready");
      } catch (err) {
        const message = String(err);
        setGlobalError(
          menuLanguage === "ja"
            ? localizeCompareError(message)
            : message,
        );
        setStatus("Change review failed");
      }
    },
    [menuLanguage],
  );

  const compareWorkspaceFiles = useCallback(
    async (rightFile: CompareAnchor) => {
      const canCompareWithActiveTab =
        activeTab !== null && activeTab.path !== rightFile.path;

      if (!canCompareWithActiveTab && !compareAnchor) {
        setCompareSource(rightFile);
        return;
      }

      if (!canCompareWithActiveTab && compareAnchor?.path === rightFile.path) {
        clearCompareSource();
        return;
      }

      setWorkspaceContextMenu(null);
      setGlobalError(null);
      setStatus("Comparing files...");

      try {
        const rightDocument = await openTextFile(rightFile.path);
        const centerLabel = menuLanguage === "ja" ? "中央" : "Center";
        const rightLabel = menuLanguage === "ja" ? "右" : "Right";
        const source =
          compareAnchor && compareAnchor.path !== rightFile.path
            ? {
                ...(await openTextFile(compareAnchor.path)),
                name: compareAnchor.name,
                path: compareAnchor.path,
                leftColumnLabel:
                  menuLanguage === "ja" ? "比較元" : "Source",
                rightColumnLabel:
                  menuLanguage === "ja" ? "比較先" : "Target",
              }
            : activeTab && activeTab.path !== rightFile.path
            ? {
                contents: activeTab.contents,
                name: activeTab.name,
                path: activeTab.path,
                leftColumnLabel: centerLabel,
                rightColumnLabel: rightLabel,
              }
            : {
                ...(await openTextFile(compareAnchor?.path ?? rightFile.path)),
                name: compareAnchor?.name ?? rightFile.name,
                path: compareAnchor?.path ?? rightFile.path,
                leftColumnLabel:
                  menuLanguage === "ja" ? "比較元" : "Source",
                rightColumnLabel:
                  menuLanguage === "ja" ? "比較先" : "Target",
              };
        const diff = buildLineDiff(source.contents, rightDocument.contents);

        setCompareView({
          kind: "file",
          leftPath: source.path,
          leftName: source.name,
          leftColumnLabel: source.leftColumnLabel,
          rightPath: rightFile.path,
          rightName: rightFile.name,
          rightColumnLabel: source.rightColumnLabel,
          ...diff,
        });
        setRightPaneMode("compare");
        setStatus("Compare ready");
      } catch (err) {
        const message = String(err);
        setGlobalError(
          menuLanguage === "ja"
            ? localizeCompareError(message)
            : message,
        );
        setStatus("Compare failed");
      }
    },
    [activeTab, clearCompareSource, compareAnchor, menuLanguage, setCompareSource],
  );

  const runSelectedFileCompare = useCallback(() => {
    if (!compareAnchor || !compareTarget) {
      setGlobalError(
        menuLanguage === "ja"
          ? "比較元と比較先の2つのテキストファイルを選んでください。"
          : "Choose both a source and target text file before comparing.",
      );
      setStatus("Compare failed");
      return;
    }

    if (compareAnchor.path === compareTarget.path) {
      setGlobalError(
        menuLanguage === "ja"
          ? "比較元と比較先には別のファイルを選んでください。"
          : "Choose different files for the source and target.",
      );
      setStatus("Compare failed");
      return;
    }

    void compareWorkspaceFiles(compareTarget);
  }, [compareAnchor, compareTarget, compareWorkspaceFiles, menuLanguage]);

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
      rememberRecentFile(nextTab.path);
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
  }, [
    activeTab,
    refreshWorkspaceTree,
    rememberRecentFile,
    tabs,
    workspaceRootPath,
  ]);

  const requestWindowClose = useCallback(async () => {
    setStatus("Closing window...");

    try {
      await closeCurrentWindow();
    } catch (err) {
      setGlobalError(`Close failed: ${String(err)}`);
      setStatus("Close failed");
    }
  }, []);

  const appMenuActionsRef = useRef({
    createNewFile,
    openFile,
    openWorkspace,
    openWorkspacePath,
    requestWindowClose,
    saveActiveTab,
    saveActiveTabAs,
  });

  useEffect(() => {
    appMenuActionsRef.current = {
      createNewFile,
      openFile,
      openWorkspace,
      openWorkspacePath,
      requestWindowClose,
      saveActiveTab,
      saveActiveTabAs,
    };
  }, [
    createNewFile,
    openFile,
    openWorkspace,
    openWorkspacePath,
    requestWindowClose,
    saveActiveTab,
    saveActiveTabAs,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: UnlistenFn | null = null;

    void listen<string>(APP_MENU_ACTION_EVENT, (event) => {
      const actions = appMenuActionsRef.current;
      const action = event.payload;

      if (action.startsWith("recent-file-")) {
        const index = Number(action.slice("recent-file-".length));
        const recentFile = recentFilesRef.current[index];

        if (recentFile) {
          void openFilePath(recentFile.path);
        }

        return;
      }

      if (action.startsWith("recent-folder-")) {
        const index = Number(action.slice("recent-folder-".length));
        const recentFolder = recentFoldersRef.current[index];

        if (recentFolder) {
          void actions.openWorkspacePath(recentFolder.path);
        }

        return;
      }

      switch (action) {
        case "new-file":
          void actions.createNewFile();
          break;
        case "open-file":
          void actions.openFile();
          break;
        case "open-folder":
          void actions.openWorkspace();
          break;
        case "save":
          void actions.saveActiveTab();
          break;
        case "save-as":
          void actions.saveActiveTabAs();
          break;
        case "close-window":
          void actions.requestWindowClose();
          break;
        case "toggle-preview":
          setPreviewVisible((current) => !current);
          break;
        case "toggle-wrap":
          setEditorSettings((current) => ({
            ...current,
            wrapLines: !current.wrapLines,
          }));
          break;
        case "toggle-invisibles":
          setEditorSettings((current) => ({
            ...current,
            showInvisibles: !current.showInvisibles,
          }));
          break;
        case "theme-system":
          setThemePreference("system");
          break;
        case "theme-light":
          setThemePreference("light");
          break;
        case "theme-dark":
          setThemePreference("dark");
          break;
        case "theme-sakura":
          setThemePreference("sakura");
          break;
        case "theme-yakou":
          setThemePreference("yakou");
          break;
        case "theme-shokou":
          setThemePreference("shokou");
          break;
        case "preferences":
          setPreferencesDialogMode("settings");
          break;
        case "agent-workbench":
          setPreferencesDialogMode("agent");
          break;
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unlisten = cleanup;
      })
      .catch((err) => {
        console.warn("Failed to listen for app menu actions", err);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openFilePath]);

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

  const applyActiveMarkdownFormat = useCallback(
    (format: MarkdownFormat) => {
      if (!activeTab) {
        setStatus("No active tab to format");
        return;
      }

      editorPaneRef.current?.applyMarkdownFormat(format);
      setStatus(markdownFormatStatus(format));
    },
    [activeTab],
  );

  const closeSelectedImagePreview = useCallback(() => {
    const returnTab =
      imageReturnTabId !== null
        ? tabs.find((tab) => tab.id === imageReturnTabId)
        : null;

    setSelectedImage(null);
    setImageReturnTabId(null);
    setActiveTabId(returnTab?.id ?? tabs[0]?.id ?? null);
    setStatus("Image preview closed");
  }, [imageReturnTabId, tabs]);

  const focusAdjacentTab = useCallback(
    (direction: "previous" | "next") => {
      if (tabs.length < 2) {
        setStatus("No other tab to focus");
        return;
      }

      const currentTabId = activeTabId ?? imageReturnTabId ?? tabs[0]?.id;
      const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const offset = direction === "next" ? 1 : -1;
      const nextIndex = (safeIndex + offset + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];

      if (!nextTab) {
        return;
      }

      setSelectedImage(null);
      setImageReturnTabId(null);
      setActiveTabId(nextTab.id);
      setStatus(
        direction === "next" ? "Next tab focused" : "Previous tab focused",
      );
      focusEditorSoon();
    },
    [activeTabId, focusEditorSoon, imageReturnTabId, tabs],
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

    setActiveTabId(pendingCloseTabId);
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
        setActiveTabId(tab.id);
        setPendingAppClose(false);
        setStatus("Close stopped");
        focusEditorSoon();
        return;
      }
    }

    allowWindowCloseRef.current = true;
    await closeCurrentWindow();
  }, [dirtyTabs, focusEditorSoon, saveTabById]);

  const discardAllAndCloseWindow = useCallback(async () => {
    const discardedDraftPaths = dirtyTabs.map((tab) => tab.path);

    discardingWindowCloseRef.current = true;
    removeStoredDrafts(discardedDraftPaths);
    setPendingDrafts((currentDrafts) =>
      currentDrafts.filter(
        (draft) => !discardedDraftPaths.includes(draft.path),
      ),
    );
    allowWindowCloseRef.current = true;

    try {
      await closeCurrentWindow();
    } catch (err) {
      allowWindowCloseRef.current = false;
      discardingWindowCloseRef.current = false;
      writeStoredDrafts(
        [
          ...readStoredDrafts(),
          ...tabsRef.current.filter(isDirty).map(draftRecordFromTab),
        ].reduce<DraftRecord[]>(
          (records, draft) => upsertDraftRecord(records, draft),
          [],
        ),
      );
      setPendingAppClose(false);
      setGlobalError(`Close failed: ${String(err)}`);
      setStatus("Close failed");
    }
  }, [dirtyTabs]);

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

  const jumpToHeading = useCallback((heading: MarkdownHeading) => {
    editorPaneRef.current?.goToLine(heading.line);
    setStatus(`Moved to line ${heading.line}`);
  }, []);

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

        if (
          tab.saveStatus === "conflict" &&
          metadata.fingerprint === tab.externalFingerprint
        ) {
          return;
        }

        if (!isDirty(tab)) {
          const file = await openTextFile(tab.path);
          const refreshedTab = createEditorTab(file);
          const latestTab = tabsRef.current.find(
            (candidate) => candidate.id === tabId,
          );

          if (!latestTab) {
            return;
          }

          if (isDirty(latestTab)) {
            setTabs((currentTabs) =>
              currentTabs.map((candidate) =>
                candidate.id === tabId
                  ? {
                      ...candidate,
                      externalFingerprint: refreshedTab.fingerprint,
                      saveStatus: "conflict",
                      error: EXTERNAL_CHANGE_CONFLICT_MESSAGE,
                    }
                  : candidate,
              ),
            );
            setStatus("External change detected");
            return;
          }

          setTabs((currentTabs) =>
            currentTabs.map((candidate) =>
              candidate.id === tabId && !isDirty(candidate)
                ? refreshedTab
                : candidate,
            ),
          );
          setStatus("External change refreshed");
          return;
        }

        setTabs((currentTabs) =>
          currentTabs.map((candidate) =>
            candidate.id === tabId
              ? {
                  ...candidate,
                  externalFingerprint: metadata.fingerprint,
                  saveStatus: "conflict",
                  error: EXTERNAL_CHANGE_CONFLICT_MESSAGE,
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
    setFindVisible(false);
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

  const updateAgentWorkbenchPreference = useCallback(
    (enabled: boolean) => {
      setAgentWorkbenchPreference(enabled);
      if (menuLanguage === "ja") {
        setStatus(
          enabled === agentWorkbenchActive
            ? enabled
              ? "エージェントワークベンチは有効です"
              : "Safe Editor モードです"
            : enabled
              ? "再起動後にエージェントワークベンチが有効になります"
              : "再起動後にエージェントワークベンチが無効になります",
        );
        return;
      }

      setStatus(
        enabled === agentWorkbenchActive
          ? enabled
            ? "Agent Workbench active"
            : "Agent Workbench disabled"
          : enabled
            ? "Agent Workbench will enable after restart"
            : "Agent Workbench will disable after restart",
      );
    },
    [agentWorkbenchActive, menuLanguage],
  );

  const restartAppForAgentMode = useCallback(async () => {
    setAppRestartPending(true);
    setStatus(menuLanguage === "ja" ? "hazakura-note を再起動中..." : "Restarting hazakura-note...");

    try {
      await requestAppRestart();
    } catch (err) {
      setAppRestartPending(false);
      setGlobalError(`Restart failed: ${String(err)}`);
      setStatus(menuLanguage === "ja" ? "再起動に失敗しました" : "Restart failed");
    }
  }, [menuLanguage]);

  const updateAgentWorkbenchConsent = useCallback(
    (acknowledged: boolean) => {
      setAgentWorkbenchConsent(acknowledged);
      setAgentLaunchGate({
        kind: "idle",
        message: "Launch gate not checked.",
        preflight: null,
      });
      setStatus(
        menuLanguage === "ja"
          ? acknowledged
            ? "エージェントワークベンチの責任境界を確認しました"
            : "エージェントワークベンチの同意を解除しました"
          : acknowledged
            ? "Agent Workbench responsibility acknowledged"
            : "Agent Workbench consent cleared",
      );
    },
    [menuLanguage],
  );

  const updateAgentWorkbenchProvider = useCallback(
    (provider: AgentWorkbenchProvider) => {
      if (activeAgentSession) {
        setAgentLaunchGate((currentGate) => ({
          ...currentGate,
          kind: "rejected",
          message: "Stop the active Agent session before changing provider.",
        }));
        setStatus("Stop Agent session before changing provider");
        return;
      }

      setAgentWorkbenchProvider(provider);
      setAgentLaunchGate({
        kind: "idle",
        message: "Launch gate not checked.",
        preflight: null,
      });
      setStatus(`Agent provider selected: ${provider}`);
    },
    [activeAgentSession],
  );

  const refreshAgentSessionState = useCallback(async () => {
    try {
      const state = await getAgentWorkbenchSessionState();
      setAgentSession((currentSession) =>
        sameAgentWorkbenchSession(currentSession, state.session)
          ? currentSession
          : state.session,
      );
      applyAgentOutput(state.output);

      if (state.session?.status === "exited") {
        setAgentLaunchGate((currentGate) => ({
          ...currentGate,
          kind: currentGate.kind === "idle" ? "passed" : currentGate.kind,
          message: "Agent session exited.",
        }));
        setStatus("Agent session exited");
      } else if (state.session?.status === "stopped") {
        setAgentLaunchGate((currentGate) => ({
          ...currentGate,
          kind: currentGate.kind === "idle" ? "passed" : currentGate.kind,
          message: "Agent session stopped.",
        }));
        setStatus("Agent session stopped");
      }
    } catch (err) {
      setAgentLaunchGate({
        kind: "rejected",
        message: String(err),
        preflight: null,
      });
      setStatus("Agent session state unavailable");
    }
  }, [applyAgentOutput]);

  const sendWorkspacePathToAgent = useCallback(
    async (file: CompareAnchor) => {
      setWorkspaceContextMenu(null);
      setGlobalError(null);

      if (!isActiveAgentSession(agentSession)) {
        setStatus(
          menuLanguage === "ja"
            ? "実行中の Agent セッションが必要です"
            : "Running Agent session required",
        );
        return;
      }

      try {
        await writeAgentWorkbenchSessionInput(file.path);
        setStatus(
          menuLanguage === "ja"
            ? `Agent にフルパスを送信: ${file.name}`
            : `Sent full path to Agent: ${file.name}`,
        );
      } catch (err) {
        setAgentLaunchGate({
          kind: "rejected",
          message: String(err),
          preflight: null,
        });
        setStatus(
          menuLanguage === "ja"
            ? "Agent へのパス送信に失敗しました"
            : "Agent path send failed",
        );
        void refreshAgentSessionState();
      }
    },
    [agentSession, menuLanguage, refreshAgentSessionState],
  );

  const checkAgentLaunchGate = useCallback(async () => {
    if (!workspaceRootPath) {
      setAgentLaunchGate({
        kind: "rejected",
        message: "Launch unavailable: open a workspace folder first.",
        preflight: null,
      });
      setStatus("Agent launch unavailable");
      return;
    }

    setAgentLaunchGate({
      kind: "checking",
      message: "Checking Agent Workbench launch gate...",
      preflight: null,
    });
    setStatus("Checking Agent Workbench launch gate...");

    try {
      const result = await startAgentWorkbenchSession(
        agentWorkbenchActive,
        agentWorkbenchConsent,
        agentWorkbenchProvider,
        workspaceRootPath,
        agentTerminalSize?.columns,
        agentTerminalSize?.rows,
      );

      if (!result.preflight.providerAvailable) {
        setAgentLaunchGate({
          kind: "rejected",
          message: `Provider not found: ${providerLabel(agentWorkbenchProvider)} was not found in the app search path, including common Homebrew and user bin locations.`,
          preflight: result.preflight,
        });
        setAgentSession(null);
        applyAgentOutput(result.output);
        setStatus("Agent provider not found");
        return;
      }

      if (!result.session) {
        setAgentLaunchGate({
          kind: "rejected",
          message: "Provider not found; no Agent session was started.",
          preflight: result.preflight,
        });
        setAgentSession(null);
        applyAgentOutput(result.output);
        setStatus("Agent provider not found");
        return;
      }

      setAgentLaunchGate({
        kind: "passed",
        message: "Agent session running in the selected workspace. Only the selected allowlisted CLI was launched.",
        preflight: result.preflight,
      });
      setAgentSession(result.session);
      applyAgentOutput(result.output);
      setStatus("Agent session running");
    } catch (err) {
      const message = String(err);

      if (message.toLowerCase().includes("not implemented")) {
        setAgentLaunchGate({
          kind: "passed",
          message: "Gate passed; launch is not implemented in this build.",
          preflight: null,
        });
        setStatus("Agent launch gate passed");
        return;
      }

      setAgentLaunchGate({
        kind: "rejected",
        message: `Agent launch rejected: ${message}`,
        preflight: null,
      });
      if (message.toLowerCase().includes("already active")) {
        void refreshAgentSessionState();
      }
      setStatus("Agent launch rejected");
    }
  }, [
    agentWorkbenchActive,
    agentWorkbenchConsent,
    agentWorkbenchProvider,
    agentTerminalSize,
    applyAgentOutput,
    refreshAgentSessionState,
    workspaceRootPath,
  ]);

  const stopAgentSession = useCallback(async () => {
    setAgentStopPending(true);
    setStatus("Stopping Agent session...");

    try {
      const state = await stopAgentWorkbenchSession();
      setAgentSession(state.session);
      applyAgentOutput(state.output);
      setAgentLaunchGate((currentGate) => ({
        ...currentGate,
        kind: state.session ? "passed" : currentGate.kind,
        message: state.session
          ? "Agent session stopped."
          : "No Agent session to stop.",
      }));
      setStatus(
        state.session
          ? "Agent session stopped"
          : "No Agent session to stop",
      );
    } catch (err) {
      setAgentLaunchGate({
        kind: "rejected",
        message: String(err),
        preflight: null,
      });
      setStatus("Agent session stop failed");
    } finally {
      setAgentStopPending(false);
    }
  }, [applyAgentOutput]);

  const sendAgentTerminalData = useCallback((data: string) => {
    if (!data || !isActiveAgentSession(agentSession)) {
      return;
    }

    void writeAgentWorkbenchSessionInput(data)
      .then(() => undefined)
      .catch((err) => {
        setAgentLaunchGate({
          kind: "rejected",
          message: String(err),
          preflight: null,
        });
        setStatus("Agent input failed");
        void refreshAgentSessionState();
      });
  }, [agentSession, refreshAgentSessionState]);

  const resizeAgentTerminal = useCallback((size: AgentTerminalSize) => {
    setAgentTerminalSize((current) => {
      if (
        current?.columns === size.columns &&
        current.rows === size.rows
      ) {
        return current;
      }

      return size;
    });

    if (!isActiveAgentSession(agentSession)) {
      return;
    }

    void resizeAgentWorkbenchTerminal(size.columns, size.rows)
      .then((state) => {
        setAgentSession(state.session);
      })
      .catch(() => {
        setStatus("Agent terminal resize failed");
      });
  }, [agentSession]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeAgentUiRefresh();
      } else {
        suspendAgentUiRefresh();
      }
    };

    window.addEventListener("blur", suspendAgentUiRefresh);
    window.addEventListener("focus", resumeAgentUiRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", resumeAgentUiRefresh);
      window.removeEventListener("blur", suspendAgentUiRefresh);
    };
  }, [resumeAgentUiRefresh, suspendAgentUiRefresh]);

  useEffect(() => {
    if (!agentWorkbenchAvailable && rightPaneMode === "agent") {
      setRightPaneMode("preview");
    }
  }, [agentWorkbenchAvailable, rightPaneMode]);

  useEffect(() => {
    if (agentWorkbenchAvailable) {
      void refreshAgentSessionState();
      return;
    }

    setAgentSession(null);
    applyAgentOutput([], { allowReset: true });
  }, [agentWorkbenchAvailable, applyAgentOutput, refreshAgentSessionState]);

  useEffect(() => {
    if (!agentWorkbenchAvailable || !isActiveAgentSession(agentSession)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.hasFocus() || agentUiSuspendedRef.current) {
        return;
      }

      void refreshAgentSessionState();
    }, AGENT_WORKBENCH_SESSION_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [agentSession, agentWorkbenchAvailable, refreshAgentSessionState]);

  useEffect(() => {
    if (activeAgentSession && agentSession?.workspaceRoot !== workspaceRootPath) {
      setAgentLaunchGate((currentGate) => ({
        ...currentGate,
        kind: "rejected",
        message:
          "Active Agent session remains bound to its launch workspace. Stop it before starting in another workspace.",
      }));
      return;
    }

    if (activeAgentSession) {
      return;
    }

    setAgentLaunchGate({
      kind: "idle",
      message: "Launch gate not checked.",
      preflight: null,
    });
  }, [activeAgentSession, agentSession?.workspaceRoot, workspaceRootPath]);

  useEffect(() => {
    recentFilesRef.current = recentFiles;
  }, [recentFiles]);

  useEffect(() => {
    recentFoldersRef.current = recentFolders;
  }, [recentFolders]);

  useEffect(() => {
    if (!workspaceContextMenu) {
      return;
    }

    const closeMenu = () => setWorkspaceContextMenu(null);
    const closeMenuFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", closeMenuFromKeyboard, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", closeMenuFromKeyboard, true);
    };
  }, [workspaceContextMenu]);

  useEffect(
    () => () => {
      if (previewScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(previewScrollFrameRef.current);
      }

      if (scrollHudHideTimerRef.current !== null) {
        window.clearTimeout(scrollHudHideTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    writeStoredRecentEntries(RECENT_FILES_STORAGE_KEY, recentFiles);
  }, [recentFiles]);

  useEffect(() => {
    writeStoredRecentEntries(RECENT_FOLDERS_STORAGE_KEY, recentFolders);
  }, [recentFolders]);

  useEffect(() => {
    const title = selectedImage
      ? `${selectedImage.name} - hazakura-note`
      : activeTab
      ? `${activeTab.name}${activeDirty ? " *" : ""} - hazakura-note`
      : "hazakura-note";

    void setCurrentWindowTitle(title).catch((err) => {
      console.warn("Failed to update window title", err);
    });
  }, [activeDirty, activeTab, selectedImage]);

  useEffect(() => {
    const menuRecentFiles: AppMenuRecentItem[] = buildRecentDisplayEntries(
      recentFiles,
    ).map((entry) => ({
      label: entry.displayLabel,
    }));
    const menuRecentFolders: AppMenuRecentItem[] = buildRecentDisplayEntries(
      recentFolders,
    ).map((entry) => ({
      label: entry.displayLabel,
    }));

    void updateAppMenuState({
      hasActiveTab: Boolean(activeTab),
      activeDirty,
      previewVisible,
      wrapLines: editorSettings.wrapLines,
      showInvisibles: editorSettings.showInvisibles,
      themePreference,
      menuLanguage,
      recentFiles: menuRecentFiles,
      recentFolders: menuRecentFolders,
    }).catch((err) => {
      console.warn("Failed to update app menu state", err);
    });
  }, [
    activeDirty,
    activeTab,
    editorSettings.showInvisibles,
    editorSettings.wrapLines,
    menuLanguage,
    previewVisible,
    recentFiles,
    recentFolders,
    themePreference,
  ]);

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

    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    const openPendingFiles = async () => {
      try {
        const paths = await drainOpenedFiles();

        if (!cancelled && paths.length > 0) {
          await openExternalFilePaths(paths);
        }
      } catch (err) {
        if (!cancelled) {
          setGlobalError(String(err));
          setStatus("Open failed");
        }
      }
    };

    void openPendingFiles();

    void listen<string[]>(OPENED_FILES_EVENT, () => {
      void openPendingFiles();
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
  }, [openExternalFilePaths, restoreComplete]);

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

    if (discardingWindowCloseRef.current) {
      return;
    }

    const dirtyDrafts = tabs.filter(isDirty).map(draftRecordFromTab);
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
    window.localStorage.setItem(MENU_LANGUAGE_STORAGE_KEY, menuLanguage);
  }, [menuLanguage]);

  useEffect(() => {
    window.localStorage.setItem(
      AGENT_WORKBENCH_ENABLED_STORAGE_KEY,
      agentWorkbenchPreference ? "true" : "false",
    );
  }, [agentWorkbenchPreference]);

  useEffect(() => {
    window.localStorage.setItem(
      AGENT_WORKBENCH_CONSENT_STORAGE_KEY,
      agentWorkbenchConsent ? "true" : "false",
    );
  }, [agentWorkbenchConsent]);

  useEffect(() => {
    window.localStorage.setItem(
      AGENT_WORKBENCH_PROVIDER_STORAGE_KEY,
      agentWorkbenchProvider,
    );
  }, [agentWorkbenchProvider]);

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
    if (!activeAgentSession || !activeTabId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (agentUiSuspendedRef.current) {
        return;
      }

      void checkTabForExternalChange(activeTabId);
    }, EXTERNAL_CHANGE_ACTIVE_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeAgentSession, activeTabId, checkTabForExternalChange]);

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
          } else if (preferencesOpen) {
            setPreferencesDialogMode(null);
            focusEditorSoon();
          }
        }

        if (event.key === "Tab") {
          trapFocusInElement(
            pendingCloseTabId !== null
              ? closeTabDialogRef.current
              : pendingAppClose
                ? appCloseDialogRef.current
                : preferencesDialogRef.current,
            event,
          );
        }

        return;
      }

      if (event.key === "Escape" && findVisible) {
        event.preventDefault();
        closeFindAndFocusEditor();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setPreferencesDialogMode("settings");
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setPreviewVisible((current) => !current);
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        event.key.toLowerCase() === "w"
      ) {
        event.preventDefault();
        setEditorSettings((current) => ({
          ...current,
          wrapLines: !current.wrapLines,
        }));
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        event.key.toLowerCase() === "i"
      ) {
        event.preventDefault();
        setEditorSettings((current) => ({
          ...current,
          showInvisibles: !current.showInvisibles,
        }));
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "w"
      ) {
        event.preventDefault();
        void requestWindowClose();
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

      if (
        isEditorKeyboardTarget(event.target) &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        applyActiveMarkdownFormat("bold");
        return;
      }

      if (
        isEditorKeyboardTarget(event.target) &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "i"
      ) {
        event.preventDefault();
        applyActiveMarkdownFormat("italic");
        return;
      }

      if (
        isEditorKeyboardTarget(event.target) &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        applyActiveMarkdownFormat("code");
        return;
      }

      if (
        isEditorKeyboardTarget(event.target) &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        applyActiveMarkdownFormat("link");
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
        setFindVisible(true);
        setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 50);
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

      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        focusAdjacentTab(event.key === "ArrowRight" ? "next" : "previous");
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();

        if (selectedImage) {
          closeSelectedImagePreview();
        } else if (activeTabId) {
          requestCloseTab(activeTabId);
        } else {
          setStatus("No active tab to close");
        }

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    activeTabId,
    applyActiveMarkdownFormat,
    cancelPendingAppClose,
    cancelPendingTabClose,
    createNewFile,
    findVisible,
    closeFindAndFocusEditor,
    closeSelectedImagePreview,
    focusAdjacentTab,
    modalOpen,
    openFile,
    openWorkspace,
    pendingAppClose,
    pendingCloseTabId,
    preferencesOpen,
    requestWindowClose,
    requestCloseTab,
    saveActiveTabAs,
    saveActiveTab,
    selectedImage,
  ]);

  useEffect(() => {
    if (pendingCloseTab) {
      closeTabCancelButtonRef.current?.focus();
      return;
    }

    if (pendingAppClose) {
      appCloseCancelButtonRef.current?.focus();
      return;
    }

    if (preferencesOpen) {
      preferencesCloseButtonRef.current?.focus();
    }
  }, [pendingAppClose, pendingCloseTab, preferencesOpen]);

  return (
    <main className="app-shell">
      {resolvedTheme === "sakura" ? <SakuraPetals /> : null}
      <section
        className="tabs-row"
        aria-label="Open files"
        onPointerEnter={suspendAgentUiRefresh}
      >
        <div className="tab-list" role="tablist" aria-label="Open file tabs">
          {agentWorkbenchModeBadge ? (
            <span
              className={`agent-mode-badge${agentWorkbenchRestartRequired ? " pending" : ""}`}
              title={agentWorkbenchCopy.modeBadgeTitle}
            >
              {agentWorkbenchModeBadge}
            </span>
          ) : null}
          {tabs.length === 0 ? (
            <span className="empty-tabs">{safeEditorCopy.emptyTabs}</span>
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
                    onClick={() => {
                      setSelectedImage(null);
                      setImageReturnTabId(null);
                      setActiveTabId(tab.id);
                    }}
                    role="tab"
                    title={tab.path}
                    type="button"
                  >
                    <span className="tab-name">{tab.name}</span>
                    {dirty ? (
                      <span className="tab-dirty-dot" aria-label="unsaved" />
                    ) : null}
                  </button>
                  <button
                    aria-label={`Close ${tab.name}`}
                    className="tab-close"
                    onClick={() => requestCloseTab(tab.id)}
                    type="button"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="document-meta">
          {activeTab ? (
              <div
                className="markdown-assist"
                aria-label={editorChromeCopy.markdownHelpers}
              >
                <button
                  aria-label={editorChromeCopy.strong}
                  className="markdown-assist-button strong"
                  onClick={() => applyActiveMarkdownFormat("bold")}
                  title={editorChromeCopy.strongTitle}
                  type="button"
                >
                  B
                </button>
                <button
                  aria-label={editorChromeCopy.italic}
                  className="markdown-assist-button italic"
                  onClick={() => applyActiveMarkdownFormat("italic")}
                  title={editorChromeCopy.italicTitle}
                  type="button"
                >
                  I
                </button>
                <button
                  aria-label={editorChromeCopy.inlineCode}
                  className="markdown-assist-button code"
                  onClick={() => applyActiveMarkdownFormat("code")}
                  title={editorChromeCopy.inlineCodeTitle}
                  type="button"
                >
                  `
                </button>
                <button
                  aria-label={editorChromeCopy.link}
                  className="markdown-assist-button"
                  onClick={() => applyActiveMarkdownFormat("link")}
                  title={editorChromeCopy.linkTitle}
                  type="button"
                >
                  <LinkIcon />
                </button>
              </div>
          ) : null}
          <RightPaneToggleControls
            agentAvailable={agentWorkbenchAvailable}
            agentActive={sidePaneMode === "agent"}
            copy={sidePaneCopy}
            diffActive={sidePaneMode === "compare"}
            diffAvailable
            onToggleDiff={toggleDiffPane}
            onToggleAgent={toggleAgentPane}
            onToggleOutline={toggleOutlinePane}
            onTogglePreview={togglePreviewPane}
            outlineActive={sidePaneMode === "outline"}
            outlineAvailable={activeTab !== null}
            previewActive={sidePaneMode === "preview"}
          />
          {activeDirty && activeTab ? (
            <button
              className="review-changes-button"
              onClick={() => void reviewTabAgainstDisk(activeTab)}
              type="button"
            >
              {recoveryCopy.reviewChanges}
            </button>
          ) : null}
          {activeTab ? (
              <label className="line-ending-compact">
                <span>{editorChromeCopy.lineEnding}</span>
                <select
                  aria-label={editorChromeCopy.lineEndings}
                  value={activeTab.line_ending}
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
          ) : null}
        </div>
      </section>

      {findVisible ? (
        <section className="find-row" aria-label={editorChromeCopy.findInActiveFile}>
          <label className="find-control">
            <span>{editorChromeCopy.find}</span>
            <input
              ref={findInputRef}
              type="search"
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder={editorChromeCopy.searchActiveFile}
            />
          </label>
          <div className="find-actions">
            <button
              type="button"
              onClick={showPreviousMatch}
              disabled={findMatches.length === 0}
            >
              {editorChromeCopy.previous}
            </button>
            <button
              type="button"
              onClick={showNextMatch}
              disabled={findMatches.length === 0}
            >
              {editorChromeCopy.next}
            </button>
            <span className="find-count">
              {findQuery
                ? invalidRegex
                  ? editorChromeCopy.invalidRegex
                  : findMatches.length > 0
                  ? `${activeMatchIndex + 1} / ${findMatches.length}`
                  : editorChromeCopy.noMatches
                : editorChromeCopy.noSearch}
            </span>
          </div>
          <div className="find-options" aria-label={editorChromeCopy.findOptions}>
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
              <span>{editorChromeCopy.caseSensitive}</span>
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
              <span>{editorChromeCopy.word}</span>
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
              <span>{editorChromeCopy.regex}</span>
            </label>
          </div>
          <div className="goto-control">
            <label htmlFor="go-to-line-input">{editorChromeCopy.line}</label>
            <input
              aria-label={editorChromeCopy.goToLine}
              id="go-to-line-input"
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
            <button
              aria-label={editorChromeCopy.goToLine}
              type="button"
              onClick={goToLine}
            >
              {editorChromeCopy.go}
            </button>
          </div>
          <button
            type="button"
            className="find-close"
            onClick={closeFindAndFocusEditor}
            aria-label={editorChromeCopy.closeSearch}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </section>
      ) : null}

      <div className="message-row">
        {activeDraft && activeTab ? (
          <div className="draft-banner">
            <span className="message-copy">
              {recoveryCopy.draftAvailable(activeTab.name)}
              <span className="message-detail">
                {recoveryCopy.savedLocally(activeDraft.updatedAt)}
              </span>
            </span>
            <div
              className="message-actions"
              aria-label={recoveryCopy.draftActions}
            >
              <button
                type="button"
                onClick={() => void reviewDraftAgainstDisk(activeTab, activeDraft)}
              >
                {recoveryCopy.reviewChanges}
              </button>
              <button type="button" onClick={() => restoreDraft(activeDraft)}>
                {recoveryCopy.restoreDraft}
              </button>
              <button
                type="button"
                onClick={() => discardDraft(activeDraft.path)}
              >
                {recoveryCopy.discardDraft}
              </button>
            </div>
          </div>
        ) : null}
        {activeError ? (
          <div
            className={activeConflict ? "conflict-banner" : "error-banner"}
          >
            <span className="message-copy">
              {activeConflict
                ? recoveryCopy.conflictHeading
                : activeSaveError
                  ? recoveryCopy.saveFailure
                  : activeError}
              {activeConflict || activeSaveError ? (
                <span className="message-detail">
                  {activeConflict ? recoveryCopy.conflictDetail : activeError}
                </span>
              ) : null}
            </span>
            {activeConflict && activeTab ? (
              <div
                className="message-actions"
                aria-label={recoveryCopy.conflictActions}
              >
                <button
                  type="button"
                  onClick={() => void reviewTabAgainstDisk(activeTab)}
                >
                  {recoveryCopy.reviewChanges}
                </button>
                <button
                  type="button"
                  onClick={() => reopenTabFromDisk(activeTab.id)}
                >
                  {recoveryCopy.reopenFromDisk}
                </button>
                <button type="button" onClick={() => closeTabNow(activeTab.id)}>
                  {recoveryCopy.closeWithoutSaving}
                </button>
                <button
                  type="button"
                  onClick={() => keepEditingAfterConflict(activeTab.id)}
                >
                  {recoveryCopy.keepEditing}
                </button>
              </div>
            ) : activeSaveError && activeTab ? (
              <div
                className="message-actions"
                aria-label={recoveryCopy.saveErrorActions}
              >
                <button
                  type="button"
                  onClick={() => void saveTabById(activeTab.id)}
                >
                  {recoveryCopy.trySaveAgain}
                </button>
                <button
                  type="button"
                  onClick={() => clearSaveError(activeTab.id)}
                >
                  {recoveryCopy.keepEditing}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="workspace">
        <aside
          className="file-tree-pane"
          aria-label={safeEditorCopy.workspaceFileTree}
        >
          <div className="workspace-header">
            <div className="workspace-heading">
              <div className="workspace-labels">
                <span className="workspace-kicker">
                  {safeEditorCopy.workspace}
                </span>
                <span className="workspace-title" title={workspaceRootPath ?? ""}>
                  {workspaceRootPath
                    ? folderLabelFromPath(workspaceRootPath)
                    : safeEditorCopy.noFolderOpen}
                </span>
              </div>
              <button
                aria-label={safeEditorCopy.openWorkspaceFolder}
                className="workspace-open-button"
                onClick={openWorkspace}
                title={safeEditorCopy.openWorkspaceFolder}
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
          {workspaceTree ? (
            <WorkspaceTree
              activePath={selectedImage?.path ?? activeTab?.path ?? null}
              compareSourcePath={compareAnchor?.path ?? null}
              compareTargetPath={compareTarget?.path ?? null}
              entry={workspaceTree}
              compareSelectionEnabled={sidePaneMode === "compare"}
              onLoadDirectory={loadWorkspaceDirectory}
              onOpenContextMenu={openWorkspaceContextMenu}
              onOpenFile={openWorkspaceFile}
              onSelectCompareFile={selectWorkspaceCompareFile}
            />
          ) : (
            <div className="workspace-empty">
              <span>{safeEditorCopy.noFolderOpen}</span>
              <button type="button" onClick={openWorkspace}>
                {safeEditorCopy.openFolder}
              </button>
            </div>
          )}
        </aside>
        <div
          ref={editorPreviewGridRef}
          className={`editor-preview-grid${sidePaneVisible ? "" : " preview-hidden"}${hasWorkspaceSelection ? "" : " empty-session"}${sidePaneMode === "compare" ? " diff-workbench" : ""}`}
          style={editorPreviewGridStyle}
        >
          <div className="pane editor-pane" aria-label="Editor">
            {activeTab ? (
              <>
                <EditorPane
                  ref={editorPaneRef}
                  activeSearchMatchIndex={activeMatchIndex}
                  documentKey={documentKey}
                  fontSize={editorSettings.fontSize}
                  onChange={handleEditorChange}
                  onScrollRatioChange={syncPreviewScroll}
                  onSelectionChange={setSelectionInfo}
                  searchMatches={findMatches}
                  showInvisibles={editorSettings.showInvisibles}
                  tabSize={editorSettings.tabSize}
                  theme={editorTheme}
                  value={activeContents}
                  wrapLines={editorSettings.wrapLines}
                />
                {scrollHud.visible && scrollHudHeadingContext.current ? (
                  <ScrollPositionHud
                    context={scrollHudHeadingContext}
                    line={scrollHudLine}
                    menuLanguage={menuLanguage}
                    totalLines={activeDocumentLineCount}
                  />
                ) : null}
              </>
            ) : selectedImage ? (
              <ImagePreviewPane
                image={selectedImage}
                title={sidePaneCopy.imagePreview}
              />
            ) : (
              <StartPanel
                copy={safeEditorCopy}
                onNewFile={createNewFile}
                onOpenFile={openFile}
                onOpenFolder={openWorkspace}
                recentFiles={recentFiles}
                onOpenRecentFile={(path) => void openFilePath(path)}
              />
            )}
          </div>
          {sidePaneVisible ? (
            <div
              aria-label={sidePaneCopy.resizeColumns}
              aria-orientation="vertical"
              aria-valuemax={MAX_PREVIEW_COLUMN_PERCENT}
              aria-valuemin={MIN_PREVIEW_COLUMN_PERCENT}
              aria-valuenow={Math.round(previewColumnPercent)}
              className="pane-resizer"
              onKeyDown={handlePreviewResizeKeyDown}
              onPointerDown={handlePreviewResizePointerDown}
              onPointerMove={handlePreviewResizePointerMove}
              role="separator"
              tabIndex={0}
              title={sidePaneCopy.resizeColumnsTitle}
            />
          ) : null}
          {sidePaneVisible ? (
            <div
              className="pane preview-pane"
              ref={sidePaneMode === "preview" ? previewPaneRef : null}
              aria-label={
                sidePaneMode === "compare"
                  ? sidePaneCopy.fileComparison
                  : sidePaneMode === "agent"
                    ? sidePaneCopy.agentWorkbench
                    : sidePaneMode === "outline"
                      ? sidePaneCopy.documentOutline
                      : sidePaneCopy.markdownPreview
              }
              onScroll={
                sidePaneMode === "preview" ? syncEditorScroll : undefined
              }
            >
              {sidePaneMode === "compare" && compareView ? (
                <DiffPane
                  menuLanguage={menuLanguage}
                  view={compareView}
                  onClose={closeCompareView}
                />
              ) : sidePaneMode === "compare" ? (
                <DiffSetupPane
                  compareSource={compareAnchor}
                  compareTarget={compareTarget}
                  onClearSource={clearCompareSource}
                  onClearTarget={clearCompareTarget}
                  onCompare={runSelectedFileCompare}
                  menuLanguage={menuLanguage}
                  workspaceRootPath={workspaceRootPath}
                />
              ) : sidePaneMode === "agent" ? (
                <AgentPaneShell
                  gate={agentLaunchGate}
                  onCheckGate={() => void checkAgentLaunchGate()}
                  onStopSession={() => void stopAgentSession()}
                  onTerminalData={sendAgentTerminalData}
                  onTerminalEngage={resumeAgentUiRefresh}
                  onTerminalRelease={suspendAgentUiRefresh}
                  onTerminalResize={resizeAgentTerminal}
                  output={agentOutput}
                  provider={agentWorkbenchProvider}
                  session={agentSession}
                  stopPending={agentStopPending}
                  menuLanguage={menuLanguage}
                  workspaceRootPath={workspaceRootPath}
                />
              ) : sidePaneMode === "outline" ? (
                <OutlinePane
                  copy={sidePaneCopy}
                  currentHeadingLine={currentMarkdownHeading?.line ?? null}
                  headings={documentHeadings}
                  onSelect={jumpToHeading}
                  truncated={documentOutline?.truncated ?? false}
                />
              ) : activeTab && previewVisible ? (
                <PreviewPane
                  onOpenLocalLink={openPreviewMarkdownLink}
                  source={activeContents}
                />
              ) : (
                <PreviewUnavailablePane
                  ariaLabel={sidePaneCopy.previewUnavailable}
                  reason={
                    activeTab
                      ? sidePaneCopy.previewDisabled
                      : sidePaneCopy.openTextFileToPreview
                  }
                />
              )}
            </div>
          ) : null}
        </div>
      </section>

      <footer className="status-bar">
        <span>{localizeStatusMessage(status, menuLanguage)}</span>
        <span>{activeStatusDetail}</span>
      </footer>

      {pendingCloseTab ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-describedby="close-tab-description"
            aria-labelledby="close-tab-title"
            aria-modal="true"
            className="close-dialog"
            ref={closeTabDialogRef}
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
            ref={appCloseDialogRef}
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

      {preferencesOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="preferences-title"
            aria-modal="true"
            className={`preferences-dialog ${preferencesDialogMode === "agent" ? "agent-workbench-dialog" : "settings-dialog"}`}
            ref={preferencesDialogRef}
            role="dialog"
          >
            <div className="preferences-header">
              <h2 id="preferences-title">
                {preferencesDialogMode === "agent"
                  ? agentWorkbenchCopy.title
                  : preferencesCopy.settingsTitle}
              </h2>
              <button
                aria-label={preferencesCopy.closeDialog}
                className="icon-button"
                onClick={() => {
                  setPreferencesDialogMode(null);
                  focusEditorSoon();
                }}
                ref={preferencesCloseButtonRef}
                type="button"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {preferencesDialogMode === "agent" ? (
              <div className="agent-workbench-settings">
                <section
                  aria-label={agentWorkbenchCopy.modeSectionLabel}
                  className="preference-section"
                >
                  <h3>{agentWorkbenchCopy.modeHeading}</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={agentWorkbenchPreference}
                      onChange={(event) =>
                        updateAgentWorkbenchPreference(event.target.checked)
                      }
                    />
                    <span className="slider"></span>
                    <span>{agentWorkbenchCopy.enableAfterRestart}</span>
                  </label>
                  <p className="preference-note">
                    {agentWorkbenchActive
                      ? agentWorkbenchCopy.activeSessionMode
                      : agentWorkbenchCopy.safeSessionMode}
                  </p>
                  {agentWorkbenchRestartRequired ? (
                    <div className="preference-warning restart-warning">
                      <span>{agentWorkbenchCopy.restartRequired}</span>
                      <button
                        disabled={appRestartPending}
                        onClick={() => void restartAppForAgentMode()}
                        type="button"
                      >
                        {appRestartPending
                          ? agentWorkbenchCopy.restarting
                          : agentWorkbenchCopy.restartNow}
                      </button>
                    </div>
                  ) : null}
                </section>
                <section
                  aria-label={agentWorkbenchCopy.sessionSectionLabel}
                  className="preference-section"
                >
                  <h3>{agentWorkbenchCopy.sessionHeading}</h3>
                  <div className="preference-status-grid">
                    <span>{agentWorkbenchCopy.provider}</span>
                    <strong>{providerLabel(agentWorkbenchProvider)}</strong>
                    <span>{agentWorkbenchCopy.session}</span>
                    <strong>{agentSessionStateLabel(agentSession, menuLanguage)}</strong>
                    <span>{agentWorkbenchCopy.workspace}</span>
                    <strong title={workspaceRootPath ?? undefined}>
                      {workspaceRootPath ?? agentWorkbenchCopy.noWorkspace}
                    </strong>
                  </div>
                  {agentWorkbenchActive ? (
                    <label className="field-control">
                      <span>{agentWorkbenchCopy.provider}</span>
                      <select
                        aria-label={agentWorkbenchCopy.providerControl}
                        disabled={activeAgentSession}
                        value={agentWorkbenchProvider}
                        onChange={(event) =>
                          updateAgentWorkbenchProvider(
                            event.target.value as AgentWorkbenchProvider,
                          )
                        }
                      >
                        {AGENT_WORKBENCH_PROVIDERS.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </section>
                <section
                  aria-label={agentWorkbenchCopy.boundarySectionLabel}
                  className="preference-section"
                >
                  <h3>{agentWorkbenchCopy.boundaryHeading}</h3>
                  <ul className="agent-consent-list">
                    {agentWorkbenchCopy.boundaryItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={agentWorkbenchConsent}
                      disabled={!agentWorkbenchActive}
                      onChange={(event) =>
                        updateAgentWorkbenchConsent(event.target.checked)
                      }
                    />
                    <span className="slider"></span>
                    <span>{agentWorkbenchCopy.consent}</span>
                  </label>
                </section>
              </div>
            ) : (
              <div className="preferences-sections">
                <section
                  className="preference-section"
                  aria-label={preferencesCopy.editorDisplay}
                >
                  <h3>{preferencesCopy.editor}</h3>
                  <label className="toggle-switch">
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
                    <span className="slider"></span>
                    <span>{preferencesCopy.wrapLines}</span>
                  </label>
                  <label className="toggle-switch">
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
                    <span className="slider"></span>
                    <span>{preferencesCopy.showInvisibles}</span>
                  </label>
                  <label className="field-control">
                    <span>{preferencesCopy.fontSize}</span>
                    <input
                      aria-label={preferencesCopy.fontSizeControl}
                      type="number"
                      min="12"
                      max="22"
                      value={editorSettings.fontSize}
                      onChange={(event) =>
                        setEditorSettings((current) => ({
                          ...current,
                          fontSize: clampNumber(
                            Number(event.target.value),
                            12,
                            22,
                            14,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field-control">
                    <span>{preferencesCopy.tabSize}</span>
                    <select
                      aria-label={preferencesCopy.tabSize}
                      value={editorSettings.tabSize}
                      onChange={(event) =>
                        setEditorSettings((current) => ({
                          ...current,
                          tabSize: clampNumber(
                            Number(event.target.value),
                            2,
                            8,
                            2,
                          ),
                        }))
                      }
                    >
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                </section>
                <section
                  className="preference-section"
                  aria-label={preferencesCopy.application}
                >
                  <h3>{preferencesCopy.application}</h3>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={previewVisible}
                      onChange={(event) => setPreviewVisible(event.target.checked)}
                    />
                    <span className="slider"></span>
                    <span>{preferencesCopy.previewPane}</span>
                  </label>
                  <label className="field-control">
                    <span>{preferencesCopy.theme}</span>
                    <select
                      aria-label={preferencesCopy.theme}
                      value={themePreference}
                      onChange={(event) =>
                        setThemePreference(event.target.value as ThemePreference)
                      }
                    >
                      <option value="system">{preferencesCopy.system}</option>
                      <option value="light">{preferencesCopy.light}</option>
                      <option value="dark">{preferencesCopy.dark}</option>
                      <option value="sakura">{preferencesCopy.sakura}</option>
                      <option value="yakou">{preferencesCopy.yakou}</option>
                      <option value="shokou">{preferencesCopy.shokou}</option>
                    </select>
                  </label>
                  <label className="field-control">
                    <span>{preferencesCopy.menuLanguage}</span>
                    <select
                      aria-label={preferencesCopy.menuLanguage}
                      value={menuLanguage}
                      onChange={(event) =>
                        setMenuLanguage(event.target.value as MenuLanguage)
                      }
                    >
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                    </select>
                  </label>
                </section>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {workspaceContextMenu ? (
        <WorkspaceContextMenu
          anchor={workspaceContextMenu}
          activeTabPath={activeTab?.path ?? null}
          canSendToAgent={activeAgentSession}
          compareSource={compareAnchor}
          menuLanguage={menuLanguage}
          onClearCompareSource={clearCompareSource}
          onClose={closeWorkspaceContextMenu}
          onCompare={() => void compareWorkspaceFiles(workspaceContextMenu)}
          onOpen={() => {
            closeWorkspaceContextMenu();
            void openWorkspaceFile(workspaceContextMenu.path);
          }}
          onCopyFullPath={() => void copyWorkspaceFullPath(workspaceContextMenu)}
          onRevealInFinder={() => void revealWorkspacePath(workspaceContextMenu)}
          onSendFullPathToAgent={() =>
            void sendWorkspacePathToAgent(workspaceContextMenu)
          }
          onSetCompareSource={() => setCompareSource(workspaceContextMenu)}
          onSetCompareTarget={() => setCompareTargetFile(workspaceContextMenu)}
        />
      ) : null}
    </main>
  );
}

function StartPanel({
  copy,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onOpenRecentFile,
  recentFiles,
}: {
  copy: {
    newFile: string;
    openFile: string;
    openFolder: string;
    recentFiles: string;
    startHeading: string;
    startActions: string;
  };
  onNewFile: () => void | Promise<void>;
  onOpenFile: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onOpenRecentFile: (path: string) => void;
  recentFiles: RecentEntry[];
}) {
  const visibleRecentFiles = buildRecentDisplayEntries(recentFiles).slice(0, 4);

  return (
    <div className="start-panel">
      <div className="start-panel-main">
        <span className="start-kicker">hazakura-note</span>
        <h1>{copy.startHeading}</h1>
        <div className="start-actions" aria-label={copy.startActions}>
          <button type="button" onClick={() => void onOpenFile()}>
            {copy.openFile}
          </button>
          <button type="button" onClick={() => void onOpenFolder()}>
            {copy.openFolder}
          </button>
          <button type="button" onClick={() => void onNewFile()}>
            {copy.newFile}
          </button>
        </div>
      </div>
      {recentFiles.length > 0 ? (
        <div className="start-recent" aria-label={copy.recentFiles}>
          <span>{copy.recentFiles}</span>
          {visibleRecentFiles.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => onOpenRecentFile(entry.path)}
              title={entry.path}
            >
              {entry.displayLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImagePreviewPane({
  image,
  title,
}: {
  image: ImagePreviewState;
  title: string;
}) {
  return (
    <div className="image-preview-pane">
      <div className="image-preview-header">
        <span>{title}</span>
        <strong title={image.path}>{image.name}</strong>
      </div>
      <div className="image-preview-stage">
        <img src={image.url} alt={image.name} />
      </div>
    </div>
  );
}

function RightPaneToggleControls({
  agentActive,
  agentAvailable,
  copy,
  diffActive,
  diffAvailable,
  onToggleAgent,
  onToggleDiff,
  onToggleOutline,
  onTogglePreview,
  outlineActive,
  outlineAvailable,
  previewActive,
}: {
  agentActive: boolean;
  agentAvailable: boolean;
  diffActive: boolean;
  diffAvailable: boolean;
  copy: {
    agentTab: string;
    diffTab: string;
    outlineTab: string;
    previewTab: string;
    sidePaneMode: string;
  };
  onToggleAgent: () => void;
  onToggleDiff: () => void;
  onToggleOutline: () => void;
  onTogglePreview: () => void;
  outlineActive: boolean;
  outlineAvailable: boolean;
  previewActive: boolean;
}) {
  return (
    <div className="right-pane-toggles" aria-label={copy.sidePaneMode}>
      <button
        aria-pressed={previewActive}
        className="right-pane-toggle"
        onClick={onTogglePreview}
        type="button"
      >
        {copy.previewTab}
      </button>
      {diffAvailable ? (
        <button
          aria-pressed={diffActive}
          className="right-pane-toggle"
          onClick={onToggleDiff}
          type="button"
        >
          {copy.diffTab}
        </button>
      ) : null}
      <button
        aria-pressed={outlineActive}
        className="right-pane-toggle"
        disabled={!outlineAvailable}
        onClick={onToggleOutline}
        type="button"
      >
        {copy.outlineTab}
      </button>
      {agentAvailable ? (
        <button
          aria-pressed={agentActive}
          className="right-pane-toggle"
          onClick={onToggleAgent}
          type="button"
        >
          {copy.agentTab}
        </button>
      ) : null}
    </div>
  );
}

function PreviewUnavailablePane({
  ariaLabel,
  reason,
}: {
  ariaLabel: string;
  reason: string;
}) {
  return (
    <div className="preview-unavailable" aria-label={ariaLabel}>
      {reason}
    </div>
  );
}

function ScrollPositionHud({
  context,
  line,
  menuLanguage,
  totalLines,
}: {
  context: MarkdownHeadingContext;
  line: number;
  menuLanguage: MenuLanguage;
  totalLines: number;
}) {
  const progress =
    totalLines <= 1 ? 0 : Math.round(((line - 1) / (totalLines - 1)) * 100);
  const meta =
    menuLanguage === "ja"
      ? `${line.toLocaleString()} / ${totalLines.toLocaleString()} 行 · ${progress}%`
      : `${line.toLocaleString()} / ${totalLines.toLocaleString()} lines · ${progress}%`;

  return (
    <div className="scroll-position-hud" aria-hidden="true">
      {context.previous ? (
        <div className="scroll-position-hud-neighbor">
          {context.previous.text}
        </div>
      ) : null}
      <div className="scroll-position-hud-current">
        <span>§</span>
        <strong>{context.current?.text}</strong>
      </div>
      {context.next ? (
        <div className="scroll-position-hud-neighbor next">
          {context.next.text}
        </div>
      ) : null}
      <div className="scroll-position-hud-meta">{meta}</div>
    </div>
  );
}

function OutlinePane({
  copy,
  currentHeadingLine,
  headings,
  onSelect,
  truncated,
}: {
  copy: {
    documentOutline: string;
    outlineEmpty: string;
    outlineTruncated: string;
  };
  currentHeadingLine: number | null;
  headings: MarkdownHeading[];
  onSelect: (heading: MarkdownHeading) => void;
  truncated: boolean;
}) {
  return (
    <div className="outline-pane">
      <div className="outline-pane-header">
        <span>{copy.documentOutline}</span>
      </div>
      {headings.length > 0 ? (
        <>
          <div className="outline-list">
            {headings.map((heading) => (
              <button
                aria-current={
                  heading.line === currentHeadingLine ? "location" : undefined
                }
                className={`outline-item${heading.line === currentHeadingLine ? " current" : ""}`}
                key={`${heading.line}-${heading.text}`}
                onClick={() => onSelect(heading)}
                style={{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }}
                title={`${heading.line}: ${heading.text}`}
                type="button"
              >
                <span className="outline-line">{heading.line}</span>
                <span className="outline-text">{heading.text}</span>
              </button>
            ))}
          </div>
          {truncated ? (
            <div className="outline-truncated" role="note">
              {copy.outlineTruncated}
            </div>
          ) : null}
        </>
      ) : (
        <div className="outline-empty">{copy.outlineEmpty}</div>
      )}
    </div>
  );
}

function AgentPaneShell({
  gate,
  menuLanguage,
  onCheckGate,
  onStopSession,
  onTerminalData,
  onTerminalEngage,
  onTerminalRelease,
  onTerminalResize,
  output,
  provider,
  session,
  stopPending,
  workspaceRootPath,
}: {
  gate: AgentLaunchGateState;
  menuLanguage: MenuLanguage;
  onCheckGate: () => void;
  onStopSession: () => void;
  onTerminalData: (data: string) => void;
  onTerminalEngage: () => void;
  onTerminalRelease: () => void;
  onTerminalResize: (size: AgentTerminalSize) => void;
  output: AgentWorkbenchOutputChunk[];
  provider: AgentWorkbenchProvider;
  session: AgentWorkbenchSession | null;
  stopPending: boolean;
  workspaceRootPath: string | null;
}) {
  const workspaceAvailable = workspaceRootPath !== null;
  const activeSession = isActiveAgentSession(session);
  const copy =
    menuLanguage === "ja"
      ? {
          noWorkspace: "ワークスペース未選択",
          unavailable:
            "起動できません: 先にワークスペースフォルダを開いてください。",
          placeholderReady:
            "選択中の Agent プロバイダーに接続するにはセッションを開始してください。",
          placeholderNoWorkspace:
            "Agent セッションを開始する前にワークスペースフォルダを開いてください。",
          alreadyActive: "Agent セッションはすでに実行中です。",
          openWorkspaceFirst: "先にワークスペースフォルダを開いてください。",
          noRunningSession: "実行中の Agent セッションはありません。",
          outputChunks: "出力チャンク",
          start: "セッション開始",
          starting: "開始中...",
          stop: "セッション停止",
          stopping: "停止中...",
          terminal: "Agent ターミナル",
          running: "Agent は実行中",
          inactive: "Agent は停止中",
        }
      : {
          noWorkspace: "No workspace selected",
          unavailable: "Launch unavailable: open a workspace folder first.",
          placeholderReady: "Start session to connect the selected Agent provider.",
          placeholderNoWorkspace:
            "Open a workspace folder before starting an Agent session.",
          alreadyActive: "One Agent session is already active.",
          openWorkspaceFirst: "Open a workspace folder first.",
          noRunningSession: "No running Agent session.",
          outputChunks: "Output chunks",
          start: "Start session",
          starting: "Starting...",
          stop: "Stop session",
          stopping: "Stopping...",
          terminal: "Agent terminal",
          running: "Agent running",
          inactive: "Agent inactive",
        };
  const gateMessage = workspaceAvailable
    ? localizeAgentGateMessage(gate.message, menuLanguage)
    : copy.unavailable;
  const terminalPlaceholder = workspaceAvailable
    ? copy.placeholderReady
    : copy.placeholderNoWorkspace;
  const showGateMessage =
    !activeSession || gate.kind === "checking" || gate.kind === "rejected";

  return (
    <section className="agent-pane" aria-label="Agent Workbench pane">
      <div className="agent-compact-header">
        <div className="agent-compact-title">
          <strong>{providerLabel(provider)}</strong>
          <span>{agentCompactSessionStateLabel(session, menuLanguage)}</span>
        </div>
        <div className="agent-actions">
          <button
            disabled={
              !workspaceAvailable || gate.kind === "checking" || activeSession
            }
            onClick={onCheckGate}
            title={
              activeSession
                ? copy.alreadyActive
                : workspaceAvailable
                  ? undefined
                  : copy.openWorkspaceFirst
            }
            type="button"
          >
            {gate.kind === "checking" ? copy.starting : copy.start}
          </button>
          <button
            disabled={!activeSession || stopPending}
            onClick={onStopSession}
            title={activeSession ? undefined : copy.noRunningSession}
            type="button"
          >
            {stopPending ? copy.stopping : copy.stop}
          </button>
        </div>
      </div>
      <div className="agent-compact-meta">
        <span title={workspaceRootPath ?? undefined}>
          {workspaceRootPath ?? copy.noWorkspace}
        </span>
        <span>{activeSession ? copy.running : copy.inactive}</span>
      </div>
      {showGateMessage ? (
        <p
          className={`agent-gate-message ${workspaceAvailable ? gate.kind : "rejected"}`}
        >
          {gateMessage}
        </p>
      ) : null}
      <AgentTerminalView
        activeSession={activeSession}
        outputLabel={copy.outputChunks}
        onData={onTerminalData}
        onEngage={onTerminalEngage}
        onRelease={onTerminalRelease}
        onResize={onTerminalResize}
        output={output}
        placeholder={terminalPlaceholder}
        terminalLabel={copy.terminal}
      />
    </section>
  );
}

function AgentTerminalView({
  activeSession,
  outputLabel,
  onData,
  onEngage,
  onRelease,
  onResize,
  output,
  placeholder,
  terminalLabel,
}: {
  activeSession: boolean;
  outputLabel: string;
  onData: (data: string) => void;
  onEngage: () => void;
  onRelease: () => void;
  onResize: (size: AgentTerminalSize) => void;
  output: AgentWorkbenchOutputChunk[];
  placeholder: string;
  terminalLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const lastOutputSeqRef = useRef(0);
  const lastTerminalSizeRef = useRef<AgentTerminalSize | null>(null);
  const activeSessionRef = useRef(activeSession);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const showInactivePlaceholder = !activeSession && output.length === 0;

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      disableStdin: !activeSessionRef.current,
      fontFamily:
        '"SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: {
        background: "#101512",
        black: "#101512",
        blue: "#8db3ff",
        brightBlack: "#758176",
        brightBlue: "#b5ccff",
        brightCyan: "#9ad8dc",
        brightGreen: "#a8ddb4",
        brightMagenta: "#d9b7ee",
        brightRed: "#ffb5ac",
        brightWhite: "#f2f5ef",
        brightYellow: "#eee6a4",
        cyan: "#80c4c8",
        cursor: "#e5ece5",
        foreground: "#dce6dd",
        green: "#8bc89a",
        magenta: "#cfa4df",
        red: "#f29a91",
        selectionBackground: "#345345",
        white: "#dce6dd",
        yellow: "#ddd27f",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    const fitAndNotify = () => {
      fitAddon.fit();
      const dimensions = fitAddon.proposeDimensions();
      if (!dimensions) {
        return;
      }

      const nextSize = {
        columns: Math.max(1, Math.min(500, dimensions.cols)),
        rows: Math.max(1, Math.min(200, dimensions.rows)),
      };
      const previousSize = lastTerminalSizeRef.current;
      if (
        previousSize?.columns === nextSize.columns &&
        previousSize.rows === nextSize.rows
      ) {
        return;
      }

      lastTerminalSizeRef.current = nextSize;
      onResizeRef.current(nextSize);
    };
    fitAndNotify();

    const dataDisposable = terminal.onData((data) => {
      if (activeSessionRef.current) {
        onDataRef.current(data);
      }
    });
    const resizeObserver = new ResizeObserver(() => {
      fitAndNotify();
    });
    resizeObserver.observe(host);
    const focusTerminal = () => {
      onEngage();
      if (activeSessionRef.current) {
        terminal.focus();
      }
    };
    const blurTerminal = () => {
      onRelease();
      terminal.blur();
    };
    const blurTerminalWhenHidden = () => {
      if (document.visibilityState !== "visible") {
        blurTerminal();
      }
    };
    host.addEventListener("pointerenter", onEngage);
    host.addEventListener("pointerdown", focusTerminal);
    host.addEventListener("mouseleave", blurTerminal);
    window.addEventListener("blur", blurTerminal);
    document.addEventListener("visibilitychange", blurTerminalWhenHidden);

    terminalRef.current = terminal;

    return () => {
      document.removeEventListener("visibilitychange", blurTerminalWhenHidden);
      window.removeEventListener("blur", blurTerminal);
      host.removeEventListener("mouseleave", blurTerminal);
      host.removeEventListener("pointerdown", focusTerminal);
      host.removeEventListener("pointerenter", onEngage);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      lastOutputSeqRef.current = 0;
      lastTerminalSizeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (output.length === 0) {
      terminal.clear();
      lastOutputSeqRef.current = 0;
      return;
    }

    const firstVisibleSeq = output[0]?.seq ?? 0;
    if (
      lastOutputSeqRef.current > 0 &&
      firstVisibleSeq > lastOutputSeqRef.current + 1
    ) {
      terminal.clear();
      lastOutputSeqRef.current = 0;
    }

    for (const chunk of output) {
      if (chunk.seq <= lastOutputSeqRef.current) {
        continue;
      }

      if (chunk.stream === "system") {
        terminal.write(`\r\n${normalizeTerminalLineEndings(chunk.text)}`);
      } else {
        terminal.write(chunk.text);
      }
      lastOutputSeqRef.current = chunk.seq;
    }
  }, [output]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = !activeSession;
    }

    if (!activeSession) {
      terminalRef.current?.blur();
    }
  }, [activeSession]);

  return (
    <div
      className={`agent-terminal-shell ${activeSession ? "active" : "inactive"}`}
    >
      <div className="agent-terminal-meta">
        {outputLabel}: {output.length} / {AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS}
      </div>
      <div
        aria-label={terminalLabel}
        className="agent-terminal-host"
        ref={hostRef}
      />
      {showInactivePlaceholder ? (
        <div className="agent-terminal-placeholder">{placeholder}</div>
      ) : null}
    </div>
  );
}

function normalizeTerminalLineEndings(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

function DiffSetupPane({
  compareSource,
  compareTarget,
  menuLanguage,
  onClearSource,
  onClearTarget,
  onCompare,
  workspaceRootPath,
}: {
  compareSource: CompareAnchor | null;
  compareTarget: CompareAnchor | null;
  menuLanguage: MenuLanguage;
  onClearSource: () => void;
  onClearTarget: () => void;
  onCompare: () => void;
  workspaceRootPath: string | null;
}) {
  const labels =
    menuLanguage === "ja"
      ? {
          clear: "解除",
          compare: "比較する",
          compareSource: "比較元",
          compareTarget: "比較先",
          introText:
            "ワークスペースから2つのテキストファイルを選んで比較します。",
          heading: "Diff",
          noWorkspace:
            "ワークスペースを開くと、左のファイル一覧から比較元と比較先を選べます。",
          openWorkspaceHint: "先にワークスペースフォルダを開いてください",
          sourceHint: "左のファイル一覧をクリックして比較元を選択",
          targetHint: "次のクリックで比較先を選択",
          ready:
            "比較元は解除するまで固定されます。右クリックメニューでも比較元/比較先を明示できます。",
          pending: "比較元と比較先を選ぶと比較できます。",
          sourceUnset: "比較元は未選択です",
          targetUnset: "比較先は未選択です",
        }
      : {
          clear: "Clear",
          compare: "Compare",
          compareSource: "Compare source",
          compareTarget: "Compare target",
          introText:
            "Choose two workspace text files and compare them.",
          heading: "Diff",
          noWorkspace:
            "Open a workspace folder to choose the source and target from the left file list.",
          openWorkspaceHint: "Open a workspace folder first",
          sourceHint: "Click a file in the left list to choose the source",
          targetHint: "The next click chooses the target",
          ready:
            "The source stays fixed until cleared. You can also use the context menu to choose either side.",
          pending: "Compare becomes available after both slots are selected.",
          sourceUnset: "No compare source selected",
          targetUnset: "No compare target selected",
        };
  const workspaceAvailable = workspaceRootPath !== null;
  const sourceName = compareSource?.name ?? null;
  const sourcePath = compareSource?.path ?? null;
  const targetName = compareTarget?.name ?? null;
  const targetPath = compareTarget?.path ?? null;
  const canCompare =
    compareSource !== null &&
    compareTarget !== null &&
    compareSource.path !== compareTarget.path;
  const sourcePrompt = workspaceAvailable
    ? labels.sourceHint
    : labels.openWorkspaceHint;
  const targetPrompt = workspaceAvailable
    ? labels.targetHint
    : labels.openWorkspaceHint;
  const actionHint = workspaceAvailable ? labels.ready : labels.pending;

  return (
    <div className="diff-setup-pane">
      <div className="diff-setup-card">
        <span>{labels.heading}</span>
        <strong>{labels.introText}</strong>
        {!workspaceAvailable ? (
          <p className="diff-setup-note">{labels.noWorkspace}</p>
        ) : null}
        <div className="diff-slots">
          <DiffSelectionSlot
            clearLabel={labels.clear}
            emptyLabel={labels.sourceUnset}
            fileName={sourceName}
            filePath={sourcePath}
            label={labels.compareSource}
            onClear={onClearSource}
            prompt={sourcePrompt}
          />
          <DiffSelectionSlot
            clearLabel={labels.clear}
            emptyLabel={labels.targetUnset}
            fileName={targetName}
            filePath={targetPath}
            label={labels.compareTarget}
            onClear={onClearTarget}
            prompt={targetPrompt}
          />
        </div>
        <div className="diff-setup-actions">
          <button type="button" onClick={onCompare} disabled={!canCompare}>
            {labels.compare}
          </button>
          <p>{actionHint}</p>
        </div>
      </div>
    </div>
  );
}

function DiffSelectionSlot({
  clearLabel,
  emptyLabel,
  fileName,
  filePath,
  label,
  onClear,
  prompt,
}: {
  clearLabel: string;
  emptyLabel: string;
  fileName: string | null;
  filePath: string | null;
  label: string;
  onClear: () => void;
  prompt: string;
}) {
  return (
    <div
      className={`diff-selection-slot${fileName ? " filled" : ""}`}
    >
      <span>{label}</span>
      {fileName && filePath ? (
        <div className="diff-selection-file">
          <code title={filePath}>{fileName}</code>
          <small title={filePath}>{filePath}</small>
          <button type="button" onClick={onClear}>
            {clearLabel}
          </button>
        </div>
      ) : (
        <em>{emptyLabel}</em>
      )}
      <small>{prompt}</small>
    </div>
  );
}

function startWorkspacePathDrag(
  event: ReactDragEvent<HTMLButtonElement>,
  entry: WorkspaceTreeEntry,
) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", entry.path);
  event.dataTransfer.setData("application/x-hazakura-workspace-path", entry.path);
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy was not accepted by the browser.");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function lastAgentOutputSeq(output: AgentWorkbenchOutputChunk[]): number {
  return output.at(-1)?.seq ?? 0;
}

function providerLabel(provider: AgentWorkbenchProvider): string {
  return (
    AGENT_WORKBENCH_PROVIDERS.find((candidate) => candidate.id === provider)
      ?.label ?? provider
  );
}

function isActiveAgentSession(session: AgentWorkbenchSession | null): boolean {
  return session?.status === "active";
}

function agentSessionStateLabel(
  session: AgentWorkbenchSession | null,
  menuLanguage: MenuLanguage = "en",
): string {
  if (!session) {
    return menuLanguage === "ja" ? "未実行" : "Not running";
  }

  switch (session.status) {
    case "active":
      return menuLanguage === "ja" ? "実行中" : "Running";
    case "exited":
      return menuLanguage === "ja" ? "終了済み" : "Exited";
    case "stopped":
      return menuLanguage === "ja" ? "停止済み" : "Stopped";
  }
}

function agentCompactSessionStateLabel(
  session: AgentWorkbenchSession | null,
  menuLanguage: MenuLanguage = "en",
): string {
  if (!session) {
    return menuLanguage === "ja" ? "待機中" : "Idle";
  }

  return agentSessionStateLabel(session, menuLanguage);
}

function localizeAgentGateMessage(
  message: string,
  menuLanguage: MenuLanguage,
): string {
  if (menuLanguage !== "ja") {
    return message;
  }

  switch (message) {
    case "Launch gate not checked.":
      return "起動ゲートはまだ確認されていません。";
    case "Checking Agent Workbench launch gate...":
      return "エージェントワークベンチの起動ゲートを確認中です...";
    case "Agent session exited.":
      return "Agent セッションは終了しました。";
    case "Agent session stopped.":
      return "Agent セッションは停止しました。";
    case "Provider not found; no Agent session was started.":
      return "プロバイダーが見つからないため、Agent セッションは開始されませんでした。";
    case "Agent session running in the selected workspace. Only the selected allowlisted CLI was launched.":
      return "選択中のワークスペースで Agent セッションが実行中です。起動されたのは選択された allowlist 済み CLI だけです。";
    default:
      if (message.startsWith("Provider not found: ")) {
        return message
          .replace("Provider not found:", "プロバイダーが見つかりません:")
          .replace(
            " was not found in the app search path, including common Homebrew and user bin locations.",
            " はアプリの検索パス（一般的な Homebrew と user bin を含む）で見つかりませんでした。",
          );
      }

      return message;
  }
}

function localizeStatusMessage(
  message: string,
  menuLanguage: MenuLanguage,
): string {
  if (menuLanguage !== "ja") {
    return message;
  }

  const exact: Record<string, string> = {
    "Agent input failed": "Agent 入力に失敗しました",
    "Agent launch gate passed": "Agent 起動ゲートを通過しました",
    "Agent launch rejected": "Agent 起動が拒否されました",
    "Agent launch unavailable": "Agent 起動は利用できません",
    "Agent provider not found": "Agent プロバイダーが見つかりません",
    "Agent session exited": "Agent セッションは終了しました",
    "Agent session running": "Agent セッション実行中",
    "Agent session state unavailable": "Agent セッション状態を取得できません",
    "Agent session stop failed": "Agent セッションの停止に失敗しました",
    "Agent session stopped": "Agent セッションを停止しました",
    "Agent terminal resize failed": "Agent ターミナルのリサイズに失敗しました",
    "Bold markup applied": "太字の Markdown を適用しました",
    "Checking Agent Workbench launch gate...":
      "エージェントワークベンチの起動ゲートを確認中です...",
    "Change review failed": "変更確認に失敗しました",
    "Change review ready": "変更確認の準備ができました",
    "Choosing file...": "ファイルを選択中...",
    "Choosing folder...": "フォルダを選択中...",
    "Choosing new file path...": "新規ファイルの保存先を選択中...",
    "Choosing Save As path...": "別名保存先を選択中...",
    "Close cancelled": "閉じる操作をキャンセルしました",
    "Close failed": "閉じる操作に失敗しました",
    "Close needs confirmation": "閉じる前に確認が必要です",
    "Close stopped": "閉じる操作を停止しました",
    "Closing window...": "ウィンドウを閉じています...",
    "Compare closed": "比較を閉じました",
    "Compare failed": "比較に失敗しました",
    "Compare ready": "比較の準備ができました",
    "Comparing files...": "ファイルを比較中...",
    "Creating file...": "ファイルを作成中...",
    "Draft discarded": "下書きを破棄しました",
    "Draft restored": "下書きを復元しました",
    "Enter a valid line number": "有効な行番号を入力してください",
    "External change detected": "外部変更を検出しました",
    "External change refreshed": "外部変更を再読み込みしました",
    "Find closed": "検索を閉じました",
    "Folder load failed": "フォルダの読み込みに失敗しました",
    "Folder open cancelled": "フォルダを開く操作をキャンセルしました",
    "Folder open failed": "フォルダを開けませんでした",
    "Folder opened": "フォルダを開きました",
    "Image preview closed": "画像プレビューを閉じました",
    "Image preview failed": "画像プレビューに失敗しました",
    "Image preview opened": "画像プレビューを開きました",
    "Inline code markup applied": "インラインコードの Markdown を適用しました",
    "Italic markup applied": "斜体の Markdown を適用しました",
    "Keeping local edits": "ローカル編集を保持します",
    "Link markup inserted": "リンクの Markdown を挿入しました",
    "Metadata check failed": "メタデータ確認に失敗しました",
    "New file cancelled": "新規ファイル作成をキャンセルしました",
    "New file created": "新規ファイルを作成しました",
    "New file created; folder refresh failed":
      "新規ファイルを作成しました。フォルダ更新には失敗しました",
    "New file failed": "新規ファイル作成に失敗しました",
    "No active tab to close": "閉じる対象のタブがありません",
    "No active tab to convert": "変換するアクティブタブがありません",
    "No active tab to format": "整形するアクティブタブがありません",
    "No active tab to save": "保存するアクティブタブがありません",
    "No Agent session to stop": "停止する Agent セッションはありません",
    "Open cancelled": "開く操作をキャンセルしました",
    "Open failed": "開けませんでした",
    "Opened safely": "安全に開きました",
    "Opening file...": "ファイルを開いています...",
    "Opening image preview...": "画像プレビューを開いています...",
    "Reading folder...": "フォルダを読み込み中...",
    "Ready": "準備完了",
    "Reopen failed": "再読み込みに失敗しました",
    "Reopened from disk": "ディスクから再読み込みしました",
    "Reopening from disk...": "ディスクから再読み込み中...",
    "Reviewing changes...": "変更を確認中...",
    "Restoring workspace...": "ワークスペースを復元中...",
    "Save As cancelled": "別名保存をキャンセルしました",
    "Save As failed": "別名保存に失敗しました",
    "Save As stopped": "別名保存を停止しました",
    "Saved": "保存しました",
    "Saved as": "別名保存しました",
    "Saved as; folder refresh failed":
      "別名保存しました。フォルダ更新には失敗しました",
    "Saving as...": "別名保存中...",
    "Saving before close...": "閉じる前に保存中...",
    "Saving...": "保存中...",
    "Stop Agent session before changing provider":
      "プロバイダー変更前に Agent セッションを停止してください",
    "Stopping Agent session...": "Agent セッションを停止中...",
    "Tab closed": "タブを閉じました",
    "Tab focused": "タブにフォーカスしました",
    "Workspace restore skipped": "ワークスペース復元をスキップしました",
    "Workspace restored": "ワークスペースを復元しました",
    "Workspace restored with drafts": "下書き付きでワークスペースを復元しました",
  };

  if (exact[message]) {
    return exact[message];
  }

  if (message.startsWith("Agent provider selected: ")) {
    return `Agent プロバイダーを選択: ${message.slice("Agent provider selected: ".length)}`;
  }

  if (message.startsWith("Provider not found: ")) {
    return message
      .replace("Provider not found:", "プロバイダーが見つかりません:")
      .replace(
        " was not found in the app search path, including common Homebrew and user bin locations.",
        " はアプリの検索パス（一般的な Homebrew と user bin を含む）で見つかりませんでした。",
      );
  }

  if (message.startsWith("Line endings set to ")) {
    return `改行コードを ${message.slice("Line endings set to ".length)} に変更しました`;
  }

  if (message.startsWith("Moved to line ")) {
    return `${message.slice("Moved to line ".length)} 行目へ移動しました`;
  }

  return message;
}

function DiffPane({
  menuLanguage,
  onClose,
  view,
}: {
  menuLanguage: MenuLanguage;
  onClose: () => void;
  view: CompareViewState;
}) {
  const rows = buildDiffDisplayRows(
    view,
    buildSplitDiffRows(view.lines),
    menuLanguage,
  );
  const labels =
    menuLanguage === "ja"
      ? {
          additions: "追加行",
          changesTitle: "変更確認",
          close: "閉じる",
          empty: "差分はありません",
          fileTitle: "Diff",
          removed: "削除行",
          summary: "比較の概要",
          to: "と",
          table: "ファイル比較",
          sourceColumn: "比較元",
          targetColumn: "比較先",
          textColumn: "内容",
        }
      : {
          additions: "Added lines",
          changesTitle: "Change review",
          close: "Close",
          empty: "No differences",
          fileTitle: "Diff",
          removed: "Removed lines",
          summary: "Comparison summary",
          to: "to",
          table: "File comparison",
          sourceColumn: "Source",
          targetColumn: "Target",
          textColumn: "Text",
        };

  return (
    <div className="diff-pane">
      <div className="diff-header">
        <div className="diff-title">
          <span>
            {view.kind === "changes" ? labels.changesTitle : labels.fileTitle}
          </span>
          <strong>
            <span title={view.leftPath}>{view.leftName}</span>
            <span aria-hidden="true">{labels.to}</span>
            <span title={view.rightPath}>{view.rightName}</span>
          </strong>
        </div>
        <div className="diff-summary" aria-label={labels.summary}>
          <span className="diff-added" title={labels.additions}>
            +{view.additions}
          </span>
          <span className="diff-removed" title={labels.removed}>
            -{view.removals}
          </span>
          <button type="button" onClick={onClose}>
            {labels.close}
          </button>
        </div>
      </div>
      <div className="diff-table" role="table" aria-label={labels.table}>
        <div className="diff-split-row diff-row-header" role="row">
          <span className="diff-line-number" role="columnheader" />
          <span className="diff-text-column" role="columnheader">
            {view.leftColumnLabel ?? labels.sourceColumn}
          </span>
          <span className="diff-line-number" role="columnheader" />
          <span className="diff-text-column" role="columnheader">
            {view.rightColumnLabel ?? labels.targetColumn}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="diff-empty">{labels.empty}</div>
        ) : (
          rows.map((displayRow) =>
            displayRow.kind === "section" ? (
              <div
                className="diff-section-row"
                key={displayRow.key}
                role="row"
              >
                <span role="cell">{displayRow.label}</span>
              </div>
            ) : (
              <div
                className={`diff-split-row ${displayRow.row.kind}`}
                key={displayRow.key}
                role="row"
              >
                <span className={`diff-line-number ${displayRow.row.left.kind}`}>
                  {displayRow.row.left.line ?? ""}
                </span>
                <code className={`diff-cell ${displayRow.row.left.kind}`}>
                  {displayRow.row.left.kind === "removed" ? (
                    <span className="diff-cell-marker" aria-hidden="true">
                      -
                    </span>
                  ) : null}
                  {displayRow.row.left.text || " "}
                </code>
                <span className={`diff-line-number ${displayRow.row.right.kind}`}>
                  {displayRow.row.right.line ?? ""}
                </span>
                <code className={`diff-cell ${displayRow.row.right.kind}`}>
                  {displayRow.row.right.kind === "added" ? (
                    <span className="diff-cell-marker" aria-hidden="true">
                      +
                    </span>
                  ) : null}
                  {displayRow.row.right.text || " "}
                </code>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}

function buildSplitDiffRows(lines: DiffLine[]): DiffSplitRow[] {
  const rows: DiffSplitRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "equal") {
      rows.push({
        kind: "equal",
        left: {
          kind: "equal",
          line: line.leftLine,
          text: line.text,
        },
        right: {
          kind: "equal",
          line: line.rightLine,
          text: line.text,
        },
      });
      index += 1;
      continue;
    }

    const removedLines: DiffLine[] = [];
    const addedLines: DiffLine[] = [];

    while (index < lines.length && lines[index].kind !== "equal") {
      if (lines[index].kind === "removed") {
        removedLines.push(lines[index]);
      } else {
        addedLines.push(lines[index]);
      }
      index += 1;
    }

    const rowCount = Math.max(removedLines.length, addedLines.length);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const removed = removedLines[rowIndex];
      const added = addedLines[rowIndex];

      rows.push({
        kind:
          removed && added
            ? "changed"
            : removed
              ? "removed"
              : "added",
        left: removed
          ? {
              kind: "removed",
              line: removed.leftLine,
              text: removed.text,
            }
          : {
              kind: "blank",
              line: null,
              text: "",
            },
        right: added
          ? {
              kind: "added",
              line: added.rightLine,
              text: added.text,
            }
          : {
              kind: "blank",
              line: null,
              text: "",
            },
      });
    }
  }

  return rows;
}

function buildDiffDisplayRows(
  view: CompareViewState,
  rows: DiffSplitRow[],
  menuLanguage: MenuLanguage,
): DiffDisplayRow[] {
  if (
    !isMarkdownDocumentPath(view.leftPath) &&
    !isMarkdownDocumentPath(view.rightPath)
  ) {
    return rows.map((row, index) => ({
      kind: "line",
      key: diffRowKey(row, index),
      row,
    }));
  }

  const leftHeadings = collectDiffSideMarkdownHeadings(view.lines, "left");
  const rightHeadings = collectDiffSideMarkdownHeadings(view.lines, "right");
  const displayRows: DiffDisplayRow[] = [];
  let inChangedBlock = false;

  rows.forEach((row, index) => {
    if (row.kind === "equal") {
      inChangedBlock = false;
      displayRows.push({
        kind: "line",
        key: diffRowKey(row, index),
        row,
      });
      return;
    }

    if (!inChangedBlock) {
      const label = formatDiffSectionContext(
        row,
        leftHeadings,
        rightHeadings,
        menuLanguage,
      );

      if (label) {
        displayRows.push({
          kind: "section",
          key: `section-${index}-${row.left.line ?? "x"}-${row.right.line ?? "x"}`,
          label,
        });
      }

      inChangedBlock = true;
    }

    displayRows.push({
      kind: "line",
      key: diffRowKey(row, index),
      row,
    });
  });

  return displayRows;
}

function diffRowKey(row: DiffSplitRow, index: number): string {
  return `${row.kind}-${index}-${row.left.line ?? "x"}-${row.right.line ?? "x"}`;
}

function collectDiffSideMarkdownHeadings(
  lines: DiffLine[],
  side: "left" | "right",
): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fenceMarker: "`" | "~" | null = null;

  for (const line of lines) {
    const lineNumber = side === "left" ? line.leftLine : line.rightLine;

    if (lineNumber === null) {
      continue;
    }

    const trimmedStart = line.text.trimStart();
    const fenceMatch = trimmedStart.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith("`") ? "`" : "~";

      if (fenceMarker === marker) {
        fenceMarker = null;
      } else if (fenceMarker === null) {
        fenceMarker = marker;
      }

      continue;
    }

    if (fenceMarker !== null) {
      continue;
    }

    const heading = parseMarkdownHeadingLine(line.text, lineNumber);

    if (heading) {
      headings.push(heading);
    }
  }

  return headings;
}

function formatDiffSectionContext(
  row: DiffSplitRow,
  leftHeadings: MarkdownHeading[],
  rightHeadings: MarkdownHeading[],
  menuLanguage: MenuLanguage,
): string | null {
  const leftHeading = row.left.line
    ? findCurrentMarkdownHeading(leftHeadings, row.left.line)
    : null;
  const rightHeading = row.right.line
    ? findCurrentMarkdownHeading(rightHeadings, row.right.line)
    : null;

  if (!leftHeading && !rightHeading) {
    return null;
  }

  const leftText = leftHeading?.text ?? null;
  const rightText = rightHeading?.text ?? null;

  if (leftText && rightText && leftText !== rightText) {
    return menuLanguage === "ja"
      ? `変更位置: 比較元 § ${leftText} / 比較先 § ${rightText}`
      : `Changed in: source § ${leftText} / target § ${rightText}`;
  }

  return menuLanguage === "ja"
    ? `変更位置: § ${leftText ?? rightText}`
    : `Changed in: § ${leftText ?? rightText}`;
}

function localizeCompareError(message: string): string {
  if (
    message.includes(
      "Compare stopped because these files are too large for the comparison preview.",
    )
  ) {
    return "ファイルが大きすぎるため、比較プレビューを停止しました。";
  }

  return message;
}

function WorkspaceContextMenu({
  activeTabPath,
  anchor,
  canSendToAgent,
  compareSource,
  menuLanguage,
  onClearCompareSource,
  onClose,
  onCompare,
  onCopyFullPath,
  onOpen,
  onRevealInFinder,
  onSendFullPathToAgent,
  onSetCompareSource,
  onSetCompareTarget,
}: {
  activeTabPath: string | null;
  anchor: WorkspaceContextMenuState;
  canSendToAgent: boolean;
  compareSource: CompareAnchor | null;
  menuLanguage: MenuLanguage;
  onClearCompareSource: () => void;
  onClose: () => void;
  onCompare: () => void;
  onCopyFullPath: () => void;
  onOpen: () => void;
  onRevealInFinder: () => void;
  onSendFullPathToAgent: () => void;
  onSetCompareSource: () => void;
  onSetCompareTarget: () => void;
}) {
  const canCompareWithActiveTab =
    activeTabPath !== null && activeTabPath !== anchor.path;
  const hasDifferentCompareSource =
    compareSource !== null && compareSource.path !== anchor.path;
  const itemCount = 7 + (canSendToAgent ? 1 : 0) + (compareSource ? 1 : 0);
  const estimatedWidth = 240;
  const estimatedHeight = 12 + itemCount * 34;
  const menuLeft = Math.min(
    Math.max(anchor.x, 8),
    Math.max(8, window.innerWidth - estimatedWidth),
  );
  const menuTop = Math.min(
    Math.max(anchor.y, 8),
    Math.max(8, window.innerHeight - estimatedHeight),
  );
  const labels =
    menuLanguage === "ja"
      ? {
          clearCompareSource: "比較元を解除",
          close: "メニューを閉じる",
          compareActive: "開いているファイルと比較",
          compare: "比較元と比較",
          copyFullPath: "フルパスをコピー",
          menu: "ワークスペース項目の操作",
          open: "開く",
          revealInFinder: "Finderで表示",
          sendFullPathToAgent: "Agent にフルパスを送る",
          setCompareSource: "比較元にする",
          setCompareTarget: "比較先にする",
        }
      : {
          clearCompareSource: "Clear compare source",
          close: "Close menu",
          compareActive: "Compare with open file",
          compare: "Compare with source",
          copyFullPath: "Copy full path",
          menu: "Workspace item actions",
          open: "Open",
          revealInFinder: "Show in Finder",
          sendFullPathToAgent: "Send full path to Agent",
          setCompareSource: "Set as compare source",
          setCompareTarget: "Set as compare target",
        };

  return (
    <div
      aria-label={labels.menu}
      className="workspace-context-menu"
      role="menu"
      style={{ left: menuLeft, top: menuTop }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={onOpen}>
        {labels.open}
      </button>
      <button type="button" role="menuitem" onClick={onCopyFullPath}>
        {labels.copyFullPath}
      </button>
      <button type="button" role="menuitem" onClick={onRevealInFinder}>
        {labels.revealInFinder}
      </button>
      {canSendToAgent ? (
        <button type="button" role="menuitem" onClick={onSendFullPathToAgent}>
          {labels.sendFullPathToAgent}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={!anchor.canCompare}
        onClick={onSetCompareSource}
      >
        {labels.setCompareSource}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!anchor.canCompare}
        onClick={onSetCompareTarget}
      >
        {labels.setCompareTarget}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={
          !anchor.canCompare ||
          (!canCompareWithActiveTab && !hasDifferentCompareSource)
        }
        onClick={onCompare}
      >
        {hasDifferentCompareSource
          ? labels.compare
          : canCompareWithActiveTab
            ? labels.compareActive
            : labels.compare}
      </button>
      {compareSource ? (
        <button type="button" role="menuitem" onClick={onClearCompareSource}>
          {labels.clearCompareSource}
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={onClose}>
        {labels.close}
      </button>
    </div>
  );
}

function SakuraPetals() {
  return (
    <div className="sakura-petals" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => (
        <span className="sakura-petal" key={index} />
      ))}
    </div>
  );
}

function WorkspaceTree({
  activePath,
  compareSourcePath,
  compareTargetPath,
  compareSelectionEnabled,
  entry,
  onLoadDirectory,
  onOpenContextMenu,
  onOpenFile,
  onSelectCompareFile,
}: {
  activePath: string | null;
  compareSourcePath: string | null;
  compareTargetPath: string | null;
  compareSelectionEnabled: boolean;
  entry: WorkspaceTreeEntry;
  onLoadDirectory: (path: string) => Promise<void>;
  onOpenContextMenu: (
    entry: WorkspaceTreeEntry,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  onOpenFile: (path: string) => void | Promise<void>;
  onSelectCompareFile: (entry: WorkspaceTreeEntry) => void;
}) {
  return (
    <div
      className={`workspace-tree${compareSelectionEnabled ? " compare-selection" : ""}`}
    >
      <TreeEntry
        activePath={activePath}
        compareSourcePath={compareSourcePath}
        compareTargetPath={compareTargetPath}
        compareSelectionEnabled={compareSelectionEnabled}
        defaultExpanded
        entry={entry}
        onLoadDirectory={onLoadDirectory}
        onOpenContextMenu={onOpenContextMenu}
        onOpenFile={onOpenFile}
        onSelectCompareFile={onSelectCompareFile}
      />
    </div>
  );
}

// SVGアイコンの定義
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.85 8.15C6.65 8.95 7.95 8.95 8.75 8.15L10.65 6.25C11.45 5.45 11.45 4.15 10.65 3.35C9.85 2.55 8.55 2.55 7.75 3.35L7.25 3.85" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8.15 5.85C7.35 5.05 6.05 5.05 5.25 5.85L3.35 7.75C2.55 8.55 2.55 9.85 3.35 10.65C4.15 11.45 5.45 11.45 6.25 10.65L6.75 10.15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H6.25C6.58152 1.5 6.89946 1.6317 7.13388 1.86612L8.63388 3.36612C8.8683 3.60054 9.18624 3.73223 9.51777 3.73223H13C13.8284 3.73223 14.5 4.4038 14.5 5.23223V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z" fill="var(--accent)" opacity="0.85"/>
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 4.75C1.5 3.92157 2.17157 3.25 3 3.25H13C13.8284 3.25 14.5 3.92157 14.5 4.75V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V4.75Z" fill="var(--accent)" opacity="0.85"/>
      <path d="M1.5 5.5L2.83333 2.16667C2.96667 1.83333 3.29167 1.5 3.65 1.5H6.25C6.58152 1.5 6.89946 1.6317 7.13388 1.86612L8.63388 3.36612C8.8683 3.60054 9.18624 3.73223 9.51777 3.73223H12" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function MarkdownFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 1.5C2.17157 1.5 1.5 2.17157 1.5 3V13C1.5 13.8284 2.17157 14.5 3 14.5H13C13.8284 14.5 14.5 13.8284 14.5 13V3C14.5 2.17157 13.8284 1.5 13 1.5H3Z" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <path d="M4.5 5V11M4.5 5L7 8.5L9.5 5V11M11.5 6.5V9.5M10.5 8H12.5" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TextFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 1.5C2.17157 1.5 1.5 2.17157 1.5 3V13C1.5 13.8284 2.17157 14.5 3 14.5H13C13.8284 14.5 14.5 13.8284 14.5 13V5.5L10.5 1.5H3Z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M10.5 1.5V5.5H14.5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M4 8H12M4 11H9" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function ImageFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 3C2.5 2.17157 3.17157 1.5 4 1.5H12C12.8284 1.5 13.5 2.17157 13.5 3V13C13.5 13.8284 12.8284 14.5 12 14.5H4C3.17157 14.5 2.5 13.8284 2.5 13V3Z" stroke="var(--text-muted)" strokeWidth="1.4"/>
      <path d="M4.25 11.25L6.25 8.75L8.25 10.75L9.75 8.75L12 11.25" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="10.5" cy="5.25" r="1" fill="var(--text-muted)" opacity="0.75"/>
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s ease',
        opacity: 0.6
      }}
    >
      <path d="M2.5 1.5L5 4L2.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TreeEntry({
  activePath,
  compareSourcePath,
  compareTargetPath,
  compareSelectionEnabled,
  defaultExpanded = false,
  entry,
  onLoadDirectory,
  onOpenContextMenu,
  onOpenFile,
  onSelectCompareFile,
}: {
  activePath: string | null;
  compareSourcePath: string | null;
  compareTargetPath: string | null;
  compareSelectionEnabled: boolean;
  defaultExpanded?: boolean;
  entry: WorkspaceTreeEntry;
  onLoadDirectory: (path: string) => Promise<void>;
  onOpenContextMenu: (
    entry: WorkspaceTreeEntry,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  onOpenFile: (path: string) => void | Promise<void>;
  onSelectCompareFile: (entry: WorkspaceTreeEntry) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const isDirectory = entry.kind === "directory";

  if (!isDirectory) {
    const isMarkdown = entry.name.toLowerCase().endsWith(".md") || entry.name.toLowerCase().endsWith(".markdown");
    const isImage = isSupportedImageFile(entry.name);
    return (
      <button
        className={`tree-file${entry.path === activePath ? " active" : ""}${entry.path === compareSourcePath ? " compare-source" : ""}${entry.path === compareTargetPath ? " compare-target" : ""}`}
        draggable={!compareSelectionEnabled}
        onClick={() =>
          compareSelectionEnabled
            ? onSelectCompareFile(entry)
            : void onOpenFile(entry.path)
        }
        onContextMenu={(event) => onOpenContextMenu(entry, event)}
        onDragStart={(event) => {
          startWorkspacePathDrag(event, entry);
        }}
        title={entry.path}
        type="button"
      >
        {isImage ? (
          <ImageFileIcon />
        ) : isMarkdown ? (
          <MarkdownFileIcon />
        ) : (
          <TextFileIcon />
        )}
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
        <ChevronIcon expanded={expanded} />
        {expanded ? <FolderOpenIcon /> : <FolderIcon />}
        <span className="tree-name">{entry.name}</span>
        {loading ? <span className="tree-meta">Loading...</span> : null}
      </button>
      {expanded ? (
        <div className="tree-children">
          {entry.children.map((child) => (
            <TreeEntry
              activePath={activePath}
              compareSourcePath={compareSourcePath}
              compareTargetPath={compareTargetPath}
              compareSelectionEnabled={compareSelectionEnabled}
              entry={child}
              key={child.path}
              onLoadDirectory={onLoadDirectory}
              onOpenContextMenu={onOpenContextMenu}
              onOpenFile={onOpenFile}
              onSelectCompareFile={onSelectCompareFile}
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

  if (
    value === "light" ||
    value === "dark" ||
    value === "system" ||
    value === "sakura" ||
    value === "yakou" ||
    value === "shokou"
  ) {
    return value;
  }

  return "system";
}

function readStoredMenuLanguage(): MenuLanguage {
  return window.localStorage.getItem(MENU_LANGUAGE_STORAGE_KEY) === "ja"
    ? "ja"
    : "en";
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

function readStoredAgentWorkbenchEnabled(): boolean {
  return (
    window.localStorage.getItem(AGENT_WORKBENCH_ENABLED_STORAGE_KEY) === "true"
  );
}

function readStoredAgentWorkbenchConsent(): boolean {
  return (
    window.localStorage.getItem(AGENT_WORKBENCH_CONSENT_STORAGE_KEY) === "true"
  );
}

function readStoredAgentWorkbenchProvider(): AgentWorkbenchProvider {
  const value = window.localStorage.getItem(AGENT_WORKBENCH_PROVIDER_STORAGE_KEY);

  return value === "opencode" ? "opencode" : "codex";
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

function readStoredRecentEntries(storageKey: string): RecentEntry[] {
  const value = window.localStorage.getItem(storageKey);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isRecentEntry)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

function writeStoredRecentEntries(storageKey: string, entries: RecentEntry[]) {
  const normalizedEntries = entries
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX_RECENT_ITEMS);

  if (normalizedEntries.length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(normalizedEntries));
}

function buildRecentDisplayEntries(
  entries: RecentEntry[],
): Array<RecentEntry & { displayLabel: string }> {
  const labelCounts = new Map<string, number>();

  for (const entry of entries) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
  }

  return entries.map((entry) => ({
    ...entry,
    displayLabel:
      (labelCounts.get(entry.label) ?? 0) > 1
        ? `${entry.label} - ${parentFolderName(entry.path)}`
        : entry.label,
  }));
}

function parentFolderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);

  return parts.length >= 2 ? parts[parts.length - 2] : path;
}

function upsertRecentEntry(
  entries: RecentEntry[],
  path: string,
  label: string,
): RecentEntry[] {
  return [
    { path, label, openedAt: Date.now() },
    ...entries.filter((entry) => entry.path !== path),
  ].slice(0, MAX_RECENT_ITEMS);
}

function isRecentEntry(value: unknown): value is RecentEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecentEntry>;

  return (
    typeof candidate.path === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.openedAt === "number"
  );
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

function removeStoredDrafts(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  writeStoredDrafts(
    readStoredDrafts().filter((draft) => !paths.includes(draft.path)),
  );
}

function draftRecordFromTab(tab: EditorTab): DraftRecord {
  return {
    path: tab.path,
    contents: tab.contents,
    line_ending: tab.line_ending,
    savedFingerprint: tab.fingerprint,
    updatedAt: Date.now(),
  };
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

function readSystemTheme(): BaseTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function trapFocusInElement(
  container: HTMLElement | null,
  event: KeyboardEvent,
) {
  if (!container) {
    return;
  }

  const focusableElements = getFocusableElements(container);

  if (focusableElements.length === 0) {
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  if (
    event.shiftKey &&
    (!activeElement ||
      !container.contains(activeElement) ||
      activeElement === firstElement)
  ) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (
    !event.shiftKey &&
    (!activeElement ||
      !container.contains(activeElement) ||
      activeElement === lastElement)
  ) {
    event.preventDefault();
    firstElement.focus();
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "a[href]",
        '[tabindex]:not([tabindex="-1"])',
      ].join(","),
    ),
  ).filter((element) => element.offsetParent !== null);
}

function extractMarkdownOutline(source: string): MarkdownOutline {
  const headings: MarkdownHeading[] = [];
  const lines = source.split(/\r\n|\n|\r/);
  let fenceMarker: "`" | "~" | null = null;
  let truncated = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedStart = line.trimStart();
    const fenceMatch = trimmedStart.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith("`") ? "`" : "~";

      if (fenceMarker === marker) {
        fenceMarker = null;
      } else if (fenceMarker === null) {
        fenceMarker = marker;
      }

      continue;
    }

    if (fenceMarker !== null) {
      continue;
    }

    const heading = parseMarkdownHeadingLine(line, index + 1);

    if (heading) {
      if (headings.length < MARKDOWN_OUTLINE_MAX_HEADINGS) {
        headings.push(heading);
      } else {
        truncated = true;
        break;
      }
    }
  }

  return {
    headings,
    truncated,
  };
}

function parseMarkdownHeadingLine(
  line: string,
  lineNumber: number,
): MarkdownHeading | null {
  const headingMatch = line.match(/^(#{1,6})[ \t]+(.+?)\s*$/);

  if (!headingMatch) {
    return null;
  }

  const text = headingMatch[2].replace(/[ \t]+#+[ \t]*$/, "").trim();

  if (!text) {
    return null;
  }

  return {
    level: headingMatch[1].length,
    line: lineNumber,
    text,
  };
}

function findCurrentMarkdownHeading(
  headings: MarkdownHeading[],
  line: number,
): MarkdownHeading | null {
  let currentHeading: MarkdownHeading | null = null;

  for (const heading of headings) {
    if (heading.line > line) {
      break;
    }

    currentHeading = heading;
  }

  return currentHeading;
}

function getMarkdownHeadingContext(
  headings: MarkdownHeading[],
  line: number,
): MarkdownHeadingContext {
  let currentIndex = -1;

  for (let index = 0; index < headings.length; index += 1) {
    if (headings[index].line > line) {
      break;
    }

    currentIndex = index;
  }

  return {
    previous: currentIndex > 0 ? headings[currentIndex - 1] : null,
    current: currentIndex >= 0 ? headings[currentIndex] : null,
    next:
      currentIndex >= 0 && currentIndex + 1 < headings.length
        ? headings[currentIndex + 1]
        : currentIndex < 0
          ? headings[0] ?? null
          : null,
  };
}

function countDocumentLines(source: string): number {
  return source.split(/\r\n|\n|\r/).length;
}

function clampScrollRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }

  return Math.min(Math.max(ratio, 0), 1);
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

function isEditorKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".editor-host") !== null;
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

function buildLineDiff(
  leftContents: string,
  rightContents: string,
): Pick<CompareViewState, "lines" | "additions" | "removals"> {
  const leftLines = splitDiffLines(leftContents);
  const rightLines = splitDiffLines(rightContents);
  const lineProduct = leftLines.length * rightLines.length;

  if (lineProduct > DIFF_MAX_LINE_PRODUCT) {
    throw new Error(
      "Compare stopped because these files are too large for the comparison preview.",
    );
  }

  const table: number[][] = Array.from(
    { length: leftLines.length + 1 },
    () => Array(rightLines.length + 1).fill(0),
  );

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (
      let rightIndex = rightLines.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      table[leftIndex][rightIndex] =
        leftLines[leftIndex] === rightLines[rightIndex]
          ? table[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(
              table[leftIndex + 1][rightIndex],
              table[leftIndex][rightIndex + 1],
            );
    }
  }

  const lines: DiffLine[] = [];
  let additions = 0;
  let removals = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    if (
      leftIndex < leftLines.length &&
      rightIndex < rightLines.length &&
      leftLines[leftIndex] === rightLines[rightIndex]
    ) {
      lines.push({
        kind: "equal",
        leftLine: leftIndex + 1,
        rightLine: rightIndex + 1,
        text: leftLines[leftIndex],
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    if (
      rightIndex < rightLines.length &&
      (leftIndex >= leftLines.length ||
        table[leftIndex][rightIndex + 1] >= table[leftIndex + 1][rightIndex])
    ) {
      lines.push({
        kind: "added",
        leftLine: null,
        rightLine: rightIndex + 1,
        text: rightLines[rightIndex],
      });
      additions += 1;
      rightIndex += 1;
      continue;
    }

    lines.push({
      kind: "removed",
      leftLine: leftIndex + 1,
      rightLine: null,
      text: leftLines[leftIndex],
    });
    removals += 1;
    leftIndex += 1;
  }

  return { lines, additions, removals };
}

function splitDiffLines(contents: string): string[] {
  const normalizedContents = normalizeTextLineEndings(contents, "lf");

  if (normalizedContents.length === 0) {
    return [""];
  }

  const lines = normalizedContents.split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function formatActiveDocumentMeta(
  stats: TextDocumentStats,
  tab: EditorTab,
  dirty: boolean,
  menuLanguage: MenuLanguage,
): string {
  return [
    ...formatDocumentMetaParts(stats, tab.name, menuLanguage),
    tab.large_file_warning
      ? menuLanguage === "ja"
        ? "大きなファイル"
        : "large file"
      : null,
    dirty
      ? menuLanguage === "ja"
        ? "未保存"
        : "unsaved"
      : menuLanguage === "ja"
        ? "保存済み"
        : "clean",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function formatDocumentMetaParts(
  stats: TextDocumentStats,
  fileName: string,
  menuLanguage: MenuLanguage,
): string[] {
  return [
    formatFileType(fileName, menuLanguage),
    "UTF-8",
    formatBytes(stats.bytes),
    menuLanguage === "ja"
      ? `${stats.characters.toLocaleString()} 文字`
      : `${stats.characters.toLocaleString()} chars`,
    formatLineEndingKind(stats.lineEnding, menuLanguage),
    stats.hasFinalNewline
      ? menuLanguage === "ja"
        ? "末尾改行あり"
        : "final newline"
      : menuLanguage === "ja"
        ? "末尾改行なし"
        : "no final newline",
  ];
}

function formatFileType(fileName: string, menuLanguage: MenuLanguage): string {
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
      return menuLanguage === "ja" ? "区切りテキスト" : "Delimited text";
    case "html":
    case "xml":
      return menuLanguage === "ja" ? "マークアップ" : "Markup";
    case "css":
      return "CSS";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "JavaScript";
    case "ts":
    case "tsx":
      return "TypeScript";
    case "ini":
    case "conf":
      return menuLanguage === "ja" ? "設定" : "Config";
    default:
      return extension
        ? extension.toUpperCase()
        : menuLanguage === "ja"
          ? "プレーンテキスト"
          : "Plain text";
  }
}

function isSupportedImageFile(path: string): boolean {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";

  return ["png", "jpg", "jpeg", "gif", "webp"].includes(extension);
}

function isComparableTextFile(path: string): boolean {
  const lowerName = fileNameFromPath(path).toLowerCase();
  const extension = lowerName.includes(".")
    ? lowerName.split(".").at(-1) ?? ""
    : "";

  if (
    [
      "md",
      "markdown",
      "mdown",
      "txt",
      "text",
      "log",
      "json",
      "jsonl",
      "yaml",
      "yml",
      "toml",
      "csv",
      "tsv",
      "css",
      "html",
      "xml",
      "ini",
      "conf",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "ts",
      "tsx",
    ].includes(extension)
  ) {
    return true;
  }

  return [
    ".editorconfig",
    ".env",
    ".gitignore",
    ".npmrc",
    "changelog",
    "license",
    "makefile",
    "readme",
    "todo",
  ].includes(lowerName);
}

function isMarkdownDocumentPath(path: string): boolean {
  const lowerName = fileNameFromPath(path).toLowerCase();
  const extension = lowerName.includes(".")
    ? lowerName.split(".").at(-1) ?? ""
    : "";

  return ["md", "markdown", "mdown"].includes(extension);
}

function resolveLocalMarkdownLinkTarget(
  href: string,
  sourcePath: string,
  workspaceRootPath: string,
): string | null {
  const trimmedHref = href.trim();

  if (
    !trimmedHref ||
    trimmedHref.startsWith("#") ||
    trimmedHref.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmedHref)
  ) {
    return null;
  }

  const hrefWithoutAnchor = trimmedHref.split("#", 1)[0] ?? "";
  const hrefPath = hrefWithoutAnchor.split("?", 1)[0]?.trim() ?? "";

  if (!hrefPath || hrefPath.startsWith("/")) {
    return null;
  }

  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(hrefPath);
  } catch {
    return null;
  }

  if (!decodedPath || decodedPath.includes("\0") || decodedPath.startsWith("/")) {
    return null;
  }

  const workspaceRoot = normalizeAbsolutePath(workspaceRootPath);
  const source = normalizeAbsolutePath(sourcePath);

  if (!isPathInsideDirectory(source, workspaceRoot)) {
    return null;
  }

  const sourceDirectory = directoryPathFromPath(source);
  const targetPath = normalizeAbsolutePath(`${sourceDirectory}/${decodedPath}`);

  if (!isPathInsideDirectory(targetPath, workspaceRoot)) {
    return null;
  }

  return targetPath;
}

function normalizeAbsolutePath(path: string): string {
  const parts: string[] = [];
  const isAbsolute = path.startsWith("/");

  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      if (parts.length === 0) {
        return isAbsolute ? "/" : "";
      }

      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return `${isAbsolute ? "/" : ""}${parts.join("/")}`;
}

function directoryPathFromPath(path: string): string {
  const normalized = normalizeAbsolutePath(path);
  const separatorIndex = normalized.lastIndexOf("/");

  if (separatorIndex <= 0) {
    return "/";
  }

  return normalized.slice(0, separatorIndex);
}

function isPathInsideDirectory(path: string, directoryPath: string): boolean {
  const normalizedPath = normalizeAbsolutePath(path);
  const normalizedDirectory = normalizeAbsolutePath(directoryPath);

  return (
    normalizedPath === normalizedDirectory ||
    normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

function formatLineEndingKind(
  lineEnding: LineEndingKind,
  menuLanguage: MenuLanguage = "en",
): string {
  if (lineEnding === "crlf") {
    return "CRLF";
  }

  if (lineEnding === "mixed") {
    return menuLanguage === "ja" ? "混在" : "Mixed";
  }

  if (lineEnding === "none") {
    return menuLanguage === "ja" ? "改行なし" : "No line endings";
  }

  return "LF";
}

function sameAgentWorkbenchSession(
  left: AgentWorkbenchSession | null,
  right: AgentWorkbenchSession | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.provider === right.provider &&
    left.workspaceRoot === right.workspaceRoot &&
    left.providerPath === right.providerPath &&
    left.createdAtMs === right.createdAtMs &&
    left.status === right.status &&
    left.runtime.status === right.runtime.status
  );
}

function markdownFormatStatus(format: MarkdownFormat): string {
  switch (format) {
    case "bold":
      return "Bold markup applied";
    case "italic":
      return "Italic markup applied";
    case "code":
      return "Inline code markup applied";
    case "link":
      return "Link markup inserted";
  }
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

function formatSelectionInfo(
  selection: EditorSelectionInfo,
  menuLanguage: MenuLanguage,
): string {
  const selectionText =
    selection.selectedCharacters > 0
      ? menuLanguage === "ja"
        ? ` · ${selection.selectedCharacters.toLocaleString()} 文字選択 / ${selection.selectedLines.toLocaleString()} 行`
        : ` · ${selection.selectedCharacters.toLocaleString()} selected / ${selection.selectedLines.toLocaleString()} lines`
      : "";

  return menuLanguage === "ja"
    ? `${selection.line.toLocaleString()} 行, ${selection.column.toLocaleString()} 列${selectionText}`
    : `Ln ${selection.line.toLocaleString()}, Col ${selection.column.toLocaleString()}${selectionText}`;
}

function formatActiveEditorStatusDetail(
  documentMeta: string,
  selection: EditorSelectionInfo,
  currentHeading: MarkdownHeading | null,
  menuLanguage: MenuLanguage,
): string {
  const parts = [documentMeta, formatSelectionInfo(selection, menuLanguage)];

  if (currentHeading) {
    parts.push(
      menuLanguage === "ja"
        ? `現在位置: § ${currentHeading.text}`
        : `Position: § ${currentHeading.text}`,
    );
  }

  return parts.join(" · ");
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

function fileNameFromPath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  const fileName = slashIndex === -1 ? path : path.slice(slashIndex + 1);

  return fileName || path;
}

function folderLabelFromPath(path: string): string {
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const slashIndex = normalizedPath.lastIndexOf("/");
  const folderName =
    slashIndex === -1 ? normalizedPath : normalizedPath.slice(slashIndex + 1);

  return folderName || normalizedPath || path;
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
