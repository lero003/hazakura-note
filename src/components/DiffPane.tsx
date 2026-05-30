import type { CompareViewState, DiffLine, DiffSplitCell, DiffSplitRow, DiffDisplayRow, MarkdownHeading, MenuLanguage } from "../types";
import {
  findCurrentMarkdownHeading,
  isMarkdownDocumentPath,
  normalizeTextLineEndings,
  parseMarkdownHeadingLine,
} from "../utils";
import { DIFF_MAX_LINE_PRODUCT } from "../types";

export function DiffPane({
  menuLanguage,
  onClose,
  view,
}: {
  menuLanguage: MenuLanguage;
  onClose: () => void;
  view: CompareViewState;
}) {
  const rows = buildDiffDisplayRows(
    view,
    buildSplitDiffRows(view.lines),
    menuLanguage,
  );
  const labels =
    menuLanguage === "ja"
      ? {
          additions: "追加行",
          changesTitle: "変更確認",
          close: "閉じる",
          empty: "差分はありません",
          fileTitle: "Diff",
          removed: "削除行",
          summary: "比較の概要",
          to: "と",
          table: "ファイル比較",
          sourceColumn: "比較元",
          targetColumn: "比較先",
          textColumn: "内容",
        }
      : {
          additions: "Added lines",
          changesTitle: "Change review",
          close: "Close",
          empty: "No differences",
          fileTitle: "Diff",
          removed: "Removed lines",
          summary: "Comparison summary",
          to: "to",
          table: "File comparison",
          sourceColumn: "Source",
          targetColumn: "Target",
          textColumn: "Text",
        };

  return (
    <div className="diff-pane">
      <div className="diff-header">
        <div className="diff-title">
          <span>
            {view.kind === "changes" ? labels.changesTitle : labels.fileTitle}
          </span>
          <strong>
            <span title={view.leftPath}>{view.leftName}</span>
            <span aria-hidden="true">{labels.to}</span>
            <span title={view.rightPath}>{view.rightName}</span>
          </strong>
        </div>
        <div className="diff-summary" aria-label={labels.summary}>
          <span className="diff-added" title={labels.additions}>
            +{view.additions}
          </span>
          <span className="diff-removed" title={labels.removed}>
            -{view.removals}
          </span>
          <button type="button" onClick={onClose}>
            {labels.close}
          </button>
        </div>
      </div>
      <div className="diff-table" role="table" aria-label={labels.table}>
        <div className="diff-split-row diff-row-header" role="row">
          <span className="diff-line-number" role="columnheader" />
          <span className="diff-text-column" role="columnheader">
            {view.leftColumnLabel ?? labels.sourceColumn}
          </span>
          <span className="diff-line-number" role="columnheader" />
          <span className="diff-text-column" role="columnheader">
            {view.rightColumnLabel ?? labels.targetColumn}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="diff-empty">{labels.empty}</div>
        ) : (
          rows.map((displayRow) =>
            displayRow.kind === "section" ? (
              <div
                className="diff-section-row"
                key={displayRow.key}
                role="row"
              >
                <span role="cell">{displayRow.label}</span>
              </div>
            ) : (
              <div
                className={`diff-split-row ${displayRow.row.kind}`}
                key={displayRow.key}
                role="row"
              >
                <span className={`diff-line-number ${displayRow.row.left.kind}`}>
                  {displayRow.row.left.line ?? ""}
                </span>
                <code className={`diff-cell ${displayRow.row.left.kind}`}>
                  {displayRow.row.left.kind === "removed" ? (
                    <span className="diff-cell-marker" aria-hidden="true">
                      -
                    </span>
                  ) : null}
                  {displayRow.row.left.text || " "}
                </code>
                <span className={`diff-line-number ${displayRow.row.right.kind}`}>
                  {displayRow.row.right.line ?? ""}
                </span>
                <code className={`diff-cell ${displayRow.row.right.kind}`}>
                  {displayRow.row.right.kind === "added" ? (
                    <span className="diff-cell-marker" aria-hidden="true">
                      +
                    </span>
                  ) : null}
                  {displayRow.row.right.text || " "}
                </code>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}

function buildSplitDiffRows(lines: DiffLine[]): DiffSplitRow[] {
  const rows: DiffSplitRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === "equal") {
      rows.push({
        kind: "equal",
        left: {
          kind: "equal",
          line: line.leftLine,
          text: line.text,
        },
        right: {
          kind: "equal",
          line: line.rightLine,
          text: line.text,
        },
      });
      index += 1;
      continue;
    }

    const removedLines: DiffLine[] = [];
    const addedLines: DiffLine[] = [];

    while (index < lines.length && lines[index].kind !== "equal") {
      if (lines[index].kind === "removed") {
        removedLines.push(lines[index]);
      } else {
        addedLines.push(lines[index]);
      }
      index += 1;
    }

    const rowCount = Math.max(removedLines.length, addedLines.length);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const removed = removedLines[rowIndex];
      const added = addedLines[rowIndex];

      rows.push({
        kind:
          removed && added
            ? "changed"
            : removed
              ? "removed"
              : "added",
        left: removed
          ? {
              kind: "removed",
              line: removed.leftLine,
              text: removed.text,
            }
          : {
              kind: "blank",
              line: null,
              text: "",
            },
        right: added
          ? {
              kind: "added",
              line: added.rightLine,
              text: added.text,
            }
          : {
              kind: "blank",
              line: null,
              text: "",
            },
      });
    }
  }

  return rows;
}

function buildDiffDisplayRows(
  view: CompareViewState,
  rows: DiffSplitRow[],
  menuLanguage: MenuLanguage,
): DiffDisplayRow[] {
  if (
    !isMarkdownDocumentPath(view.leftPath) &&
    !isMarkdownDocumentPath(view.rightPath)
  ) {
    return rows.map((row, index) => ({
      kind: "line",
      key: diffRowKey(row, index),
      row,
    }));
  }

  const leftHeadings = collectDiffSideMarkdownHeadings(view.lines, "left");
  const rightHeadings = collectDiffSideMarkdownHeadings(view.lines, "right");
  const displayRows: DiffDisplayRow[] = [];
  let inChangedBlock = false;

  rows.forEach((row, index) => {
    if (row.kind === "equal") {
      inChangedBlock = false;
      displayRows.push({
        kind: "line",
        key: diffRowKey(row, index),
        row,
      });
      return;
    }

    if (!inChangedBlock) {
      const label = formatDiffSectionContext(
        row,
        leftHeadings,
        rightHeadings,
        menuLanguage,
      );

      if (label) {
        displayRows.push({
          kind: "section",
          key: `section-${index}-${row.left.line ?? "x"}-${row.right.line ?? "x"}`,
          label,
        });
      }

      inChangedBlock = true;
    }

    displayRows.push({
      kind: "line",
      key: diffRowKey(row, index),
      row,
    });
  });

  return displayRows;
}

function diffRowKey(row: DiffSplitRow, index: number): string {
  return `${row.kind}-${index}-${row.left.line ?? "x"}-${row.right.line ?? "x"}`;
}

function collectDiffSideMarkdownHeadings(
  lines: DiffLine[],
  side: "left" | "right",
): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fenceMarker: "`" | "~" | null = null;

  for (const line of lines) {
    const lineNumber = side === "left" ? line.leftLine : line.rightLine;

    if (lineNumber === null) {
      continue;
    }

    const trimmedStart = line.text.trimStart();
    const fenceMatch = trimmedStart.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith("`") ? "`" : "~";

      if (fenceMarker === marker) {
        fenceMarker = null;
      } else if (fenceMarker === null) {
        fenceMarker = marker;
      }

      continue;
    }

    if (fenceMarker !== null) {
      continue;
    }

    const heading = parseMarkdownHeadingLine(line.text, lineNumber);

    if (heading) {
      headings.push(heading);
    }
  }

  return headings;
}

function formatDiffSectionContext(
  row: DiffSplitRow,
  leftHeadings: MarkdownHeading[],
  rightHeadings: MarkdownHeading[],
  menuLanguage: MenuLanguage,
): string | null {
  const leftHeading = row.left.line
    ? findCurrentMarkdownHeading(leftHeadings, row.left.line)
    : null;
  const rightHeading = row.right.line
    ? findCurrentMarkdownHeading(rightHeadings, row.right.line)
    : null;

  if (!leftHeading && !rightHeading) {
    return null;
  }

  const leftText = leftHeading?.text ?? null;
  const rightText = rightHeading?.text ?? null;

  if (leftText && rightText && leftText !== rightText) {
    return menuLanguage === "ja"
      ? `変更位置: 比較元 § ${leftText} / 比較先 § ${rightText}`
      : `Changed in: source § ${leftText} / target § ${rightText}`;
  }

  return menuLanguage === "ja"
    ? `変更位置: § ${leftText ?? rightText}`
    : `Changed in: § ${leftText ?? rightText}`;
}



