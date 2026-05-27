# Development Automation

Status: Operational
Scope: Recurring automation guidance for quality hardening
Authority: High
Last reviewed: 2026-05-27

## Purpose

This document is the source of truth for unattended or recurring `hazakura-note` improvement loops.

The automation should make the app safer and more comfortable to use in small verified slices. It should not turn the project into an IDE, agent platform, or project analyzer.

## Current Automation Lane

Name: `hazakura-note quality loop`

Cadence: recurring local development loop, intended for small quality slices.

Primary outcome: one coherent improvement per run, verified, documented, committed, and pushed when checks pass.

## Start Every Run

1. Read `AGENTS.md`, `README.md`, `docs/current-status.md`, `docs/roadmap.md`, `docs/smoke-checklist.md`, and this document.
2. Run `git status --short --branch`.
3. Treat existing uncommitted changes as user or previous-run work. Do not revert them. If they are relevant, inspect and close them before starting new work.
4. Use Hazakura Habitat before substantial implementation, dependency or lockfile work, automation changes, Git/GitHub mutations, release work, or command-selection uncertainty.
5. Keep the slice small enough to verify in the same run.

## Selection Order

Choose the first useful slice that is both small and verifiable.

1. File safety and close/quit behavior:
   - app/window close confirmation manual-smoke follow-up if the new flow regresses
   - save failure recovery manual-smoke follow-up if the retry / keep-editing flow regresses
   - trailing newline preservation manual-smoke follow-up if the Rust-covered behavior regresses
2. Editor reliability:
   - Undo/redo smoke and explicit docs
   - Japanese IME smoke
   - search highlight visibility
   - focus movement and keyboard-only operation
   - long file name and narrow window layout
3. Markdown writing comfort:
   - heading outline
   - light Markdown insertion aids
   - checkbox or link helpers
   - preview scroll behavior
4. Local release readiness:
   - GitHub Actions for existing quality gates
   - app version/about metadata
   - release candidate checklist
   - packaging docs, without signing or notarization claims
5. Verified no-op:
   - If no small useful slice is safe, run the relevant checks, update docs only if facts changed, and report no-op clearly.

## Boundaries

Do not implement during this automation:

- Git integration
- LSP
- terminal
- AI assistance
- arbitrary command execution
- plugin system
- project-wide analysis or indexing
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

## Documentation Duties

Update only the docs that changed truth:

- `docs/current-status.md` for implemented behavior, verification results, risks, and next action.
- `docs/roadmap.md` when a phase, lane, or priority changes.
- `docs/smoke-checklist.md` when manual checks change.
- `README.md` when user-facing features, limits, or run/build instructions change.
- `docs/next-goals.md` when a reusable goal prompt changes.

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

Use docs/development-automation.md as the source of truth. Prefer file safety and close/quit behavior first, then editor reliability, Markdown writing comfort, local release readiness, and verified no-op if no useful small slice is safe.

Do not implement Git integration, LSP, terminal, AI assistance, arbitrary command execution, plugin systems, project-wide analysis/indexing, signing/notarization completion, merge editor, advanced Git diff, or dependency/lockfile changes without explicit user approval.

For substantial implementation, automation changes, Git/GitHub mutation, release work, or command-selection uncertainty, run Hazakura Habitat first and read agent_context.md before continuing. Consult command_policy.md before risky or mutating commands.

Choose exactly one coherent slice. Implement it, update the relevant docs, and verify it. For code changes run npm run build:vite, cargo fmt --manifest-path src-tauri/Cargo.toml -- --check, cargo test --manifest-path src-tauri/Cargo.toml, npm run build, and git diff --check. For docs-only changes run git diff --check. For UI behavior changes, update or exercise docs/smoke-checklist.md and do not claim manual smoke passed unless it was actually exercised.

If checks pass, stage only related files, commit with a concise message, and push to the configured HTTPS tracking branch. If checks fail, do not commit or push; report the failing command and next fix.

Final report: selected slice, changed files, verification, commit hash and push result or reason not committed, residual risk, and the next small action.
```
