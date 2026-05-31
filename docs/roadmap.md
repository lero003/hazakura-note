# Roadmap

Status: Operational
Scope: Current release sequence and planning boundaries
Authority: Medium
Last reviewed: 2026-05-31 (v0.6 scope redefined; 6/10 items implemented)

## Current Position

`hazakura-note` is no longer in the early `v0.1` planning sequence.

> **Planned rename**: `hazakura-note` → **`hazakura editor`** at v0.6 release. The name change signals the product identity as a text editor first (evoking the classic サクラエディタ heritage), rather than a note-taking app. All docs, package names, and release assets will be updated at that boundary.

The current public line is:

- `v0.1.0`: source-only developer preview
- `v0.1.0-warning-expected-dmg-preview`: separate warning-expected DMG preview lane
- `v0.2.0-pre.0`: pre0.2 warning-expected DMG preview with normal-mode and Agent Workbench screenshots in README
- `v0.2.0-pre.1`: pre0.2 warning-expected DMG preview with Finder/app-icon text document open support
- `v0.2.0`: Safe Editor preview warning-expected DMG release with theme/Japanese UI polish and the current Agent Workbench boundary kept optional
- `v0.3.0`: Safe Editor non-Git diff / change-review warning-expected DMG release
- `v0.4.0`: Markdown Review Navigation warning-expected DMG release

The old `v0.1` / `v0.3.x` phase map is archived in `docs/roadmap-v0.1-archived.md`.

Before the next public release claims image paste, export, Zen, spellcheck, table editing, or Agent authoring improvements, reconcile the implementation against `docs/authoring-feature-readiness.md`. Several merged slices have UI or command surfaces, but not all of the product promises are complete enough to advertise honestly.

## Product Boundary

The main product remains a Markdown-first safe editor.

Default Safe Editor Mode must keep these boundaries:

- no general terminal
- no arbitrary command execution
- no Git client
- no LSP or IDE features
- no plugin system
- no project-wide indexing
- no auto-apply or auto-commit behavior

Optional Agent Workbench Mode is a separate trust boundary. It may host one allowlisted local CLI provider session in a selected workspace, but it must remain explicit, consent-gated, and scoped by `docs/agent-workbench-boundary.md`.

## 0.2: Safe Editor Preview Stabilization

Goal: make pre0.2 honest, testable on another Mac, and easy to understand from the README and GitHub Release while keeping Safe Editor Mode visually and conceptually primary.

Status: Released as `v0.2.0` warning-expected DMG preview.

Completion criteria:

- README explains the normal Safe Editor value before Agent Workbench.
- README screenshots show normal mode first and Agent Workbench second.
- Version surfaces and release notes match the shipped preview version.
- Warning-expected DMG notes clearly state ad-hoc signing, no Developer ID signing, no notarization, and expected Gatekeeper warnings or rejection.
- Release assets verify after download with `shasum -c` and `hdiutil verify`.
- At least one non-development-machine smoke result is recorded for DMG download, mount, launch, and basic editor use.
- Known risks are visible rather than hidden behind stable-release wording.

Do not use 0.2 to add broad new features.

## 0.3: Safe Editor Non-Git Diff And Review

Goal: complete the core product promise of checking text changes without turning the app into a Git client, merge tool, IDE, or project analyzer.

Status: Released as `v0.3.0` warning-expected DMG preview.

Priority work:

- diff from disk versus current editor text
- simple explicit file-to-file diff
- compare restart draft or recovery candidates before restoring
- save-conflict review before choosing Reopen / Close without saving / Keep editing
- plain-text comparison output that does not imply Git status, Git history, staging, commit, branch, or repository awareness
- minimal review UI that makes changed regions readable before richer layouts are attempted

Acceptance:

- Current buffer versus disk diff is available for a selected text file.
- Explicit file A versus file B comparison works for safe text inputs.
- Draft/recovery and save-conflict flows can show the relevant text difference before the user chooses a recovery action.
- Diff labels use file/workspace language, not Git language.
- `.git` presence is not inspected or surfaced for this feature.
- No commit, branch, staging, status, history, patch apply, or repository operation is introduced.

This phase must not pass if:

- the feature behaves like a Git client
- the app scans the whole project to infer change state
- diff output suggests the user can stage, apply, commit, pull, push, or resolve a merge
- save-conflict recovery can discard local edits without an explicit user choice

Do not add:

- Git integration
- merge editor
- project-wide index
- auto-apply
- auto-format as part of diff

## 0.4: Markdown Review Navigation

Goal: make Markdown documents easier to read, navigate, and review after the v0.3 diff foundation, while avoiding intrusive prediction or automatic rewriting.

Status: Released as `v0.4.0` warning-expected DMG preview.

Delivered:

- current-file heading outline with click-to-jump
- current heading or section context in the editor/review surface
- diff hunk heading context for Markdown files
- local Markdown link navigation limited to explicitly selected workspace files
- open-tabs keyboard navigation
- display/readability polish for Markdown preview and review
- transient current-section HUD during Markdown scrolling, based only on the current file's headings, with no workspace indexing or automatic rewriting
- small Markdown editing helpers only when they are predictable, reversible, and not aggressive

This phase should prefer navigation, visibility, and manual review over prediction. Avoid strong autocomplete, automatic lint fixes, broad formatting rewrites, workspace-wide indexing, or project-level symbol search unless a later boundary review explicitly approves them.

## 0.5: Pi CLI Provider And App Stability

Goal: add Pi as a first-class Agent Workbench CLI provider while improving app stability in small, verifiable slices.

Status: Active development lane after the `v0.4.0` warning-expected DMG preview release.

Pre-release gate:

- resolve or explicitly defer the incomplete Markdown authoring/export items in `docs/authoring-feature-readiness.md`
- do not claim image paste as complete until pasted `assets/...` references render safely in preview and HTML export
- do not claim table editing beyond "Insert table" until row/column/alignment editing exists
- do not claim Agent selection actions until a selected-text candidate and diff-review flow is designed inside the safe boundary

Delivered:

- `pi` is available as an allowlisted local CLI provider in the existing Agent Workbench UI and backend validation path
- Pi remains a local CLI provider only: no Pi RPC, SDK, provider-add UI, arbitrary provider configuration, multi-agent orchestration, auto-apply, auto-commit, general terminal, or Git client behavior

Candidate work:

- keep Pi launch behavior inside the existing Agent Workbench gate: explicit mode, restart boundary, responsibility consent, selected workspace root, one active session, no restore
- run trusted-workspace manual smoke for Pi CLI usage alongside existing `codex` / `opencode` provider checks
- record provider-not-found evidence when Pi is not installed locally, without installing or configuring it during automation
- improve app stability and responsiveness found during normal editor and Agent Workbench smoke
- keep Safe Editor Mode visually and conceptually primary while the provider list grows

Do not use this phase to add Pi SDK integration, RPC integration, arbitrary provider configuration, multi-agent orchestration, auto-apply, auto-commit, a general terminal, or a Git client.

## 0.6: Foundation Release — Daily-Drivable Safe Editor

Goal: v0.6 is not a feature-adding release. It's the release where `hazakura-note` becomes **`hazakura editor`** — an editor you can actually use every day.

> Agent で勝つより先に、Agent を安心して置けるエディタの床を固める

The core positioning remains **「安全に読める。安全に直せる。必要なときだけAIに渡せる。Markdown-first の小さな作業場。」**

The rename to `hazakura editor` also signals kinship with the classic サクラエディタ (Sakura Editor) lineage — a lightweight, Japanese-first text editor heritage. Selected Sakura Editor features (encoding display, rectangular selection, regex replace) will be adopted where they align with the safe Markdown-first identity.

v0.6 delivers (✅ = implemented):

1. ~~**App.tsx 分割** — extract `useAgentWorkbench`, `usePreferences`, `useExport` into custom hooks. No zustand/Context. Goal: stop writing to App.tsx by default.~~ _(deferred)_
2. **Cmd+P クイックオープン** ✅ — fzf-style file name search + Enter to open.
3. **自動保存 + バックアップ** — periodic save to `.hazakura/backups/` with Draft restore recovery. Trust foundation. _(pending)_
4. **Replace (置換)** ✅ — Find bar gets replace input, Replace one / Replace all.
5. **Agent 差分ポーリング** — `last_seen_seq` incremental output fetching. Eliminates polling lag. _(pending)_
6. **選択範囲→Agent 送信** ✅ — select text in editor → Cmd+Shift+Enter sends to terminal stdin.
7. **プリセットプロンプトボタン** ✅ — [要約] [校正] [翻訳] [コードレビュー] chips above the terminal.
8. **タブのドラッグ並び替え** ✅ — Drag-and-drop tab reordering.
9. **Multi-cursor** ✅ — CodeMirror 6 built-in: Alt+click, Cmd+D.
10. **矩形選択 (Rectangular selection)** ✅ — Alt+Shift+drag.

**v0.6 progress: 7/10 items implemented.**

Deliberately deferred to v0.7:
- Global Search (Cmd+Shift+F)
- コマンドパレット (Cmd+Shift+P)
- ツリー Rename / Delete
- セッションログ保存
- ファイルコンテキスト自動添付
- Alt text 編集UI
- **文字コード表示 + 別名保存で文字コード変更**: status bar encoding display + Save As dialog with encoding dropdown (UTF-8/Shift-JIS/EUC-JP). Rust `encoding_rs` conversion.
- ペイン切替ショートカット

Do not use this phase to add SDK integration, background sessions, session restore, provider plugins, arbitrary command execution, automated approval of provider actions, zustand/Context architecture changes, Pi RPC, theme editor, KaTeX, Mermaid, tab split, or external file rename tracking.

## 0.7: Workspace Power Release

Goal: make the workspace experience powerful enough that users never need to leave the app for file/search operations.

Candidate work:

- Global Search (Cmd+Shift+F): workspace-wide grep via Rust
- コマンドパレット (Cmd+Shift+P): fuzzy-accessible all actions
- ツリー Rename / Delete: in-app file management
- セッションログ保存: save Agent chat as .md
- ファイルコンテキスト自動添付: auto-attach active file path to Agent messages
- Alt text 編集UI: improve image paste completeness

Do not use this phase to add Git integration, LSP, plugin system, theme editor, or project-wide indexing.

## 0.8: Writing Experience Release

Goal: refine the Markdown editing experience beyond basic functionality.

Candidate work:

- プレビュースクロール同期: scroll preview to match editor position
- Markdown スニペット展開: auto-complete blockquote, list, heading
- Markdown ツールバー拡充: heading / bold / italic / list / code block buttons
- フォーカスモード / タイプライターモード: highlight only the current line
- 書き出し品質向上: CSS polish for HTML export
- ピン留め / お気に入り: quick-access pinned files

## Future

Possible later work, only after a fresh boundary review:

- Developer ID signed and notarized distribution
- Markdown lint or manual formatting checks
- heading-level or paragraph-level Markdown diff
- Pi RPC integration, only after CLI mode improvements prove insufficient
- KaTeX 数式レンダリング
- Mermaid 図レンダリング
- テーマ自動切替（macOS appearance sync）
- タブ分割編集
- Homebrew Cask 対応
- GitHub Actions .dmg 自動ビルド
- アップデート通知

These are not approval to add a general terminal, arbitrary command execution, Git client behavior, plugin execution, auto-apply, auto-commit, or multi-agent orchestration.

## Roadmap Review Questions

Use these when asking for external review:

1. Does 0.2 clearly communicate the current value and preview limits?
2. Is Safe Editor Mode still visually and conceptually primary?
3. Does 0.3 complete the "check with diff" promise without becoming Git-aware?
4. Does 0.4 improve Markdown review/navigation without over-predicting or auto-rewriting user text?
5. Does 0.5 add Pi as a bounded CLI provider without making Agent Workbench feel like the default app mode?
6. Does 0.6 deliver a daily-drivable safe editor — Cmd+P, auto-save, Replace, App.tsx split — before adding more Agent features?
7. Does 0.7 add workspace power (Global Search, command palette, Rename) without scope creep?
8. Does 0.8 refine the writing experience without becoming a full IDE?
