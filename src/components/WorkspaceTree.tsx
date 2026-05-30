import {
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  useState,
} from "react";
import type { WorkspaceTreeEntry } from "../tauri";
import { isSupportedImageFile } from "../utils";
import {
  ChevronIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageFileIcon,
  MarkdownFileIcon,
  TextFileIcon,
} from "./Icons";

function startWorkspacePathDrag(
  event: ReactDragEvent<HTMLButtonElement>,
  entry: WorkspaceTreeEntry,
) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", entry.path);
  event.dataTransfer.setData(
    "application/x-hazakura-workspace-path",
    entry.path,
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
    const isMarkdown =
      entry.name.toLowerCase().endsWith(".md") ||
      entry.name.toLowerCase().endsWith(".markdown");
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

export function WorkspaceTree({
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
