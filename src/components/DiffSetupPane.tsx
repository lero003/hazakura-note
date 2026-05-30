import type { CompareAnchor, MenuLanguage } from "../types";
import { DiffSelectionSlot } from "./DiffSelectionSlot";

export function DiffSetupPane({
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
