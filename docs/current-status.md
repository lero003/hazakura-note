# Current Status

Status: Operational
Scope: Current implementation state and next safe actions
Authority: High
Last reviewed: 2026-05-26

## Current State

- A touchable Tauri desktop prototype exists.
- The prototype opens a user-selected text/Markdown file, edits it with CodeMirror 6, saves it through Rust with external-change protection, and renders a sanitized Markdown preview.
- The built macOS app bundle is generated at `src-tauri/target/release/bundle/macos/hazakura-note.app`.

## Implemented

- Tauri v2 shell
- React + TypeScript frontend
- CodeMirror 6 editor
- Markdown preview with `marked` and `DOMPurify`
- Native open-file dialog through `@tauri-apps/plugin-dialog`
- Rust commands for opening and saving UTF-8 text files
- Save-conflict detection using a Rust-generated file fingerprint
- Unsaved-change confirmation before opening another file
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
- Open -> edit -> Save was manually exercised against `/tmp/hazakura-note-smoke.md`; the saved file contained the edited Markdown text.
- A save conflict was manually exercised against `/tmp/hazakura-note-conflict.md`; the app stopped the save, kept the conflict banner to one normal message row, and left the external disk change intact.
- Unsaved-change confirmation appeared before opening a different file from a dirty document.
- Markdown preview sanitize was manually exercised against `/tmp/hazakura-note-sanitize.md`; `script`, `iframe`, and `alert` content did not appear in the preview tree, while ordinary headings and list items remained visible.
- Open -> edit -> Save was manually exercised against `/tmp/hazakura-note-sanitize.md` after the latest build; the saved file contained the edited Markdown text.
- Reusable manual smoke steps are documented in `docs/smoke-checklist.md`.

Known verification note:

- Vite reports a production chunk-size warning because CodeMirror and preview libraries are bundled together. This is acceptable for the prototype; revisit before distribution readiness.

## Risks / Unknowns

- No undo/redo, search, tabs, folder tree, or diff workflow has been hardened beyond CodeMirror defaults.
- After a save conflict, the user must currently reopen the file manually; there is no merge or diff-assisted recovery flow yet.
- The app is not signed or notarized.
- GitHub remote contents are still unverified because SSH access previously failed with `Permission denied (publickey)`.

## Next Actions

1. Run Goal 3: Workspace Basics for tabs, file tree support, and System / Light / Dark theme switching.
2. Use HTTPS for GitHub push unless SSH access is explicitly repaired later.
3. Keep distribution work separate from the prototype and safety-hardening phases.

## Avoid

- Do not add Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows during Workspace Basics.
- Do not expand Goal 3 into Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows.
- Do not treat the current build as distribution-ready.
