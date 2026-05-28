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
  themePreference: "system" | "light" | "dark" | "sakura";
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

export type AgentWorkbenchProvider = "codex" | "opencode";

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
): Promise<void> {
  await invoke("start_agent_workbench_session", {
    agentWorkbenchEnabled,
    consentAcknowledged,
    provider,
    workspaceRoot,
  });
}

export async function updateAppMenuState(state: AppMenuState): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("update_app_menu_state", { state });
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

function isTauriRuntime(): boolean {
  return Boolean(
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}
