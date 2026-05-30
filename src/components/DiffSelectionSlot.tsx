export function DiffSelectionSlot({
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
