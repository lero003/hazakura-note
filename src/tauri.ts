import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  getCurrentWindow,
  type CloseRequestedEvent,
} from "@tauri-apps/api/window";

export type TextFileDocument = {
  path: string;
  name: string;
  contents: string;
  size: number;
  modified_ms: number | null;
  fingerprint: string;
  large_file_warning: boolean;
};

export type SavedFileState = {
  path: string;
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
};

export async function pickMarkdownFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Text",
        extensions: [
          "md",
          "markdown",
          "mdown",
          "txt",
          "json",
          "yaml",
          "yml",
          "toml",
          "css",
          "html",
        ],
      },
    ],
  });

  return typeof selected === "string" ? selected : null;
}

export async function pickNewMarkdownFilePath(
  defaultPath: string | null,
): Promise<string | null> {
  const selected = await saveDialog({
    defaultPath: defaultPath ?? "untitled.md",
    filters: [
      {
        name: "Markdown",
        extensions: ["md", "markdown"],
      },
      {
        name: "Text",
        extensions: ["txt", "json", "yaml", "yml", "toml", "css", "html"],
      },
    ],
  });

  return typeof selected === "string" ? selected : null;
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

export async function onCurrentWindowCloseRequested(
  handler: (event: CloseRequestedEvent) => void | Promise<void>,
): Promise<() => void> {
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

export async function saveTextFile(
  path: string,
  contents: string,
  expectedFingerprint: string,
): Promise<SavedFileState> {
  return invoke<SavedFileState>("save_text_file", {
    path,
    contents,
    expectedFingerprint,
  });
}
