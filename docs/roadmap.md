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
5. Source Release Readiness: source-only developer previewとして出せる説明、品質ゲート、手動smoke証跡を揃える
6. Distribution Readiness: パッケージング、署名、E2E、README、既知制限、リリース手順を整える

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
- Active-file search with visible match highlights and keyboard next / previous / return-to-editor flow
- IME変換中のEnter / Escapeとグローバルショートカットを通常コマンドとして扱わないキーボードガード
- 外部変更衝突後の Reopen from disk / Close without saving / Keep editing
- dirty tab close時の Save / Discard / Cancel 再確認
- app/window close時の dirty tab 向け Save All / Discard All / Cancel 再確認
- dirty tab / app close確認をCancelまたはEscapeで閉じた後のeditor focus復帰
- dirty tab close確認からのSaveが失敗または衝突した場合、closeを止めて通常の回復導線へ戻す
- 長いファイル名と狭い表示幅で tabs / file tree / status / error / close dialog が主要操作を押し出さない表示ガード
- Cmd+O / Cmd+Shift+O / Cmd+W の基本ショートカット
- Workspace treeのlazy loading: Open Folder時はroot直下だけを読み、directory展開時に直下childrenを読む。除外directoryは維持し、directory単位の上限超過はpartial listingとして表示する。
- CodeMirror本文とpreview/statusの再読み込み同期
- 既存ファイルの LF / CRLF 改行コード保持
- 末尾改行の有無を保存時に勝手に変更しない契約のRustテスト化
- non-conflict save failure時の Try save again / Keep editing 回復導線
- System / Light / Dark の復元と可読性確認
- Light / Dark / System 切り替え時にactive editorを再生成せず、現在のカーソル・選択・undo/redo session stateを保持
- Rust側 file I/O / workspace listing / 除外 / バイナリ拒否 / 大容量境界テストの拡充
- README、current-status、roadmap、smoke-checklistの現状同期

このフェーズでは、Git連携、LSP、ターミナル、AI支援、プロジェクト全体解析、merge editor、高度なGit diffは入れない。

## v0.3.2: Source Release Readiness

Status: Evidence gathered on 2026-05-27; tag approval pending

目的: 署名済みアプリ配布ではなく、source-only developer preview として公開判断できる状態にする。

- `docs/source-release-checklist.md` に従ってsource release境界を確認済み
- `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` のversion alignmentは `0.1.0` で確認済み
- READMEのbuild-from-source手順とKnown Limitsをsource release向けに確認済み
- source release notesの種を `docs/source-release-checklist.md` に記録済み
- built appでfile safety、workspace tree、search、theme、close確認のmanual smoke evidenceを `docs/current-status.md` に記録済み
- Japanese IME smokeはbuilt appで人間の手動入力により確認済み
- 既存のlocal quality gatesはこのフェーズで実行済み

このフェーズでは、Apple Developer ID署名、notarization、installer、自動更新、binary asset publicationは扱わない。tag作成、push、GitHub Release公開は、ユーザーの明示承認がある場合だけ行う。

## v0.3.3: Text Editor Usability Pack

Status: Completed on 2026-05-27

目的: Markdown-first safe editorのまま、一般的なテキストエディタとして最低限ほしい表示・保存・preview操作を足す。

- active tab metadataとして、概算byte数、文字数、改行コード、末尾改行の有無、clean/unsaved状態を表示
- LF / CRLF の明示変換controlを追加し、変換後は保存までdirtyとして扱う
- Save Asを追加し、`.md` 以外の一般的なUTF-8 text extensionにも新規保存できるようにする
- Save Asは既存ファイルを上書きしない
- macOS Save panelが `name.log.txt` のような二重拡張子を返した場合、既知のtext extension同士に限り意図した `name.log` に正規化する
- Preview表示のON/OFFを追加し、選択を `localStorage` に保持
- Markdown preview内の画像は、embedded `data:image` PNG/JPEG/GIF/WebPのみ表示し、外部/ローカル画像参照はブロック表示にする
- built appでmetadata、preview toggle、image policy、CRLF -> LF変換、Save As to `.log` をmanual smoke済み

このフェーズでは、画像ファイルブラウザ、外部画像読み込み、ローカル画像プロトコル、UI刷新、Git連携、LSP、terminal、AI支援は扱わない。

## v0.3.4: Editor Reliability / Navigation Pack

Status: Completed on 2026-05-27

目的: 一般的なテキストエディタとして日常操作に必要な表示、検索、復元、外部変更気づきを追加する。

- Status barにcursor line / columnを表示
- 選択範囲の概算character数とline数を表示
- Active tab metadataに拡張子由来のfile type / modeを表示
- Searchにcase-sensitive、whole-word、regex optionを追加し、invalid regexは検索失敗として安全に表示
- Go to Line controlを追加
- Line wrap、invisible characters、font size、tab sizeのeditor display settingsを追加し、`localStorage` に保持
- Dirty tabのunsaved draftをlocalStorageへ保持し、restart後にfingerprintが一致する場合だけ明示的にRestore / Discardできるようにする
- App focus / visibility復帰とactive tab switch時に外部変更metadataを再確認し、保存前に気づけるようにする
- Vite buildとbrowser smokeで検索option、invalid regex、Go to Line、editor settings復元を確認

このフェーズでは、autosave、merge editor、diff UI、Git連携、LSP、terminal、AI支援、project indexingは扱わない。

## v0.3.5: Source Preview Quality Polish

Status: In progress from 2026-05-27

目的: 新機能を広げず、built app smokeを繰り返してsource-only developer previewとしての粗を削る。

- 保存、外部変更衝突、dirty close、draft restore、Save As、改行コード、preview sanitize、workspace tree、検索、テーマ、長いファイル名を優先smoke対象にする
- 見つかった問題は小さな修正単位に分け、再smokeしてからdocs/current-status.mdへ証跡を残す
- 2026-05-27の初回polishでは、Go to Lineのアクセシビリティ名とmetadata/status separatorの余分な空白を修正済み
- このフェーズでは、Git連携、LSP、terminal、AI支援、project indexing、署名済みbinary配布、課金導線は扱わない

## v0.4: Markdown Workspace

目的: Markdownを書く体験を軽くする。

Before starting broad Markdown helpers, let the recurring automation close small reliability gaps from `docs/development-automation.md`, especially keyboard-only operation, layout rough edges, and small reliability regressions found during manual smoke.

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
