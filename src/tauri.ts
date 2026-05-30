import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  getCurrentWindow,
  type CloseRequestedEvent,
} from "@tauri-apps/api/window";

export type AppMenuRecentItem = {
  label: string;
};

export type AppMenuState = {
  hasActiveTab: boolean;
  activeDirty: boolean;
  previewVisible: boolean;
  wrapLines: boolean;
  showInvisibles: boolean;
  spellcheckEnabled: boolean;
  themePreference: "system" | "light" | "dark" | "sakura" | "yakou" | "shokou" | "kouyou";
  menuLanguage: "en" | "ja";
  recentFiles: AppMenuRecentItem[];
  recentFolders: AppMenuRecentItem[];
};

export type TextFileDocument = {
  path: string;
  name: string;
  contents: string;
  line_ending: "lf" | "crlf";
  size: number;
  modified_ms: number | null;
  fingerprint: string;
  large_file_warning: boolean;
};

export type SavedFileState = {
  path: string;
  line_ending: "lf" | "crlf";
  size: number;
  modified_ms: number | null;
  fingerprint: string;
};

export type FileMetadataState = {
  path: string;
  size: number;
  modified_ms: number | null;
  fingerprint: string;
  large_file_warning: boolean;
};

export type WorkspaceTreeEntry = {
  name: string;
  path: string;
  kind: "directory" | "file";
  children: WorkspaceTreeEntry[];
  children_loaded: boolean;
  children_truncated: boolean;
};

export type ImagePreviewDocument = {
  path: string;
  name: string;
  dataUrl: string;
  size: number;
};

export type AgentWorkbenchProvider = "codex" | "opencode" | "pi";

export type AgentWorkbenchPreflight = {
  provider: AgentWorkbenchProvider;
  workspaceRoot: string;
  providerAvailable: boolean;
  providerPath: string | null;
  launchImplemented: boolean;
};

export type AgentWorkbenchSessionStatus = "active" | "stopped" | "exited";

export type AgentRuntimeStatus = "running" | "stopped" | "exited";

export type AgentRuntimeHandle = {
  provider: AgentWorkbenchProvider;
  workspaceRoot: string;
  providerPath: string;
  status: AgentRuntimeStatus;
};

export type AgentWorkbenchOutputStream = "stdout" | "stderr" | "system";

export type AgentWorkbenchOutputChunk = {
  seq: number;
  stream: AgentWorkbenchOutputStream;
  text: string;
  receivedAtMs: number;
};

export type AgentWorkbenchSession = {
  provider: AgentWorkbenchProvider;
  workspaceRoot: string;
  providerPath: string;
  createdAtMs: number;
  status: AgentWorkbenchSessionStatus;
  runtime: AgentRuntimeHandle;
};

export type AgentWorkbenchSessionStartResult = {
  preflight: AgentWorkbenchPreflight;
  session: AgentWorkbenchSession | null;
  output: AgentWorkbenchOutputChunk[];
};

export type AgentWorkbenchSessionState = {
  session: AgentWorkbenchSession | null;
  output: AgentWorkbenchOutputChunk[];
};

export const OPENED_FILES_EVENT = "hazakura-note://opened-files";

const TEXT_FILE_EXTENSIONS = [
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
];

const TEXT_FILE_FILTERS = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown"],
  },
  {
    name: "Text",
    extensions: TEXT_FILE_EXTENSIONS,
  },
];

export async function pickMarkdownFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: TEXT_FILE_FILTERS,
  });

  return typeof selected === "string" ? selected : null;
}

export async function pickNewMarkdownFilePath(
  defaultPath: string | null,
): Promise<string | null> {
  const selected = await saveDialog({
    defaultPath: defaultPath ?? "untitled.md",
    filters: TEXT_FILE_FILTERS,
  });

  return typeof selected === "string"
    ? normalizeSelectedTextFilePath(selected)
    : null;
}

export async function pickSaveAsTextFilePath(
  defaultPath: string | null,
): Promise<string | null> {
  const selected = await saveDialog({
    defaultPath: defaultPath ?? "untitled-copy.md",
    filters: TEXT_FILE_FILTERS,
  });

  return typeof selected === "string"
    ? normalizeSelectedTextFilePath(selected)
    : null;
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
  });

  return typeof selected === "string" ? selected : null;
}

export async function confirmDiscardUnsavedChanges(): Promise<boolean> {
  return confirm(
    "The current file has unsaved changes. Discard them and open another file?",
    {
      title: "Unsaved changes",
      kind: "warning",
    },
  );
}

export async function closeCurrentWindow(): Promise<void> {
  await getCurrentWindow().close();
}

export async function requestAppRestart(): Promise<void> {
  if (!isTauriRuntime()) {
    window.location.reload();
    return;
  }

  await invoke("request_app_restart");
}

export async function setCurrentWindowTitle(title: string): Promise<void> {
  if (!isTauriRuntime()) {
    document.title = title;
    return;
  }

  await getCurrentWindow().setTitle(title);
}

export async function onCurrentWindowCloseRequested(
  handler: (event: CloseRequestedEvent) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  return getCurrentWindow().onCloseRequested(handler);
}

export async function openTextFile(path: string): Promise<TextFileDocument> {
  return invoke<TextFileDocument>("open_text_file", { path });
}

export async function revealPathInFileManager(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("reveal_path_in_file_manager", { path });
}

export async function drainOpenedFiles(): Promise<string[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  return invoke<string[]>("drain_opened_files");
}

export async function createTextFile(path: string): Promise<TextFileDocument> {
  return invoke<TextFileDocument>("create_text_file", { path });
}

export async function getFileMetadata(path: string): Promise<FileMetadataState> {
  return invoke<FileMetadataState>("get_file_metadata", { path });
}

export async function listWorkspaceTree(
  root: string,
): Promise<WorkspaceTreeEntry> {
  return invoke<WorkspaceTreeEntry>("list_workspace_tree", { root });
}

export async function listWorkspaceDirectory(
  root: string,
  directory: string,
): Promise<WorkspaceTreeEntry> {
  return invoke<WorkspaceTreeEntry>("list_workspace_directory", {
    root,
    directory,
  });
}

export async function openWorkspaceImage(
  root: string,
  path: string,
): Promise<ImagePreviewDocument> {
  return invoke<ImagePreviewDocument>("open_workspace_image", { root, path });
}

export async function saveTextFile(
  path: string,
  contents: string,
  expectedFingerprint: string,
  lineEnding: "lf" | "crlf",
): Promise<SavedFileState> {
  return invoke<SavedFileState>("save_text_file", {
    path,
    contents,
    expectedFingerprint,
    lineEnding,
  });
}

export async function saveTextFileAs(
  path: string,
  contents: string,
  lineEnding: "lf" | "crlf",
): Promise<TextFileDocument> {
  return invoke<TextFileDocument>("save_text_file_as", {
    path,
    contents,
    lineEnding,
  });
}

export async function startAgentWorkbenchSession(
  agentWorkbenchEnabled: boolean,
  consentAcknowledged: boolean,
  provider: AgentWorkbenchProvider,
  workspaceRoot: string,
  terminalColumns?: number,
  terminalRows?: number,
): Promise<AgentWorkbenchSessionStartResult> {
  return invoke<AgentWorkbenchSessionStartResult>("start_agent_workbench_session", {
    agentWorkbenchEnabled,
    consentAcknowledged,
    provider,
    workspaceRoot,
    terminalColumns,
    terminalRows,
  });
}

export async function stopAgentWorkbenchSession(): Promise<AgentWorkbenchSessionState> {
  return invoke<AgentWorkbenchSessionState>("stop_agent_workbench_session");
}

export async function getAgentWorkbenchSessionState(): Promise<AgentWorkbenchSessionState> {
  if (!isTauriRuntime()) {
    return { session: null, output: [] };
  }

  return invoke<AgentWorkbenchSessionState>(
    "get_agent_workbench_session_state",
  );
}

export async function writeAgentWorkbenchSessionInput(
  input: string,
): Promise<void> {
  return invoke<void>("write_agent_workbench_session_input", {
    input,
  });
}

export async function resizeAgentWorkbenchTerminal(
  columns: number,
  rows: number,
): Promise<AgentWorkbenchSessionState> {
  return invoke<AgentWorkbenchSessionState>("resize_agent_workbench_terminal", {
    columns,
    rows,
  });
}

export async function updateAppMenuState(state: AppMenuState): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("update_app_menu_state", { state });
}

export async function updateThemeMenuState(
  themePreference: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("update_theme_menu_state", { themePreference });
}

function normalizeSelectedTextFilePath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex === -1 ? "" : path.slice(0, slashIndex + 1);
  const fileName = slashIndex === -1 ? path : path.slice(slashIndex + 1);
  const segments = fileName.split(".");

  if (segments.length < 3) {
    return path;
  }

  const finalExtension = segments.at(-1)?.toLowerCase() ?? "";
  const typedExtension = segments.at(-2)?.toLowerCase() ?? "";

  if (
    TEXT_FILE_EXTENSIONS.includes(finalExtension) &&
    TEXT_FILE_EXTENSIONS.includes(typedExtension)
  ) {
    return `${directory}${segments.slice(0, -1).join(".")}`;
  }

  return path;
}

export function isTauriRuntime(): boolean {
  return Boolean(
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}
