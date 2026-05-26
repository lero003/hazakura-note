# Development Prep

Status: Operational
Scope: Setup and first implementation steps
Authority: Medium
Last reviewed: 2026-05-26

## Repository

GitHub remote:

```txt
https://github.com/lero003/hazakura-note.git
```

このディレクトリは、2026-05-26時点で `main` ブランチのGitリポジトリとして初期化済み。

`origin` はHTTPSで設定済み。SSH権限の問題を避けるため、このrepoではHTTPS remoteを使う。

## Suggested Stack

初期構成は以下を第一候補にする。

```txt
Tauri + React + CodeMirror 6
```

理由:

- Electronより軽量にしやすい
- ファイルI/Oの境界をTauri側で絞りやすい
- CodeMirror 6でMarkdown編集、検索、将来のdiff表示へ進みやすい
- Rust側を薄く保てる

## Language Direction

Rustはこのプロジェクトに向いている。ただし、最初からエディタUIやMarkdown編集体験までRustだけで作る必要はない。

推奨する責務分担:

- Rust: ファイルI/O、安全境界、メタデータ確認、バイナリ判定、保存処理
- TypeScript: UI、エディタ状態、CodeMirror連携、Markdownプレビュー、ユーザー操作

Rustを厚くする候補:

- atomic save
- 外部変更検知
- 大容量ファイル判定
- バイナリ判定
- Markdown sanitize前後の安全な受け渡し
- 将来のローカル差分計算

Rustを厚くしすぎない領域:

- エディタUI
- Markdown入力補助
- タブやパネルの状態管理
- プレビュー表示

判断基準は、OSファイル境界と安全性に関わる部分をRustへ寄せ、画面上の編集体験はTypeScript側へ寄せること。

## Initial Architecture Boundary

Rust側はファイルI/Oだけに寄せる。

初期Tauri command候補:

```txt
open_text_file
save_text_file
get_file_metadata
```

外部コマンド実行、Git操作、パッケージ操作、プロジェクト解析は入れない。

## First Development Checklist

1. GitHubリモートの既存状態を確認する
2. 既存履歴がなければ現在の文書整理とプロトタイプを初回commitにする
3. Goal 2: Safety Hardening を実行する
4. Goal 3: Workspace Basics でタブとファイルツリーを実装する
5. 保存失敗時の表示と復旧方針を継続的に固める
6. `docs/development-automation.md` の自動改善ループで、保存・終了・ショートカット・IME・UI崩れを小さく固める

## Do Not Start With

- Diff
- 設定画面
- AI支援
- Git機能

次の勝ちは、複数ファイルへ広げる前に、安全に開いて保存できることを崩さないことです。
