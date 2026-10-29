# チケットテンプレート

承認待ちの本文は通常の会話メッセージで提示し、`ask_user_question` 内には入れない。分割と保存・公開の両承認前にファイルや Issue を作らない。Local は下記の見出しを `# <NN>: <title>` にし、GitHub は title を Issue のタイトルに渡す。`Parent` は元 Issue がある場合だけ含める。

```markdown
# <title>

## Approved Plan

<承認済みの正式な Plan の解決可能なパスまたはリンクと承認根拠>
<Plan なし / 未承認ならその事実と「Implementation の前提は未成立」を記す>

## Parent

<元 Issue の実リンク。本文・状態は変更しない>

## What to build

<ユーザーから見た end-to-end の成果と対象外>

## Acceptance criteria

- [ ] <検証可能な完了条件>

## Verification

<新しいセッションで実行・観測できる確認方法>

## Blocked by

<本当の blocker の実参照。Local は番号・タイトル・相対リンク、GitHub は実 Issue リンク>
<なければ None (can start immediately)>
```

GitHub の native 関係を使う場合も readback と再開照合のため本文の実参照を残す。Local の状態記述は既存ルールに従い、必要なら既存の `ready-for-agent` 対応名を用いる。ただし label / 状態は Plan 承認や blocker 完了の証拠ではなく、Plan なし・未承認なら Implementation 未成立の明記を維持する。
