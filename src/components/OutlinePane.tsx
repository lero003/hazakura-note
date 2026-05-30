import type { MarkdownHeading } from "../types";

export interface OutlinePaneCopy {
  documentOutline: string;
  outlineEmpty: string;
  outlineTruncated: string;
}

export function OutlinePane({
  copy,
  currentHeadingLine,
  headings,
  onSelect,
  truncated,
}: {
  copy: OutlinePaneCopy;
  currentHeadingLine: number | null;
  headings: MarkdownHeading[];
  onSelect: (heading: MarkdownHeading) => void;
  truncated: boolean;
}) {
  return (
    <div className="outline-pane">
      <div className="outline-pane-header">
        <span>{copy.documentOutline}</span>
      </div>
      {headings.length > 0 ? (
        <>
          <div className="outline-list">
            {headings.map((heading) => (
              <button
                aria-current={
                  heading.line === currentHeadingLine ? "location" : undefined
                }
                className={`outline-item${heading.line === currentHeadingLine ? " current" : ""}`}
                key={`${heading.line}-${heading.text}`}
                onClick={() => onSelect(heading)}
                style={{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }}
                title={`${heading.line}: ${heading.text}`}
                type="button"
              >
                <span className="outline-line">{heading.line}</span>
                <span className="outline-text">{heading.text}</span>
              </button>
            ))}
          </div>
          {truncated ? (
            <div className="outline-truncated" role="note">
              {copy.outlineTruncated}
            </div>
          ) : null}
        </>
      ) : (
        <div className="outline-empty">{copy.outlineEmpty}</div>
      )}
    </div>
  );
}
