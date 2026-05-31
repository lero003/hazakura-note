import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { inlineWorkspaceAssetImages, renderMarkdown } from "../markdown";
import { openWorkspaceImage } from "../tauri";

type PreviewPaneProps = {
  onOpenLocalLink?: (href: string) => void;
  source: string;
  workspaceRoot?: string | null;
};

export default function PreviewPane({
  onOpenLocalLink,
  source,
  workspaceRoot,
}: PreviewPaneProps) {
  const renderedHtml = useMemo(
    () => renderMarkdown(source, { workspaceRoot }),
    [source, workspaceRoot],
  );
  const [html, setHtml] = useState(renderedHtml);

  useEffect(() => {
    let cancelled = false;
    setHtml(renderedHtml);

    if (!workspaceRoot) {
      return () => {
        cancelled = true;
      };
    }

    void inlineWorkspaceAssetImages(renderedHtml, async (path) => {
      const image = await openWorkspaceImage(workspaceRoot, path);
      return image.dataUrl;
    }).then((nextHtml) => {
      if (!cancelled) {
        setHtml(nextHtml);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [renderedHtml, workspaceRoot]);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!onOpenLocalLink) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest("a[href]");

    if (!link || !event.currentTarget.contains(link)) {
      return;
    }

    const href = link.getAttribute("href")?.trim() ?? "";

    event.preventDefault();
    onOpenLocalLink(href);
  };

  return (
    <article
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}
