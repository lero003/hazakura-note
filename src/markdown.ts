import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: false,
});

const WORKSPACE_ASSET_PATH_ATTR = "data-hazakura-asset-path";
const TRANSPARENT_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export function renderMarkdown(
  source: string,
  options?: { workspaceRoot?: string | null },
): string {
  const rawHtml = marked.parse(source, { async: false }) as string;
  const imageBoundedHtml = applyImagePreviewPolicy(
    rawHtml,
    options?.workspaceRoot ?? null,
  );
  const tableBoundedHtml = applyTablePreviewPolicy(imageBoundedHtml);

  return DOMPurify.sanitize(tableBoundedHtml, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

export async function inlineWorkspaceAssetImages(
  html: string,
  loadImageDataUrl: (absolutePath: string) => Promise<string>,
): Promise<string> {
  if (!html.includes(WORKSPACE_ASSET_PATH_ATTR)) {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const image of Array.from(
    template.content.querySelectorAll(`img[${WORKSPACE_ASSET_PATH_ATTR}]`),
  )) {
    const path = image.getAttribute(WORKSPACE_ASSET_PATH_ATTR);
    if (!path) {
      continue;
    }

    try {
      const dataUrl = await loadImageDataUrl(path);
      image.setAttribute("src", dataUrl);
      image.removeAttribute(WORKSPACE_ASSET_PATH_ATTR);
    } catch {
      image.replaceWith(blockedImageMessage(image.getAttribute("alt")?.trim()));
    }
  }

  return template.innerHTML;
}

function applyImagePreviewPolicy(
  html: string,
  workspaceRoot: string | null,
): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    const src = image.getAttribute("src")?.trim() ?? "";

    if (isAllowedEmbeddedImageSource(src)) {
      image.removeAttribute("srcset");
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      continue;
    }

    const assetPath = workspaceAssetImagePath(src, workspaceRoot);
    if (assetPath) {
      image.setAttribute("src", TRANSPARENT_IMAGE_SRC);
      image.setAttribute(WORKSPACE_ASSET_PATH_ATTR, assetPath);
      image.removeAttribute("srcset");
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      continue;
    }

    image.replaceWith(blockedImageMessage(image.getAttribute("alt")?.trim()));
  }

  return template.innerHTML;
}

function blockedImageMessage(alt?: string | null): HTMLSpanElement {
  const replacement = document.createElement("span");
  replacement.className = "blocked-image";
  replacement.setAttribute("role", "note");
  replacement.textContent = alt
    ? `Image blocked: ${alt}`
    : "Image blocked: external and local image loading is disabled.";
  return replacement;
}

function applyTablePreviewPolicy(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const table of Array.from(template.content.querySelectorAll("table"))) {
    if (table.parentElement?.classList.contains("markdown-table-frame")) {
      continue;
    }

    const frame = document.createElement("div");
    frame.className = "markdown-table-frame";
    frame.setAttribute("role", "region");
    frame.setAttribute("aria-label", "Markdown table");
    table.replaceWith(frame);
    frame.append(table);
  }

  return template.innerHTML;
}

function isAllowedEmbeddedImageSource(src: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src);
}

function workspaceAssetImagePath(
  src: string,
  workspaceRoot: string | null,
): string | null {
  if (!workspaceRoot) {
    return null;
  }

  let decodedSrc: string;
  try {
    decodedSrc = decodeURIComponent(src);
  } catch {
    return null;
  }

  const match = /^(?:\.\/|\/)?assets\//i.exec(decodedSrc);
  if (!match) {
    return null;
  }

  const relativePath = decodedSrc.slice(match[0].length);
  if (
    !relativePath ||
    relativePath.startsWith(".") ||
    relativePath.includes("..") ||
    relativePath.includes("\\")
  ) {
    return null;
  }

  return `${workspaceRoot.replace(/\/+$/, "")}/assets/${relativePath}`;
}
