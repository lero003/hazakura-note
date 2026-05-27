# Smoke Checklist

Status: Operational
Scope: Manual prototype checks
Authority: Medium
Last reviewed: 2026-05-28

Use this checklist after changes to file creation, file opening, workspace listing, tabs, saving, preview rendering, theme handling, workspace restoration, search, or save-conflict handling.

Latest built-app source-release pass: 2026-05-27 with `/tmp/hazakura-note-release-smoke-20260527202313`. Confirmed New File create/existing-file non-overwrite, Open -> Edit -> Save, CRLF/final-newline preservation, conflict stop, save-failure recovery, dirty-tab close cancellation, app/window close cancellation, active-file search, Japanese IME composition guard, lazy workspace tree partial listing, theme switching/session persistence, and sanitize preview.

Latest Text Editor Usability Pack pass: 2026-05-27 with `/tmp/hazakura-note-usability-smoke.VHMxWZ`. Confirmed active-tab byte/character/line-ending/final-newline metadata, CRLF clean-open behavior, explicit LF conversion and save, Save As to `.log`, preview toggle, and safe image preview policy.

Latest Editor Reliability / Navigation Pack pass: 2026-05-27 with Vite browser smoke at `http://127.0.0.1:1420/`. Confirmed case/regex UI wiring, invalid regex reporting, Go to Line movement/status, cursor line/column status, and editor display setting restoration after reload.

Latest Source Preview Quality Polish pass: 2026-05-27 with `/Users/keisetsu/Projects/hazakura-note-smoke-paid-quality`. Confirmed built-app workspace switching, hidden/heavy directory exclusion, long filename clipping in the tree, Markdown and CRLF metadata, search highlights, external-change recheck on tab return, and Go to Line accessibility naming.

Latest Dirty Tab Close Failure Focus Polish checks: 2026-05-28 automated gates passed after updating the inactive-tab failed-selection path. No fresh built-app manual smoke was claimed.

Latest Discard All Draft Cleanup Polish checks: 2026-05-28 automated gates passed after clearing discarded app/window close drafts before close. No fresh built-app manual smoke was claimed.

Latest Editor Keyboard Editing Polish checks: 2026-05-28 with Vite browser smoke at `http://127.0.0.1:1421/`. Confirmed Tab inserts indentation in the editor, selected lines indent/outdent with Tab / Shift+Tab, and Shift+Arrow selects text without moving focus away from the editor. No fresh built-app manual smoke was claimed.

Latest Find Close Polish checks: 2026-05-28 automated gates passed after making the Find close button clear the query and highlights like Escape. No fresh built-app manual smoke was claimed.

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
2. Open it with File > Open or Cmd+O.
3. Edit the text.
4. Confirm the title and status bar show unsaved state.
5. Save with File > Save or Cmd+S.
6. Confirm the status returns to clean.
7. Read the file from disk and confirm the edited text was written.
8. Open the same file again from File > Open or the file tree and confirm the existing tab is focused instead of duplicated.
9. Repeat with a CRLF fixture and confirm saving preserves CRLF line endings on disk.
10. Repeat with one fixture that ends in a final newline and one fixture that does not, then confirm saving does not add or remove the final newline.

## Text Metadata And Line Endings

1. Open a LF fixture and confirm the status bar shows byte count, character count, `LF`, final-newline state, and clean/unsaved state.
2. Open a CRLF fixture and confirm it opens clean while the status bar shows `CRLF`.
3. Change the Line control from CRLF to LF and confirm the tab becomes unsaved.
4. Save and confirm the tab returns to clean.
5. Read the file from disk and confirm CRLF bytes were converted to LF bytes.
6. Repeat LF to CRLF if the changed area is safe to overwrite in a throwaway fixture.

## Workspace Switching

1. Use the `+` button in the workspace header.
2. Choose a throwaway folder.
3. Confirm the file tree changes to the selected folder.
4. Repeat from a different folder and confirm the workspace title and tree update without using the native menu.

## Markdown Preview Sync

1. Open a Markdown file long enough for both editor and preview to scroll.
2. Turn Preview on.
3. Scroll the editor downward and confirm the preview follows to the matching approximate position without jittering.
4. Scroll the preview back upward and confirm the editor follows to the matching approximate position without jittering.
5. Confirm small scroll-position differences are tolerated instead of causing continuous fine adjustment.

## Editor / Preview Split

1. Open a Markdown file with Preview on.
2. Drag the divider between editor and preview to make the preview wider.
3. Confirm both panes remain usable and the preview can be made visibly larger.
4. Focus the divider and press ArrowLeft / ArrowRight to confirm keyboard resizing works.

## Markdown Input Helpers

1. Select text in the editor and press Cmd+B, Cmd+I, Cmd+E, and Cmd+K in separate throwaway edits.
2. Confirm the selected text is wrapped as bold, italic, inline code, or link Markdown.
3. Undo each edit and repeat with the tabs-row helper buttons.
4. With no selection, confirm bold, italic, and inline code insert paired markers, and link inserts `[text](url)` with editable placeholder text selected.

## Save As

1. Open a throwaway text file.
2. Use File > Save As or press Cmd+Shift+S.
3. Save to a new common text extension such as `.log`, `.txt`, `.json`, `.yaml`, `.toml`, or `.csv`.
4. Confirm the tab switches to the new path and remains clean.
5. Confirm the new file exists on disk with the expected text and selected line endings.
6. Try Save As to an existing path and confirm the app refuses to overwrite it.

## New File

1. Open a throwaway folder outside the repo with File > Open Folder.
2. Use File > New File or press Cmd+N.
3. Choose a new Markdown filename inside the throwaway folder.
4. Confirm the new file opens as a clean tab and appears in the file tree.
5. Type text, save it, and confirm the file on disk contains the saved text.
6. Try choosing an existing file path and confirm the app does not overwrite it.

## Native Menus And Preferences

1. Launch the built app with no open tabs and confirm the start panel is shown instead of editable welcome text.
2. Confirm File > Save and File > Save As are disabled when no tab is open.
3. Open a file and confirm the window title changes to the active file name.
4. Edit the file and confirm the window title marks unsaved state, then save and confirm the mark clears.
5. Confirm File > Recent Files can reopen a recently opened file.
6. Toggle View > Preview, View > Wrap Lines, and View > Show Invisibles and confirm each setting changes the editor or preview.
7. Open View > Preferences and confirm Font size, Tab size, Theme, Preview, Wrap, and Invisibles persist after restart.

## Workspace Tree And Tabs

1. Create a throwaway folder outside the repo with nested Markdown files.
2. Add excluded folders such as `.git`, `node_modules`, `target`, and `dist`.
3. Open the folder with File > Open Folder.
4. Confirm the file tree shows normal folders and files, and does not show excluded folders.
5. Confirm nested folders are not recursively populated until expanded.
6. Expand a nested folder and confirm its direct children appear on demand.
7. Open at least two files from the tree.
8. Confirm each file opens in its own tab.
9. Switch tabs and confirm the editor, preview, status, and active tree item match the selected tab.

## Workspace Image Preview

1. Create a throwaway workspace with a Markdown file and a small PNG/JPEG/GIF/WebP image.
2. Open the folder with File > Open Folder.
3. Select the image from the workspace tree and confirm it opens as a read-only preview in the work area.
4. Confirm the image file is highlighted in the workspace tree and the status bar identifies the selected image.
5. Press Cmd+W and confirm the image preview closes without closing the app.
6. Open the Markdown file from the same tree and confirm text editing, tabs, and Markdown preview still work normally.
7. Add a Markdown local image reference to the text file and confirm the Markdown preview still shows an image-blocked note instead of loading it.

## Large Workspace Tree

1. Create a throwaway folder outside the repo with more than 2,000 entries inside one child directory.
2. Open the throwaway folder with File > Open Folder and confirm the root listing completes instead of failing the whole workspace.
3. Expand the large child directory.
4. Confirm the directory shows visible entries and a partial-listing note.
5. Confirm excluded folders such as `.git`, `node_modules`, `target`, and `dist` still do not appear.
6. Open a normal Markdown file from the same workspace and confirm it opens in a tab.

## Active File Search

1. Open a file containing a repeated test word.
2. Press Cmd+F and confirm the app's Find overlay opens without opening CodeMirror's built-in search panel.
3. Type the word into the Find field.
4. Confirm the match count appears.
5. Confirm all visible matches are highlighted and the active match is visually stronger than the rest.
6. Use Prev and Next and confirm the stronger active highlight and editor selection move together.
7. With the Find field focused, press Enter and Shift+Enter and confirm the active match moves next and previous.
8. Press Escape and confirm the Find overlay closes, highlights clear, and keyboard focus returns to the editor.
9. Reopen Find, search for the word again, click the close button, and confirm the overlay closes, highlights clear, and keyboard focus returns to the editor.
10. Search for a missing word and confirm highlights clear and the UI reports no matches without changing the file.
11. Enable Case and confirm case mismatches are not counted.
12. Enable Word and confirm substrings inside longer words are not counted.
13. Enable Regex, enter a valid expression, and confirm matches are highlighted.
14. Enter an invalid regex such as `[` and confirm the UI reports invalid regex without changing the file or crashing.

## Editor Navigation And Display Settings

1. Move the cursor in the editor and confirm the status bar shows the current line and column.
2. Select text spanning one line and multiple lines, then confirm approximate selected character and line counts appear.
3. Enter a valid line number in the Line control and click Go.
4. Confirm the cursor moves to that line and the status bar updates.
5. Confirm the Go button is exposed to accessibility as Go to line, not as the Line label.
6. Confirm metadata and status separators render as single ` · ` separators without doubled spacing.
7. Toggle Wrap and confirm long lines wrap or stop wrapping without changing file contents.
8. Toggle Invisibles and confirm spaces/tabs/trailing whitespace receive visible markers without changing file contents.
9. Change Font and Tab size, restart or reload the app, and confirm the selected display settings are restored.

## Preview Toggle, Images, And Tables

1. Toggle Preview off and confirm the editor expands into the preview area.
2. Toggle Preview on and confirm Markdown preview returns.
3. Restart the app and confirm the Preview setting is restored.
4. Add a Markdown external image such as `![remote](https://example.com/image.png)` and confirm the preview shows an image-blocked note instead of loading it.
5. Add an embedded `data:image/png;base64` image in a throwaway note and confirm the preview treats it as an image.
6. Add a GFM table with at least four columns and confirm headers, grid lines, row striping, and alignment markers render readably.
7. Add a wider table and confirm only the table frame scrolls horizontally instead of breaking the preview layout.
8. Confirm `script`, `iframe`, and inline event handlers still do not execute or appear as active content.

## Japanese IME

1. Open a throwaway Markdown file and focus the editor.
2. Enable a Japanese IME and start composing text.
3. Press Enter to confirm conversion and confirm it inserts text instead of triggering Save, Open, Find, or tab close behavior.
4. Open the Find field, start composing a Japanese query, and press Enter to confirm conversion.
5. Confirm the Find field keeps focus and does not move to the next or previous match while composition is active.
6. Start another Find-field composition and press Escape while composition is active if your IME uses Escape for candidate cancellation.
7. Confirm the Find field does not close until Escape is pressed after composition ends.

## Keyboard Shortcuts

1. Press Cmd+N and confirm the native new-file path picker opens.
2. Press Cmd+O and confirm the native file picker opens.
3. Press Cmd+Shift+O and confirm the native folder picker opens.
4. Open a throwaway Markdown file, edit it without saving, then press Cmd+W.
5. Confirm the app offers Save, Discard, and Cancel through the same dirty-tab confirmation used by the tab close button.
6. Cancel once and confirm the tab stays open with its unsaved text and keyboard focus returns to the editor.
7. Repeat Cmd+W and confirm Discard closes the tab without writing the unsaved text.
8. Press Cmd+Shift+W and confirm the window close path is requested.

## Editor Keyboard Editing

1. Focus the editor body.
2. Press Tab with a collapsed cursor and confirm indentation is inserted into the document instead of moving focus to another control.
3. Select multiple lines and press Tab, then confirm all selected lines are indented.
4. Press Shift+Tab on the indented selection and confirm the selected lines are outdented without changing unrelated lines.
5. Press Shift+ArrowLeft and Shift+ArrowRight and confirm the selection expands or shrinks by character with a visible highlight.
6. Press Shift+ArrowUp and Shift+ArrowDown and confirm the selection expands by line with a visible highlight.
7. Confirm the status bar reports the selected character and line counts.

## Unsaved Tab Close Confirmation

1. Open a throwaway Markdown file.
2. Edit it without saving.
3. Click the tab close button.
4. Confirm the app offers Save, Discard, and Cancel.
5. Confirm Cancel receives initial keyboard focus.
6. Press Tab and Shift+Tab repeatedly and confirm focus cycles among Save, Discard, and Cancel without moving behind the dialog.
7. Press Escape once and confirm the current tab stays open with its unsaved text and keyboard focus returns to the editor.
8. Repeat, choose Cancel, and confirm the current tab stays open with keyboard focus returned to the editor.
9. Repeat and confirm Discard closes the tab without writing the unsaved text.
10. Repeat with a save failure or external save conflict, choose Save, and confirm the close dialog disappears, the failed tab is selected even if the close was requested from an inactive tab, the tab stays open, keyboard focus returns to the editor, and the save-failure or conflict recovery actions are visible.

## App / Window Close Confirmation

1. Open two throwaway Markdown files.
2. Edit both files without saving.
3. Request app or window close from the window close control, Cmd+Shift+W, or Cmd+Q.
4. Confirm the app stays open and offers Save All, Discard All, and Cancel.
5. Confirm Cancel receives initial keyboard focus.
6. Press Tab and Shift+Tab repeatedly and confirm focus cycles among Save All, Discard All, and Cancel without moving behind the dialog.
7. Press Escape once and confirm both dirty tabs remain open with their unsaved text and keyboard focus returns to the editor.
8. Request close again, choose Cancel, and confirm both dirty tabs remain open with keyboard focus returned to the editor.
9. Request close again and confirm Discard All exits without writing the unsaved text.
10. Reopen the app and confirm the files discarded by Discard All are not offered as recoverable unsaved drafts.
11. Repeat with fresh edits and confirm Save All writes both files before closing.
12. If one dirty file has an external save conflict or save failure, confirm Save All stops the close, leaves the app open, selects the failed tab, returns keyboard focus to the editor, and shows the normal recovery actions.

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
6. Resize the window to the app minimum width and confirm the tabs row, find row, editor, preview, and status bar remain usable without controls overlapping.

## Workspace Restoration

1. Open a throwaway folder outside the repo.
2. Open at least two files as tabs.
3. Select a non-first active tab.
4. Restart the app.
5. Confirm the workspace tree, open tabs, active tab, and theme preference are restored.
6. Edit one open tab without saving, restart the app, and confirm a draft restore prompt appears only if the file on disk still matches the draft's saved fingerprint.
7. Choose Restore draft and confirm the unsaved text returns and the tab is dirty.
8. Repeat and choose Discard draft, then confirm the clean disk contents remain.
9. Modify the file on disk before restart and confirm the stale draft is not applied automatically.

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
11. Repeat by modifying the file outside the app, then switch away and back to the tab or refocus the app before pressing Save.
12. Confirm the app detects the external change and stops with the same recovery choices before the user relies on Save.

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
