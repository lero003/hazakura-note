import type { RecentEntry } from "../types";
import { buildRecentDisplayEntries } from "../utils";

export interface StartPanelCopy {
  newFile: string;
  openFile: string;
  openFolder: string;
  recentFiles: string;
  startHeading: string;
  startActions: string;
}

export function StartPanel({
  copy,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onOpenRecentFile,
  recentFiles,
}: {
  copy: StartPanelCopy;
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
