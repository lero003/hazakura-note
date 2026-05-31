# Release Review Request — v0.5.0

この文書は hazakura-note v0.5.0 のリリース判定を依頼するための外部レビューブリーフです。
以下を確認し、リリース可否の判断をお願いします。

---

## プロジェクト / リリース対象

| 項目 | 値 |
|---|---|
| プロジェクト | hazakura-note — Markdown-safe editor with optional Agent Workbench |
| 現在の公開バージョン | v0.4.0 (2026-05-30) |
| 候補バージョン | **v0.5.0** |
| 現在のブランチ | `main` (origin/main より 31 commit ahead) |
| ワークツリー | clean |
| 最新版からの追補コミット | 31 commits (v0.4.0..HEAD) |

## リリース意図

「iOS/macOS 向け Pi エージェント」系のマイルストーンではなく、**v0.4 Markdown Review Navigation** で出し切れなかった以下の機能群を仕上げて、あらためて warning-expected DMG preview として配布する。

- 画像ペースト（assets/ 保存 → プレビュー/エクスポート表示）
- 画像ドラッグ＆ドロップ（assets/ 取込）
- 重複画像のハッシュベース自動統合
- HTML / Print to PDF エクスポート
- Zen Mode、Spellcheck Toggle、Table Insertion
- Agent Workbench ターミナル安定化（resize debounce）

## 今回実装されたもの

- **Image paste**: Cmd+V でクリップボード画像 → `assets/<hash>.png` → `![](assets/xxx)` 挿入。ワークスペースなしでもファイルの親ディレクトリに assets/ を作成
- **Image drag & drop**: 画像ファイルをウィンドウにドロップ → assets/ に取込 → `![](assets/xxx)` 挿入
- **Hash-based dedup**: 同じ画像を複数回ペーストしても1ファイルしか増えない（FNV-1a ハッシュ + 存在チェック）
- **Image preview**: assets/ 内の画像がプレビューに表示され、HTML エクスポートにも data:URI で埋め込まれる
- **HTML export**: Save As ダイアログ → スタンドアロン HTML ファイル書き出し（テーマCSS反映、画像インライン可）
- **Print to PDF**: `window.print()` → フォールバックでブラウザで開いて印刷
- **Zen Mode**: Cmd+Shift+F で全UI非表示、Escape で解除、エディタが中央寄せ
- **Spellcheck toggle**: Cmd+Option+; でネイティブスペルチェック ON/OFF
- **Table insertion**: ツールバーボタン / Cmd+Shift+T で3列Markdownテーブル挿入
- **Agent Workbench**: ターミナルリサイズ debounce (100ms)、終了状態の視覚スタイル

## 検証結果

| チェック項目 | 結果 |
|---|---|
| `npm run typecheck` (TypeScript) | ✅ Passed |
| `npm run build:vite` | ✅ Passed (chunk size 警告は既存) |
| `npm run build` (tauri build) | ✅ Passed (release + ad-hoc signed .app) |
| `cargo test` (78 tests) | ✅ All passed |
| `cargo fmt -- --check` | ✅ (直近実行) |
| `git diff --check` | ✅ Clean |
| 既存の DMG リリース手順 | 「appファイルビルド」まで確認済み |

## リリース前の既知ギャップ

1. **Print to PDF は `window.print()` 非対応のためブラウザフォールバック**
   - Tauri v2 + WKWebView の制約。ブラウザで開いたあと Cmd+P → PDF保存になる
2. **DMG ビルド未実施**（`npm run build:dmg-preview` が必要）
3. **リリースノート未作成**（テンプレートは `docs/releases/` にある）
4. **バージョン未 bump**（現状すべて `0.4.0`）

## リスク / レビューフォーカス

- **画像ペーストの CSP 安全性**: `asset://localhost/` + `https://asset.localhost` のみ許可。任意のローカルファイル読み込みは不可
- **コードサイズ**: `index.js` 1.3MB (417KB gzip)。増加傾向。動的インポート分割は未着手
- **署名・公証**: Ad-hoc signing のみ。Gatekeeper 警告が出ることを前提とした warning-expected リリース
- **ドキュメント: authoring-feature-readiness.md は更新済み**だが、smoke-checklist.md は今回の新機能に対応していない
- **旧リリースタグ**: すべて immutable。v0.5.0 は新規タグ

## レビュアーへの質問

1. **このバージョンに命名されている `v0.5` のスコープ（Pi CLI provider + App Stability）に対して、今回の追加機能群は適切か？** それとも `v0.6` にずらすべきか？
2. **画像ペースト + 重複検出の実装は「release claim」に十分な完成度か？** （alt text入力UIの不在、smoke未実施をどう評価するか）
3. **DMG ビルド + バージョン bump + リリースノート作成の完了をもって「リリース可」とするか？**
4. **今回のリリースで解決しないまま次のマイルストーンに送る課題は何か？**

## 現時点の推奨

**条件付きリリース可**。以下の完了を条件として推奨します：

1. `package.json` / `Cargo.toml` / `tauri.conf.json` のバージョンを `0.5.0` に統一
2. `docs/releases/0.5.0-warning-expected-dmg-preview.release.md` を作成
3. `npm run build:dmg-preview` で DMG + SHA-256 checksum 生成
4. GitHub Release (prerelease) に DMG アップロード

上記が完了すれば、warning-expected DMG preview として公開可能な状態です。
