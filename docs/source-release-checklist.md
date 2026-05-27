# Source Release Checklist

Status: Evidence gathered; release approval pending
Scope: Source-only release readiness
Authority: High
Last reviewed: 2026-05-27

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

## Required Local Gates

Run from the repository root:

```bash
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```

The Vite chunk-size warning is acceptable for the source preview if it is still listed in known limits.

## Required Manual Smoke Evidence

Use the built app and record concise evidence in `docs/current-status.md` before tagging:

- New File creates a new file and refuses to overwrite an existing file
- Open -> Edit -> Save writes expected text
- CRLF and final-newline preservation survive save
- External-change conflict stops overwrite
- Non-conflict save failure keeps local edits and offers recovery
- Dirty-tab close and app/window close preserve unsaved changes when cancelled
- Search highlights, Enter / Shift+Enter movement, and Escape return-to-editor work
- Japanese IME composition does not trigger editor shortcuts
- Lazy workspace tree opens a large throwaway workspace, loads expanded directories on demand, hides excluded directories, and shows partial listing when a folder exceeds the cap
- Theme switching keeps editor cursor/selection and undo/redo session state

2026-05-27 built-app evidence:

- Confirmed with `/tmp/hazakura-note-release-smoke-20260527202313`: New File create, existing-file non-overwrite, Open -> Edit -> Save, CRLF preservation, final-newline preservation, external-change conflict, non-conflict save failure recovery, dirty-tab close cancellation, app/window close cancellation, active-file search, lazy workspace tree, theme switching, restart theme persistence, and Markdown preview sanitize.
- Japanese IME composition was confirmed by human manual smoke in the built app; editor and Find-field composition confirmation did not trigger editor shortcuts while composing.
- Follow-up Text Editor Usability Pack smoke used `/tmp/hazakura-note-usability-smoke.VHMxWZ` and confirmed metadata display, preview toggle, safe image preview policy, LF conversion save, and Save As to `.log`.

## Version And Release Notes

Before tagging:

- Confirm `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` carry the intended version. Current checked version: `0.1.0` in all three files.
- Add or update release notes for the source preview. Current source-release note seed: source-only developer preview, local build from source, ad-hoc signed but not Developer ID signed or notarized local `.app`, no binary assets.
- State clearly that users build from source with `npm install` and `npm run build`. This is present in `README.md`.
- State clearly that the built local app is ad-hoc signed only and is not Developer ID signed or notarized. This is present in `README.md` Known Limits.
- Keep known limits visible in `README.md` and `docs/current-status.md`.

## Stop Conditions

Do not tag a source release if:

- Any required local gate fails.
- The app cannot build locally.
- Current docs imply signed/notarized app distribution.
- Source build instructions are missing or misleading.
- Manual smoke evidence for file safety is absent.
- The working tree contains unrelated uncommitted changes.
