export interface RightPaneToggleCopy {
  agentTab: string;
  diffTab: string;
  outlineTab: string;
  previewTab: string;
  sidePaneMode: string;
}

export function RightPaneToggleControls({
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
  copy: RightPaneToggleCopy;
  diffActive: boolean;
  diffAvailable: boolean;
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
