# Next Goals

Status: Operational
Scope: Ready-to-use goal prompts and phase boundaries
Authority: High
Last reviewed: 2026-05-26

## Goal 2: Safety Hardening

Status: Completed on 2026-05-26

目的: 触れるプロトタイプを、保存事故を起こしにくい最小エディタへ締める。

このフェーズでは、タブやフォルダツリーにはまだ広げない。複数ファイル化の前に、単一ファイルの保存境界、外部変更検知、失敗表示、手動スモーク手順を固める。

### Goal Prompt

```txt
hazakura-note の Safety Hardening を完成させる。
現在の Tauri + React + CodeMirror 6 プロトタイプを前提に、単一ファイル編集の保存安全性を固める。
Rust側で外部変更検知に必要なメタデータ確認を追加し、保存前に外部変更衝突を検出して、ユーザーへ分かる形で保存を止める。
保存失敗時のUI表示、バイナリ拒否、大容量制限、Markdown sanitize境界を確認し、Open -> edit -> Save の手動スモークを docs に再現可能なチェックリストとして残す。
タブ、フォルダツリー、Diff、Git連携、AI支援はこのgoalでは実装しない。
最後に npm run build:vite、cargo fmt --manifest-path src-tauri/Cargo.toml -- --check、cargo test --manifest-path src-tauri/Cargo.toml、npm run build、git diff --check を実行し、docs/current-status.md を更新する。
```

### Acceptance Criteria

- 外部変更されたファイルを上書き保存しない
- 保存失敗がUI上で分かる
- 手動スモーク手順が `docs/current-status.md` または専用docsに残っている
- 単一ファイル編集の状態が次フェーズへ進める程度に安定している

### Completion Notes

- Rust側でファイルfingerprintを返し、保存時に期待fingerprintと現在のファイル状態を比較する。
- 外部変更がある場合は保存を止め、UIにsave-conflict messageを表示する。
- 未保存状態から別ファイルを開く前に確認dialogを出す。
- 手動スモーク手順は `docs/smoke-checklist.md` に分離した。

## Goal 3: Workspace Basics

Status: Completed on 2026-05-26

目的: タブ、フォルダツリー、テーマ切り替えで、複数ファイルを扱える作業場にする。

このフェーズでは、フォルダをユーザーが選択した範囲だけ読み、テキストファイルをタブで開く。テーマは System / Light / Dark の切り替えまでに留める。Git操作、プロジェクト解析、隠しディレクトリの深掘り、任意コマンド実行には広げない。

### Goal Prompt

```txt
hazakura-note の Workspace Basics を完成させる。
Safety Hardening 済みの単一ファイル編集を前提に、ユーザーが選択したフォルダのファイルツリー表示、複数ファイルをタブで開く体験、System / Light / Dark のテーマ切り替えを実装する。
Rust側には選択フォルダ配下を安全に一覧する command を追加し、node_modules、.git、target、dist など重い/実行系ディレクトリは初期表示から除外する。
TypeScript側には左ペインのファイルツリー、タブバー、アクティブタブ切り替え、タブごとの未保存状態、閉じる前の未保存警告を追加する。
UI側にはテーマ切り替えcontrolを追加し、選択テーマをlocalStorageへ保存する。System選択時はOS設定に追従し、CodeMirror、preview、status、tabs、file treeが同じテーマで読めるようにする。
保存は既存の安全境界を使い、外部変更衝突をタブ単位で扱う。
Git連携、Diff、LSP、ターミナル、AI支援、プロジェクト全体解析、テーマエディタやカスタム配色作成は実装しない。
最後に npm run build:vite、cargo fmt --manifest-path src-tauri/Cargo.toml -- --check、cargo test --manifest-path src-tauri/Cargo.toml、npm run build、git diff --check を実行し、docs/current-status.md と docs/roadmap.md を更新する。
```

### Acceptance Criteria

- ユーザーが選択したフォルダのファイルツリーを左ペインに表示できる
- テキストファイルを複数タブで開ける
- タブごとに未保存状態が分かる
- アクティブタブを切り替えても本文とプレビューが対応する
- 未保存タブを閉じる前に保存/破棄/キャンセルの判断ができる
- `.git` や `node_modules` などを勝手に深掘りしない
- System / Light / Dark のテーマを切り替えられる
- テーマ選択が再起動後も維持される
- CodeMirror、preview、tabs、file tree、status表示が選択テーマで破綻しない

### Completion Notes

- Rust側に `list_workspace_tree` command を追加し、深さと件数に上限を置いた。
- `.git`、`node_modules`、`target`、`dist`、隠しディレクトリは初期ツリーから除外する。
- TypeScript側で複数タブ、タブごとのdirty状態、保存、close前の Save / Discard / Cancel を扱う。
- Themeは System / Light / Dark を切り替え、`localStorage` に保持する。
- 最近開いたフォルダやタブの復元は未実装。次の小さな改善候補として扱う。

## Recurring Automation: Quality Loop

Status: Active guidance added on 2026-05-27

目的: 大きなgoalを待たずに、保存事故・終了時挙動・ショートカット・IME・UI崩れ・ローカル品質ゲートを小さく継続改善する。

正本: `docs/development-automation.md`

### Automation Prompt

Use the reusable automation prompt in `docs/development-automation.md`.

### Acceptance Criteria

- 1回のrunで1つの coherent slice だけを選ぶ
- 変更した現実に合わせて必要なdocsだけ更新する
- code変更では既存の品質ゲートを通す
- UI挙動を変えた場合は smoke checklist を更新または実施する
- 検証が通った場合だけ、関連差分をcommit/pushする
