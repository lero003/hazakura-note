# hazakura-note

Status: Operational
Scope: Project entry point
Authority: High
Last reviewed: 2026-05-28

`hazakura-note` は、Markdownを中心に安全にテキストを読む・書く・比べるための軽量エディタです。

万能IDEではありません。拡張機能、LSP、ターミナル、Gitクライアント、任意コマンド実行を持たないことで、信頼しきれないプロジェクト内のテキストを静かに扱うことを目的にします。

> 安全に開く。静かに書く。差分で確かめる。

## Current Decision

- Product direction: Markdown-first safe text editor
- Primary platform direction: Desktop app
- Preferred initial stack: Tauri + CodeMirror 6 + React
- Repository remote: `https://github.com/lero003/hazakura-note.git`
- Current prototype: Tauri + React + CodeMirror 6で、Markdownを開く・編集する・保存する・プレビューする・複数タブで扱う最小体験を実装済み

## Current Features

- Markdown/text file creation, open, edit, save, and sanitized preview
- Folder picker with a lazy, bounded file tree
- File-tree, Open, and restored files unified into the same tab model
- Multiple tabs with active-tab editor, preview, size, and save status
- Active-tab metadata for approximate bytes, character count, LF / CRLF line-ending mode, and final-newline state
- Explicit LF / CRLF conversion before save
- Save As to a new common UTF-8 text file extension, with existing-file overwrite rejection
- Preview visibility toggle with persisted preference
- Tab-level unsaved state and Save / Discard / Cancel before closing dirty tabs
- Keyboard shortcuts for New File, Open, Open Folder, Save, Find, and tab close
- External-change save conflict detection with Reopen from disk / Close without saving / Keep editing actions
- Non-conflict save failures keep local edits and show Try save again / Keep editing recovery actions
- Workspace tree directory expansion loads direct children on demand, keeps heavy / hidden directory exclusions, and shows a partial-listing note instead of failing the whole workspace when one folder exceeds the entry cap
- In-file search for the active tab, with visible match highlights, active-match selection, and keyboard next / previous / return-to-editor flow
- Search options for case-sensitive, whole-word, and regex matching with invalid-regex reporting
- Go to Line, cursor line/column status, and approximate selected character/line count
- Editor display settings for line wrap, invisible characters, font size, and tab size, with persisted preference
- Find-field and global shortcut handling ignores active IME composition so Japanese text conversion is not mistaken for editor commands
- System / Light / Dark theme switching with persisted selection
- Theme switching reconfigures the active editor without recreating it, preserving the current editor session state during theme changes
- Recent workspace, open tabs, and active tab restoration after restart
- Explicit unsaved draft recovery after restart when the disk file still matches the draft's saved fingerprint
- Rust-side binary-looking file rejection, large-file warning, editing size limit, and atomic save helper
- Existing LF / CRLF line endings are preserved on save
- Existing final-newline presence is preserved on save; the app does not add or remove a trailing newline by policy
- Markdown preview blocks external/local image references and allows embedded `data:image` PNG/JPEG/GIF/WebP images
- Window and dirty-tab close requests are stopped when open tabs have unsaved changes, with safe keyboard cancellation, Save / Discard choices, and editor focus restored after cancellation
- Dirty-tab and app/window close dialogs keep Tab / Shift+Tab focus within the dialog while it is open
- Failed or conflicted saves from the dirty-tab close dialog stop the close, select the failed tab, and return to the editor with the normal recovery actions visible
- Failed or conflicted Save All from the app/window close dialog stops the close, selects the failed tab, and returns to the editor with the normal recovery actions visible
- Long file names are clipped or wrapped in tabs, the file tree, status/error rows, and close dialogs so core controls stay reachable

## Canonical Docs

- [Product Brief](docs/product-brief.md): 何を作るか、何を作らないか
- [MVP Scope](docs/mvp-scope.md): 最初に実装する範囲と受け入れ基準
- [Security Boundary](docs/security-boundary.md): 安全性のために守る制約
- [Roadmap](docs/roadmap.md): 段階的な開発順序
- [Development Prep](docs/development-prep.md): 開発開始前の準備と最初の一手
- [Development Automation](docs/development-automation.md): 自動改善ループの優先順位と検証ルール
- [Current Status](docs/current-status.md): 現在動く範囲、確認結果、次の一手
- [Next Goals](docs/next-goals.md): 次フェーズのgoal指示文
- [Smoke Checklist](docs/smoke-checklist.md): 手動スモーク確認手順
- [Source Release Checklist](docs/source-release-checklist.md): source-only developer previewの準備境界

## Run

```bash
npm install
npm run dev
```

Build a local macOS app bundle:

```bash
npm run build
```

The built app is generated at:

```txt
src-tauri/target/release/bundle/macos/hazakura-note.app
```

Quality gates used for local release-readiness checks:

```bash
npm run build:vite
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
git diff --check
```

Source-only developer preview boundary:

- Current intended source version is `0.1.0` across npm, Tauri, and Cargo metadata.
- Source users build locally with `npm install` and `npm run build`.
- The generated local `.app` is unsigned and not notarized.
- Manual smoke evidence is tracked in [Current Status](docs/current-status.md) and reusable steps live in [Smoke Checklist](docs/smoke-checklist.md).
- Tag creation, push, and GitHub Release publication require explicit user approval.

## Known Limits

- Unsaved draft restore is explicit and fingerprint-bound; it is not autosave and does not merge with changed disk content.
- The file tree is a workspace browser, not an index. Very large directories are capped per folder and may show only the first visible entries.
- Save conflicts are recoverable by reopening, closing, or keeping local edits, but there is no merge editor or advanced diff.
- The app is not signed or notarized with an Apple Developer ID.
- There is no Git integration, LSP, terminal, AI assistance, plugin system, arbitrary command execution, or project-wide analysis.
- The production bundle currently carries a Vite chunk-size warning from editor/preview dependencies.

## Draft Source

- [Original Plan](markdown-safe-editor-plan.md): 初期企画案。発想の原本であり、実装判断の正本ではありません。
