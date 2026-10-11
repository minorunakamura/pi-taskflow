# Local Markdown 設定テンプレート

対象プロジェクトの `docs/agents/issue-tracker.md` が未設定のときだけ、保存先・内容を提示して明示承認後に保存する。既存ファイルの補完・変更では独自記述を維持する。

```markdown
# Issue tracker

## Tracker

Local Markdown

## 保存・取得

- プロジェクトルートから .scratch/<feature-slug>/issues/<NN>-<slug>.md に保存する。
- 01 から依存順に番号を付け、1チケット1ファイル。既存ファイルは上書きしない。
- 取得: 指定された ticket path を直接 read する。

## 依存関係

Blocked by に blocker の番号・タイトルと実ファイルへの相対リンクを記す。Approved Plan の相対リンクを含め、全リンクは ticket のディレクトリから解決する。
```

`<feature-slug>` / `<NN>` / `<slug>` は実行時の命名パターンであり、設定時に特定 feature に固定しない。GitHub CLI・認証・label 作成は Local には不要。
