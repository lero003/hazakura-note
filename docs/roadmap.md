# Roadmap

Status: Operational
Scope: Current release sequence and planning boundaries
Authority: Medium
Last reviewed: 2026-05-29

## Current Position

`hazakura-note` is no longer in the early `v0.1` planning sequence.

The current public line is:

- `v0.1.0`: source-only developer preview
- `v0.1.0-warning-expected-dmg-preview`: separate warning-expected DMG preview lane
- `v0.2.0-pre.0`: pre0.2 warning-expected DMG preview with normal-mode and Agent Workbench screenshots in README

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

## 0.2: Preview Release Stabilization

Goal: make pre0.2 honest, testable on another Mac, and easy to understand from the README and GitHub Release.

Status: In progress through `v0.2.0-pre.0`.

Completion criteria:

- README explains the normal Safe Editor value before Agent Workbench.
- README screenshots show normal mode first and Agent Workbench second.
- Version surfaces and release notes match the shipped preview version.
- Warning-expected DMG notes clearly state ad-hoc signing, no Developer ID signing, no notarization, and expected Gatekeeper warnings or rejection.
- Release assets verify after download with `shasum -c` and `hdiutil verify`.
- At least one non-development-machine smoke result is recorded for DMG download, mount, launch, and basic editor use.
- Known risks are visible rather than hidden behind stable-release wording.

Do not use 0.2 to add broad new features.

## 0.3: Agent Workbench Quality

Goal: make the existing Agent Workbench preview understandable, bounded, and comfortable enough for trusted-workspace testing.

Priority work:

- Complete and record trusted-workspace manual smoke for real `codex` and `opencode` providers.
- Add a visible Agent Workbench boundary indicator while the Agent pane is active or running.
- Recheck provider-not-found, abnormal exit, stop, restart, and long-output behavior from the user-facing pane.
- Evaluate a 30-minute session smoke for output buffer, responsiveness, and memory comfort.
- Add low-risk context helpers already allowed by the boundary document, such as Copy open tab paths, Copy workspace root, and Copy prompt template.
- Keep provider-made file edits flowing through the existing external-change and conflict paths.

Do not add:

- arbitrary shell or command input
- provider-add UI
- multiple sessions
- session restore
- auto-apply
- auto-commit
- Git integration

## 0.4: Safe Editor Review And Diff

Goal: improve review confidence without turning the app into a Git client or IDE.

Candidate work:

- simple file-to-file diff
- diff from disk versus current editor text
- save-conflict review before choosing Reopen / Close without saving / Keep editing
- Markdown-focused review aids that do not execute project code
- search, recovery, and draft-restore polish found during 0.2 / 0.3 smoke

This phase should prefer review and comparison over formatting automation.

## 0.5: Release And Maintenance Quality

Goal: make the project easier to test, maintain, and distribute honestly.

Candidate work:

- minimal CI for TypeScript build, Rust format, and Rust tests
- Dependabot or equivalent dependency visibility without auto-merge
- documented cross-machine smoke matrix
- release checklist tightening for source-only and warning-expected DMG lanes
- clearer dependency-audit triage for Tauri/wry transitive warnings
- README and release-note polish based on external tester feedback

Notarization remains a separate future decision. Do not imply production distribution quality until Developer ID signing, hardened runtime review, notarization, stapling, Gatekeeper verification, and installation guidance are actually implemented.

## Future

Possible later work, only after a fresh boundary review:

- Developer ID signed and notarized distribution
- richer Markdown outline and navigation
- Markdown lint or manual formatting checks
- heading-level or paragraph-level Markdown diff
- carefully scoped Git-adjacent review helpers

These are not approval to add a general terminal, arbitrary command execution, Git client behavior, plugin execution, auto-apply, auto-commit, or multi-agent orchestration.

## Roadmap Review Questions

Use these when asking for external review:

1. Does 0.2 clearly communicate the current value and preview limits?
2. Is Safe Editor Mode still visually and conceptually primary?
3. Does Agent Workbench read as a separate trust boundary rather than the default app mode?
4. Is 0.3 focused enough on quality and real-provider smoke instead of feature expansion?
5. Are the 0.4 diff/review ideas useful without making the app a Git client?
