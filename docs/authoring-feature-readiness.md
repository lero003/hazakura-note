# Markdown Authoring Feature Readiness

Status: Draft
Scope: Incomplete Markdown authoring, export, and Agent-adjacent feature work
Authority: Medium
Last reviewed: 2026-05-31

## Purpose

This document separates implemented behavior from feature-shaped stubs that are not ready to claim in a release.

Do not use this backlog to widen the product boundary. The app remains a Markdown-first safe editor. Agent Workbench remains a separate explicit trust boundary.

## Current Verdict

| Area | Current reality | Not ready yet | First ready slice |
| --- | --- | --- | --- |
| Image paste | Clipboard image paste can call `save_pasted_image`, write supported image bytes into workspace `assets/`, and insert Markdown. | Inserted `assets/...` images are still blocked by Markdown preview/export image policy. Drag-and-drop images do not copy into `assets/`. Alt text, visible error/status, and smoke coverage are incomplete. | Make workspace-relative `assets/...` image refs render safely in preview and exported HTML, scoped to the selected workspace and active document. |
| PDF / HTML export | File menu entries exist. HTML export writes standalone HTML through a save dialog. PDF export calls `window.print()`. | Exported HTML uses the same image policy, so pasted `assets/...` images are blocked. CSS is only partial, not "preview exactly". PDF has no explicit app-level output path and depends on the system print dialog. Smoke checklist coverage is missing. | Tighten HTML export parity with preview, then document PDF as "Print to PDF" unless a real PDF pipeline is chosen. |
| Zen mode | View menu toggle, shortcut, CSS class, and Escape exit exist. | Release docs and smoke checklist do not describe the behavior. Menu state after Escape and focus return need smoke. | Add/execute a small Zen smoke section and only fix behavior found by that smoke. |
| Spellcheck | CodeMirror content gets `spellcheck=true/false` through the View menu toggle. | This is WebView/browser spellcheck wiring, not a macOS `NSSpellChecker` command path. Suggestions, language control, and context menu are not implemented. Smoke coverage is missing. | Decide the MVP is WebView spellcheck, document that boundary, and add a smoke path. |
| Table editing | Toolbar and shortcut can insert a fixed 3-column Markdown table. Preview table styling exists. | There is no WYSIWYG-like table editor, right-click row/column add/delete, or alignment editing. | Treat current behavior as "Insert table" only; add row/column/alignment commands in later narrow slices if still desired. |
| Agent Workbench authoring actions | Agent Workbench can run one allowlisted provider and can send a workspace file path to the active provider. Diff/review exists separately. | There are no selection-range actions for summarize/proofread/translate, no captured candidate result, and no selection-to-diff apply flow. | Start with a context-helper only: send selected text plus an explicit instruction to the running Agent session, without auto-apply. True inline assistance needs a separate diff/apply design review first. |

## Recommended Order

1. Complete image paste by making pasted `assets/...` references visible in preview and HTML export without opening arbitrary local images.
2. Add drag-and-drop image ingestion into `assets/` using the same backend validation and Markdown insertion path as clipboard paste.
3. Add smoke coverage for image paste, image drag/drop, HTML export, Print to PDF, Zen mode, spellcheck toggle, and table insertion.
4. Rename or document table scope honestly as "Insert table" until row/column/alignment editing exists.
5. Keep Agent authoring assistance out of release claims until a selected-text, candidate, diff-review, explicit-apply flow is designed inside `docs/security-boundary.md`.

## Implementation Boundaries

- Keep image loading scoped to the active document and selected workspace root.
- Do not enable arbitrary local image loading from Markdown.
- Do not load external images during preview or export.
- Do not add Pandoc, shell execution, or `tauri-plugin-shell` for export without a fresh boundary decision.
- Do not add a WYSIWYG Markdown table editor as one broad change.
- Do not add Agent auto-apply, auto-commit, background sessions, arbitrary command input, or provider plugins.

## Ready Goal Prompt

```txt
Bring hazakura-note's Markdown authoring feature set from feature-shaped stubs to honest release-ready MVP behavior.

Start by reading AGENTS.md, docs/security-boundary.md, docs/current-status.md, docs/roadmap.md, docs/smoke-checklist.md, docs/development-automation.md, and docs/authoring-feature-readiness.md. Check git status --short --branch and do not revert user changes.

Choose exactly one small slice from docs/authoring-feature-readiness.md, in this order: safe workspace-relative assets image rendering in preview/export; image drag-and-drop into assets; export smoke/parity; Zen/spellcheck smoke and docs; table insertion honesty; Agent selected-text context-helper design. Do not implement multiple areas in one run.

Keep the safe-editor boundary: no arbitrary command execution, no shell/Pandoc pipeline, no arbitrary local image loading, no external image loading, no Git integration, no LSP, no plugins, no project-wide indexing, no Agent auto-apply or auto-commit.

For code changes run npm run typecheck, cargo fmt --manifest-path src-tauri/Cargo.toml -- --check, cargo test --manifest-path src-tauri/Cargo.toml, npm run build, and git diff --check. For docs-only changes run git diff --check. Update smoke checklist/current status only when behavior or evidence changes.

Final report: selected slice, what is now honestly implemented, what remains deferred, verification, and the next smallest slice.
```
