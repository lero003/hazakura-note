import type {
  AgentWorkbenchPreflight,
  AgentWorkbenchProvider,
  TextFileDocument,
} from "./tauri";

// ── Storage Keys ──

export const THEME_STORAGE_KEY = "hazakura-note-theme";
export const WORKSPACE_STATE_STORAGE_KEY = "hazakura-note-workspace-state";
export const PREVIEW_VISIBLE_STORAGE_KEY = "hazakura-note-preview-visible";
export const EDITOR_SETTINGS_STORAGE_KEY = "hazakura-note-editor-settings";
export const MENU_LANGUAGE_STORAGE_KEY = "hazakura-note-menu-language";
export const DRAFT_STATE_STORAGE_KEY = "hazakura-note-unsaved-drafts";
export const RECENT_FILES_STORAGE_KEY = "hazakura-note-recent-files";
export const RECENT_FOLDERS_STORAGE_KEY = "hazakura-note-recent-folders";
export const AGENT_WORKBENCH_ENABLED_STORAGE_KEY =
  "hazakura-note-agent-workbench-enabled";
export const AGENT_WORKBENCH_CONSENT_STORAGE_KEY =
  "hazakura-note-agent-workbench-consent";
export const AGENT_WORKBENCH_PROVIDER_STORAGE_KEY =
  "hazakura-note-agent-workbench-provider";

// ── App Constants ──

export const APP_MENU_ACTION_EVENT = "hazakura-note://menu-action";
export const AGENT_WORKBENCH_MAX_OUTPUT_CHUNKS = 500;
export const AGENT_WORKBENCH_SESSION_POLL_MS = 200;
export const EXTERNAL_CHANGE_ACTIVE_POLL_MS = 1000;
export const MAX_RESTORED_TABS = 12;
export const MAX_STORED_DRAFTS = 20;
export const MAX_RECENT_ITEMS = 8;
export const SCROLL_SYNC_TOLERANCE_PX = 10;
export const DEFAULT_PREVIEW_COLUMN_PERCENT = 42;
export const MIN_PREVIEW_COLUMN_PERCENT = 25;
export const MAX_PREVIEW_COLUMN_PERCENT = 75;
export const DIFF_MAX_LINE_PRODUCT = 1_000_000;
export const MARKDOWN_OUTLINE_MAX_HEADINGS = 200;

export const EXTERNAL_CHANGE_CONFLICT_MESSAGE =
  "The file changed on disk, possibly from another app or Agent provider. Saving is stopped until you choose how to continue.";

export const AGENT_WORKBENCH_PROVIDERS: Array<{
  id: AgentWorkbenchProvider;
  label: string;
}> = [
  { id: "codex", label: "Codex CLI" },
  { id: "opencode", label: "OpenCode CLI" },
  { id: "pi", label: "Pi CLI" },
];

// ── Core Types ──

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export type BaseTheme = "light" | "dark";

export type ThemePreference =
  | "system"
  | BaseTheme
  | "sakura"
  | "yakou"
  | "shokou"
  | "kouyou";

export type ResolvedTheme =
  | BaseTheme
  | "sakura"
  | "yakou"
  | "shokou"
  | "kouyou";

export type EditableLineEnding = "lf" | "crlf";

export type LineEndingKind = EditableLineEnding | "mixed" | "none";

export type RightPaneMode = "preview" | "compare" | "outline" | "agent";

export type MenuLanguage = "en" | "ja";

export type PreferencesDialogMode = "settings" | "agent";

// ── Document Types ──

export type MarkdownHeading = {
  level: number;
  line: number;
  text: string;
};

export type MarkdownOutline = {
  headings: MarkdownHeading[];
  truncated: boolean;
};

export type MarkdownHeadingContext = {
  previous: MarkdownHeading | null;
  current: MarkdownHeading | null;
  next: MarkdownHeading | null;
};

// ── Agent Types ──

export type AgentLaunchGateState = {
  kind: "idle" | "checking" | "passed" | "rejected";
  message: string;
  preflight: AgentWorkbenchPreflight | null;
};

export type AgentTerminalSize = {
  columns: number;
  rows: number;
};

// ── Editor Types ──

export type EditorTab = TextFileDocument & {
  id: string;
  contents: string;
  lastSavedContents: string;
  lastSavedLineEnding: EditableLineEnding;
  ignoredExternalFingerprint: string | null;
  externalFingerprint: string | null;
  saveStatus: SaveStatus;
  error: string | null;
};

export type PersistedWorkspaceState = {
  workspaceRootPath: string | null;
  tabPaths: string[];
  activeTabPath: string | null;
};

export type TextMatch = {
  from: number;
  to: number;
};

export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

export type EditorSettings = {
  wrapLines: boolean;
  showInvisibles: boolean;
  fontSize: number;
  tabSize: number;
  spellcheckEnabled: boolean;
};

export type DraftRecord = {
  path: string;
  contents: string;
  line_ending: EditableLineEnding;
  savedFingerprint: string;
  updatedAt: number;
};

export type RecentEntry = {
  path: string;
  label: string;
  openedAt: number;
};

export type TextDocumentStats = {
  bytes: number;
  characters: number;
  lineEnding: LineEndingKind;
  hasFinalNewline: boolean;
};

export type ImagePreviewState = {
  path: string;
  name: string;
  url: string;
  size: number;
};

// ── Compare / Diff Types ──

export type CompareAnchor = {
  path: string;
  name: string;
};

export type WorkspaceContextMenuState = CompareAnchor & {
  x: number;
  y: number;
  canCompare: boolean;
};

export type DiffLine = {
  kind: "equal" | "added" | "removed";
  leftLine: number | null;
  rightLine: number | null;
  text: string;
};

export type DiffSplitCell = {
  kind: "equal" | "added" | "removed" | "blank";
  line: number | null;
  text: string;
};

export type DiffSplitRow = {
  kind: "equal" | "added" | "removed" | "changed";
  left: DiffSplitCell;
  right: DiffSplitCell;
};

export type DiffDisplayRow =
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

export type CompareViewState = {
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
