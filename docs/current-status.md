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
- Preferences includes an Agent Workbench developer-mode gate. Changing it stores the requested mode and requires restart before Agent UI or backend launch-command availability changes.
- When Agent Workbench mode is active for the current app session, Preferences shows only allowlisted provider choices (`codex` / `opencode`) and requires explicit responsibility-boundary consent before the backend launch gate can pass.
- When Agent Workbench mode is active and consent is acknowledged, the right pane can switch between Preview and a compact Agent pane shell that displays provider/session state above an expanded xterm-based terminal surface. The shell can start one allowlisted provider process in the selected workspace root, render PTY output, send terminal input to it, resize the backend PTY from xterm rows/columns, and stop it through the runtime adapter boundary.
- The app window title follows the active file and marks unsaved state, so the redundant in-app title header is no longer shown.
- The workspace header includes a small open-folder action for switching workspace without returning to the native menu.
- Save writes the editor text without adding or removing a final trailing newline by policy; Rust tests cover LF and CRLF final-newline presence.
- Markdown preview shows embedded `data:image` PNG/JPEG/GIF/WebP images and blocks external or local image references with an in-preview note.
- Markdown preview wraps GFM tables in a scrollable table frame with clearer headers, grid lines, row striping, and alignment support.
- Selecting a PNG/JPEG/GIF/WebP file up to 20 MB in the workspace tree opens a read-only local image preview in the work area after a lightweight content-signature check, without adding Markdown local-image loading. Closing that image preview returns to the prior text tab when one is still open.
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
- Read-only local workspace image preview for PNG/JPEG/GIF/WebP files up to 20 MB, with extension and content-signature validation
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
- Agent Workbench mode gate in Preferences, with requested mode stored separately from the active app-session mode
- Agent Workbench provider/consent gate in Preferences, visible only when Agent Workbench is active for the current app session
- Agent Workbench right-pane shell, visible only after active-session mode and consent gates pass, with compact provider/session state, bounded PTY-backed xterm output/input, PTY resize from xterm rows/columns, and no arbitrary command, shell selector, auto-apply, auto-commit, or Git integration
- Rust-side Agent Workbench launch preflight, runtime adapter, and in-memory session lifecycle that rejects disabled mode, unacknowledged consent, non-allowlisted providers, invalid workspace roots, provider-not-found starts, adapter failures, stop-adapter failures, and second active sessions before starting an allowlisted provider process
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
- Local macOS `.app` bundle icon resource, explicit non-Carbon launch metadata, macOS 11.0 minimum-system metadata aligned with the Rust binary, and ad-hoc signing for build-output validation

## Verification

Commands run successfully:

```bash
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```

Agent Workbench xterm Terminal Surface on 2026-05-28:

- The Agent pane now uses an xterm-based terminal surface instead of the previous simple log view and textarea input.
- PTY output is passed through to xterm so terminal control sequences are rendered by the terminal emulator instead of printed as raw text.
- The Agent pane status area was compacted so the terminal surface gets most of the right pane height.
- xterm fit dimensions are sent to the backend at provider launch and on terminal resize, and the backend applies them to the provider PTY.
- Terminal data from the xterm surface is sent only to the existing running allowlisted provider session and is not stored as output history, so key-by-key input does not consume the bounded provider-output buffer. No arbitrary command input, shell selector, provider-add UI, session restore, auto-apply, auto-commit, or Git integration was added.
- The backend gate, allowlisted provider lookup, single-session lifecycle, runtime stop boundary, bounded output buffer, and no-restore behavior are unchanged.
- `@xterm/xterm` and `@xterm/addon-fit` were added as frontend dependencies.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 64 Rust tests, including invalid/no-session/active/exited terminal resize coverage, real PTY `stty size` verification for launch-time and runtime terminal resize, and exited-session input rejection.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent Workbench UI visible.
- Real `codex` / `opencode` behavior still needs trusted-workspace manual smoke because provider-internal behavior is outside hazakura-side automation.

Agent Workbench Mode Gate Foundation on 2026-05-28:

- Preferences now stores requested Agent Workbench mode separately from the app-session active mode, so enable/disable changes require restart before taking effect.
- A Rust `start_agent_workbench_session` entry exists only as a gate. It validates active mode, allowlisted provider, and workspace root, then stops with a not-implemented message before any launch.
- No PTY, xterm, TUI rendering, CLI process spawn, auto-apply, Git flow, multiple sessions, or session restore was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 28 Rust tests, including disabled-mode rejection, non-allowlisted provider rejection, workspace-root validation, and foundation-build no-launch behavior.
- Browser smoke at `http://127.0.0.1:1421/` confirmed the app loads and Agent Workbench UI is not visible during normal Safe Editor startup.
- `git diff --check` passed.

Agent Workbench Provider/Consent Gate on 2026-05-28:

- Preferences now shows provider selection and responsibility-boundary consent only when Agent Workbench is active for the current app session.
- Provider selection is fixed to the allowlist `codex` / `opencode`; no arbitrary command, shell, path, PTY, xterm, or process-spawn UI was added.
- Consent is stored in `localStorage` and passed to the Rust launch gate.
- The Rust `start_agent_workbench_session` gate now validates active mode, acknowledged consent, allowlisted provider, and workspace root before stopping with the existing not-implemented message.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 30 Rust tests, including disabled-mode rejection, unacknowledged-consent rejection, non-allowlisted provider rejection, invalid-workspace rejection, and foundation-build no-launch behavior.

Agent Workbench Pane Shell on 2026-05-28:

- The right pane now exposes Preview / Agent modes only when Agent Workbench is active for the app session and responsibility-boundary consent is acknowledged.
- The Agent pane shell shows the selected provider, workspace root, consent state, and backend launch-gate state.
- With no selected workspace root, the Agent pane reports launch unavailable and the gate-check button is disabled.
- The gate-check button calls the existing backend launch gate; a passed gate still reports launch not implemented instead of starting a CLI. This was later replaced by structured Host Preflight.
- No arbitrary command input, arbitrary path input, shell selector, PTY, xterm, CLI process launch, multiple sessions, session restore, auto-apply, auto-commit, or Git integration was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 30 Rust tests.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without an Agent side-pane switch.

Agent Workbench Host Preflight on 2026-05-28:

- `start_agent_workbench_session` now returns structured preflight state instead of starting a CLI process.
- The preflight validates active-session mode, responsibility-boundary consent, allowlisted provider, and workspace root before checking provider CLI availability.
- Provider CLI discovery is limited to allowlisted `codex` / `opencode` names on `PATH`; non-allowlisted command names are rejected before lookup.
- The Agent pane now shows provider availability. Missing provider CLI is reported as provider not found, while found provider CLI reports preflight passed / launch not implemented.
- No arbitrary command input, arbitrary path input, shell selector, PTY, xterm, CLI process launch, multiple sessions, session restore, auto-apply, auto-commit, or Git integration was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 Rust tests, including command-level rejection for disabled mode, unacknowledged consent, non-allowlisted providers, invalid workspace roots, and allowlist-only provider lookup.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without an Agent side-pane switch or Agent pane.
- `git diff --check` passed.

Agent Workbench Session Lifecycle Stub on 2026-05-28:

- `start_agent_workbench_session` now creates an in-memory session stub only after preflight passes and the allowlisted provider CLI is found on `PATH`.
- The session stub records provider, workspace root, provider path, `createdAtMs`, and status. It does not start a CLI process.
- Provider not found returns no session stub. Active sessions reject a second start until stopped.
- `stop_agent_workbench_session` marks the current stub stopped without process management, and `get_agent_workbench_session_state` returns the current in-memory stub state or none.
- Session stubs are not persisted, restored, or treated as process state after restart.
- The Agent pane now shows session status and exposes Start session stub / Stop session stub controls.
- No arbitrary command input, arbitrary path input, shell selector, PTY, xterm, CLI process launch, multiple sessions, session restore, auto-apply, auto-commit, or Git integration was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 40 Rust tests, including session-stub creation, provider-not-found no-session behavior, second-active-session rejection, stop-to-stopped behavior, and fresh-store no-restore behavior.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent switch, Agent pane, or session-stub controls.
- `git diff --check` passed.

Agent Workbench Runtime Adapter Stub on 2026-05-28:

- Session stub creation now goes through an `AgentRuntimeAdapter` boundary instead of constructing future runtime state directly inside lifecycle code.
- The default adapter is a stub adapter. It receives only allowlisted provider, canonical workspace root, and resolved provider path, then returns a runtime handle with status `stubbed/not_started`.
- Runtime stub handles are stored on the session stub but do not include process IDs, stdio handles, PTY handles, or any real CLI process state.
- Provider-not-found starts do not call the adapter or create a session stub. Adapter failure also creates no session stub. A second active-session start is rejected before calling the adapter again.
- The Agent pane now shows runtime status when a session stub exists.
- No arbitrary command input, arbitrary path input, shell selector, PTY, xterm, CLI process launch, multiple sessions, session restore, auto-apply, auto-commit, or Git integration was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 42 Rust tests, including adapter invocation, canonical workspace/provider path handoff, provider-not-found no-adapter behavior, adapter-failure no-session behavior, no second adapter call while active, and no process-resource fields on runtime handles.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent switch, Agent pane, runtime status, or session-stub controls.
- `git diff --check` passed.

Agent Workbench Runtime Stop Adapter Stub on 2026-05-28:

- Session stub stopping now goes through the `AgentRuntimeAdapter` stop boundary before the session is marked stopped.
- The stub stop returns a runtime handle with status `stubbed/stopped` while preserving the same allowlisted provider, canonical workspace root, and resolved provider path.
- Stop-adapter failure leaves the session active with its previous `stubbed/not_started` runtime handle.
- Stopping with no session does not call the runtime adapter.
- No CLI process kill, PTY close, stdio close, arbitrary command input, shell selector, session restore, auto-apply, auto-commit, or Git integration was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 44 Rust tests, including runtime stop adapter invocation, stop-handle handoff, stopped runtime status, no-session no-adapter behavior, stop-adapter failure preservation, and no process-resource fields on runtime handles.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent switch, Agent pane, runtime status, or session-stub controls.
- `git diff --check` passed.

Agent Workbench Minimal Real Session Slice on 2026-05-28:

- `start_agent_workbench_session` now uses the runtime adapter to start exactly one allowlisted provider process from the resolved provider path, with `cwd` set to the canonical workspace root.
- Provider stdout/stderr are captured as bounded output chunks and shown in the Agent pane. The pane can send user input to the active provider stdin and stop the session.
- `get_agent_workbench_session_state` refreshes exited process state, and stopped/exited sessions are not persisted or restored after restart.
- The backend still rejects disabled mode, unacknowledged consent, non-allowlisted providers, invalid workspace roots, provider-not-found starts, launch failures, and second active sessions before process launch.
- No arbitrary command field, arbitrary path field, shell selector, multiple sessions, session restore, auto-apply, auto-commit, Git integration, or prompt auto-submit was added.
- PTY/xterm integration is still not implemented; the current real-session slice uses process pipes, so full-screen TUI behavior may be limited.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 46 Rust tests, including real provider process start, stdout capture, stdin input, stop-through-adapter behavior, no-session no-adapter behavior, stop failure preservation, and no arbitrary command handoff through the launch request.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent switch, Agent pane, runtime status, session controls, or Agent input.
- `git diff --check` passed.

Agent Workbench Real Session Stabilization on 2026-05-28:

- The earlier simple Agent output view auto-scrolled and labeled stdout, stderr, input, and system chunks separately; the current xterm surface sends input directly to the provider and keeps output history focused on provider/system output.
- The output buffer is fixed at 500 chunks; when it overflows, older chunks are discarded first.
- Active sessions keep provider changes disabled and warn if the selected workspace changes while the process remains bound to its launch workspace.
- Stopped or exited sessions reject new input, and stdin failures return an error without mutating the stored session state.
- Store drop / app close cleanup kills and waits for any running provider process.
- Existing external-change/conflict handling remains the path for files changed by the launched CLI.
- No PTY, xterm, full-screen TUI support, arbitrary command field, arbitrary path field, shell selector, multiple sessions, session restore, auto-apply, auto-commit, Git integration, or prompt auto-submit was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 50 Rust tests, including output pruning, stream distinctions, exited state, stopped-session input rejection, stdin failure preservation, active-session second-start rejection across provider/workspace changes, and drop cleanup.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent switch, Agent pane, runtime status, session controls, Agent input, or output-limit status.
- `git diff --check` passed.

Agent Workbench Automated Stabilization Harness on 2026-05-28:

- Rust-side Agent Workbench tests now use a reusable fake allowlist provider fixture for process-based lifecycle checks.
- Fake providers cover large stdout output pruning, stderr capture, immediate provider exit, abnormal provider exit, stdin/write-failure preservation, long-running stop cleanup, and store-drop cleanup without requiring real `codex` / `opencode` automation.
- The Agent pane output counter now states that the oldest chunks are pruned at the 500-chunk limit, and disabled controls expose minimal state-specific hints.
- Agent Workbench boundary docs now state that automated stabilization is fake-provider centered; real provider checks remain trusted-workspace manual smoke, not automated approval of provider-internal behavior.
- No PTY, xterm, full-screen TUI support, real provider internal automation, arbitrary command field, arbitrary path field, shell selector, multiple sessions, session restore, auto-apply, auto-commit, or Git integration was added.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 53 Rust tests.
- `npm run build` passed and regenerated the local macOS `.app` bundle.
- Browser smoke at `http://127.0.0.1:1421/` confirmed normal Safe Editor startup loads without Agent Workbench, Agent input, or output-limit status. The known Vite-only Tauri menu-listener warning still appeared outside the Tauri runtime.

Agent Workbench Manual Smoke Readiness on 2026-05-28:

- `docs/smoke-checklist.md` now includes an Agent Workbench Trusted Workspace Manual Smoke section.
- The checklist keeps real `codex` / `opencode` checks scoped to a trusted throwaway workspace and explicitly avoids provider-internal auto-approval.
- The manual smoke path covers Safe Editor default visibility, restart-required mode gate, provider/consent setup, provider-not-found behavior, one real session start, terminal input delivery, stop/exited state, optional external-change observation, close cleanup, and a result record template.
- No real provider manual smoke is claimed by this documentation update.

Agent Workbench Provider Discovery Polish on 2026-05-28:

- Backend preflight now builds an app search path from the app process `PATH`, user bin directories, and common macOS GUI-launch gaps such as Homebrew paths before resolving the allowlisted provider.
- The same app search path is passed to the launched provider process as `PATH`, so provider scripts using shebangs such as `#!/usr/bin/env node` can resolve their runtime when installed through Homebrew or common user-bin locations.
- Provider lookup still accepts only allowlisted `codex` / `opencode` names and does not expose arbitrary command lookup.
- View menu now includes an `Agent Workbench...` entry that opens Preferences, making the mode gate easier to find without adding Agent UI to normal Safe Editor startup.
- The provider-not-found UI wording now refers to the app search path instead of implying the user's Terminal `PATH`.
- `npm run build:vite` passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 56 Rust tests, including provider process `PATH` propagation for `env node` style launchers.
- `npm run build` passed and regenerated the local macOS `.app` bundle.

Agent Workbench Minimal PTY Runtime on 2026-05-28:

- The real Agent runtime now starts allowlisted providers behind a minimal macOS PTY instead of plain stdin/stdout pipes, so CLIs that require terminal stdin can pass their terminal check.
- User input still goes only to the active allowlisted provider process. The UI remains a simple output/input surface and does not implement xterm or full-screen TUI rendering.
- ANSI and terminal control sequences are stripped from displayed provider output so PTY-driven CLIs do not show raw escape codes in the simple Agent pane.
- Pipe-mode runtime tests remain available for stream-specific fake-provider coverage; the production runtime uses PTY mode.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed with 58 Rust tests, including a PTY fake-provider check that confirms provider stdin is a terminal, input reaches the provider, and terminal control sequences are stripped from display output.

Pre-release stabilization review intake on 2026-05-28:

- The accepted release boundary is `0.1.0 source-only developer preview`.
- Binary distribution, Developer ID signing, notarization, installer packaging, and auto-update remain out of scope.
- README build guidance now treats `npm ci` as the source-preview path; `npm install` is reserved for intentional dependency updates.
- `docs/source-release-checklist.md` now requires dependency audit checks and latest-HEAD built-app smoke evidence before tag approval.
- `docs/releases/0.1.0.md` is the release-note draft for GitHub Release copy.
- `docs/dmg-preview-checklist.md` records DMG distribution as a future, separate preview lane from the source-only release.
- Docs-only intake verification: `git diff --check` passed.
- No new latest-HEAD built-app smoke is claimed by this intake itself.

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
- Rust tests cover accepting supported PNG/JPEG/GIF/WebP previews, rejecting paths outside the workspace root, rejecting a `.png` file whose bytes are not image content, rejecting extension/signature mismatches, and rejecting images above the 20 MB preview limit.
- Automated local gates passed after this change; no fresh built-app manual smoke was claimed.

Workspace Image Size Limit Coverage checks on 2026-05-28:

- Added a Rust regression test that rejects workspace image previews above the 20 MB preview limit before producing a preview `data:` URL.
- `README.md`, `docs/roadmap.md`, and `docs/smoke-checklist.md` now state the same 20 MB workspace image preview boundary.
- `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build`, and `git diff --check` passed.
- No fresh built-app manual smoke was claimed.

Local Bundle Minimum System Version Polish checks on 2026-05-28:

- `src-tauri/tauri.conf.json` now sets the macOS bundle minimum system version to `11.0`, matching the Rust binary's `LC_BUILD_VERSION` minimum OS.
- `npm run build` regenerated the local `.app` bundle.
- `plutil -p src-tauri/target/release/bundle/macos/hazakura-note.app/Contents/Info.plist` confirmed `LSMinimumSystemVersion => "11.0"` while preserving `CFBundleExecutable => "hazakura-note"`.
- `otool -l src-tauri/target/release/bundle/macos/hazakura-note.app/Contents/MacOS/hazakura-note` confirmed the executable still reports `minos 11.0`.
- `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/hazakura-note.app` passed.
- `open -n src-tauri/target/release/bundle/macos/hazakura-note.app` still returned `kLSNoExecutableErr` in this automation session, so no fresh built-app manual UI smoke is claimed.

Workspace Image Close Return Polish checks on 2026-05-28:

- Closing a selected workspace image preview now restores the text tab that was active before the image was opened when that tab is still open, falling back to the first open text tab if needed.
- `docs/smoke-checklist.md` now asks the image-preview smoke to confirm Cmd+W returns to the prior text tab.
- Automated local gates passed after this change. `open -n src-tauri/target/release/bundle/macos/hazakura-note.app` still returned `kLSNoExecutableErr` in this automation session, so no fresh built-app manual smoke was claimed.

Warning-expected DMG preview local check on 2026-05-28:

- Lane: binary DMG preview only; this does not change the source-only developer preview release boundary.
- This was a local preview artifact check only. No tag, push, GitHub Release publication, or DMG attachment was performed.
- `npm ci`, `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build`, `npm run build:dmg-preview`, `npm audit`, `cargo audit`, and `git diff --check` passed or completed with triaged warnings.
- `cargo audit` completed with 17 warnings and no pasted vulnerability findings. The warnings are transitive Tauri/wry dependency advisories: unmaintained GTK3/gtk-rs Linux stack crates, `proc-macro-error`, `unic-*` crates through `tauri-utils` / `urlpattern`, and one `glib` unsoundness warning through the Linux GTK/WebKit dependency path. These are not treated as a macOS warning-expected DMG preview blocker, but should remain visible for Linux support and future Tauri dependency update review.
- `npm run build -- --bundles app,dmg` confirmed Tauri can reach the app bundle step, but the Tauri DMG bundler stalled in Finder/`osascript` layout handling and was stopped before publication. The warning-expected lane now uses `scripts/build-warning-dmg-preview.sh` to avoid that Finder layout dependency.
- A plain local preview DMG was generated from the freshly built app with `npm run build:dmg-preview`: `src-tauri/target/release/bundle/dmg/hazakura-note_0.1.0_aarch64-warning-expected.dmg`.
- DMG SHA-256: `68d45b3699e4f3f3c529448bdbdbe6e24bb541586be4e3cbbf2a74d4104a716a`.
- Checksum file: `src-tauri/target/release/bundle/dmg/hazakura-note_0.1.0_aarch64-warning-expected.dmg.sha256`; `shasum -c` passed.
- `hdiutil verify src-tauri/target/release/bundle/dmg/hazakura-note_0.1.0_aarch64-warning-expected.dmg` passed.
- The DMG mounted read-only, contained `hazakura-note.app` and an `Applications` symlink, launched from the mounted volume, showed one window, exposed native File and View menus, and kept File > Save disabled in the no-file state.
- `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/hazakura-note.app` passed.
- `codesign -dv --verbose=4` reported `Signature=adhoc` and `TeamIdentifier=not set`; `spctl --assess --type execute -vv` rejected the app, which matches the warning-expected, not-notarized preview boundary.
- App version was confirmed from the built bundle as `CFBundleShortVersionString => "0.1.0"` and `CFBundleVersion => "0.1.0"`.
- Release notes update proposal: `docs/releases/0.1.0-warning-expected-dmg-preview.md`.
- `scripts/build-warning-dmg-preview.sh` normalizes Apple Silicon artifact naming to `aarch64` so the generated preview filename matches the release-note convention.
- DeepSeek review feedback was incorporated by switching app bundle staging from `cp -R` to `cp -a` and making the next action explicitly require binary publication approval before DMG attachment.
- Chika review feedback was incorporated by adding macOS and required-command guards to the DMG preview script, clarifying the aarch64-only artifact identity, and tightening the release-note warning that this is not the source-only release.

Source-only 0.1.0 release gate on 2026-05-28:

- User approved proceeding with the source-only release lane first.
- Version alignment confirmed at `0.1.0` in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
- No local `v0.1.0` tag or GitHub Release existed before publication work started.
- `npm ci`, `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run build`, `npm audit`, and `git diff --check` passed.
- `npm run build` regenerated `src-tauri/target/release/bundle/macos/hazakura-note.app`; notarization was skipped because no Apple notarization credentials were configured, which matches the source-only boundary.
- `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/hazakura-note.app` passed.
- Built bundle metadata confirmed `CFBundleIdentifier => "lab.hazakura.note"`, `CFBundleShortVersionString => "0.1.0"`, `CFBundleVersion => "0.1.0"`, and `LSMinimumSystemVersion => "11.0"`.
- `cargo audit` completed with 17 allowed warnings from transitive Tauri/wry dependencies. These remain dependency-update review items and are not treated as source-only release blockers.
- Source release notes are in `docs/releases/0.1.0.md`.
- No DMG asset is approved for this source-only release.

Known verification note:

- Vite reports a production chunk-size warning because CodeMirror and preview libraries are bundled together. This is acceptable for the prototype; revisit before distribution readiness.
- The Modal Focus Trap Polish did not include a fresh built-app manual focus-cycling smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The App Close Save All Failure Focus Polish did not include a fresh built-app manual failure/conflict smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The Dirty Tab Close Failure Focus Polish did not include a fresh built-app manual failure/conflict smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The Discard All Draft Cleanup Polish did not include a fresh built-app manual restart smoke pass; use the updated smoke checklist before treating this path as distribution-grade.
- The Editor Keyboard Editing Polish used Vite browser smoke only; repeat the new editor keyboard checklist in the built app before treating this path as distribution-grade.
- The UI Brush-up Search Overlay checks used Vite browser smoke only; repeat active-file search in the built app before treating this path as distribution-grade.
- The Find Close Polish did not include a fresh built-app manual active-file search pass; use the updated close-button check before treating this path as distribution-grade.
- The Workspace Image Preview / Quality Automation, content-validation, size-limit coverage, and close-return checks did not include a fresh built-app image-selection smoke pass; use the updated workspace image checklist before treating this path as distribution-grade.
- The Local Bundle Launch Metadata and Minimum System Version polish verified generated bundle metadata and ad-hoc signing, but the current automation session could not complete `open -n`; repeat built-app launch and native File menu smoke outside this automation environment before treating this path as distribution-grade.
- Agent Workbench real-provider behavior has automated fake-provider coverage only so far; use the trusted-workspace manual smoke checklist before treating real `codex` / `opencode` sessions as product-grade.
- Long file name clipping was re-smoked in the workspace tree during Source Preview Quality Polish. A narrower-window pass is still useful before binary distribution readiness.

## Risks / Unknowns

- Unsaved draft restore is intentionally explicit and fingerprint-bound. It is a safety net, not an autosave system, and does not merge with changed disk content.
- Workspace listing is intentionally lazy and not a project index. Very large directories can still be partially listed when a single folder exceeds the per-folder cap.
- Save-conflict recovery is explicit but still simple. There is no merge editor or diff-assisted recovery flow yet.
- Undo/redo remain CodeMirror defaults and have not received dedicated product-level controls beyond preserving the active editor session during theme changes.
- The app is ad-hoc signed for local build validation, but it is not Developer ID signed or notarized.
- The GitHub remote is configured over HTTPS. SSH access previously failed with `Permission denied (publickey)`.

## Next Actions

1. For release work, run the P0 gates in `docs/source-release-checklist.md`, including dependency audits and latest-HEAD built-app smoke evidence, before asking for tag approval.
2. For Agent Workbench work, run `docs/smoke-checklist.md` Agent Workbench Trusted Workspace Manual Smoke in a throwaway workspace before further terminal, PTY, or provider-lifecycle changes.
3. For recurring automation, use `docs/development-automation.md` and start from one narrow built-app smoke section when practical.
4. Re-smoke long file name / constrained-width layout before binary distribution readiness.
5. If publishing the warning-expected DMG preview, get explicit approval for binary asset publication and use `docs/releases/0.1.0-warning-expected-dmg-preview.md` as the release-note addendum.
6. Add minimal CI and Dependabot as P1 release hardening when a small verified slice is available.
7. Add focused UI/E2E coverage for draft restore and external-change focus recheck before treating them as distribution-grade behavior.
8. Keep signing, notarization, and installer packaging separate from source-release and workspace hardening.

## Avoid

- Do not add Git operations, terminal integration, LSP, plugin execution, or AI rewrite flows during the next workspace polish slices.
- Do not expand workspace persistence into project indexing or background scanning.
- Do not treat the current build as distribution-ready.
