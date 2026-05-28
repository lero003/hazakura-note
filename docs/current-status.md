# Current Status

Status: Operational
Scope: Current implementation state and next safe actions
Authority: High
Last reviewed: 2026-05-28

## Current State

- A touchable Tauri desktop prototype exists.
- The prototype creates user-selected text/Markdown files, opens a user-selected folder, shows a lazy bounded file tree, opens multiple files in tabs, edits the active tab with CodeMirror 6, saves through Rust with external-change protection, searches with visible match highlights and keyboard/navigation options, renders a toggleable sanitized Markdown preview, and shows selected workspace images in a read-only preview.
- Existing LF / CRLF line endings are detected when a file is opened and preserved through save.
- The status bar shows approximate UTF-8 byte count, character count, saved line-ending mode, final-newline state, and clean/unsaved state.
- Line endings can be explicitly converted between LF and CRLF; conversion marks the tab unsaved until saved.
- Save As can create a new UTF-8 text file with common text extensions such as `.txt`, `.log`, `.json`, `.yaml`, `.toml`, `.csv`, `.css`, and `.html`, while refusing to overwrite an existing file.
- New File, Open, Open Folder, Save, Save As, and Recent file/folder actions are available from the native File menu instead of occupying the top toolbar.
- Preview, Wrap, Invisibles, Theme, Font, and Tab display settings now live in the native View menu and Preferences dialog, leaving the always-visible editor chrome minimal.
- The app window title follows the active file and marks unsaved state, so the redundant in-app title header is no longer shown.
- The workspace header includes a small open-folder action for switching workspace without returning to the native menu.
- Save writes the editor text without adding or removing a final trailing newline by policy; Rust tests cover LF and CRLF final-newline presence.
- Markdown preview shows embedded `data:image` PNG/JPEG/GIF/WebP images and blocks external or local image references with an in-preview note.
- Markdown preview wraps GFM tables in a scrollable table frame with clearer headers, grid lines, row striping, and alignment support.
- Selecting a PNG/JPEG/GIF/WebP file in the workspace tree opens a read-only local image preview in the work area after a lightweight content-signature check, without adding Markdown local-image loading. Closing that image preview returns to the prior text tab when one is still open.
- Markdown preview and editor panes use lightweight bidirectional scroll synchronization with a small tolerance to avoid jitter while preview is visible.
- The editor / preview split can be resized with a draggable vertical divider while preview is visible.
- Recent workspace, open tabs, active tab, and theme preference are restored after restart.
- Unsaved dirty tab drafts are stored locally and offered for explicit restoration after restart when the on-disk file still matches the draft's saved fingerprint.
- Editor display settings for wrap, invisible characters, font size, and tab size are persisted locally and adjustable from Preferences.
- Theme changes now reconfigure the active CodeMirror editor without recreating it, so the current cursor, selection, and undo/redo session state are not reset by switching Light / Dark / System.
- The status bar groups supplemental document details: file type, approximate byte count, character count, line-ending mode, final-newline state, clean/unsaved state, cursor line/column, and approximate selection counts.
- Active-file search supports case-sensitive, whole-word, and safe regex modes, with invalid regex input reported without throwing.
- Go to Line jumps the active editor to a requested line.
- The active tab is rechecked for external on-disk changes when it gains focus through tab switching or app focus/visibility changes, and external-change recovery is surfaced as a focused banner.
- Find-field Enter / Escape handling and global shortcuts now ignore active IME composition events, so Japanese conversion is not mistaken for search movement, find close, save, open, or tab-close commands.
- Editor-local keyboard editing keeps Tab inside the editor for indentation, supports Shift+Tab outdent, and preserves Shift+Arrow text selection.
- Editor-local Markdown helpers wrap or insert bold, italic, inline-code, and link syntax from the tabs row or Cmd+B / Cmd+I / Cmd+E / Cmd+K while focus is inside the editor.
- Save conflicts now present explicit recovery choices: Reopen from disk, Close without saving, and Keep editing.
- Non-conflict save failures now state that local edits remain in the editor and offer Try save again / Keep editing actions.
- Window close requests now stop when any open tab is unsaved and offer Save All, Discard All, or Cancel.
- Cancelling dirty-tab and app/window close dialogs by button or Escape returns keyboard focus to the editor.
- Dirty-tab and app/window close dialogs keep Tab / Shift+Tab focus cycling inside the dialog while it is open.
- If Save from a dirty-tab close dialog fails or detects an external change, the close is stopped, the failed tab is selected, the dialog is dismissed, editor focus returns, and the existing save-failure or conflict recovery actions remain visible.
- If Save All from the app/window close dialog fails or detects an external change, the close is stopped, the failed tab is selected, editor focus returns, and the existing save-failure or conflict recovery actions remain visible.
- Discard All from the app/window close dialog removes matching stored unsaved drafts before close, so intentionally discarded edits are not offered for restoration on restart.
- Cmd+N creates a new file, Cmd+O opens a file, Cmd+Shift+O opens a folder, Cmd+W closes the active tab through the same dirty-tab confirmation path as the tab close button, and Cmd+Shift+W requests window close.
- Workspace tree loading now reads only direct children for the opened root or expanded directory, keeps heavy and hidden directory exclusions, rejects direct child listing outside the selected workspace root, and reports per-folder cap overflow as a partial listing instead of failing the whole workspace.
- Atomic save cleanup removes the hidden temporary save file if the final replace step fails and refuses to overwrite a pre-existing hidden save temp file.
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
- Explicit LF / CRLF conversion control in the tabs row
- Approximate byte count, character count, line-ending mode, final-newline status, and clean/unsaved state in the status bar
- Final-newline presence preservation on save
- Preview visibility toggle through View / Preferences with `localStorage` persistence
- Safe embedded-image preview policy for Markdown preview
- GFM table preview styling with a bounded horizontal scroll frame
- Read-only local workspace image preview for PNG/JPEG/GIF/WebP files, with extension and content-signature validation
- Lightweight bidirectional editor/preview scroll synchronization while Markdown preview is visible
- Resizable editor / preview columns while Markdown preview is visible
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
- File type/mode label in the status bar
- Editor display settings for line wrap, invisible characters, font size, and tab size
- Unsaved draft recovery prompt after restart
- External-change metadata recheck on app focus / visibility return and active tab switch
- IME-safe keyboard handling for find-field Enter / Escape and global shortcuts during active composition
- Editor-local Tab / Shift+Tab indentation and Shift+Arrow selection key handling
- Markdown input helpers for bold, italic, inline code, and link syntax
- Native File menu actions for New File, Open, Open Folder, Save, Save As, and Recent file/folder reopening
- Native View menu actions for Preview, Wrap, Invisibles, Theme, and Preferences
- Preferences dialog for display settings that were previously exposed in the top toolbar
- Dynamic window title for active file and unsaved state
- Keyboard shortcuts for New File, Open, Open Folder, Save, Find, active-tab close, and window close
- Conflict recovery actions for reloading, closing, or continuing with local edits
- Save-failure recovery wording and retry / keep-editing actions for non-conflict save errors
- App/window close confirmation for dirty tabs
- Dirty-tab and app/window close dialogs focus Cancel by default, can be cancelled with Escape, and return focus to the editor after cancellation
- Dirty-tab and app/window close dialogs trap Tab / Shift+Tab focus while open
- Failed or conflicted Save from the dirty-tab close dialog selects the failed tab and returns to the normal recovery banner
- Failed or conflicted Save All from the app/window close dialog selects the failed tab and returns to the normal recovery banner
- Discard All from the app/window close dialog clears matching stored recovery drafts before close
- Long file name and constrained-width layout guardrails for tabs, the file tree, status/error rows, and close dialogs
- Lazy file-tree directory expansion with per-folder partial-listing state
- Binary-looking file rejection
- 5 MB large-file warning flag
- 10 MB prototype editing limit
- Atomic save helper with temporary-file cleanup after failed replace attempts and existing-temp-file overwrite protection
- Minimal app icon for Tauri build requirements
- Local macOS `.app` bundle icon resource, explicit non-Carbon launch metadata, and ad-hoc signing for build-output validation

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

Native File Menu UI polish on 2026-05-28:

- Top toolbar file-action buttons and the prototype subtitle were removed.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 18 Rust tests.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- The regenerated `.app` launched, and macOS System Events confirmed the native File menu contains New File, Open, Open Folder, Save, and Save As.

Application Completion Polish on 2026-05-28:

- Top toolbar display settings were moved into the native View menu and Preferences dialog.
- File menu Save / Save As now reflect whether the active document can be saved, and File menu Recent Files / Recent Folders are populated from local history.
- The empty editor state now shows a focused start panel instead of editable welcome copy.
- The workspace pane now has a stable workspace header, and the window title follows the active file plus unsaved state.
- `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build`, and `git diff --check` passed.
- Built-app checks confirmed the native File menu, View menu, disabled Save state, disabled Save As state with no open tab, dynamic window title for an active restored file, Preferences dialog rendering, and the no-file start panel.

Local Bundle Signature Polish checks on 2026-05-28:

- `src-tauri/tauri.conf.json` now points the bundle at `icons/icon.icns` and uses ad-hoc macOS signing for local build validation.
- `npm run build` passed and regenerated the local macOS `.app` bundle with `Contents/Resources/icon.icns`.
- `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/hazakura-note.app` passed.
- No Developer ID signing or notarization was added.
- Later built-app smoke on 2026-05-28 successfully inspected native menus through System Events, so the earlier menu-inspection blocker is no longer current.

Local Bundle Launch Metadata Polish checks on 2026-05-28:

- `src-tauri/Info.plist` now explicitly overrides the generated bundle metadata to set `LSRequiresCarbon` to `false`.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- `plutil -p src-tauri/target/release/bundle/macos/hazakura-note.app/Contents/Info.plist` confirmed `LSRequiresCarbon => false` while preserving `CFBundleExecutable => "hazakura-note"`.
- `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/hazakura-note.app` passed.
- This automation session still could not complete an `open -n` launch smoke; Launch Services returned `kLSNoExecutableErr`, so no fresh manual built-app UI smoke is claimed for this slice.

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

- Built-app toolbar showed LF / CRLF line-ending control and Preview toggle without pushing core controls out of reach.
- Preview toggle hid the preview pane and expanded the editor; toggling it back restored the Markdown preview.
- Preview image policy was manually exercised in the built app: an external `https://` image rendered as `Image blocked`, while an embedded `data:image/png;base64` image remained an image element.
- A CRLF `.txt` fixture opened clean with metadata showing `16 B · 9 chars · CRLF · no final newline`.
- Converting that fixture to LF marked the tab unsaved, saving returned it to clean state, and disk bytes changed to LF.
- Save As through the built app saved the same text to a new `.log` file and switched the tab to the new path. The path normalization handles macOS Save panel double-extension output such as `.log.txt` by saving to the intended known text extension.
- Rust tests cover Save As creation with a non-Markdown text extension and existing-file overwrite rejection.

Editor Reliability / Navigation Pack smoke on 2026-05-27:

- `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build`, and `git diff --check` passed after adding cursor/selection status, search options, Go to Line, display settings, draft restore, and focus/tab external-change recheck.
- Vite browser smoke at `http://127.0.0.1:1420/` confirmed search match count, invalid regex reporting, Go to Line status/cursor movement, and persisted editor settings for Invisibles, Font 16, and Tab 4 after reload.

Source Preview Quality Polish smoke on 2026-05-27:

- Built-app smoke used `/Users/keisetsu/Projects/hazakura-note-smoke-paid-quality`.
- Opening the throwaway folder replaced the workspace tree with direct children only and continued to hide `.git`, `node_modules`, `target`, and `dist`.
- Opening `alpha.md` from the tree showed Markdown metadata, preview, active tree state, and search highlights for two `target` matches.
- Opening `crlf.txt` showed `Text`, `CRLF`, byte/character counts, and clean state without marking the tab dirty.
- Modifying `alpha.md` outside the app, switching away, then switching back to the tab detected the external change and showed Reopen from disk / Close without saving / Keep editing before Save.
- A small polish fix corrected the Go to Line button's accessible name and removed extra separator whitespace in metadata/status text.

Modal Focus Trap Polish checks on 2026-05-27:

- Dirty-tab and app/window close dialogs now keep Tab / Shift+Tab focus cycling inside the dialog while it is open.
- `docs/smoke-checklist.md` now includes Tab / Shift+Tab focus-cycling checks for both close dialogs.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 16 Rust tests.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- `git diff --check` passed.

App Close Save All Failure Focus Polish checks on 2026-05-28:

- Failed or conflicted Save All from the app/window close dialog now stops the close, selects the failed tab, dismisses the dialog, returns focus to the editor, and leaves the normal save-failure or conflict recovery actions visible.
- `docs/smoke-checklist.md` now includes the failed-tab selection and editor-focus check for app/window close Save All failure.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Dirty Tab Close Failure Focus Polish checks on 2026-05-28:

- Failed or conflicted Save from the dirty-tab close dialog now stops the close, selects the failed tab even when the close was requested from an inactive tab, dismisses the dialog, returns focus to the editor, and leaves the normal save-failure or conflict recovery actions visible.
- `docs/smoke-checklist.md` now includes the inactive-tab failed-selection check for dirty-tab close Save failure.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Atomic Save Cleanup Polish checks on 2026-05-28:

- Atomic save now removes its hidden `.filename.hazakura-note.tmp` file if the final replace step fails.
- Rust tests cover both successful atomic replacement and cleanup after a failed replace attempt.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Atomic Save Temp Collision Polish checks on 2026-05-28:

- Atomic save now creates its hidden `.filename.hazakura-note.tmp` file with exclusive creation, so a pre-existing temp file is not overwritten or removed by a failed save attempt.
- Rust tests cover successful atomic replacement, cleanup after a failed replace attempt, and pre-existing temp-file preservation.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Discard All Draft Cleanup Polish checks on 2026-05-28:

- Discard All from the app/window close dialog now suppresses draft persistence during the requested close and removes stored recovery drafts for the discarded dirty tabs.
- `docs/smoke-checklist.md` now includes a restart check that discarded dirty tabs are not offered as recoverable drafts.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Editor Keyboard Editing Polish checks on 2026-05-28:

- Editor-local Tab now inserts indentation instead of moving focus away from the editor.
- Shift+Tab outdents selected or current lines.
- Shift+Arrow selection is explicitly bound for character and line selection.
- Selection highlight colors were strengthened after browser smoke showed selection state moving while the visible highlight was too subtle.
- `npm run build:vite` passed.
- Vite browser smoke at `http://127.0.0.1:1421/` confirmed collapsed-cursor Tab indentation, selected-line Tab / Shift+Tab indent and outdent, Shift+Arrow character selection status, and visible selection highlight rendering.
- No fresh built-app manual smoke was claimed.

UI Brush-up Search Overlay checks on 2026-05-28:

- Cmd+F now opens the app's floating Find overlay without also opening CodeMirror's built-in search panel.
- Escape from the Find field closes the overlay, clears highlights, and returns focus to the editor.
- `npm run build:vite` passed.
- Vite browser smoke at `http://127.0.0.1:1421/` confirmed search count, highlights, no CodeMirror search panel, no horizontal overflow, and editor focus restoration.
- No fresh built-app manual smoke was claimed.

Find Close Polish checks on 2026-05-28:

- The Find close button now uses the same close path as Escape, clearing the query and search highlights before returning focus to the editor.
- `docs/smoke-checklist.md` now includes the close-button highlight-clear check in Active File Search.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Workspace Image Preview / Quality Automation checks on 2026-05-28:

- Workspace tree image selection now opens a read-only local PNG/JPEG/GIF/WebP preview in the work area.
- Image preview reads the selected image through a Rust command constrained to the current workspace root and returns a `data:` URL, avoiding broad asset-protocol filesystem access.
- Markdown preview image safety remains unchanged: local and external Markdown image references stay blocked, while embedded `data:image` references remain allowed.
- `docs/development-automation.md` and the saved `hazakura-note-quality-loop` automation now prioritize quality-hardening slices that begin from built-app smoke when practical.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Workspace Image Content Validation checks on 2026-05-28:

- Workspace image preview now requires the selected PNG/JPEG/GIF/WebP extension to match a lightweight file-content signature before returning a `data:` URL.
- Rust tests cover accepting supported PNG/JPEG/GIF/WebP previews, rejecting paths outside the workspace root, rejecting a `.png` file whose bytes are not image content, and rejecting extension/signature mismatches.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Workspace Image Close Return Polish checks on 2026-05-28:

- Closing a selected workspace image preview now restores the text tab that was active before the image was opened when that tab is still open, falling back to the first open text tab if needed.
- `docs/smoke-checklist.md` now asks the image-preview smoke to confirm Cmd+W returns to the prior text tab.
- Automated local gates passed after this change. `open -n src-tauri/target/release/bundle/macos/hazakura-note.app` still returned `kLSNoExecutableErr` in this automation session, so no fresh built-app manual smoke was claimed.

Known verification note:

- Vite reports a production chunk-size warning because CodeMirror and preview libraries are bundled together. This is acceptable for the prototype; revisit before distribution readiness.
- The Modal Focus Trap Polish did not include a fresh built-app manual focus-cycling smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The App Close Save All Failure Focus Polish did not include a fresh built-app manual failure/conflict smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The Dirty Tab Close Failure Focus Polish did not include a fresh built-app manual failure/conflict smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The Discard All Draft Cleanup Polish did not include a fresh built-app manual restart smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The Editor Keyboard Editing Polish used Vite browser smoke only; repeat the new editor keyboard checklist in the built app before treating this path as distribution-grade.
- The UI Brush-up Search Overlay checks used Vite browser smoke only; repeat active-file search in the built app before treating this path as distribution-grade.
- The Find Close Polish did not include a fresh built-app manual active-file search pass; use the updated close-button check before treating this path as distribution-grade.
- The Workspace Image Preview / Quality Automation, content-validation, and close-return checks did not include a fresh built-app image-selection smoke pass; use the updated workspace image checklist before treating this path as distribution-grade.
- The Local Bundle Launch Metadata Polish verified generated bundle metadata and ad-hoc signing, but the current automation session could not complete `open -n`; repeat built-app launch and native File menu smoke outside this automation environment before treating this path as distribution-grade.
- Long file name clipping was re-smoked in the workspace tree during Source Preview Quality Polish. A narrower-window pass is still useful before binary distribution readiness.

## Risks / Unknowns

- Unsaved draft restore is intentionally explicit and fingerprint-bound. It is a safety net, not an autosave system, and does not merge with changed disk content.
- Workspace listing is intentionally lazy and not a project index. Very large directories can still be partially listed when a single folder exceeds the per-folder cap.
- Save-conflict recovery is explicit but still simple. There is no merge editor or diff-assisted recovery flow yet.
- Undo/redo remain CodeMirror defaults and have not received dedicated product-level controls beyond preserving the active editor session during theme changes.
- The app is ad-hoc signed for local build validation, but it is not Developer ID signed or notarized.
- The GitHub remote is configured over HTTPS. SSH access previously failed with `Permission denied (publickey)`.

## Next Actions

1. Run recurring automation from `docs/development-automation.md` in the Source Preview Quality Polish lane.
2. Start each automation run from one narrow built-app smoke section in `docs/smoke-checklist.md`, then fix only the smallest actionable issue found.
3. Re-smoke long file name / constrained-width layout before binary distribution readiness.
4. Use `docs/source-release-checklist.md` as the source-only release boundary and do not tag or publish without explicit approval.
5. Add focused UI/E2E coverage for draft restore and external-change focus recheck before treating them as distribution-grade behavior.
6. Keep signing, notarization, and installer packaging separate from source-release and workspace hardening.

## Avoid

- Do not add Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows during the next workspace polish slices.
- Do not expand workspace persistence into project indexing or background scanning.
- Do not treat the current build as distribution-ready.
