import DOMPurify from "dompurify";
import { marked } from "marked";
import { convertFileSrc } from "@tauri-apps/api/core";

marked.use({
  gfm: true,
  breaks: false,
});

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
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
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

    const assetUrl = workspaceAssetImageUrl(src, workspaceRoot);
    if (assetUrl) {
      image.setAttribute("src", assetUrl);
      image.removeAttribute("srcset");
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      continue;
    }

    const replacement = document.createElement("span");
    const alt = image.getAttribute("alt")?.trim();
    replacement.className = "blocked-image";
    replacement.setAttribute("role", "note");
    replacement.textContent = alt
      ? `Image blocked: ${alt}`
      : "Image blocked: external and local image loading is disabled.";
    image.replaceWith(replacement);
  }

  return template.innerHTML;
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

function workspaceAssetImageUrl(
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

  const match = /^assets\//i.exec(decodedSrc);
  if (!match) {
    return null;
  }

  const relativePath = decodedSrc.slice(match[0].length);
  if (!relativePath || relativePath.startsWith("..")) {
    return null;
  }

  const absolutePath = `${workspaceRoot.replace(/\/+$/, "")}/assets/${relativePath}`;

  if (
    typeof window !== "undefined" &&
    (window as { __TAURI_INTERNALS__?: { convertFileSrc?: unknown } })
      .__TAURI_INTERNALS__?.convertFileSrc
  ) {
    return convertFileSrc(absolutePath);
  }

  // Fallback: encode each path segment individually for asset:// URL
  const segments = absolutePath.split("/").map(encodeURIComponent);
  return `asset://localhost/${segments.join("/")}`;
}
