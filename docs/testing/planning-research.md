# Planning 外部調査 smoke 確認

Issue #5 の対象は、Planning から `pi-subagents` 経由で `pi-ketch.researcher` を起動し、外部調査の結論を Root に返す経路である。
実際の model と外部取得を使う。Agent の定義や tool 応答を mock した確認だけでは成功としない。
Plan Review・ticket 公開までの E2E は [Feature smoke](planning-feature.md) の対象であり、ここでは繰り返さない。

## 前提と境界

- Pi、`pi-subagents`、`pi-ketch` が通常の Pi package 設定で読み込まれ、model と Ketch CLI が利用可能。
- Root の公開 `subagent({ action: "list", capabilities: true })` と `get` で package agent の出所、fresh default、継承設定、tools、child Extension を確認する。
- 同名の user / project Agent や override が package 定義を置き換えていないことを確認する。
- 呼び出し側は Agent の tools / extensions / skills / model を上書きしない。通常は context も指定せず、package の `defaultContext: fresh` に任せる。global context override がある環境では、fresh に解決されることを別途確認する。
- `pi-taskflow` に独自 Researcher、Ketch tool 一覧、child Extension path、`subagentOnlyExtensions` 設定を追加しない。
- package が見つからない、必要な tool が利用不可、外部取得が失敗した場合は未確認として停止する。built-in `researcher` や Root の直接調査で代用しない。

## 隔離した fixture と起動

`TASKFLOW_REPO` と `SMOKE_MODEL` を、リポジトリの絶対パスと利用可能な `provider/model` に設定する。
リポジトリ外の一時ディレクトリに、変更しない調査対象を用意する。

```sh
SMOKE_DIR=$(mktemp -d)
cd "$SMOKE_DIR"
git init -q
printf '%s\n' 'console.log(new URL(process.argv[2]).href);' > url-info.mjs
printf '%s\n' '{"type":"module","scripts":{"test":"node url-info.mjs https://EXAMPLE.COM:8443/path"}}' > package.json
git add url-info.mjs package.json
git -c commit.gpgsign=false commit -qm 'smoke fixture'
```

次の依頼を fixture の `request.txt` に保存する。確認文字列は Root だけに置き、child task に渡さない。

```text
/skill:taskflow-planning url-info.mjs に --hostname オプションを追加する計画を作ってください。
オプションなしの既存動作は変更せず、オプションありの時だけ指定 URL の hostname を出力します。
Node.js 24 の WHATWG URL を使い、依存関係追加、入力仕様の拡張、その他のオプションは対象外です。
TDD は使わず CLI 実行で検証します。
URL.hostname が port を含むか、英大文字の domain がどう正規化されるかを外部資料で確認してください。
出典候補: https://developer.mozilla.org/en-US/docs/Web/API/URL/hostname
これは Issue #5 の external-research smoke です。外部調査後、必要な結論と出典を反映した
未承認の Plan 草案を最終回答に提示して停止してください。
今回は Plan Review、Approved Plan 保存、ticket 公開、実装は行わず、Planning 全体の完了とはしないでください。
外部調査は Skill に従って package agent に委譲してください。
開始前に公開 subagent の list (capabilities:true) と get で package agent を確認してください。
Agent の tools、extensions、skills、context、model は上書きせず、package の定義に任せてください。
async の実結果を受け取ってから草案を作り、調査 trace をファイル保存しないでください。
Root だけの確認文字列は ROOT_ONLY_ISSUE5_SMOKE です。child task や Plan に含めないでください。
```

Root で外部取得を代行できないよう、使える tool を絞って実際の Planning Skill を起動する。
通常の package discovery を残し、Ketch の child 配線を CLI 側にも記述しない。

```sh
pi --mode json --no-approve --no-mcp --no-prompt-templates --no-skills \
  --skill "$TASKFLOW_REPO/skills/taskflow-planning" -e "$TASKFLOW_REPO" \
  --session-dir "$SMOKE_DIR/sessions" --tools read,subagent,subagents_enable \
  --model "$SMOKE_MODEL" --thinking medium @request.txt \
  > events.jsonl 2> stderr.log
```

## 観測と合格条件

1. Root が Planning Skill、Feature Playbook、fixture を読む。
2. 公開 list / get で package agent を確認し、`agent: "pi-ketch.researcher"` を指定して起動する。built-in `researcher` は使わない。
3. 起動応答と child の `status.json` が `context: "fresh"` を示す。別の child session に Root の確認文字列や会話全文がない。
4. `recovery-descriptor.json` の Agent の出所・継承設定と、実際の child session の system message の `toolsAdded` を照合する。package が要求する tools がすべて宣言されていることを確認する。登録処理自体の unit test は `pi-taskflow` に作らない。
5. child の `launchResolvedExtensions` で ambient Extension が無効でも package の child Extension が有効になっていることを確認する。呼び出し引数に Extension path や配線設定がないことも確認する。
6. child が Ketch tool を実際に呼び、各 URL の成功応答を得る。tool の成功フラグだけでなく、batch 内の各ページにエラーがないことと本文の根拠を確認する。
7. child が終了コード0 / complete となり、実結果が Root に返る。その後の草案に、port を含まないこと・HTTPS domain の小文字化・出典・対応する CLI の期待結果が含まれる。
8. 草案は結論と出典だけを利用し、取得本文や調査会話のコピーではない。正式な Plan / ticket / 調査 trace ファイルを保存せず、production 相当の fixture を変更しない。

```sh
git diff --exit-code HEAD -- url-info.mjs package.json
node url-info.mjs https://EXAMPLE.COM:8443/path
# 既存の出力: https://example.com:8443/path
```

`events.jsonl` の起動応答にある `asyncDir` から、子の `status.json`・`recovery-descriptor.json`・ログを辿れる。
child session のパスは `status.json` の `sessionFile` から取得する。パスや tool 一覧を `pi-taskflow` に固定しない。
Pi / pi-subagents 自身の session・診断ログは検証証拠であり、workflow が Implementation に渡す正式な成果物ではない。
一時領域の完全な trace を本リポジトリにコピーしない。

## 2026-10-08 JST の実行結果

- Pi `1.0.4`、`pi-subagents` `0.76.1`、`pi-ketch` `1.0.0`（commit `e49fd9ea48b675eef2ede729c9f13f7e12d44c20`）、Ketch `0.12.0`、Node.js `v24.21.0`、model `openai/gpt-6.1-sol` / medium を使用。
- fixture: `/tmp/pi-taskflow-research-smoke.WQHBI5`。起動引数は `invocation.json`、Root の履歴は `events.jsonl`、session は `sessions/`。確認文字列は `ROOT_ONLY_ISSUE5_WQHBI5` を使用。実際の依頼と起動では上記と同じ検証境界を指定した。
- child run: `8b4e5a85-76c7-4754-8aea-df7eee74e3a3`。`asyncDir` は `/var/folders/04/cs5vwntd34d_fdbtdczbxg000000gn/T/pi-subagents-uid-501/async-subagent-runs/8b4e5a85-76c7-4754-8aea-df7eee74e3a3`。Root / child とも終了コード0、child は complete。
- Root は list / get の後、package agent を `async: true` で起動。context・tools・Extension の上書きなし。fresh の実応答、child の独立した session、Root の確認文字列が child 全文にないことを確認した。
- `recovery-descriptor.json` の要求 tools と child system message の `toolsAdded` が一致。継承設定は project / global context / skills がすべて false。ambient Extension は無効で、package が提供する child Extension が解決・有効化されていた。
- child は `ketch_scrape` で MDN と Node.js 24 の公式 URL documentation を取得。batch の両ページが成功し、本文に port の除外と HTTPS domain の小文字化の根拠があった。ほかの Ketch tool は登録・宣言を確認したが、各 backend の外部呼び出しはこのシナリオの対象外。
- 実結果の返却後、Root は必須6項目と出典を含む未承認の草案を提示。調査本文や会話全文をコピーせず、正式な Plan / ticket / 調査 trace ファイルを保存していない。`url-info.mjs`・`package.json` の差分なしと、既存 CLI 出力を実行確認した。
- Plan Review、ticket 公開、Implementation は開始していない。これは外部調査 checkpoint の成功であり、Planning 全体の完了ではない。
- 証拠は一時領域にあるため恒久保存は保証しない。外部サービス・認証・backend 設定によって再実行が失敗する場合は未確認として報告する。

### Issue #5 の Acceptance criteria 照合

| 条件 | 結果・根拠 |
| --- | --- |
| pi-subagents から package researcher を起動できる | 確認済み: 実際の起動と complete / 終了コード0 |
| 適切な fresh child context | 確認済み: 起動応答・status・独立 session・Root 確認文字列の不在 |
| Planning から外部調査を呼べる | 確認済み: Planning Skill → package agent の実呼び出し |
| 独自 researcher Agent を定義しない | 確認済み: Agent 定義の追加なし、package の出所を確認 |
| built-in researcher で代用しない | 確認済み: 実呼び出しと child の Agent 名 |
| Ketch tool 名の一覧を管理しない | 確認済み: production 側に一覧・配線を追加せず package 定義を利用 |
| child Extension path をハードコードしない | 確認済み: 呼び出し引数・production 側に path なし |
| Ketch 用 subagentOnlyExtensions を設定しない | 確認済み: taskflow 側の設定・配線追加なし |
| 必要な Ketch tools が child で利用可能 | 確認済み: package の要求 tools と実 session の宣言を照合、外部取得成功 |
| 配線を再実装せず child Extension を利用可能 | 確認済み: ambient 無効でも package Extension の解決・取得成功 |
| 少なくとも1つの integration / smoke で結果が Planning に返る | 確認済み: この実シナリオの実結果 → Root の草案 |
| 必要な結論を利用し完全な trace を永続化しない | 確認済み: Skill の規則、草案内容、workflow の保存操作なし |
