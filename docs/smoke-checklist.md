# Smoke Checklist

Status: Operational
Scope: Manual prototype checks
Authority: Medium
Last reviewed: 2026-05-26

Use this checklist after changes to file opening, saving, preview rendering, or save-conflict handling.

## Build First

```bash
npm run build
```

Open the built app:

```bash
open -n src-tauri/target/release/bundle/macos/hazakura-note.app
```

## Open -> Edit -> Save

1. Create a throwaway Markdown file outside the repo.
2. Open it with the app's Open button.
3. Edit the text.
4. Confirm the title and status bar show unsaved state.
5. Save.
6. Confirm the Save button disables and the status returns to clean.
7. Read the file from disk and confirm the edited text was written.

## Unsaved Open Confirmation

1. Open a throwaway Markdown file.
2. Edit it without saving.
3. Click Open.
4. Confirm the app asks whether to discard unsaved changes.
5. Cancel once and confirm the current document stays open.
6. Repeat and confirm accepting the dialog opens the selected file.

## External Change Conflict

1. Open a throwaway Markdown file.
2. Edit it in the app without saving.
3. Modify the same file outside the app.
4. Click Save in the app.
5. Confirm the app shows a save-conflict message.
6. Confirm the file on disk still contains the external change, not the app's unsaved text.

## Markdown Preview Sanitize

1. Open a throwaway Markdown file containing raw HTML such as `script`, `iframe`, or inline event handler attributes.
2. Confirm the preview does not execute script or render embedded active content.
3. Confirm ordinary Markdown headings, paragraphs, lists, and code blocks still render.

## Binary And Large File Boundary

Binary-looking files and files above the prototype editing limit are covered by Rust tests. Re-run these after changing file I/O:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```
