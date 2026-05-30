# DMG Preview Checklist

Status: Operational
Scope: Warning-expected DMG preview distribution
Authority: Medium
Last reviewed: 2026-05-29

This checklist is for a warning-expected binary DMG preview lane only. It was used for the `v0.2.0-pre.0`, `v0.2.0-pre.1`, `v0.2.0`, `v0.3.0`, and `v0.4.0` warning-expected DMG previews and remains the current boundary for similar preview releases.

Do not attach the DMG to the source-only GitHub Release. Do not create tags, push commits, publish a GitHub Release, or attach assets without explicit approval.

## Boundary

There are two different DMG lanes:

- Warning-expected DMG preview: a downloadable `.dmg` that packages the locally built app, with clear release notes that it is not Developer ID signed or notarized.
- Developer ID / notarized DMG: a distribution-grade lane that requires Developer ID signing, hardened runtime review, notarization, stapling, and Gatekeeper verification.

Do not mix these lanes in release notes.

## Warning-expected DMG Preview

Use this only if the user explicitly approves moving from source-only release to DMG preview.

The current preview artifact is for macOS Apple Silicon / `aarch64`. It is not a universal or x64 DMG preview unless a separate artifact is built and verified.

Required work:

- Keep the release marked as developer preview.
- Use the repo-local warning-expected DMG preview script instead of the Tauri Finder-layout DMG path.
- Run the source-release P0 gates from `docs/source-release-checklist.md`.
- Build the app and DMG from a clean lockfile install.
- Verify the generated `.app` launches from the built bundle.
- Verify the generated `.dmg` with `hdiutil verify`.
- Mount the `.dmg`, copy or open the contained app as a user would, and run a minimal built-app smoke.
- Generate a SHA-256 checksum for the `.dmg`.
- Record the DMG filename, checksum, app version, and smoke result in `docs/current-status.md`.
- Update release notes to say the DMG is not Developer ID signed, not notarized, and may show macOS security warnings.

Suggested commands, adjusted to the actual generated paths:

```bash
npm ci
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build:dmg-preview
cd src-tauri/target/release/bundle/dmg
shasum -c hazakura-note_<version>_aarch64-warning-expected.dmg.sha256
```

`npm run build:dmg-preview` deliberately uses `hdiutil create` with a plain app-plus-Applications-link layout. Do not use `npm run build -- --bundles app,dmg` for this lane unless the Finder/AppleScript layout path is separately re-verified in the current environment.

Do not claim this path is safe, trusted, signed for public distribution, or notarized.

## Developer ID / Notarized DMG

Treat this as a later distribution-readiness project, not a small source-preview follow-up.

Required decisions before implementation:

- Apple Developer Program account and Developer ID certificate ownership.
- Signing identity and secret handling policy.
- Hardened runtime and entitlement review.
- Notarization workflow with `notarytool`.
- Stapling and offline Gatekeeper verification.
- Release asset naming, checksum, and rollback policy.

Reference Apple docs before starting this lane:

- https://developer.apple.com/developer-id/
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac

## Stop Conditions

Stop and do not attach a DMG to a release if:

- The release is still described as source-only.
- The `.dmg` cannot be verified or mounted.
- The app cannot launch from the packaged DMG.
- The release notes imply Developer ID signing or notarization when neither was performed.
- The checksum is missing.
- The user has not explicitly approved binary asset publication.
