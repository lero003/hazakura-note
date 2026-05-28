# Agent Workbench Boundary

Status: Draft
Scope: Optional CLI-agent workbench direction
Authority: Medium
Last reviewed: 2026-05-28

## Purpose

`hazakura-note` may explore an optional Agent Workbench mode while preserving the existing Markdown-first safe editor.

This is not a replacement for Safe Editor Mode. The default product value remains: open selected text files, edit them carefully, and confirm changes without turning the app into an IDE or terminal.

Agent Workbench mode is only acceptable if it is explicit, reversible, and clear about responsibility.

## Product Shape

The intended split is:

```txt
Safe Editor Mode
=
Markdown/text editor
+ workspace file browser
+ sanitized preview
+ save/conflict/draft recovery
+ no process launch ability

Agent Workbench Mode
=
Safe Editor Mode
+ optional right-pane TUI agent host
+ allowlisted local CLI launcher
+ one interactive agent session
```

## Safe Editor Mode

Safe Editor Mode must remain usable without agent features.

Requirements:

- Agent pane hidden.
- CLI launcher hidden.
- PTY backend not initialized.
- Process-spawn command unavailable or denied.
- Backend launch commands reject requests while Agent Workbench mode is off.
- No generic terminal.
- No provider configuration required.
- Existing editor, preview, save, conflict, draft, and workspace behavior continues to work.

When possible, Safe Editor Mode should be a build-time variant rather than only a setting. A build without agent-host code is easier to explain and audit.

## Agent Workbench Mode

Agent Workbench mode may expose a right pane that starts an allowlisted local TUI coding-agent CLI inside the selected workspace root.

The precise boundary is:

- `hazakura-note` does not provide a general-purpose shell prompt.
- `hazakura-note` can directly launch only allowlisted agent CLIs.
- What the launched agent CLI can do internally depends on that CLI's own behavior and the user's actions inside it.

Initial allowed launch targets, if implemented:

- `codex`
- `opencode`

The app must not expose an arbitrary command field.

Requirements:

- User explicitly enables Agent Workbench mode.
- Enabling Agent Workbench mode requires restart before agent UI or backend launch commands become available.
- The initial mode gate stores the requested mode separately from the active app-session mode.
- The backend launch entry rejects while the active app-session mode is off, even if a caller bypasses hidden UI.
- Provider selection is limited to `codex` and `opencode` in both UI and backend validation.
- First-use consent is stored locally and required before the backend launch entry can pass its gate.
- User explicitly starts the session.
- Exactly one TUI agent session may run at a time.
- Session starts with `cwd` set to the selected workspace root.
- User can send keyboard input to the running TUI.
- User can stop the session.
- Closing the app stops the session.
- Session is not restored after app restart.
- No background agent execution continues after app close.

## Responsibility Boundary

Agent Workbench mode changes the trust model.

`hazakura-note` may launch a selected local CLI, but it does not control or guarantee what that CLI does. The launched CLI may read, create, modify, delete, or run files depending on its own behavior, permissions, and user choices inside the CLI. Some agent CLIs may allow the user to approve command execution from inside the CLI; `hazakura-note`'s boundary is that it does not become the general-purpose terminal or arbitrary-command launcher.

The user is responsible for:

- Choosing a trusted workspace.
- Choosing whether to enable Agent Workbench mode.
- Understanding the selected CLI's permissions and behavior.
- Reviewing file changes made by the CLI.
- Deciding whether to keep, revert, commit, publish, or discard those changes outside `hazakura-note`.

The app is responsible for:

- Not presenting Agent Workbench as a safe-editor-only mode.
- Not exposing a general-purpose shell prompt.
- Not accepting arbitrary launch commands.
- Making the active workspace root visible before launch.
- Making the warning visible before the first launch and after configuration changes.
- Requiring explicit consent before any launch gate can pass.
- Detecting relevant on-disk changes through the existing external-change path where practical.

## MVP Non-goals

The first Agent Workbench implementation must not include:

- General-purpose terminal emulator.
- Shell prompt.
- Arbitrary command launcher.
- VS Code compatible IDE.
- Built-in AI agent or model orchestration.
- Automatic accept, commit, push, publish, or release flow.
- Multiple agent sessions.
- Persistent terminal history.
- Session restore after restart.
- Background agent execution after app close.
- Git client features inside `hazakura-note`.
- LSP, debugger, extension host, or package-manager UI.
- Auto-apply, auto-commit, auto-push, or auto-publish.

## Context Helpers

Context helpers may be added only as copy/paste aids.

Acceptable MVP helpers:

- Copy active file path.
- Copy open tab paths.
- Copy workspace root.
- Copy a prompt template.

Not in the MVP:

- Automatic prompt submission.
- Automatic file application.
- Automatic approval of CLI actions.
- Project-wide indexing.
- Build/test command execution by `hazakura-note`.

## First Implementation Gate

Before implementation starts, the project should decide:

- Mode shape: whether Agent Workbench is a fork, branch, feature build, or future product mode.
- Runtime gate: where the developer-mode-like setting lives, how restart-required enablement works, and how disabling returns to Safe Editor Mode.
- Backend gate: how launch commands reject requests when Agent Workbench mode is off, independent of whether the UI is hidden.
- Build gate: whether Safe Editor Mode can be built without PTY/process-launch code.
- Provider gate: which provider commands are allowlisted and how their paths are resolved.
- Consent gate: how the first-run warning is worded and when the user must acknowledge it again.
- Workspace gate: how the selected workspace root is shown before launch and how untrusted/no-workspace states are handled.
- Lifecycle gate: how start, stop, app close, crash, and restart cleanup behave.
- Change-detection gate: how existing external-change detection surfaces files modified by the CLI.
- Verification gate: which tests or smoke checks prove that arbitrary shell launch is not exposed.
- Documentation gate: this direction document must be updated before implementation changes widen the trust boundary.

Until those decisions are made, this document is direction only, not an implemented feature claim.
