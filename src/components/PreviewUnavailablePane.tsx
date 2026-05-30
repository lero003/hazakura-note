export function PreviewUnavailablePane({
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
