import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(
  source: string,
  options?: { workspaceRoot?: string | null },
): string {
  const rawHtml = marked.parse(source, { async: false }) as string;
  const imageBoundedHtml = applyImagePreviewPolicy(rawHtml, options?.workspaceRoot ?? null);
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

    // Allow workspace-relative assets/ images; convert to asset:// URL
    if (workspaceRoot && src.startsWith("assets/")) {
      const absolutePath = workspaceRoot.replace(/\/+$/, "") + "/" + src;
      image.setAttribute("src", `asset://localhost/${absolutePath}`);
      image.removeAttribute("srcset");
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      continue;
    }

    // Also allow explicit asset:// URLs (for already-resolved paths)
    if (src.startsWith("asset://") || src.startsWith("http://asset.localhost/")) {
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
