# Smoke Checklist

Status: Operational
Scope: Manual prototype checks
Authority: Medium
Last reviewed: 2026-05-27

Use this checklist after changes to file creation, file opening, workspace listing, tabs, saving, preview rendering, theme handling, workspace restoration, search, or save-conflict handling.

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
8. Open the same file again from the Open button or file tree and confirm the existing tab is focused instead of duplicated.
9. Repeat with a CRLF fixture and confirm saving preserves CRLF line endings on disk.
10. Repeat with one fixture that ends in a final newline and one fixture that does not, then confirm saving does not add or remove the final newline.

## New File

1. Open a throwaway folder outside the repo with Open Folder.
2. Click New File or press Cmd+N.
3. Choose a new Markdown filename inside the throwaway folder.
4. Confirm the new file opens as a clean tab and appears in the file tree.
5. Type text, save it, and confirm the file on disk contains the saved text.
6. Try choosing an existing file path and confirm the app does not overwrite it.

## Workspace Tree And Tabs

1. Create a throwaway folder outside the repo with nested Markdown files.
2. Add excluded folders such as `.git`, `node_modules`, `target`, and `dist`.
3. Open the folder with Open Folder.
4. Confirm the file tree shows normal folders and files, and does not show excluded folders.
5. Confirm nested folders are not recursively populated until expanded.
6. Expand a nested folder and confirm its direct children appear on demand.
7. Open at least two files from the tree.
8. Confirm each file opens in its own tab.
9. Switch tabs and confirm the editor, preview, status, and active tree item match the selected tab.

## Large Workspace Tree

1. Create a throwaway folder outside the repo with more than 2,000 entries inside one child directory.
2. Open the throwaway folder with Open Folder and confirm the root listing completes instead of failing the whole workspace.
3. Expand the large child directory.
4. Confirm the directory shows visible entries and a partial-listing note.
5. Confirm excluded folders such as `.git`, `node_modules`, `target`, and `dist` still do not appear.
6. Open a normal Markdown file from the same workspace and confirm it opens in a tab.

## Active File Search

1. Open a file containing a repeated test word.
2. Type the word into the Find field or use Cmd+F and type it.
3. Confirm the match count appears.
4. Confirm all visible matches are highlighted and the active match is visually stronger than the rest.
5. Use Prev and Next and confirm the stronger active highlight and editor selection move together.
6. With the Find field focused, press Enter and Shift+Enter and confirm the active match moves next and previous.
7. Press Escape and confirm the Find field clears and keyboard focus returns to the editor.
8. Search for a missing word and confirm highlights clear and the UI reports no matches without changing the file.

## Keyboard Shortcuts

1. Press Cmd+N and confirm the native new-file path picker opens.
2. Press Cmd+O and confirm the native file picker opens.
3. Press Cmd+Shift+O and confirm the native folder picker opens.
4. Open a throwaway Markdown file, edit it without saving, then press Cmd+W.
5. Confirm the app offers Save, Discard, and Cancel through the same dirty-tab confirmation used by the tab close button.
6. Cancel once and confirm the tab stays open with its unsaved text and keyboard focus returns to the editor.
7. Repeat Cmd+W and confirm Discard closes the tab without writing the unsaved text.
8. Press Cmd+W with no active tab and confirm the window stays open.

## Unsaved Tab Close Confirmation

1. Open a throwaway Markdown file.
2. Edit it without saving.
3. Click the tab close button.
4. Confirm the app offers Save, Discard, and Cancel.
5. Confirm Cancel receives initial keyboard focus.
6. Press Escape once and confirm the current tab stays open with its unsaved text and keyboard focus returns to the editor.
7. Repeat, choose Cancel, and confirm the current tab stays open with keyboard focus returned to the editor.
8. Repeat and confirm Discard closes the tab without writing the unsaved text.
9. Repeat with a save failure or external save conflict, choose Save, and confirm the close dialog disappears, the tab stays open, keyboard focus returns to the editor, and the save-failure or conflict recovery actions are visible.

## App / Window Close Confirmation

1. Open two throwaway Markdown files.
2. Edit both files without saving.
3. Request app or window close from the window close control or Cmd+Q.
4. Confirm the app stays open and offers Save All, Discard All, and Cancel.
5. Confirm Cancel receives initial keyboard focus.
6. Press Escape once and confirm both dirty tabs remain open with their unsaved text and keyboard focus returns to the editor.
7. Request close again, choose Cancel, and confirm both dirty tabs remain open with keyboard focus returned to the editor.
8. Request close again and confirm Discard All exits without writing the unsaved text.
9. Repeat with fresh edits and confirm Save All writes both files before closing.
10. If one dirty file has an external save conflict, confirm Save All stops the close and leaves the app open.

## Theme Switching

1. Switch between System, Light, and Dark.
2. Confirm the editor, preview, tabs, file tree, and status bar remain readable.
3. Restart the app and confirm the selected theme is restored.
4. With System selected, confirm the app follows the OS-resolved light/dark mode.
5. Edit an open file, select text or leave the cursor in the edited area, switch theme, and confirm the cursor/selection remains in the active editor.
6. After a theme switch, press Cmd+Z and confirm the most recent edit is undone instead of losing the active editor's undo history.

## Long File Names And Constrained Width

1. Open a throwaway folder containing a Markdown file with a long unbroken filename.
2. Open that file and confirm the tab label clips with the close button still reachable.
3. Confirm the same long filename clips in the file tree instead of widening the sidebar.
4. Edit the file, request tab close, and confirm the close dialog wraps the filename while Save, Discard, and Cancel remain visible.
5. Trigger a save failure or conflict with that file when practical and confirm the message row wraps while recovery buttons remain reachable.
6. Resize the window to the app minimum width and confirm the toolbar, find row, editor, preview, and status bar remain usable without controls overlapping.

## Workspace Restoration

1. Open a throwaway folder outside the repo.
2. Open at least two files as tabs.
3. Select a non-first active tab.
4. Restart the app.
5. Confirm the workspace tree, open tabs, active tab, and theme preference are restored.
6. Confirm unsaved text is not expected to restore; save or discard dirty tabs before relying on restart behavior.

## External Change Conflict

1. Open a throwaway Markdown file.
2. Edit it in the app without saving.
3. Modify the same file outside the app.
4. Click Save in the app.
5. Confirm the app shows a save-conflict message.
6. Confirm the file on disk still contains the external change, not the app's unsaved text.
7. Click Keep editing and confirm the local editor text remains.
8. Trigger the conflict again and click Reopen from disk.
9. Confirm the editor, preview, and status all show the external disk content.
10. Trigger the conflict once more if needed and confirm Close without saving closes the tab without overwriting disk.

## Save Failure Recovery

1. Open a throwaway Markdown file.
2. Edit it in the app without saving.
3. Make the file or containing folder temporarily unwritable, unavailable, or otherwise unable to accept a normal save.
4. Click Save in the app.
5. Confirm the app reports that saving failed and that local edits are still in the editor.
6. Confirm Try save again is available.
7. Confirm Keep editing clears the save-failure banner without discarding local edits.
8. Restore the file or folder to a writable state, save again, and confirm the edited text reaches disk.

## Markdown Preview Sanitize

1. Open a throwaway Markdown file containing raw HTML such as `script`, `iframe`, or inline event handler attributes.
2. Confirm the preview does not execute script or render embedded active content.
3. Confirm ordinary Markdown headings, paragraphs, lists, and code blocks still render.

## Binary And Large File Boundary

Binary-looking files, files above the prototype editing limit, line-ending preservation, and final-newline preservation are covered by Rust tests. Re-run these after changing file I/O:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Final Local Gates

Before committing a release-readiness or quality-hardening slice, run:

```bash
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```
