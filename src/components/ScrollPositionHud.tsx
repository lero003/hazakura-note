import type { MarkdownHeadingContext } from "../types";
import type { MenuLanguage } from "../types";

export function ScrollPositionHud({
  context,
  line,
  menuLanguage,
  totalLines,
}: {
  context: MarkdownHeadingContext;
  line: number;
  menuLanguage: MenuLanguage;
  totalLines: number;
}) {
  const progress =
    totalLines <= 1 ? 0 : Math.round(((line - 1) / (totalLines - 1)) * 100);
  const meta =
    menuLanguage === "ja"
      ? `${line.toLocaleString()} / ${totalLines.toLocaleString()} 行 · ${progress}%`
      : `${line.toLocaleString()} / ${totalLines.toLocaleString()} lines · ${progress}%`;

  return (
    <div className="scroll-position-hud" aria-hidden="true">
      {context.previous ? (
        <div className="scroll-position-hud-neighbor">
          {context.previous.text}
        </div>
      ) : null}
      <div className="scroll-position-hud-current">
        <span>§</span>
        <strong>{context.current?.text}</strong>
      </div>
      {context.next ? (
        <div className="scroll-position-hud-neighbor next">
          {context.next.text}
        </div>
      ) : null}
      <div className="scroll-position-hud-meta">{meta}</div>
    </div>
  );
}
