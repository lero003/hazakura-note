import { useMemo } from "react";
import { renderMarkdown } from "../markdown";

type PreviewPaneProps = {
  source: string;
};

export default function PreviewPane({ source }: PreviewPaneProps) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  return (
    <article
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
