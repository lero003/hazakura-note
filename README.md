# hazakura-note

Status: Operational
Scope: Project entry point
Authority: High
Last reviewed: 2026-05-26

`hazakura-note` は、Markdownを中心に安全にテキストを読む・書く・比べるための軽量エディタです。

万能IDEではありません。拡張機能、LSP、ターミナル、Gitクライアント、任意コマンド実行を持たないことで、信頼しきれないプロジェクト内のテキストを静かに扱うことを目的にします。

> 安全に開く。静かに書く。差分で確かめる。

## Current Decision

- Product direction: Markdown-first safe text editor
- Primary platform direction: Desktop app
- Preferred initial stack: Tauri + CodeMirror 6 + React
- Repository remote: `git@github.com:lero003/hazakura-note.git`
- Current prototype: Tauri + React + CodeMirror 6で、Markdownを開く・編集する・保存する・プレビューする最小体験を実装済み

## Canonical Docs

- [Product Brief](docs/product-brief.md): 何を作るか、何を作らないか
- [MVP Scope](docs/mvp-scope.md): 最初に実装する範囲と受け入れ基準
- [Security Boundary](docs/security-boundary.md): 安全性のために守る制約
- [Roadmap](docs/roadmap.md): 段階的な開発順序
- [Development Prep](docs/development-prep.md): 開発開始前の準備と最初の一手
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

## Draft Source

- [Original Plan](markdown-safe-editor-plan.md): 初期企画案。発想の原本であり、実装判断の正本ではありません。
