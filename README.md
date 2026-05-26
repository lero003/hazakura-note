# hazakura-note

Status: Operational
Scope: Project entry point
Authority: High
Last reviewed: 2026-05-27

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

- Markdown/text file open, edit, save, and sanitized preview
- Folder picker with a bounded file tree
- File-tree, Open, and restored files unified into the same tab model
- Multiple tabs with active-tab editor, preview, size, and save status
- Tab-level unsaved state and Save / Discard / Cancel before closing dirty tabs
- Keyboard shortcuts for Open, Open Folder, Save, Find, and tab close
- External-change save conflict detection with Reopen from disk / Close without saving / Keep editing actions
- In-file search for the active tab
- System / Light / Dark theme switching with persisted selection
- Recent workspace, open tabs, and active tab restoration after restart
- Rust-side binary-looking file rejection, large-file warning, editing size limit, and atomic save helper
- Window close requests are stopped when open tabs have unsaved changes, with Save All / Discard All / Cancel choices

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

## Known Limits

- Unsaved text is not restored after restart; only workspace, tab paths, active tab, and theme are restored.
- Save conflicts are recoverable by reopening, closing, or keeping local edits, but there is no merge editor or advanced diff.
- The app is not signed or notarized with an Apple Developer ID.
- There is no Git integration, LSP, terminal, AI assistance, plugin system, arbitrary command execution, or project-wide analysis.
- The production bundle currently carries a Vite chunk-size warning from editor/preview dependencies.

## Draft Source

- [Original Plan](markdown-safe-editor-plan.md): 初期企画案。発想の原本であり、実装判断の正本ではありません。
