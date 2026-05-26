# AGENTS.md

## Role

このプロジェクトでは、変更を小さく保ち、Markdown-first safe editor という軸を守る。

## Working Rules

- まず目的を確認し、現状の文書とコードを読む
- 実装範囲をMVPに寄せる
- 任意コード実行、Git操作、LSP、ターミナル、拡張機能の追加へ広げない
- セキュリティ境界に関わる変更は `docs/security-boundary.md` を先に確認する
- ドキュメント判断は `README.md` と `docs/` 配下を優先し、`markdown-safe-editor-plan.md` は発想の原本として扱う
- テストまたは確認コマンドを実行してから完了報告する

## Reporting

作業後は、変更したこと、確認したこと、残っているリスク、次に見るべきことを簡潔に報告する。
