# Current Status

Status: Operational
Scope: Current implementation state and next safe actions
Authority: High
Last reviewed: 2026-05-27

## Current State

- A touchable Tauri desktop prototype exists.
- The prototype creates user-selected text/Markdown files, opens a user-selected folder, shows a bounded file tree, opens multiple files in tabs, edits the active tab with CodeMirror 6, saves through Rust with external-change protection, and renders a sanitized Markdown preview.
- Existing LF / CRLF line endings are detected when a file is opened and preserved through save.
- Save writes the editor text without adding or removing a final trailing newline by policy; Rust tests cover LF and CRLF final-newline presence.
- Recent workspace, open tabs, active tab, and theme preference are restored after restart.
- Save conflicts now present explicit recovery choices: Reopen from disk, Close without saving, and Keep editing.
- Non-conflict save failures now state that local edits remain in the editor and offer Try save again / Keep editing actions.
- Window close requests now stop when any open tab is unsaved and offer Save All, Discard All, or Cancel.
- Cmd+N creates a new file, Cmd+O opens a file, Cmd+Shift+O opens a folder, and Cmd+W closes the active tab through the same dirty-tab confirmation path as the tab close button.
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
- Rust command for bounded workspace tree listing
- Save-conflict detection using a Rust-generated file fingerprint
- LF / CRLF line-ending detection and save preservation
- Final-newline presence preservation on save
- Multiple open file tabs
- Tab-level unsaved state
- Save / Discard / Cancel confirmation before closing an unsaved tab
- System / Light / Dark theme switching
- Theme selection persistence through `localStorage`
- Recent workspace restoration through `localStorage`
- Open tab and active tab restoration through `localStorage`
- Active-file search with match count and previous/next controls
- Keyboard shortcuts for New File, Open, Open Folder, Save, Find, and active-tab close
- Conflict recovery actions for reloading, closing, or continuing with local edits
- Save-failure recovery wording and retry / keep-editing actions for non-conflict save errors
- App/window close confirmation for dirty tabs
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

Runtime smoke:

- The bundled `.app` opened and displayed the editor and preview panes.
- A throwaway folder at `/tmp/hazakura-note-polish-smoke` opened in the left file tree.
- The file tree showed `alpha.md`, `notes`, `notes/beta.md`, and `notes/sanitize.md`, and did not show `.git`, `node_modules`, `target`, or `dist`.
- `alpha.md`, `notes/beta.md`, and `notes/sanitize.md` opened in tabs; switching tabs updated the editor, preview, status, and active tree item together.
- Active-file search found `target` in `notes/beta.md`, showed `1 / 1`, and kept previous/next controls disabled when no match remained after reload.
- Editing and saving `notes/beta.md` wrote `Saved from polish smoke.` to disk before the conflict test.
- Closing dirty `alpha.md` showed Save / Discard / Cancel; Cancel kept the tab open and Discard closed it without saving. Disk still contained the original `alpha.md`.
- A save conflict was manually exercised against `notes/beta.md`; the app stopped the save, left the external disk change intact, and displayed Reopen from disk / Close without saving / Keep editing actions.
- Keep editing cleared the conflict banner while preserving local edits. Reopen from disk restored the external file content in both CodeMirror and preview.
- System, Light, and Dark theme selections were manually exercised. System remained readable and the theme choice was restored after restart.
- Restart restored the recent workspace, open tabs, active tab, and selected theme.
- Markdown preview sanitize was manually exercised against `notes/sanitize.md`; `script`, `iframe`, and `alert` content did not appear in the preview tree, while ordinary headings and list items remained visible.
- Reusable manual smoke steps are documented in `docs/smoke-checklist.md`.

Known verification note:

- Vite reports a production chunk-size warning because CodeMirror and preview libraries are bundled together. This is acceptable for the prototype; revisit before distribution readiness.
- New File creation and existing-file overwrite rejection have Rust test coverage and smoke-checklist coverage, but still need a manual built-app smoke pass.
- CRLF line-ending preservation has Rust test coverage and smoke-checklist coverage, but still needs a manual built-app smoke pass.
- Final trailing newline presence has Rust test coverage and smoke-checklist coverage, but still needs a manual built-app smoke pass.
- App/window dirty-tab close confirmation and the newer keyboard shortcuts have build/test coverage and smoke-checklist coverage, but still need a manual built-app smoke pass.
- Non-conflict save-failure recovery wording and actions have build coverage and smoke-checklist coverage, but still need a manual built-app smoke pass.

## Risks / Unknowns

- Unsaved text is not restored after restart; only workspace path, tab paths, active tab, and theme preference are restored.
- Save-conflict recovery is explicit but still simple. There is no merge editor or diff-assisted recovery flow yet.
- Undo/redo remain CodeMirror defaults and have not received dedicated product-level polish.
- The app is not signed or notarized.
- The GitHub remote is configured over HTTPS. SSH access previously failed with `Permission denied (publickey)`.

## Next Actions

1. Run recurring automation from `docs/development-automation.md` to harden one small slice at a time.
2. Manually smoke app/window close confirmation, keyboard shortcuts, New File, CRLF save preservation, final-newline preservation, and save-failure recovery in the built app before adding new Markdown features.
3. Decide whether unsaved draft restoration belongs in the product or should remain intentionally out of scope.
4. Keep signing, notarization, and installer packaging separate from editor/workspace hardening.

## Avoid

- Do not add Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows during the next workspace polish slices.
- Do not expand workspace persistence into project indexing or background scanning.
- Do not treat the current build as distribution-ready.
