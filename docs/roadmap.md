# Roadmap

Status: Operational
Scope: Development sequence
Authority: Medium
Last reviewed: 2026-05-27

## Quality Strategy

本番品質は最初のgoalに詰め込まない。以下の順で、触れるものから壊れにくいものへ進める。

1. Prototype: 開く、編集する、保存する、プレビューする最小体験を作る
2. Safety Hardening: 保存、外部変更、バイナリ拒否、大容量警告、Markdown sanitizeを固める
3. Workspace Basics: タブ、ファイルツリー、テーマ切り替えで複数ファイルを扱えるようにする
4. Workspace Polish / Quality Hardening: 復元、検索、衝突回復、UI崩れ、テスト、ドキュメントを固める
5. Distribution Readiness: パッケージング、署名、E2E、README、既知制限、リリース手順を整える

各段階で「次へ進む条件」を明確にし、前段の未確認リスクを抱えたまま機能を広げない。

## v0.1: Minimum Editor

目的: Markdownを開いて保存できる状態にする。

- 単一ファイルを開く
- 編集
- 保存
- Markdownシンタックスハイライト
- Cmd+S保存
- UTF-8対応
- 大容量ファイル警告
- バイナリ読み込み防止

## v0.2: Safety Hardening

Status: Completed on 2026-05-26

目的: 単一ファイル編集を保存事故に強くする。

- 外部変更検知
- 保存前の衝突検出
- 保存失敗時のUI表示
- 手動スモークチェックリスト
- sanitize境界の確認
- Rust側ファイルI/Oテストの拡充

このフェーズでは、タブとフォルダツリーはまだ入れない。実装済みの安全境界を、v0.3でタブ単位へ広げる。

## v0.3: Workspace Basics

Status: Completed on 2026-05-26

目的: 複数ファイルを扱える作業場にする。

- フォルダを開く
- ファイルツリー
- タブ
- 未保存表示
- タブごとの外部変更検知
- System / Light / Dark テーマ切り替え
- テーマ選択の保持
- 未保存タブを閉じる前の確認
- `.git` / `node_modules` / `target` / `dist` などの重いディレクトリ除外

v0.3では、最近開いたファイルまたはフォルダの復元は未実装のまま残した。これはv0.3.1で回収済み。

## v0.3.1: Workspace Polish / Quality Hardening

Status: Completed on 2026-05-26

目的: Workspace Basicsを、日常的に触れるプロトタイプとして破綻しにくくする。

- 最近開いたworkspaceの復元
- 開いていたタブと最後のアクティブタブの復元
- File tree / Open / restored tabs の同一タブ管理への統合
- Active-file search
- 外部変更衝突後の Reopen from disk / Close without saving / Keep editing
- dirty tab close時の Save / Discard / Cancel 再確認
- app/window close時の dirty tab 向け Save All / Discard All / Cancel 再確認
- Cmd+O / Cmd+Shift+O / Cmd+W の基本ショートカット
- CodeMirror本文とpreview/statusの再読み込み同期
- 既存ファイルの LF / CRLF 改行コード保持
- System / Light / Dark の復元と可読性確認
- Rust側 file I/O / workspace listing / 除外 / バイナリ拒否 / 大容量境界テストの拡充
- README、current-status、roadmap、smoke-checklistの現状同期

このフェーズでは、Git連携、LSP、ターミナル、AI支援、プロジェクト全体解析、merge editor、高度なGit diffは入れない。

## v0.4: Markdown Workspace

目的: Markdownを書く体験を軽くする。

Before starting broad Markdown helpers, let the recurring automation close small reliability gaps from `docs/development-automation.md`, especially save-failure wording, IME smoke, search highlight visibility, keyboard-only operation, and layout rough edges.

- Markdownプレビュー
- 見出しアウトライン
- リスト継続
- 太字、inline code、リンクの記法補助
- チェックボックス補助
- frontmatterテンプレート挿入

## v0.5: Markdown Tidy

目的: 本文の主導権を人間に残したまま、軽い修正支援を入れる。

- Markdown lint
- 手動実行のFormat Markdown
- 保存前の軽いチェック
- コードフェンス閉じ忘れ検知
- 画像alt欠落検知

## v0.6: File Diff

目的: Gitに依存しないファイル同士の差分確認を入れる。

- ファイルA/B比較
- インラインdiff
- サイドバイサイドdiff
- 差分箇所ジャンプ
- 差分数表示
- `.diff` 保存

## Later

- 見出し単位のMarkdown diff
- frontmatter差分表示
- 段落単位diff
- 単語単位ハイライト
- 選択範囲だけの文章支援

AI支援は後回しにする。入れる場合も、差分確認と明示的な適用を必須にする。

## Production Quality Gates

本番品質を目指す場合は、少なくとも以下を別フェーズとして扱う。

- File Safety: atomic save、保存失敗時の復旧、外部変更衝突、改行コード保持
- Preview Safety: Markdown HTML sanitize、外部リンク、外部画像、ローカル参照の扱い
- Editor Reliability: undo/redo、検索、IME、日本語入力、ショートカット、スクロール同期
- Large File Behavior: 5MB警告、10MB以上の読み取り専用候補、フリーズ防止
- Tests: Rust側ファイルI/Oテスト、UI smoke、保存失敗系、sanitize確認
- Distribution: macOS署名、notarization、権限、初回起動、既知制限の明記

この段階に入るまでは、「動く」ことを「安全に配れる」とは呼ばない。
