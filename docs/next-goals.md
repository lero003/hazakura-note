# Next Goals

Status: Operational
Scope: Ready-to-use goal prompts and phase boundaries
Authority: High
Last reviewed: 2026-05-31

## Ready Goal: Markdown Authoring Feature Completion

Status: Ready

目的: 画像ペースト、エクスポート、Zen、スペルチェック、テーブル、Agent authoring について、実装済みの雰囲気と実際の完成度を切り分け、release claim に耐える MVP へ小さく進める。

正本: `docs/authoring-feature-readiness.md`

### Goal Prompt

```txt
Bring hazakura-note's Markdown authoring feature set from feature-shaped stubs to honest release-ready MVP behavior.

Start by reading AGENTS.md, docs/security-boundary.md, docs/current-status.md, docs/roadmap.md, docs/smoke-checklist.md, docs/development-automation.md, and docs/authoring-feature-readiness.md. Check git status --short --branch and do not revert user changes.

Choose exactly one small slice from docs/authoring-feature-readiness.md, in this order: safe workspace-relative assets image rendering in preview/export; image drag-and-drop into assets; export smoke/parity; Zen/spellcheck smoke and docs; table insertion honesty; Agent selected-text context-helper design. Do not implement multiple areas in one run.

Keep the safe-editor boundary: no arbitrary command execution, no shell/Pandoc pipeline, no arbitrary local image loading, no external image loading, no Git integration, no LSP, no plugins, no project-wide indexing, no Agent auto-apply or auto-commit.

For code changes run npm run typecheck, cargo fmt --manifest-path src-tauri/Cargo.toml -- --check, cargo test --manifest-path src-tauri/Cargo.toml, npm run build, and git diff --check. For docs-only changes run git diff --check. Update smoke checklist/current status only when behavior or evidence changes.

Final report: selected slice, what is now honestly implemented, what remains deferred, verification, and the next smallest slice.
```

### Acceptance Criteria

- `docs/authoring-feature-readiness.md` の1項目だけを選ぶ
- 画像ペーストは、保存、Markdown挿入、preview表示、HTML export表示が揃うまで完成扱いにしない
- 画像D&Dは、既存のファイルオープンD&Dとは別に `assets/` 保存とMarkdown挿入を確認する
- PDFは明示的なPDF生成ではなく Print to PDF として扱う場合、その制限をREADME/docsに残す
- Tableは row/column/alignment UI が入るまで "Insert table" として表現する
- Agent authoring は selected text -> candidate -> diff review -> explicit apply の設計なしに release claim しない
- code変更では既存の品質ゲートを通す
- UI挙動を変えた場合は `docs/smoke-checklist.md` を更新または実施する

### Non-goals

- arbitrary local image loading
- external image loading
- Pandoc or shell-backed export
- WYSIWYG table editor in one broad change
- Agent auto-apply, auto-commit, general terminal, provider plugins, or Git integration

## Current Recurring Automation: v0.5 Pi CLI Provider And App Stability

Status: Active guidance after the `v0.4.0` warning-expected DMG preview release

目的: Agent Workbench に Pi CLI provider を既存の安全境界内で追加しつつ、実利用で見える安定性・終了処理・provider lifecycle の粗さを小さく直す。

正本: `docs/development-automation.md`

### Automation Prompt

Use the reusable automation prompt in `docs/development-automation.md`.

### Acceptance Criteria

- 1回のrunで1つの coherent slice だけを選ぶ
- Pi を扱う前に `docs/agent-workbench-boundary.md` の境界を更新する
- Pi は既存の Agent Workbench gate 内の allowlisted local CLI provider としてだけ扱う
- explicit mode、restart boundary、responsibility consent、selected workspace root、one active session を維持する
- provider availability、launch failure、stop/exit、resize、app-close cleanup、trusted-workspace smoke のいずれかを小さく進める
- code変更では既存の品質ゲートを通す
- UI挙動を変えた場合は smoke checklist を更新または実施する
- 検証が通った場合だけ、関連差分をcommit/pushする

### Non-goals

- Pi RPC / SDK integration
- arbitrary provider configuration or provider-add UI
- arbitrary terminal/shell access or arbitrary command execution
- multiple sessions, session restore, auto-apply, auto-commit, or Git integration
- project-wide indexing, plugin system, LSP, release/publish/tag flow, signing/notarization completion

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

## Recurring Automation: Source Preview Quality Loop

Status: Superseded by the v0.5 automation guidance on 2026-05-30

目的: source-only developer preview として「500円で売っても恥ずかしくない」最低限の手触りまで、built app smokeを起点に小さく継続改善する。

正本: `docs/development-automation.md`

### Automation Prompt

Use the reusable automation prompt in `docs/development-automation.md`.

### Acceptance Criteria

- 1回のrunで1つの coherent slice だけを選ぶ
- 変更した現実に合わせて必要なdocsだけ更新する
- code変更では既存の品質ゲートを通す
- UI挙動を変えた場合は smoke checklist を更新または実施する
- 検証が通った場合だけ、関連差分をcommit/pushする

### Ready Smoke Areas

Choose one narrow smoke area per run:

- Save failure recovery
- External-change conflict and focus/tab recheck
- Dirty tab close and app/window close cancellation
- Unsaved draft restore
- Save As and extension handling
- LF / CRLF conversion and final-newline preservation
- Preview toggle, sanitize boundary, and embedded-image policy
- Lazy workspace tree, excluded folders, and partial-listing state
- Theme switching and session preservation
- Search, Go to Line, keyboard focus, and Japanese IME guard
- Long file names and constrained-width layout

Acceptance:

- The run starts from a specific `docs/smoke-checklist.md` section.
- Any fix is the smallest coherent correction found by the smoke.
- The result is recorded in `docs/current-status.md` or `docs/smoke-checklist.md` only when facts changed.
- The run does not add Git integration, LSP, terminal, AI assistance, project indexing, signing/notarization, binary release assets, or a sales/price flow.

## Goal 4: Source Release Readiness

Status: Evidence gathered on 2026-05-27; tag approval pending

目的: 署名済みアプリ配布ではなく、source-only developer preview として出せるだけの品質・説明・検証証跡を揃える。

このgoalの主要証跡は `docs/current-status.md` と `docs/source-release-checklist.md` に記録済み。実際のtag作成、push、GitHub Release公開は、ユーザーが明示した場合だけ行う。

### Goal Prompt

```txt
hazakura-note の Source Release Readiness を完成させる。
現在の Tauri + React + CodeMirror 6 prototype を、source-only developer preview として公開判断できる状態にする。
docs/source-release-checklist.md を正本として、READMEのbuild-from-source説明、Known Limits、version alignment、release note準備、manual smoke evidence、quality gatesを揃える。
package.json、src-tauri/tauri.conf.json、src-tauri/Cargo.toml のversionが意図したsource release versionで一致していることを確認する。
署名済みmacOSアプリ配布、notarization、installer、自動更新、binary asset publication、Git連携、LSP、terminal、plugin、AI支援には広げない。
必須のmanual smokeは built app で行い、New File、Open -> Edit -> Save、CRLF / final-newline preservation、external-change conflict、save-failure recovery、dirty close / app close cancellation、search keyboard flow、Japanese IME guard、lazy workspace tree、theme switching session preservation を簡潔に記録する。
最後に npm run build:vite、cargo fmt --manifest-path src-tauri/Cargo.toml -- --check、cargo test --manifest-path src-tauri/Cargo.toml、npm run build、git diff --check を実行し、docs/current-status.md、README.md、docs/roadmap.md、docs/source-release-checklist.md を必要最小限で更新する。
tag作成、commit、push、GitHub Release作成はユーザーの明示承認があるまで行わない。
```

### Acceptance Criteria

- Source-only release boundaryが `README.md` と `docs/source-release-checklist.md` で明確
- `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` のversionが `0.1.0` で揃っている
- 必須local gatesが2026-05-27に通っている
- built app manual smoke evidenceが `docs/current-status.md` に残っている
- Known Limitsがsource release向けに過剰主張していない
- 署名済み/notarized app配布をしたかのような記述がない
- tag / push / GitHub Releaseはユーザー承認なしに実行しない
