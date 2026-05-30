# Roadmap

Status: Operational
Scope: Current release sequence and planning boundaries
Authority: Medium
Last reviewed: 2026-05-30

## Current Position

`hazakura-note` is no longer in the early `v0.1` planning sequence.

The current public line is:

- `v0.1.0`: source-only developer preview
- `v0.1.0-warning-expected-dmg-preview`: separate warning-expected DMG preview lane
- `v0.2.0-pre.0`: pre0.2 warning-expected DMG preview with normal-mode and Agent Workbench screenshots in README
- `v0.2.0-pre.1`: pre0.2 warning-expected DMG preview with Finder/app-icon text document open support
- `v0.2.0`: Safe Editor preview warning-expected DMG release with theme/Japanese UI polish and the current Agent Workbench boundary kept optional
- `v0.3.0`: Safe Editor non-Git diff / change-review warning-expected DMG release

The old `v0.1` / `v0.3.x` phase map is archived in `docs/roadmap-v0.1-archived.md`.

## Product Boundary

The main product remains a Markdown-first safe editor.

Default Safe Editor Mode must keep these boundaries:

- no general terminal
- no arbitrary command execution
- no Git client
- no LSP or IDE features
- no plugin system
- no project-wide indexing
- no auto-apply or auto-commit behavior

Optional Agent Workbench Mode is a separate trust boundary. It may host one allowlisted local CLI provider session in a selected workspace, but it must remain explicit, consent-gated, and scoped by `docs/agent-workbench-boundary.md`.

## 0.2: Safe Editor Preview Stabilization

Goal: make pre0.2 honest, testable on another Mac, and easy to understand from the README and GitHub Release while keeping Safe Editor Mode visually and conceptually primary.

Status: Released as `v0.2.0` warning-expected DMG preview.

Completion criteria:

- README explains the normal Safe Editor value before Agent Workbench.
- README screenshots show normal mode first and Agent Workbench second.
- Version surfaces and release notes match the shipped preview version.
- Warning-expected DMG notes clearly state ad-hoc signing, no Developer ID signing, no notarization, and expected Gatekeeper warnings or rejection.
- Release assets verify after download with `shasum -c` and `hdiutil verify`.
- At least one non-development-machine smoke result is recorded for DMG download, mount, launch, and basic editor use.
- Known risks are visible rather than hidden behind stable-release wording.

Do not use 0.2 to add broad new features.

## 0.3: Safe Editor Non-Git Diff And Review

Goal: complete the core product promise of checking text changes without turning the app into a Git client, merge tool, IDE, or project analyzer.

Status: Released as `v0.3.0` warning-expected DMG preview.

Priority work:

- diff from disk versus current editor text
- simple explicit file-to-file diff
- compare restart draft or recovery candidates before restoring
- save-conflict review before choosing Reopen / Close without saving / Keep editing
- plain-text comparison output that does not imply Git status, Git history, staging, commit, branch, or repository awareness
- minimal review UI that makes changed regions readable before richer layouts are attempted

Acceptance:

- Current buffer versus disk diff is available for a selected text file.
- Explicit file A versus file B comparison works for safe text inputs.
- Draft/recovery and save-conflict flows can show the relevant text difference before the user chooses a recovery action.
- Diff labels use file/workspace language, not Git language.
- `.git` presence is not inspected or surfaced for this feature.
- No commit, branch, staging, status, history, patch apply, or repository operation is introduced.

This phase must not pass if:

- the feature behaves like a Git client
- the app scans the whole project to infer change state
- diff output suggests the user can stage, apply, commit, pull, push, or resolve a merge
- save-conflict recovery can discard local edits without an explicit user choice

Do not add:

- Git integration
- merge editor
- project-wide index
- auto-apply
- auto-format as part of diff

## 0.4: Markdown Review Navigation

Goal: make Markdown documents easier to read, navigate, and review after the v0.3 diff foundation, while avoiding intrusive prediction or automatic rewriting.

Candidate work:

- current-file heading outline with click-to-jump (started)
- current heading or section context in the editor/review surface (started)
- diff hunk heading context for Markdown files (started)
- local Markdown link navigation limited to explicitly selected workspace files (started)
- open-tabs and recent-files navigator (started)
- display/readability polish for Markdown preview and review (started)
- transient current-section HUD during Markdown scrolling, based only on the current file's headings, with no workspace indexing or automatic rewriting (started)
- small Markdown editing helpers only when they are predictable, reversible, and not aggressive

This phase should prefer navigation, visibility, and manual review over prediction. Avoid strong autocomplete, automatic lint fixes, broad formatting rewrites, workspace-wide indexing, or project-level symbol search unless a later boundary review explicitly approves them.

## 0.5: Pi CLI Provider And App Stability

Goal: add Pi as a first-class Agent Workbench CLI provider while improving app stability in small, verifiable slices.

Candidate work:

- add `pi` as an allowlisted local CLI provider, after updating `docs/agent-workbench-boundary.md`
- keep Pi launch behavior inside the existing Agent Workbench gate: explicit mode, restart boundary, responsibility consent, selected workspace root, one active session, no restore
- run trusted-workspace manual smoke for Pi CLI usage alongside existing `codex` / `opencode` provider checks
- improve app stability and responsiveness found during normal editor and Agent Workbench smoke
- keep Safe Editor Mode visually and conceptually primary while the provider list grows

Do not use this phase to add Pi SDK integration, RPC integration, arbitrary provider configuration, multi-agent orchestration, auto-apply, auto-commit, a general terminal, or a Git client.

## 0.6: Agent Workbench Hardening

Goal: reduce friction and risk found through real Agent Workbench usage before treating the agent surface as release-quality.

Candidate work:

- tighten start, stop, exit, resize, output-buffer, and app-close behavior from real-provider smoke findings
- improve provider availability, launch failure, and consent-state messaging
- verify that provider-made file changes continue to surface through existing external-change and conflict handling
- document known provider-specific limitations without claiming control over provider internals
- evaluate whether Pi RPC should become the next experiment lane, while keeping it out of the app until a boundary review approves it

Do not use this phase to add SDK integration, background sessions, session restore, provider plugins, arbitrary command execution, or automated approval of provider actions.

## 0.7: Release And Maintenance Quality

Goal: make the preview line easier to test, maintain, and distribute honestly without treating it as a formally signed production app.

Candidate work:

- minimal CI for TypeScript build, Rust format, and Rust tests
- Dependabot or equivalent dependency visibility without auto-merge
- documented cross-machine smoke matrix
- release checklist tightening for source-only and warning-expected DMG lanes
- clearer dependency-audit triage for Tauri/wry transitive warnings
- README and release-note polish based on external tester feedback
- evaluate whether a Safe Editor-only build variant would make review and distribution easier

Developer ID signing, hardened runtime review, notarization, stapling, and production installation guidance remain separate future decisions. 0.7 should improve release hygiene for the existing preview lanes without implying formal macOS distribution quality.

## Future

Possible later work, only after a fresh boundary review:

- Developer ID signed and notarized distribution
- Markdown lint or manual formatting checks
- heading-level or paragraph-level Markdown diff
- carefully scoped Git-adjacent review helpers
- Pi RPC integration, only after Pi CLI usage proves useful and a fresh Agent Workbench boundary review approves the wider integration shape
- Pi SDK integration, only as a separate product-level decision if `hazakura-note` intentionally moves beyond a safe editor with an optional agent pane

These are not approval to add a general terminal, arbitrary command execution, Git client behavior, plugin execution, auto-apply, auto-commit, or multi-agent orchestration.

## Roadmap Review Questions

Use these when asking for external review:

1. Does 0.2 clearly communicate the current value and preview limits?
2. Is Safe Editor Mode still visually and conceptually primary?
3. Does 0.3 complete the "check with diff" promise without becoming Git-aware?
4. Does 0.4 improve Markdown review/navigation without over-predicting or auto-rewriting user text?
5. Does 0.5 add Pi as a bounded CLI provider without making Agent Workbench feel like the default app mode?
6. Does 0.6 harden Agent Workbench from real usage without hiding provider-internal responsibility from the user?
7. Does 0.7 improve release quality without implying production distribution before signing and notarization are actually implemented?
