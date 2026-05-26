# Product Brief

Status: Canonical
Scope: Product direction and non-goals
Authority: High
Last reviewed: 2026-05-26

## Concept

`hazakura-note` は、Markdown中心の安全なテキスト作業机です。

IDEを置き換えるのではなく、開発プロジェクト内のテキストファイルを実行せずに開き、必要な範囲だけ編集し、差分で確認できる場を作ります。

## Core Value

- Markdownを軽く書ける
- 基本的なテキストファイルを安全に閲覧・編集できる
- 拡張機能に依存しない
- 任意コード実行をしない
- AIや手作業による修正版を差分で確認できる
- 小さく、速く、壊れにくい

## Target Users

- Markdownで記事、企画書、メモを書く人
- VSCode拡張機能の安全性に不安がある人
- AI生成物やAI修正版を人間の目で確認したい人
- 信頼しきれないプロジェクト内のファイルを安全に開きたい人
- LSPや補完よりも、軽さと安全性を重視する人

## Non-Goals

このプロジェクトでは、以下を目指さない。

- VSCode互換
- 拡張機能マーケットプレイス
- LSP対応
- コード補完
- デバッガ
- ターミナル統合
- Gitクライアント機能
- リモート開発
- AIエージェント統合
- プロジェクトビルド
- パッケージ管理
- 任意コマンド実行

## Product Principle

判断に迷った場合は、便利さよりも以下を優先する。

1. 実行しない
2. 補完しすぎない
3. 勝手に変えない
4. 差分で確認する
