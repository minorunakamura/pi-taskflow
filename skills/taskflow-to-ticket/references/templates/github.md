# GitHub Issues 設定テンプレート

対象プロジェクトの `docs/agents/issue-tracker.md` が未設定のときだけ、以下の値を確認し、保存内容を提示して明示承認後に保存する。既存ファイルの補完・変更では独自記述を維持する。`<...>` を未確定のまま保存しない。

```markdown
# Issue tracker

## Tracker

GitHub Issues

## Repository

<確認済み owner/repo と repository URL>

## 作成・取得

- 公開 gh CLI を使い、常に上記 repository を明示する。
- 作成: gh issue create --repo <owner/repo> --title <title> --body <body> --label <ready-for-agent 対応名>
- 取得: gh issue view <number-or-url> --repo <owner/repo> --json number,url,title,body,comments,labels,state
- ready-for-agent 対応名は docs/agents/triage-labels.md があればその既存対応名、なければ ready-for-agent。必要な1つだけ別途承認後に準備する。

## 依存関係

blocker を先に作成し、実 Issue の参照を使う。利用可能なら native blocking relationship / sub-issue、機能非対応なら本文の Blocked by / Parent の実リンクで表す。認証・権限・通信の失敗では停止する。元 Issue の本文・状態は変更しない。
```

host が github.com 以外なら確認済み host も Repository に明記し、その host の認証とアクセスを確認する。label vocabulary の設定ファイルや他の triage labels はこのテンプレートから生成しない。
