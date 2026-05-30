# Source Release Checklist

Status: Pre-release stabilization review accepted; release approval pending
Scope: Source-only release readiness
Authority: High
Last reviewed: 2026-05-28

This checklist is for a source-only developer preview release of `hazakura-note`.

Source-only means publishing the repository state, tag, source archive, release notes, and build instructions. It does not mean distributing a signed or notarized macOS app.

## Release Boundary

In scope:

- Source tag readiness
- README build-from-source clarity
- Version alignment across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
- Local quality gates
- Manual smoke evidence for core editor safety
- Known limits and preview wording
- Release notes for a developer-preview source release

Out of scope:

- Apple Developer ID signing
- Notarization
- Installer packaging
- Auto-update
- Git integration inside the app
- LSP, terminal, plugin, or AI features
- Binary asset publication unless a later release goal explicitly approves it

If a DMG preview becomes the release goal, switch to `docs/dmg-preview-checklist.md` and treat it as a separate release lane instead of stretching this source-only checklist.

## Required Local Gates

Run from the repository root:

```bash
npm ci
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```

The Vite chunk-size warning is acceptable for the source preview if it is still listed in known limits.

## Required Dependency Checks

Run before tagging:

```bash
npm audit
cargo audit
```

`npm audit` and `cargo audit` must have no untriaged critical or high-severity issues in release-sensitive dependencies. `cargo audit` warnings such as unmaintained or unsound transitive dependencies require an explicit release-note or status triage before tag approval.

If `cargo audit` is unavailable, stop the release gate instead of treating the check as passed. Install `cargo-audit` as an explicit local tool-prep step, then rerun the audit before tag approval.

Also run these as review-only freshness checks:

```bash
npm outdated
cargo update --manifest-path src-tauri/Cargo.toml --dry-run
```

Outdated dependencies do not automatically block the source preview. They require a release note or follow-up issue only when the update affects safety, build reproducibility, or the Markdown preview boundary.

Priority dependency surfaces:

- `@tauri-apps/api`
- `@tauri-apps/cli`
- `tauri`
- `tauri-build`
- `tauri-plugin-dialog`
- `dompurify`
- `marked`
- `vite`
- `codemirror`

Treat `dompurify` and `marked` as preview-boundary dependencies because Markdown rendering and sanitization depend on them.

## Required Manual Smoke Evidence

Use the latest built app from the current release HEAD and record concise evidence in `docs/current-status.md` before tagging:

- Launch with `open -n src-tauri/target/release/bundle/macos/hazakura-note.app`.
- Confirm native File menu and View menu are present.
- Confirm Save and Save As are disabled in the no-file state.
- Confirm dirty-tab close Cancel / Save / Discard behavior.
- Confirm dirty-tab close Save failure or conflict stops close and returns to the affected tab.
- Confirm app/window close Save All failure or conflict stops close and returns to the affected tab.
- Confirm Discard All, then restart, does not show a recoverable draft for intentionally discarded edits.
- Confirm Cmd+F opens the Find overlay and close / Escape clear highlights.
- Confirm Japanese IME composition Enter / Escape does not trigger search, close, save, open, or tab-close commands.
- Confirm Tab, Shift+Tab, and Shift+Arrow behave correctly in the built app editor.
- Confirm workspace image preview works in the built app.
- Confirm Markdown preview blocks external and local images while allowing embedded `data:image` references.
- Confirm New File creates a file and refuses to overwrite an existing file.
- Confirm Open -> Edit -> Save writes expected text.
- Confirm CRLF and final-newline preservation survive save.
- Confirm external-change conflict stops overwrite.
- Confirm non-conflict save failure keeps local edits and offers recovery.
- Confirm lazy workspace tree opens a large throwaway workspace, loads expanded directories on demand, hides excluded directories, and shows partial listing when a folder exceeds the cap.
- Confirm theme switching keeps editor cursor/selection and undo/redo session state.

2026-05-27 built-app evidence:

- Confirmed with `/tmp/hazakura-note-release-smoke-20260527202313`: New File create, existing-file non-overwrite, Open -> Edit -> Save, CRLF preservation, final-newline preservation, external-change conflict, non-conflict save failure recovery, dirty-tab close cancellation, app/window close cancellation, active-file search, lazy workspace tree, theme switching, restart theme persistence, and Markdown preview sanitize.
- Japanese IME composition was confirmed by human manual smoke in the built app; editor and Find-field composition confirmation did not trigger editor shortcuts while composing.
- Follow-up Text Editor Usability Pack smoke used `/tmp/hazakura-note-usability-smoke.VHMxWZ` and confirmed metadata display, preview toggle, safe image preview policy, LF conversion save, and Save As to `.log`.

## Version And Release Notes

Before tagging:

- Confirm `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` carry the intended version. Current checked version: `0.3.0` in all three files.
- Add or update the version-specific file under `docs/releases/` for the intended source preview.
- State clearly that users build from source with `npm ci` and `npm run build`. This is present in `README.md`.
- State clearly that the built local app is ad-hoc signed only and is not Developer ID signed or notarized. This is present in `README.md` Known Limits.
- Keep known limits visible in `README.md` and `docs/current-status.md`.

## P1 Release Hardening Follow-ups

These are useful before or soon after the source preview, but they are not required to tag if the P0 gates above pass and the user explicitly approves release publication:

- Add minimal GitHub Actions for `npm ci`, `npm run build:vite`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
- Decide separately whether CI should run full `npm run build` on macOS.
- Add Dependabot for npm, cargo, and GitHub Actions without auto-merge.
- Review Tauri, DOMPurify, marked, Vite, and CodeMirror dependency updates manually before merging.

## P2 Future Stabilization Follow-ups

These are useful after the source preview boundary is no longer moving:

- Add a small UI/E2E test set for dirty close cancellation, save conflict overwrite protection, Find highlight cleanup, stale draft suppression, and external-change focus recheck.

## Stop Conditions

Do not tag a source release if:

- Any required local gate fails.
- The app cannot build locally.
- `npm audit` or `cargo audit` reports an untriaged high or critical issue in a release-sensitive dependency.
- Current docs imply signed/notarized app distribution.
- Source build instructions are missing or misleading.
- Latest-HEAD built-app smoke evidence for the required release paths is absent.
- The working tree contains unrelated uncommitted changes.
