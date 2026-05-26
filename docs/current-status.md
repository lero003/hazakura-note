# Current Status

Status: Operational
Scope: Current implementation state and next safe actions
Authority: High
Last reviewed: 2026-05-26

## Current State

- A touchable Tauri desktop prototype exists.
- The prototype opens a user-selected folder, shows a bounded file tree, opens multiple text/Markdown files in tabs, edits the active tab with CodeMirror 6, saves through Rust with external-change protection, and renders a sanitized Markdown preview.
- The built macOS app bundle is generated at `src-tauri/target/release/bundle/macos/hazakura-note.app`.

## Implemented

- Tauri v2 shell
- React + TypeScript frontend
- CodeMirror 6 editor
- Markdown preview with `marked` and `DOMPurify`
- Native open-file dialog through `@tauri-apps/plugin-dialog`
- Native open-folder dialog through `@tauri-apps/plugin-dialog`
- Rust commands for opening and saving UTF-8 text files
- Rust command for bounded workspace tree listing
- Save-conflict detection using a Rust-generated file fingerprint
- Multiple open file tabs
- Tab-level unsaved state
- Save / Discard / Cancel confirmation before closing an unsaved tab
- System / Light / Dark theme switching
- Theme selection persistence through `localStorage`
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
- A throwaway folder at `/tmp/hazakura-note-workspace-smoke` opened in the left file tree.
- The file tree showed `alpha.md`, `notes`, and `notes/beta.md`, and did not show `.git` or `node_modules`.
- `alpha.md` and `notes/beta.md` opened in separate tabs; switching tabs updated the editor and preview together.
- Editing and saving `notes/beta.md` wrote `Saved from tab.` to disk.
- Closing dirty `alpha.md` showed Save / Discard / Cancel; Cancel kept the tab open and Discard closed it without saving.
- Light and Dark themes were manually selected, and the Dark theme persisted after app restart.
- Open -> edit -> Save was manually exercised against `/tmp/hazakura-note-smoke.md`; the saved file contained the edited Markdown text.
- A save conflict was manually exercised against `/tmp/hazakura-note-conflict.md`; the app stopped the save, kept the conflict banner to one normal message row, and left the external disk change intact.
- Markdown preview sanitize was manually exercised against `/tmp/hazakura-note-sanitize.md`; `script`, `iframe`, and `alert` content did not appear in the preview tree, while ordinary headings and list items remained visible.
- Open -> edit -> Save was manually exercised against `/tmp/hazakura-note-sanitize.md` after the latest build; the saved file contained the edited Markdown text.
- Reusable manual smoke steps are documented in `docs/smoke-checklist.md`.

Known verification note:

- Vite reports a production chunk-size warning because CodeMirror and preview libraries are bundled together. This is acceptable for the prototype; revisit before distribution readiness.

## Risks / Unknowns

- No undo/redo, search, recent workspace, restore-open-tabs, or diff workflow has been hardened beyond CodeMirror defaults.
- After a save conflict, the user must currently reopen the file manually; there is no merge or diff-assisted recovery flow yet.
- The app is not signed or notarized.
- The GitHub remote is configured over HTTPS. SSH access previously failed with `Permission denied (publickey)`.

## Next Actions

1. Polish workspace persistence: recent folder and restore-open-tabs.
2. Add search or lightweight Markdown writing aids before diff work.
3. Keep distribution work separate from the prototype and safety-hardening phases.

## Avoid

- Do not add Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows during the next workspace polish slices.
- Do not expand workspace persistence into project indexing or background scanning.
- Do not treat the current build as distribution-ready.
