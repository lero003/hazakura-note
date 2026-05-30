# Smoke Checklist

Status: Operational
Scope: Manual prototype checks
Authority: Medium
Last reviewed: 2026-05-30

Use this checklist after changes to file creation, file opening, workspace listing, tabs, saving, preview rendering, theme handling, workspace restoration, search, or save-conflict handling.

Latest built-app source-release pass: 2026-05-27 with `/tmp/hazakura-note-release-smoke-20260527202313`. Confirmed New File create/existing-file non-overwrite, Open -> Edit -> Save, CRLF/final-newline preservation, conflict stop, save-failure recovery, dirty-tab close cancellation, app/window close cancellation, active-file search, Japanese IME composition guard, lazy workspace tree partial listing, theme switching/session persistence, and sanitize preview.

Latest Text Editor Usability Pack pass: 2026-05-27 with `/tmp/hazakura-note-usability-smoke.VHMxWZ`. Confirmed active-tab byte/character/line-ending/final-newline metadata, CRLF clean-open behavior, explicit LF conversion and save, Save As to `.log`, preview toggle, and safe image preview policy.

Latest Editor Reliability / Navigation Pack pass: 2026-05-27 with Vite browser smoke at `http://127.0.0.1:1420/`. Confirmed case/regex UI wiring, invalid regex reporting, Go to Line movement/status, cursor line/column status, and editor display setting restoration after reload.

Latest Source Preview Quality Polish pass: 2026-05-27 with `/Users/keisetsu/Projects/hazakura-note-smoke-paid-quality`. Confirmed built-app workspace switching, hidden/heavy directory exclusion, long filename clipping in the tree, Markdown and CRLF metadata, search highlights, external-change recheck on tab return, and Go to Line accessibility naming.

Latest Dirty Tab Close Failure Focus Polish checks: 2026-05-28 automated gates passed after updating the inactive-tab failed-selection path. No fresh built-app manual smoke was claimed.

Latest Discard All Draft Cleanup Polish checks: 2026-05-28 automated gates passed after clearing discarded app/window close drafts before close. No fresh built-app manual smoke was claimed.

Latest Editor Keyboard Editing Polish checks: 2026-05-28 with Vite browser smoke at `http://127.0.0.1:1421/`. Confirmed Tab inserts indentation in the editor, selected lines indent/outdent with Tab / Shift+Tab, and Shift+Arrow selects text without moving focus away from the editor. No fresh built-app manual smoke was claimed.

Latest Find Close Polish checks: 2026-05-28 automated gates passed after making the Find close button clear the query and highlights like Escape. No fresh built-app manual smoke was claimed.

Latest Workspace Image Signature Coverage checks: 2026-05-28 automated gates passed after expanding Rust coverage for PNG/JPEG/GIF/WebP content signatures and extension/signature mismatch rejection. No fresh built-app manual smoke was claimed.

Latest Workspace Image Size Limit Coverage checks: 2026-05-28 automated gates passed after adding Rust coverage for rejecting workspace image previews above 20 MB. No fresh built-app manual smoke was claimed.

Latest Workspace Image Close Return checks: 2026-05-28 automated gates passed after restoring the prior text tab when Cmd+W closes a selected workspace image preview. `open -n` still returned `kLSNoExecutableErr` in the automation session, so no fresh built-app manual smoke was claimed.

Latest Local Bundle Launch Metadata Polish checks: 2026-05-28 build output confirmed `LSRequiresCarbon => false`, `CFBundleExecutable => "hazakura-note"`, and valid ad-hoc signing. No fresh built-app manual UI smoke was claimed because `open -n` still returned `kLSNoExecutableErr` in this automation session.

Latest Local Bundle Minimum System Version checks: 2026-05-28 build output confirmed `LSMinimumSystemVersion => "11.0"`, matching the Rust executable's `minos 11.0`, and valid ad-hoc signing. No fresh built-app manual UI smoke was claimed because `open -n` still returned `kLSNoExecutableErr` in this automation session.

Latest Agent Workbench Automated Stabilization checks: 2026-05-28 automated gates passed with fake allowlist providers. No real `codex` / `opencode` manual smoke was claimed.

Latest Agent Workbench xterm Terminal Surface checks: 2026-05-28 automated gates passed after replacing the simple log/input surface with an xterm-based provider terminal, compacting the Agent pane header, and passing xterm rows/columns to the backend PTY. Rust coverage now verifies real PTY `stty size` at launch and after resize. Real `codex` / `opencode` behavior remains trusted-workspace manual smoke.

Latest Agent Workbench Trusted Provider Smoke Readiness checks: 2026-05-29 automated gates passed after updating the manual smoke path and result template for the compact xterm Agent pane. No real `codex` / `opencode` manual smoke was claimed by this update.

Latest Agent Workbench OpenCode trusted-provider observation: 2026-05-29 user smoke reported OpenCode CLI launched, OpenCode Zen/free model could edit a local file, and the xterm pane rendered the TUI. Initial input felt very slow, then follow-up smoke after the responsiveness change reported basic input speed was comfortable. Real `codex` / `opencode` behavior remains trusted-workspace manual smoke, not automated provider-internal approval.

Latest app icon update: 2026-05-29 automated build passed after replacing the local Tauri icon assets with a centered `🌸` emoji mark on a soft pink rounded base. Built-app launch or Dock visual smoke is still useful before distribution readiness.

Latest start panel layout polish: 2026-05-29 built-app smoke confirmed the no-file start panel keeps the Japanese heading on one line, places recent files below the primary actions, and still starts in Safe Editor surface with no file open.

Latest Finder text document open checks: 2026-05-29 built-app smoke confirmed a `.json` file passed through macOS open-file handling opens as a normal clean editor tab, and the app quits cleanly after the smoke.

Latest Japanese status bar localization checks: 2026-05-29 built-app smoke confirmed Japanese menu mode shows the idle status as `準備完了` instead of `Ready` on the no-file start surface.

Latest Agent pane Japanese copy polish checks: 2026-05-29 automated gates passed after replacing visible Japanese-mode `Agent provider` wording with `Agent プロバイダー` and smoothing the idle/running Agent state copy.

Latest Japanese editor chrome localization checks: 2026-05-29 built-app smoke confirmed Japanese menu mode localizes Markdown helper accessibility labels/tooltips, the line-ending control, Find row labels/options, Go to Line controls, Markdown helper status messages, and active-document status metadata.

Latest Japanese recovery banner copy checks: 2026-05-29 automated gates passed after localizing Japanese-mode unsaved draft, external-change conflict, and non-conflict save-error recovery banner copy/actions. No fresh external-change scenario smoke was claimed.

Latest Non-Git file comparison label polish checks: 2026-05-29 built-app Safe Editor surface was inspected before the change, then automated gates passed after replacing visible comparison-view `Diff` / `Compare` wording with file-comparison language. No fresh file-comparison interaction smoke was claimed.

Latest file comparison column readability checks: 2026-05-29 built-app launch was attempted, but Computer Use could not inspect the window in this run. Automated gates passed after adding source/target/content column headers to the existing file-comparison view. No fresh file-comparison interaction smoke was claimed.

Latest file comparison target gating checks: 2026-05-30 automated gates passed after limiting Set as compare source / Compare with source actions to common text-document filenames while leaving Open and Copy full path available for other workspace files. No fresh file-comparison interaction smoke was claimed.

Latest file comparison wording alignment checks: 2026-05-30 automated gates passed after clarifying the second context-menu action as Compare with source / 比較元と比較 and aligning the README feature/limit wording with the existing explicit non-Git file-comparison behavior. No fresh file-comparison interaction smoke was claimed.

Latest Japanese side-pane tab copy checks: 2026-05-30 built-app surface inspection confirmed Japanese mode still showed the right-pane tabs as `プレビュー` / `Agent`; automated gates passed after changing the Japanese Agent tab label to `エージェント`. No Agent provider session was started.

Latest Japanese image preview header copy checks: 2026-05-30 automated gates passed after making the workspace image preview header follow the menu language, using `画像プレビュー` in Japanese mode. No fresh image-selection interaction smoke was claimed.

Latest Japanese Agent mode badge copy checks: 2026-05-30 built-app surface inspection confirmed Japanese mode still showed the top toolbar badge as `Agent モード`; automated gates passed after changing it to `エージェントモード` / `エージェントモード: 再起動待ち`. No Agent provider session was started.

Latest Japanese Agent Workbench mode-gate copy checks: 2026-05-30 built-app surface inspection confirmed Japanese Agent mode was active, the top badge was localized, and the app menu still showed `Agent Workbench...` in Japanese mode. Automated gates passed after smoothing the Japanese Agent Workbench dialog title, mode toggle, restart-required wording, provider control label, responsibility-boundary consent, badge tooltip, and native app-menu Agent Workbench label. No Agent provider session was started.

Latest Japanese Agent Workbench accessibility copy checks: 2026-05-30 automated gates passed after localizing the Japanese side-pane Agent Workbench label, Agent Workbench dialog close button label, mode/session/boundary section labels, consent status messages, and launch-gate status text. Built-app smoke confirmed the app menu and Agent Workbench dialog accessibility tree use the Japanese labels. No Agent provider session was started.

Latest start panel language alignment checks: 2026-05-30 Vite browser smoke confirmed the English no-file start surface now shows `Start writing quietly` instead of the Japanese heading. The Japanese heading remains `静かに書き始める` through the shared start-surface copy path.

Latest right-pane toggle / encoding polish checks: 2026-05-30 Vite browser smoke confirmed the Safe Editor no-file surface still loads without a side pane. Automated gates passed after moving Preview / Agent controls to the top editor chrome as open/close toggles, adding UTF-8 to document metadata, and reducing redundant Agent session-state updates during active provider polling.

Latest Agent Workbench macOS menu-bar stability check: 2026-05-30 user smoke confirmed macOS File / View menu popovers no longer immediately close while an Agent provider session is running after Agent UI refresh is suspended when the pointer moves into the app header or the app loses focus, then resumed when the terminal is re-engaged. Returning from another app can still require an extra click before terminal input is focused; this appears to be a lower-priority macOS activation/first-click polish item rather than the menu-close regression.

Latest Non-Git diff/review readiness checks: 2026-05-30 automated gates passed after shifting file comparison toward a dedicated GitHub-PR-like split Diff workbench mode, then tightening setup into explicit source and target slots with a Compare button. The slots can be filled by Diff-mode workspace row clicks or side-specific context-menu actions; drag selection is intentionally out of scope for this flow. Active buffer-versus-disk, draft-versus-disk, and conflict local-edits-versus-disk review entry points use the same non-Git comparison surface. No fresh built-app diff/review interaction smoke was claimed.

Latest Diff empty-state polish checks: 2026-05-30 Vite browser smoke confirmed the no-file / no-workspace surface loads, Diff opens as a main workbench, the center editor area is hidden, Compare remains disabled, and the setup copy now asks the user to open a workspace folder before choosing source/target files. No fresh built-app file-comparison interaction smoke was claimed.

Latest narrow viewport containment polish checks: 2026-05-30 Vite browser smoke confirmed the app root stays at the viewport left edge with document horizontal scroll held at `0` on the no-file and Diff empty-state surfaces. No fresh built-app narrow-window smoke was claimed.

Latest Markdown outline navigation checks: 2026-05-30 Vite browser smoke confirmed the no-file Safe Editor surface loads with a disabled Outline toggle, and automated gates passed after adding a current-file Outline toggle that lists ATX Markdown headings outside fenced code blocks and jumps the editor to the selected heading line. No fresh built-app outline interaction smoke was claimed.

Latest Markdown current-section context checks: 2026-05-30 Vite browser smoke confirmed the no-file Safe Editor surface still loads with Outline disabled, and automated gates passed after adding current-section status-bar context from the cursor line and highlighting the matching heading in the Outline pane. No fresh built-app outline interaction smoke was claimed.

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

## Finder Text Document Open

1. Build the app.
2. Create a throwaway `.json` file outside the repo.
3. Open it through Finder/app-icon drag or `open -n path/to/file.json -a src-tauri/target/release/bundle/macos/hazakura-note.app`.
4. Confirm it opens as a normal clean editor tab, not an image preview or Agent surface.
5. Repeat while the app is already running and confirm the same tab path is focused instead of duplicated.
6. Quit the app after the smoke and confirm no hazakura-note process is left running.

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

## File Comparison

1. Open a throwaway folder outside the repo with at least two small text or Markdown files.
2. Click Diff in the top editor chrome and confirm the center editor area is hidden while a Diff setup workbench fills the main content area.
3. Click the first comparable file in the left workspace tree and confirm it fills the Compare source / 比較元 slot instead of opening the file.
4. Click the second comparable file and confirm it fills the Compare target / 比較先 slot.
5. Click Compare / 比較する and confirm the workbench opens a GitHub-PR-like split Diff view with source line numbers/text on the left and target line numbers/text on the right.
6. Close the comparison result and confirm Diff mode returns to setup with the source/target selection still understandable.
7. Right-click comparable files and choose Set as compare source / 比較元にする or Set as compare target / 比較先にする to confirm context-menu side selection still works.
8. Confirm dragging is not required for the Diff setup flow; click and context-menu selection are the supported paths.
9. Confirm additions are shown on the right, removals on the left, and changed lines appear aligned when practical.
10. Confirm the labels say Diff or non-Git file/workspace comparison language, and do not mention Git status, branch, staging, commit, or repository state.
11. Right-click an image or obvious non-text file such as `.DS_Store` if present and confirm compare actions are disabled while Open and Copy full path remain available.
12. Toggle Diff off and confirm the editor, workspace tree, and active tab remain usable.

## Change Review

1. Open a small text or Markdown file in a throwaway workspace.
2. Edit the file without saving and confirm Review changes / 変更を確認 appears in the top editor chrome.
3. Click Review changes / 変更を確認 and confirm the side pane opens a Change review / 変更確認 view comparing Disk / ディスク to Editor / エディタ.
4. Confirm the line counts reflect the local edit and no Git status, branch, staging, commit, or repository state appears.
5. Create a recoverable unsaved draft, relaunch, and confirm the draft banner offers Review changes / 変更を確認 before Restore draft / 下書きを復元.
6. Click the draft Review changes action and confirm Disk / ディスク is compared to Draft / 下書き before choosing restore or discard.
7. Trigger an external-change conflict on a dirty tab and confirm the conflict banner offers Review changes / 変更を確認 before Reopen from disk / Close without saving / Keep editing.
8. Click the conflict Review changes action and confirm Disk / ディスク is compared to Editor / エディタ while the recovery choices remain explicit and no overwrite happens automatically.

## Markdown Outline Navigation

1. Open a Markdown file with several ATX headings such as `#`, `##`, and `###`.
2. Click Outline / 見出し in the top editor chrome and confirm a right-side document outline opens.
3. Confirm headings inside fenced code blocks are not listed.
4. Click a heading in the outline and confirm the editor jumps to that heading line.
5. Move the cursor under a different heading and confirm the status bar shows the current section / 現在の見出し context.
6. Confirm the matching Outline row is highlighted as the cursor moves through sections.
7. Toggle Outline off and confirm the editor remains active and the tab contents are unchanged.
8. Open a Markdown file without headings and confirm the Outline pane shows the empty-heading message instead of stale headings from the prior file.

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
7. Confirm Preferences and Agent Workbench are not in the File or View menu.
8. Open hazakura-note > Settings and confirm Font size, Tab size, Theme, Preview, Wrap, Invisibles, and Menu language persist after restart.
9. Change Menu language to Japanese and confirm the native app/File/Edit/View/Window/Help menu labels, empty start surface, workspace labels and workspace context menu, right-pane toggle labels, workspace image preview header, common status bar messages, preview unavailable messages, Preferences labels, and Agent Workbench pane/mode-gate copy update.
10. Open hazakura-note > Agent Workbench and confirm it shows Agent mode, provider/session summary, and responsibility-boundary controls separately from Preferences.
11. Toggle Agent Workbench mode and confirm the restart-required state includes an explicit restart button.
12. Relaunch with Agent Workbench mode active and confirm the top toolbar shows the Agent Mode / エージェントモード badge.
13. Open a text file and confirm the status metadata includes UTF-8.
14. Use the Preview, Diff, Outline, and Agent controls in the top editor chrome and confirm each button opens and closes its pane/workbench without requiring a tab strip inside the right pane.

## Agent Workbench Trusted Workspace Manual Smoke

Use this only in a trusted throwaway workspace. Do not use a repository with important uncommitted work. This smoke confirms hazakura-side launch, input, output, stop, and external-change observation; it does not approve or validate real provider-internal behavior.

Run this once per provider when practical. If only one provider is installed, record the other provider as not run or provider-not-found rather than installing or configuring it during the smoke.

Setup:

1. Build the app first.
2. Create a trusted throwaway workspace outside this repo, with one small Markdown file.
3. Choose one provider to smoke: `codex` or `opencode`.
4. If the selected provider is not installed or not found by the app search path, record the result as provider-not-found and stop there.

Safe Editor default:

1. Launch hazakura-note normally.
2. Confirm Safe Editor Mode is active.
3. Confirm the Agent Workbench pane is not visible before enabling Agent Workbench.

Mode gate:

1. Open hazakura-note > Agent Workbench.
2. Turn Agent Workbench on.
3. Confirm the UI says restart is required before Agent UI or backend launch commands change.
4. Quit and relaunch the app.
5. Reopen Agent Workbench and confirm Agent Workbench mode is active for this app session.
6. Select the provider.
7. Read the responsibility-boundary list and acknowledge consent.

Launch and session:

1. Open the trusted throwaway workspace folder.
2. Switch the right pane to Agent.
3. Confirm the pane shows compact provider/session/runtime status and gives most of the right pane height to the xterm terminal surface.
4. Right-click the small Markdown file in the workspace tree and choose Copy full path; confirm the clipboard contains the file path string, not file contents.
5. Drag the file row if practical and confirm the drag payload can be used as text/path input rather than a file-copy operation.
6. Click Start session.
7. If the provider is missing, confirm the UI reports provider not found and no session starts.
8. If the provider is found, confirm one session starts, launch gate is passed, runtime status becomes active/running, and terminal output mentions the provider start.
9. While the session is active, confirm provider selection is disabled.
10. Right-click the small Markdown file again and confirm Send full path to Agent is available only while the session is running.
11. Choose Send full path to Agent and confirm only the selected workspace file path is sent as plain input, without hazakura adding a shell command or arbitrary path field.
12. Type only harmless, user-chosen input into the terminal surface. Do not approve provider-internal command execution or file edits unless intentionally testing in the throwaway workspace.
13. Confirm the provider receives input and terminal control output is rendered by the terminal surface instead of appearing as raw escape text.
14. If testing file-targeted agent work, use only the copied/sent full path string in the provider prompt; hazakura should not expose an arbitrary path input field.
15. Resize the right pane if practical and confirm the provider terminal remains usable.
16. Click Stop session.
17. Confirm session/runtime status becomes stopped or exited and terminal output records the stop or exit.
18. Confirm terminal input no longer reaches the provider after stop.

External-change path, optional:

1. Only inside the throwaway workspace, intentionally allow the provider to edit the small Markdown file.
2. If the file is open and clean in hazakura-note, confirm the editor content refreshes from disk without pressing Save.
3. Confirm the status bar reports the external refresh.
4. Repeat with unsaved local edits in the same tab and confirm hazakura shows the external-change recovery choices instead of overwriting either side.
5. Confirm hazakura does not auto-approve, auto-commit, or make a Git decision for the provider-made change.
6. If the file was not already open, open it manually and treat the provider-made contents as an ordinary on-disk file change.
7. Decide manually whether to keep, reload, discard, or inspect the provider-made change outside hazakura-note.

Close cleanup:

1. Start a provider session in the throwaway workspace.
2. Quit hazakura-note without using Stop first.
3. Confirm no session is restored on relaunch.
4. If practical, confirm the provider process did not remain running.

Record:

- Date:
- App build path:
- Workspace path:
- Codex provider found: yes/no/not run
- Codex launch/start result:
- Codex input/render result:
- Codex stop result:
- Codex quit cleanup result:
- Codex optional external-change result:
- OpenCode provider found: yes/no/not run
- OpenCode launch/start result:
- OpenCode input/render result:
- OpenCode stop result:
- OpenCode quit cleanup result:
- OpenCode optional external-change result:
- Notes or follow-up:

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
5. Press Cmd+W and confirm the image preview closes without closing the app, returning to the text tab that was active before opening the image when one is still open.
6. Add a text file renamed with a supported image extension such as `not-image.png`, select it from the tree, and confirm it is rejected instead of previewed.
7. Add a supported image file above 20 MB, select it from the tree, and confirm it is rejected instead of previewed.
8. Open the Markdown file from the same tree and confirm text editing, tabs, and Markdown preview still work normally.
9. Add a Markdown local image reference to the text file and confirm the Markdown preview still shows an image-blocked note instead of loading it.

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
2. While the app tab is clean, modify the same file outside the app.
3. Switch away and back to the tab, refocus the app, or use an active Agent Workbench session, and confirm the editor refreshes to the on-disk content with an external refresh status.
4. Edit the file in the app without saving.
5. Modify the same file outside the app.
6. Click Save in the app.
7. Confirm the app shows an outside-hazakura change message with Reopen from disk / Close without saving / Keep editing.
8. Confirm the file on disk still contains the external change, not the app's unsaved text.
9. Click Keep editing and confirm the local editor text remains.
10. Trigger the conflict again and click Reopen from disk.
11. Confirm the editor, preview, and status all show the external disk content.
12. Trigger the conflict once more if needed and confirm Close without saving closes the tab without overwriting disk.
13. Repeat by modifying the file outside the app, then switch away and back to the tab or refocus the app before pressing Save.
14. Confirm the app detects the external change and stops with the same recovery choices before the user relies on Save.

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
