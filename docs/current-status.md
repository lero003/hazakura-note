# Current Status

Status: Operational
Scope: Current implementation state and next safe actions
Authority: High
Last reviewed: 2026-05-27

## Current State

- A touchable Tauri desktop prototype exists.
- The prototype creates user-selected text/Markdown files, opens a user-selected folder, shows a lazy bounded file tree, opens multiple files in tabs, edits the active tab with CodeMirror 6, saves through Rust with external-change protection, searches with visible match highlights and keyboard/navigation options, and renders a toggleable sanitized Markdown preview.
- Existing LF / CRLF line endings are detected when a file is opened and preserved through save.
- The active tab shows approximate UTF-8 byte count, character count, saved line-ending mode, final-newline state, and clean/unsaved state.
- Line endings can be explicitly converted between LF and CRLF; conversion marks the tab unsaved until saved.
- Save As can create a new UTF-8 text file with common text extensions such as `.txt`, `.log`, `.json`, `.yaml`, `.toml`, `.csv`, `.css`, and `.html`, while refusing to overwrite an existing file.
- Save writes the editor text without adding or removing a final trailing newline by policy; Rust tests cover LF and CRLF final-newline presence.
- Markdown preview shows embedded `data:image` PNG/JPEG/GIF/WebP images and blocks external or local image references with an in-preview note.
- Recent workspace, open tabs, active tab, and theme preference are restored after restart.
- Unsaved dirty tab drafts are stored locally and offered for explicit restoration after restart when the on-disk file still matches the draft's saved fingerprint.
- Editor display settings for wrap, invisible characters, font size, and tab size are persisted locally.
- Theme changes now reconfigure the active CodeMirror editor without recreating it, so the current cursor, selection, and undo/redo session state are not reset by switching Light / Dark / System.
- The status bar shows cursor line/column and approximate selection character/line counts.
- The active tab metadata includes a simple file type/mode label derived from the extension.
- Active-file search supports case-sensitive, whole-word, and safe regex modes, with invalid regex input reported without throwing.
- Go to Line jumps the active editor to a requested line.
- The active tab is rechecked for external on-disk changes when it gains focus through tab switching or app focus/visibility changes.
- Find-field Enter / Escape handling and global shortcuts now ignore active IME composition events, so Japanese conversion is not mistaken for search movement, find close, save, open, or tab-close commands.
- Save conflicts now present explicit recovery choices: Reopen from disk, Close without saving, and Keep editing.
- Non-conflict save failures now state that local edits remain in the editor and offer Try save again / Keep editing actions.
- Window close requests now stop when any open tab is unsaved and offer Save All, Discard All, or Cancel.
- Cancelling dirty-tab and app/window close dialogs by button or Escape returns keyboard focus to the editor.
- If Save from a dirty-tab close dialog fails or detects an external change, the close is stopped, the dialog is dismissed, editor focus returns, and the existing save-failure or conflict recovery actions remain visible.
- Cmd+N creates a new file, Cmd+O opens a file, Cmd+Shift+O opens a folder, and Cmd+W closes the active tab through the same dirty-tab confirmation path as the tab close button.
- Workspace tree loading now reads only direct children for the opened root or expanded directory, keeps heavy and hidden directory exclusions, rejects direct child listing outside the selected workspace root, and reports per-folder cap overflow as a partial listing instead of failing the whole workspace.
- The built macOS app bundle is generated at `src-tauri/target/release/bundle/macos/hazakura-note.app`.

## Implemented

- Tauri v2 shell
- React + TypeScript frontend
- CodeMirror 6 editor
- Markdown preview with `marked` and `DOMPurify`
- Native open-file dialog through `@tauri-apps/plugin-dialog`
- Native open-folder dialog through `@tauri-apps/plugin-dialog`
- Native save-path dialog through `@tauri-apps/plugin-dialog`
- Rust commands for creating, opening, and saving UTF-8 text files
- Rust command for Save As to a new UTF-8 text file without overwriting existing files
- Rust command for bounded workspace tree listing
- Rust command for bounded direct directory listing inside the selected workspace root
- Save-conflict detection using a Rust-generated file fingerprint
- LF / CRLF line-ending detection and save preservation
- Explicit LF / CRLF conversion control in the toolbar
- Approximate byte count, character count, line-ending mode, and final-newline status in the tab metadata row
- Final-newline presence preservation on save
- Preview visibility toggle with `localStorage` persistence
- Safe embedded-image preview policy for Markdown preview
- Multiple open file tabs
- Tab-level unsaved state
- Save / Discard / Cancel confirmation before closing an unsaved tab
- System / Light / Dark theme switching
- Theme selection persistence through `localStorage`
- Active editor theme reconfiguration without recreating the CodeMirror view
- Recent workspace restoration through `localStorage`
- Open tab and active tab restoration through `localStorage`
- Active-file search with match count, previous/next controls, visible match highlights, active-match selection, Enter / Shift+Enter match navigation, and Escape return-to-editor behavior
- Search options for case-sensitive, whole-word, and regex search with invalid-regex reporting
- Go to Line control
- Cursor line/column and approximate selection count in the status bar
- File type/mode label in the active tab metadata row
- Editor display settings for line wrap, invisible characters, font size, and tab size
- Unsaved draft recovery prompt after restart
- External-change metadata recheck on app focus / visibility return and active tab switch
- IME-safe keyboard handling for find-field Enter / Escape and global shortcuts during active composition
- Keyboard shortcuts for New File, Open, Open Folder, Save, Find, and active-tab close
- Conflict recovery actions for reloading, closing, or continuing with local edits
- Save-failure recovery wording and retry / keep-editing actions for non-conflict save errors
- App/window close confirmation for dirty tabs
- Dirty-tab and app/window close dialogs focus Cancel by default, can be cancelled with Escape, and return focus to the editor after cancellation
- Failed or conflicted Save from the dirty-tab close dialog stops close and returns to the normal recovery banner
- Long file name and constrained-width layout guardrails for tabs, the file tree, status/error rows, and close dialogs
- Lazy file-tree directory expansion with per-folder partial-listing state
- Binary-looking file rejection
- 5 MB large-file warning flag
- 10 MB prototype editing limit
- Atomic save helper
- Minimal app icon for Tauri build requirements

## Verification

Commands run successfully:

```bash
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```

Source Release Readiness smoke on 2026-05-27:

- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 16 Rust tests, including external-change conflict rejection, binary-looking file rejection, oversized-file rejection, CRLF preservation, final-newline preservation, Save As, and workspace lazy-listing boundaries.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Version alignment was confirmed at `0.1.0` across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
- Manual built-app smoke used `/tmp/hazakura-note-release-smoke-20260527202313`.

Runtime smoke:

- The bundled `.app` opened and displayed the editor and preview panes.
- Open Folder loaded only the throwaway root's direct children first; `notes` and `large` remained collapsed until expanded.
- The tree hid `.git`, `node_modules`, `target`, `dist`, and `.hidden`.
- Expanding `notes` loaded `beta.md` on demand.
- Expanding `large` with 2,005 files did not fail the workspace; the status reported `Folder partially loaded` and visible entries remained usable.
- New File created `created-from-app.md` as a clean 0-byte tab, refreshed the tree, and wrote it to disk.
- Choosing existing `alpha.md` through New File did not overwrite disk; the existing clean tab was focused and disk content stayed intact.
- Open -> Edit -> Save wrote `alpha.md` changes to disk and returned the tab to clean state.
- Opening and saving `crlf.md` preserved CRLF bytes on disk.
- Editing and saving `no-final-newline.md` without a trailing newline preserved the missing final newline on disk.
- A save conflict on `conflict.md` stopped overwrite, left the external disk change intact, and displayed Reopen from disk / Close without saving / Keep editing actions.
- A non-conflict save failure on `no-write/failure.md` showed permission-denied recovery, kept local edits in the editor, and saved successfully after permissions were restored and Try save again was used.
- Dirty-tab close through the tab close button showed Save / Discard / Cancel, focused Cancel, kept the tab open after Cancel, preserved the unsaved text, and returned focus to the editor.
- App/window close with one dirty tab showed Save All / Discard All / Cancel; Cancel kept the app open, preserved the unsaved text, and returned focus to the editor.
- Active-file search found `target` twice in `notes/beta.md`, showed `2 / 2`, and highlighted both matches.
- Japanese IME composition was manually exercised by a human in the built app; editor and Find-field composition confirmation did not trigger Save, Open, Find movement, or tab-close shortcuts while composing.
- System, Light, and Dark theme selections were manually exercised. Dark was restored after restart; System followed the current OS-resolved dark appearance and kept editor, preview, status, tabs, and tree readable.
- Markdown preview sanitize was manually exercised against `sanitize.md`; `script`, `iframe`, and `alert` content did not appear in the preview tree, while ordinary headings and list items remained visible.
- Reusable manual smoke steps are documented in `docs/smoke-checklist.md`.

Text Editor Usability Pack smoke on 2026-05-27:

- Built-app toolbar showed Save As, LF / CRLF line-ending control, and Preview toggle without pushing core controls out of reach.
- Preview toggle hid the preview pane and expanded the editor; toggling it back restored the Markdown preview.
- Preview image policy was manually exercised in the built app: an external `https://` image rendered as `Image blocked`, while an embedded `data:image/png;base64` image remained an image element.
- A CRLF `.txt` fixture opened clean with metadata showing `16 B · 9 chars · CRLF · no final newline`.
- Converting that fixture to LF marked the tab unsaved, saving returned it to clean state, and disk bytes changed to LF.
- Save As through the built app saved the same text to a new `.log` file and switched the tab to the new path. The path normalization handles macOS Save panel double-extension output such as `.log.txt` by saving to the intended known text extension.
- Rust tests cover Save As creation with a non-Markdown text extension and existing-file overwrite rejection.

Editor Reliability / Navigation Pack smoke on 2026-05-27:

- `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build`, and `git diff --check` passed after adding cursor/selection status, search options, Go to Line, display settings, draft restore, and focus/tab external-change recheck.
- Vite browser smoke at `http://127.0.0.1:1420/` confirmed search match count, invalid regex reporting, Go to Line status/cursor movement, and persisted editor settings for Invisibles, Font 16, and Tab 4 after reload.

Known verification note:

- Vite reports a production chunk-size warning because CodeMirror and preview libraries are bundled together. This is acceptable for the prototype; revisit before distribution readiness.
- Long file name and constrained-width layout guardrails have build coverage and smoke-checklist coverage, but still need a focused manual built-app smoke pass before binary distribution readiness.

## Risks / Unknowns

- Unsaved draft restore is intentionally explicit and fingerprint-bound. It is a safety net, not an autosave system, and does not merge with changed disk content.
- Workspace listing is intentionally lazy and not a project index. Very large directories can still be partially listed when a single folder exceeds the per-folder cap.
- Save-conflict recovery is explicit but still simple. There is no merge editor or diff-assisted recovery flow yet.
- Undo/redo remain CodeMirror defaults and have not received dedicated product-level controls beyond preserving the active editor session during theme changes.
- The app is not signed or notarized.
- The GitHub remote is configured over HTTPS. SSH access previously failed with `Permission denied (publickey)`.

## Next Actions

1. Run recurring automation from `docs/development-automation.md` to harden one small slice at a time.
2. Re-smoke long file name / constrained-width layout before binary distribution readiness.
3. Use `docs/source-release-checklist.md` as the source-only release boundary and do not tag or publish without explicit approval.
4. Add focused UI/E2E coverage for draft restore and external-change focus recheck before treating them as distribution-grade behavior.
5. Keep signing, notarization, and installer packaging separate from source-release and workspace hardening.

## Avoid

- Do not add Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows during the next workspace polish slices.
- Do not expand workspace persistence into project indexing or background scanning.
- Do not treat the current build as distribution-ready.
