# Development Automation

Status: Operational
Scope: Recurring automation guidance for quality hardening
Authority: High
Last reviewed: 2026-05-29

## Purpose

This document is the source of truth for unattended or recurring `hazakura-note` improvement loops.

The automation should make the app safer and more comfortable to use in small verified slices. It should not turn the project into an IDE, agent platform, or project analyzer.

## Current Automation Lane

Name: `hazakura-note-safe-editor-review-loop`

Cadence: 30-minute heartbeat loop for non-goal micro-polish work.

Current phase: v0.3 Non-Git Diff / Review preparation, with v0.4 Markdown Review Navigation kept as the next safe-editor direction.

Primary outcome: one coherent improvement per run, verified, documented, committed, and pushed when checks pass. A verified no-op is acceptable when no safe useful slice is found.

Each run should fit the 30-minute cadence. If the useful slice is larger than that, narrow it, leave a short next-step note, or stop with a verified no-op instead of stretching the scope.

The automation should not create test code just to produce activity. Add or change tests only when a real regression risk, reproduced bug, backend/safety contract, or high-value smoke gap justifies it.

Do not decide verified no-op from documentation review alone when app inspection is practical. Before a no-op, look at the current app surface through a built-app smoke or Vite/browser smoke, or state why app inspection was not practical in that run.

## Start Every Run

1. Read `AGENTS.md`, `README.md`, `docs/current-status.md`, `docs/roadmap.md`, `docs/smoke-checklist.md`, and this document.
2. Run `git status --short --branch`.
3. Treat existing uncommitted changes as user or previous-run work. Do not revert them. If they are relevant, inspect and close them before starting new work.
4. Use Hazakura Habitat before substantial implementation, dependency or lockfile work, automation changes, Git/GitHub mutations, release work, or command-selection uncertainty.
5. Inspect the actual app surface when practical, using a built-app smoke or Vite/browser smoke that matches the slice. For no-op runs, prefer at least a quick Safe Editor startup or focused UI surface check.
6. If a smoke opens the built app, quit `hazakura-note` before final reporting. Do not leave a provider session or app process running after an automation pass.
7. Keep the slice small enough to verify in the same run, ideally within 30 minutes.

## Selection Order

Choose the first useful slice that is both small and verifiable.

1. Everyday usability polish:
   - menu placement, menu language, button labels, dialog wording, external-change messages, save-conflict wording, layout fit, and built-app smoke notes
   - prefer the smallest visible improvement that makes manual use clearer
2. v0.3 Non-Git Diff / Review preparation:
   - current buffer versus disk comparison
   - explicit file-to-file text comparison
   - draft/recovery candidate comparison
   - save-conflict review before Reopen / Close without saving / Keep editing
   - plain text diff labels that avoid Git wording
   - no repository status, branch, staging, history, apply, commit, push, pull, or merge behavior
3. v0.4 Markdown Review Navigation preparation:
   - current-file heading outline
   - current heading or section context
   - diff hunk heading context for Markdown files
   - local Markdown link navigation limited to explicit workspace files
   - open-tabs and recent-files navigation
   - readable Markdown preview/review display polish
   - avoid strong autocomplete, automatic lint fixes, broad formatting rewrites, project-wide indexing, and symbol search
4. Safety-boundary regression checks:
   - Safe Editor default startup
   - Agent Workbench explicit mode gate and restart boundary
   - responsibility-boundary consent
   - allowlisted `codex` / `opencode` providers only
   - selected workspace root only
   - one active session
   - no arbitrary shell, arbitrary command input UI, arbitrary path input UI, session restore, auto-apply, auto-commit, provider-add UI, or Git integration
5. Stability and responsiveness:
   - stale snapshot handling, external-change live refresh, save/reopen failure paths, theme switching, search responsiveness, and Agent Workbench lifecycle regressions when touched
   - prefer fake-provider coverage for hazakura-owned Agent lifecycle behavior and trusted-workspace manual smoke for real `codex` / `opencode` behavior
6. Markdown-first safe editor quality:
   - save failure recovery, external-change recheck, dirty close, draft restore, Save As, line endings, preview sanitize, workspace image preview, scroll sync, resizable panes, window close, workspace tree, theme switching, search, long file names, constrained-width layout, Japanese IME, and keyboard focus
7. Local release readiness:
   - source-only release P0 gates from `docs/source-release-checklist.md`
   - dependency audit review with `npm audit` and `cargo audit` only when the run has enough time and risk justification
   - latest-HEAD built-app smoke evidence before tag approval
   - app version/about metadata and source release notes
   - packaging docs without signing or notarization claims
   - do not tag, publish, release, or attach a DMG without explicit user approval
8. Verified no-op:
   - If no small useful slice is safe after reading docs and inspecting the app surface when practical, run the relevant checks, update docs only if facts changed, and report no-op clearly.
   - A no-op report should say whether app inspection was performed, or why it was skipped.

## Test Discipline

Tests are valuable when they protect behavior that is easy to regress and hard to notice manually. They are noise when they only restate an implementation detail that was not changed.

Add or update automated tests when:

- a bug was reproduced and can be fixed with a stable regression test
- a backend or safety-boundary contract changes
- an Agent Workbench lifecycle, gate, output/input, stop/exit, or external-change path gains new behavior
- a fake provider can verify hazakura-owned behavior without depending on real provider internals

Prefer docs or manual smoke notes instead of new tests when:

- the change is UI wording, menu placement, visual density, or checklist language only
- existing tests already cover the contract being touched
- the test would duplicate another fake-provider case without covering a new behavior
- the slice is a verified no-op

## Boundaries

Do not implement during this automation:

- Git integration
- LSP
- arbitrary terminal or shell access
- new AI assistance surfaces outside the existing Agent Workbench boundary
- arbitrary command execution
- arbitrary path input UI
- plugin system
- project-wide analysis or indexing
- strong predictive autocomplete
- automatic lint fixes or broad formatting rewrites
- Apple Developer ID signing or notarization completion
- merge editor
- advanced Git diff
- dependency or lockfile changes unless explicitly approved by the user

## Verification

For code changes, run:

```bash
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```

For docs-only changes, run:

```bash
git diff --check
```

For UI behavior changes, also update or exercise `docs/smoke-checklist.md`. Use the built app when practical, and do not claim manual smoke passed unless it was actually exercised.

If built-app smoke launches `src-tauri/target/release/bundle/macos/hazakura-note.app`, quit the app before reporting. If Agent Workbench was running, stop the provider session or quit the app and confirm cleanup when practical.

For source-release prep, use `docs/source-release-checklist.md`. Do not claim release readiness until its P0 gates, dependency checks, and latest-HEAD built-app smoke evidence are recorded.

For DMG preview prep, use `docs/dmg-preview-checklist.md`. Do not attach a DMG to a release unless the user explicitly approves changing the release lane from source-only to DMG preview.

## Documentation Duties

Update only the docs that changed truth:

- `docs/current-status.md` for implemented behavior, verification results, risks, and next action.
- `docs/roadmap.md` when a phase, lane, or priority changes.
- `docs/smoke-checklist.md` when manual checks change.
- `README.md` when user-facing features, limits, or run/build instructions change.
- `docs/next-goals.md` when a reusable goal prompt changes.
- `docs/source-release-checklist.md` when source-release gates or boundaries change.

## Completion Rules

If checks pass and the slice is complete:

1. Stage only related files.
2. Commit with a concise message.
3. Push to the tracking branch over the configured HTTPS remote.
4. Report changed files, verification, commit hash, push result, residual risk, and the next small action.

If checks fail:

1. Do not commit or push.
2. Report the exact failing command and the most likely next fix.
3. Leave unrelated changes untouched.

## Reusable Automation Prompt

```txt
Advance hazakura-note by one small, verifiable quality-hardening slice.

Start by reading AGENTS.md, README.md, docs/current-status.md, docs/roadmap.md, docs/smoke-checklist.md, docs/development-automation.md, and checking git status --short --branch. Treat existing uncommitted changes as user or previous-run work and do not revert them.

Use docs/development-automation.md as the source of truth. The current lane is a 30-minute safe-editor and Agent Workbench review loop. Choose from this priority order: v0.5 Pi CLI provider preparation after the Agent Workbench boundary is updated; app stability and responsiveness; everyday usability polish; Agent Workbench safety-boundary regression checks; Markdown-first safe editor quality; local preview release hygiene; verified no-op if no useful small slice is safe.

Keep Agent Workbench limited to explicit mode gate, restart boundary, responsibility consent, allowlisted `codex` / `opencode` providers plus `pi` only after the boundary document is updated, one selected workspace root, and one active session. Keep diff work limited to explicit text/file comparison and recovery review; do not inspect or present Git repository state. Do not implement Git integration, LSP, arbitrary terminal/shell access, arbitrary command execution, arbitrary path input UI, session restore, auto-apply, auto-commit, provider-add UI, plugin systems, project-wide analysis/indexing, strong predictive autocomplete, automatic lint fixes, broad formatting rewrites, signing/notarization completion, merge editor, advanced Git diff, release/publish/tag flow, Pi RPC integration, Pi SDK integration, or dependency/lockfile changes without explicit user approval.

For substantial implementation, automation changes, Git/GitHub mutation, release work, or command-selection uncertainty, run Hazakura Habitat first and read agent_context.md before continuing. Consult command_policy.md before risky or mutating commands.

Choose exactly one coherent slice that can fit the 30-minute cadence. Prefer one narrow built-app smoke section from docs/smoke-checklist.md, fix only the smallest actionable quality issue found, update the relevant docs, and verify it. Do not decide verified no-op from documentation review alone when app inspection is practical; before no-op, inspect the current app surface through built-app smoke or Vite/browser smoke, or state why app inspection was skipped. If built-app smoke opens hazakura-note, quit the app before final reporting and do not leave Agent provider sessions running. Do not add test code merely to create activity across repeated runs. Add or change tests only for reproduced bugs, backend/safety contracts, Agent lifecycle/gate/output/input/stop/exit/external-change behavior, or high-value fake-provider coverage. Prefer docs or manual smoke notes for UI wording, menu placement, visual density, and verified no-op slices.

For code changes run npm run build:vite, cargo fmt --manifest-path src-tauri/Cargo.toml -- --check, cargo test --manifest-path src-tauri/Cargo.toml, npm run build, and git diff --check. For docs-only changes run git diff --check. For UI behavior changes, update or exercise docs/smoke-checklist.md and do not claim manual smoke passed unless it was actually exercised. For source-release prep, follow docs/source-release-checklist.md and do not tag or publish without explicit user approval. For DMG preview prep, follow docs/dmg-preview-checklist.md and keep it separate from source-only release approval.

If checks pass, stage only related files, commit with a concise message, and push to the configured HTTPS tracking branch. If checks fail, do not commit or push; report the failing command and next fix.

Final report: selected slice, changed files, verification, commit hash and push result or reason not committed, residual risk, and the next small action.
```
