import type { RecentEntry } from "./types";
import { AGENT_WORKBENCH_PROVIDERS } from "./types";
import type { AgentWorkbenchProvider, AgentWorkbenchSession } from "./tauri";
import type { MenuLanguage } from "./types";
import type { EditableLineEnding, MarkdownHeading } from "./types";

// ── Recent Entries ──

export function parentFolderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);

  return parts.length >= 2 ? parts[parts.length - 2] : path;
}

export function buildRecentDisplayEntries(
  entries: RecentEntry[],
): Array<RecentEntry & { displayLabel: string }> {
  const labelCounts = new Map<string, number>();

  for (const entry of entries) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
  }

  return entries.map((entry) => ({
    ...entry,
    displayLabel:
      (labelCounts.get(entry.label) ?? 0) > 1
        ? `${entry.label} - ${parentFolderName(entry.path)}`
        : entry.label,
  }));
}

// ── Path Helpers ──

export function fileNameFromPath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  const fileName = slashIndex === -1 ? path : path.slice(slashIndex + 1);

  return fileName || path;
}

export function folderLabelFromPath(path: string): string {
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const slashIndex = normalizedPath.lastIndexOf("/");
  const folderName =
    slashIndex === -1 ? normalizedPath : normalizedPath.slice(slashIndex + 1);

  return folderName || normalizedPath || path;
}

export function suggestedNewFilePath(
  workspaceRootPath: string | null,
): string | null {
  return workspaceRootPath
    ? `${workspaceRootPath}/untitled.md`
    : "untitled.md";
}

export function suggestedSaveAsPath(path: string): string {
  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex === -1 ? "" : path.slice(0, slashIndex + 1);
  const fileName = slashIndex === -1 ? path : path.slice(slashIndex + 1);
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex <= 0) {
    return `${directory}${fileName}-copy`;
  }

  return `${directory}${fileName.slice(0, dotIndex)}-copy${fileName.slice(dotIndex)}`;
}

export function normalizeAbsolutePath(path: string): string {
  const parts: string[] = [];
  const isAbsolute = path.startsWith("/");

  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      if (parts.length === 0) {
        return isAbsolute ? "/" : "";
      }

      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return `${isAbsolute ? "/" : ""}${parts.join("/")}`;
}

export function directoryPathFromPath(path: string): string {
  const normalized = normalizeAbsolutePath(path);
  const separatorIndex = normalized.lastIndexOf("/");

  if (separatorIndex <= 0) {
    return "/";
  }

  return normalized.slice(0, separatorIndex);
}

export function isPathInsideDirectory(
  path: string,
  directoryPath: string,
): boolean {
  const normalizedPath = normalizeAbsolutePath(path);
  const normalizedDirectory = normalizeAbsolutePath(directoryPath);

  return (
    normalizedPath === normalizedDirectory ||
    normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

// ── Number Helpers ──

export function isSupportedImageFile(path: string): boolean {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";

  return ["png", "jpg", "jpeg", "gif", "webp"].includes(extension);
}


// ── Line Ending Helpers ──

export function normalizeTextLineEndings(
  contents: string,
  lineEnding: EditableLineEnding,
): string {
  const lfContents = contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (lineEnding === "lf") {
    return lfContents;
  }

  return lfContents.replace(/\n/g, "\r\n");
}


export function isMarkdownDocumentPath(path: string): boolean {
  const lowerName = fileNameFromPath(path).toLowerCase();
  const extension = lowerName.includes(".")
    ? lowerName.split(".").at(-1) ?? ""
    : "";

  return ["md", "markdown", "mdown"].includes(extension);
}

export function parseMarkdownHeadingLine(
  line: string,
  lineNumber: number,
): MarkdownHeading | null {
  const headingMatch = line.match(/^(#{1,6})[ \t]+(.+?)\s*$/);

  if (!headingMatch) {
    return null;
  }

  const text = headingMatch[2].replace(/[ \t]+#+[ \t]*$/, "").trim();

  if (!text) {
    return null;
  }

  return {
    level: headingMatch[1].length,
    line: lineNumber,
    text,
  };
}

export function findCurrentMarkdownHeading(
  headings: MarkdownHeading[],
  line: number,
): MarkdownHeading | null {
  let currentHeading: MarkdownHeading | null = null;

  for (const heading of headings) {
    if (heading.line > line) {
      break;
    }

    currentHeading = heading;
  }

  return currentHeading;
}

export function localizeCompareError(message: string): string {
  if (
    message.includes(
      "Compare stopped because these files are too large for the comparison preview.",
    )
  ) {
    return "ファイルが大きすぎるため、比較プレビューを停止しました。";
  }

  return message;
}

// ── Agent Helpers ──

export function providerLabel(provider: AgentWorkbenchProvider): string {
  return (
    AGENT_WORKBENCH_PROVIDERS.find((candidate) => candidate.id === provider)
      ?.label ?? provider
  );
}

export function isActiveAgentSession(
  session: AgentWorkbenchSession | null,
): boolean {
  return session?.status === "active";
}

export function agentSessionStateLabel(
  session: AgentWorkbenchSession | null,
  menuLanguage: MenuLanguage = "en",
): string {
  if (!session) {
    return menuLanguage === "ja" ? "未実行" : "Not running";
  }

  switch (session.status) {
    case "active":
      return menuLanguage === "ja" ? "実行中" : "Running";
    case "exited":
      return menuLanguage === "ja" ? "終了済み" : "Exited";
    case "stopped":
      return menuLanguage === "ja" ? "停止済み" : "Stopped";
  }
}

export function agentCompactSessionStateLabel(
  session: AgentWorkbenchSession | null,
  menuLanguage: MenuLanguage = "en",
): string {
  if (!session) {
    return menuLanguage === "ja" ? "待機中" : "Idle";
  }

  return agentSessionStateLabel(session, menuLanguage);
}

export function localizeAgentGateMessage(
  message: string,
  menuLanguage: MenuLanguage,
): string {
  if (menuLanguage !== "ja") {
    return message;
  }

  switch (message) {
    case "Launch gate not checked.":
      return "起動ゲートはまだ確認されていません。";
    case "Checking Agent Workbench launch gate...":
      return "エージェントワークベンチの起動ゲートを確認中です...";
    case "Agent session exited.":
      return "Agent セッションは終了しました。";
    case "Agent session stopped.":
      return "Agent セッションは停止しました。";
    case "Provider not found; no Agent session was started.":
      return "プロバイダーが見つからないため、Agent セッションは開始されませんでした。";
    case "Agent session running in the selected workspace. Only the selected allowlisted CLI was launched.":
      return "選択中のワークスペースで Agent セッションが実行中です。起動されたのは選択された allowlist 済み CLI だけです。";
    default:
      if (message.startsWith("Provider not found: ")) {
        return message
          .replace("Provider not found:", "プロバイダーが見つかりません:")
          .replace(
            " was not found in the app search path, including common Homebrew and user bin locations.",
            " はアプリの検索パス（一般的な Homebrew と user bin を含む）で見つかりませんでした。",
          );
      }

      return message;
  }
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(numberValue), min), max);
}

// ── General Helpers ──

export function isEditorKeyboardTarget(
  element: EventTarget | null,
): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  if (element.classList.contains("cm-editor")) {
    return true;
  }

  const parent = element.closest(".cm-editor");

  return parent !== null;
}

export function trapFocusInElement(
  element: HTMLElement | null,
  event: KeyboardEvent,
): void {
  if (!element) {
    return;
  }

  const focusableSelectors = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ];

  const focusableElements = Array.from(
    element.querySelectorAll<HTMLElement>(focusableSelectors.join(", ")),
  ).filter(
    (focusableElement) =>
      focusableElement.tabIndex >= 0 &&
      focusableElement.offsetParent !== null,
  );

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const currentIndex = focusableElements.indexOf(
    document.activeElement as HTMLElement,
  );
  const isShiftTab = event.shiftKey;

  if (isShiftTab && currentIndex <= 0) {
    event.preventDefault();
    focusableElements[focusableElements.length - 1].focus();
    return;
  }

  if (!isShiftTab && currentIndex >= focusableElements.length - 1) {
    event.preventDefault();
    focusableElements[0].focus();
    return;
  }
}
