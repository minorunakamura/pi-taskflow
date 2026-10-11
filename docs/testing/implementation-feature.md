# Feature Implementation smoke 確認

共通 Implementation フローと Feature Playbook、および Issue #17 の tracker 設定引継ぎを、新しい実際の Root セッションで確認する。
`pnpm test` の `implementation-skill.test.ts` は Pi の Skill 読み込みと Feature 参照だけを確認する。文章の一致や模擬 Agent / approval の応答を E2E 成功の証拠にしない。

## 前提と隔離

- Pi の model、公開 `pi-subagents` の built-in `worker` / `reviewer`、`ponytail-review` Skill、`pi-taskflow` Extension を利用可能にする。
- [Feature Planning smoke](planning-feature.md) で実際にユーザーが承認した Approved Plan と、分割を別途確認した local Work Item を使う。未承認の fixture Plan を Approved Plan と呼ばない。
- Planning の fixture から `greet.mjs`、`package.json`、正式な Plan、Work Item、`docs/agents/issue-tracker.md` だけをリポジトリ外の別の一時ディレクトリへコピーする。Plan / ticket の相対パスを維持する。AGENTS.md / CLAUDE.md、Planning の sessions、会話、Scout 出力、tool 履歴はコピーしない。
- 初期コードは `console.log("Hello, world!");`。両方の CLI がまだ `Hello, world!` を出力することを確認し、fixture のみを Git の baseline として記録する。
- Code Review は設定なしのデフォルト無効で確認する。実際の `taskflow_code_review` が `skipped` を返す必要がある。global 設定は変更しない。

```sh
TASKFLOW_REPO=/absolute/path/to/pi-taskflow
PLANNING_FIXTURE=/path/to/completed-planning-fixture
SMOKE_DIR=$(mktemp -d)
mkdir -p "$SMOKE_DIR/docs/plans" "$SMOKE_DIR/docs/agents" "$SMOKE_DIR/.scratch/greet-uppercase/issues"
cp "$PLANNING_FIXTURE/greet.mjs" "$PLANNING_FIXTURE/package.json" "$SMOKE_DIR/"
cp "$PLANNING_FIXTURE/docs/plans/greet-uppercase.md" "$SMOKE_DIR/docs/plans/"
cp "$PLANNING_FIXTURE/docs/agents/issue-tracker.md" "$SMOKE_DIR/docs/agents/"
cp "$PLANNING_FIXTURE/.scratch/greet-uppercase/issues/"*.md "$SMOKE_DIR/.scratch/greet-uppercase/issues/"
cd "$SMOKE_DIR"
git init -q
git add greet.mjs package.json docs .scratch
git -c commit.gpgsign=false -c user.name=TaskflowSmoke -c user.email=smoke@example.invalid commit -qm baseline
node greet.mjs
node greet.mjs --uppercase
TICKET=$(find .scratch/greet-uppercase/issues -type f -name '*.md' | sort | head -n 1)
shasum -a 256 docs/agents/issue-tracker.md > tracker-before.sha256
pi --mode json --approve -e "$TASKFLOW_REPO" \
  --skill "$TASKFLOW_REPO/skills/taskflow-implementation" \
  --session-dir "$SMOKE_DIR/sessions" \
  "/skill:taskflow-implementation $TICKET" \
  > events.jsonl 2> run.stderr
```

`--continue` / `--resume` / `--fork` は使わない。command に渡す ticket は実際の生成物から選び、依存なし・判断確定済みの Feature Work Item であることを実行前に読む。設定が絶対パスを含むなど、別 fixture へのコピーと矛盾する場合は黙って更新せず、ticket Skill で変更内容を実ユーザーに確認してから準備し直す。
Code Review を有効にした試行や、ユーザー確認待ちになる停止試行では TUI または RPC を使う。print / JSON の UI 制約は Planning smoke を参照する。

## 観測と合格条件

1. Root が Work Item 取得前に fixture root の `docs/agents/issue-tracker.md` を直接 read し、Local の対象・取得ルールを確認する。その後 Work Item、正式な Approved Plan を取得し、開始条件を確認する。この Work Item は依存なし・判断確定済み。AGENTS.md / CLAUDE.md や Planning の会話・Scout 出力に依存しない。
2. Root が実際の Work Item の内容から Feature Playbook を読み、現在の `greet.mjs` と `package.json` を直接確認する。分類だけの子 Agent を使わない。小規模なので Scout は省略してよい。
3. built-in `worker` が fresh context で起動される。依頼には今回の Work Item、Plan の関係部分、完了条件、制約・対象外、正式なチェック・直接検証方法、現在のコードの事実がある。`ponytail` を明示的に追加しない。TDD は Plan が指定していないため追加しない。
4. Worker が `greet.mjs` のみを最小限変更し、Plan にない仕様変更、依存追加、merge / release / deploy を行わない。Root は実際の差分を確認する。
5. 正式な `package.json` の `test`（`npm test`）が成功する。lint / formatter / typecheck は定義されていないため推測・追加しない。
6. 別の直接検証で `node greet.mjs` が `Hello, world!\n`、`node greet.mjs --uppercase` が `HELLO, WORLD!\n` を出力し、両方の exit code が0、stderr が空であることを確認する。test script だけでは新しい動作を証明できない。
7. fresh built-in `reviewer` による Correctness Review と、別の fresh built-in `reviewer` + `ponytail-review` による Ponytail Review が完了する。入力に Work Item、Plan、実際の差分、チェック結果、直接検証結果があり、Worker の自己申告だけを証拠にしない。Reviewer は project code を変更せず、Root に指摘を返す。
8. 指摘があれば Root が採否を判断する。修正が必要ならまとめて Worker に依頼し、影響したチェック・直接検証を再実行する。再レビューは修正の大きさ・リスクに応じて行う。無指摘なら不要な修正 loop を追加しない。
9. Root が最後に実際の `taskflow_code_review` を呼び、無効時の `status: "skipped"` を確認する。tool の呼び出しを省略しない。
10. 最終回答が `READY_FOR_MERGE` を明示し、変更、チェック、直接検証、各完了条件、指摘の採否、リスクを報告する。Git の差分と CLI を smoke の実行者も独立して確認する。実際の merge、release、deploy は行わない。

Skill / Playbook は確率的な Agent の手順であり、読み込みテストだけでは実行遵守を保証しない。実際の tool 履歴・child の launch context・差分・コマンド出力・最終回答を根拠にする。
終了後に `shasum -a 256 -c tracker-before.sha256` と `git diff --exit-code HEAD -- docs .scratch` で設定・Plan・ticket の不変を確認する。Implementation が設定を作成・更新していないことと、AGENTS.md / CLAUDE.md の不存在も確認する。
fixture の `.pi/subagents`、sessions、ログは一時領域の runtime artifact であり、本リポジトリに移さない。

## 停止と承認 gate の追加確認

必要に応じて別の試行で以下を確認する。未実行の分岐は実行済みと報告しない。

- Work Item 不在、Approved Plan 不在、未完了の genuine blocker、不明な完了条件、未解決のユーザー判断では、Worker やコード変更の前に `BLOCKED`。
- Plan と現在のコードが矛盾して設計変更が必要なら `REPLAN_REQUIRED`。Worker から Plan 変更の要求が返った場合も Root が停止する。
- チェックや直接検証の失敗を隠して `READY_FOR_MERGE` にしない。
- Code Review 有効時は実際のユーザーが明示的に Approve するまで完了しない。Reject の採否は Root が判断し、修正後に必要な確認と再提出を行う。Cancel / unavailable / error は承認ではない。

Code Review の設定解決と Approve / Reject / Cancel / unavailable / error の tool contract は既存の `settings.test.ts`、`code-review.test.ts`、`plannotator.test.ts` でも確認する。これは有効な gate の人間参加 E2E とは区別する。

## tracker 引継ぎと開始 gate の再現手順（Issue #17）

成功シナリオとは別に、**各 case ごとに** Planning の未実装 fixture から新しい隔離ディレクトリを作る。以下で設定・Plan・ticket・初期コードのみをコピーし、下表の該当 case の準備を行う。ログは fixture 外に置く。

```sh
CASE_DIR=$(mktemp -d)
CASE_LOG_DIR=$(mktemp -d)
mkdir -p "$CASE_DIR/docs" "$CASE_DIR/.scratch"
cp "$PLANNING_FIXTURE/greet.mjs" "$PLANNING_FIXTURE/package.json" "$CASE_DIR/"
cp -R "$PLANNING_FIXTURE/docs/plans" "$PLANNING_FIXTURE/docs/agents" "$CASE_DIR/docs/"
cp -R "$PLANNING_FIXTURE/.scratch/greet-uppercase" "$CASE_DIR/.scratch/"
cd "$CASE_DIR"
TICKET=$(find .scratch/greet-uppercase/issues -type f -name '*.md' | sort | head -n 1)
```

この入力は停止 gate 用のテスト変更であり、チケット化成功の証拠にしない。正式 Plan とコードは変更しない。以下の準備を行った**後**、fixture の baseline を記録する。`unreadable-config` の権限変更だけは baseline 記録後に行う。

| case | 準備・入力 | 必須の観測 |
| --- | --- | --- |
| `incomplete-blocker` | ticket と同じディレクトリに `00-blocker.md` を作り、`Status: OPEN`、保存契約など開始に必須の成果、未達の完了条件を明記する。対象 ticket の `Blocked by` をこの実ファイルへの相対リンクに変更し、未完了では開始できない理由を記す。入力は `$TICKET` | 設定、ticket、正式 Plan、blocker の実本文・状態を取得して `BLOCKED`。label があっても開始しない。単なる関連リンク扱いや close の推測で回避しない |
| `tracker-conflict` | Local 設定をそのまま保持し、入力だけ `https://github.com/minorunakamura/pi-taskflow/issues/17` にする。これは矛盾の検証用参照であり、Issue の実装・更新許可ではない | 設定と明示 URL の不一致を検出し、`BLOCKED` とユーザー確認待ち。勝手な GitHub 取得先への切替や設定変更なし |
| `no-config-local-path` | `rm docs/agents/issue-tracker.md`。依存なしの元の `$TICKET` を入力する | 不存在を確認した後、local path と ticket 基準の Plan リンクで取得できる。設定を作らず開始 gate を通過する。取得確認後にユーザーが停止を依頼する read-only 試行でもよいが、全 Implementation 成功とは区別する |
| `no-config-number` | 設定を削除し、入力を `17` のみにする。remote のない隔離 fixture で実行する | 対象 repo / tracker を推測せず `BLOCKED`。設定・ticket の新規作成なし |
| `unreadable-config` | baseline 記録後、コピーした既存設定に `chmod 000 docs/agents/issue-tracker.md`。非特権ユーザーで実行し、実際に read が権限エラーとなる環境でのみ観測する。入力は `$TICKET` | 不存在ではなく read 失敗として `BLOCKED`。明示 path があっても未設定扱いで進めない。実行後に fixture のみ `chmod 600` で戻す |

```sh
cd "$CASE_DIR"
git init -q
git add greet.mjs package.json docs .scratch
git -c commit.gpgsign=false -c user.name=TaskflowSmoke -c user.email=smoke@example.invalid commit -qm baseline
pi --approve -e "$TASKFLOW_REPO" \
  --skill "$TASKFLOW_REPO/skills/taskflow-implementation" \
  --session-dir "$CASE_LOG_DIR"
```

各回、新しい TUI / RPC Root に `/skill:taskflow-implementation <上表の入力>` を渡す。前のセッションを resume せず、期待状態名や模擬 tool 応答を prompt に含めない。`no-config-local-path` の取得確認だけを行う場合は、実装前に一旦停止して取得結果を報告するよう依頼する。
実 tool 履歴で**Work Item 取得より前の設定直接 read**を確認し、最終回答、停止理由・再開条件、取得できた Plan / blocker を記録する。停止ケースでは Worker / 子 Agent 起動と edit / write がなく、`git diff --exit-code HEAD` が成功することを確認する。新規の設定・AGENTS.md / CLAUDE.md もなく、runtime artifact 以外の予定外ファイルがないことを一覧確認する。read エラーが再現できなければ `unreadable-config` は未確認と記録する。

## 結果の報告

日時、Pi / model、fixture とログ、Work Item 取得前の設定 read、設定・Plan・ticket の不変確認、各開始 gate の状態、Worker と両 Reviewer の fresh context、check と直接検証、Code Review 応答、最終状態、未確認の分岐を記録する。
未実行や途中停止なら Issue #6 の代表 Feature E2E 条件を達成したと報告しない。

以下は Issue #6 の当時の結果であり、新しい設定直接参照の成功記録ではない。

### 2026-10-08 の実行結果

- Pi `1.0.4`、Root model `openai/gpt-6.1-sol`、Node.js `v24.21.0` を使用。model / thinking の workflow 独自設定は追加していない。
- Feature fixture: `/tmp/pi-taskflow-implementation-smoke.gqWvl5`。上記の Planning fixture の承認済み Plan / 確認済み ticket と初期コードだけをコピーし、別の Root セッションで開始した。Planning の sessions / 会話 / Scout 出力はコピーしていない。
- fixture の baseline commit は環境の署名設定不足で失敗したため、初期4ファイルの staged index を baseline として使った。Root と Worker は index を変更せず、実装前後の blob ID が一致した。上記の再実行手順では fixture commit のみ `commit.gpgsign=false` を指定し、global 設定を変更しない。
- Root が Work Item、正式な Plan、Feature Playbook、現在のコードを読み、開始条件と正式チェックを確認した。分類専用の子 Agent は起動していない。
- built-in Worker の requested / resolved context はともに `fresh`。依頼に必要な6項目、cwd / 編集範囲、停止条件があり、`ponytail` / `tdd` の明示追加はなかった。変更は `greet.mjs` の3行だけで、Plan / ticket / `package.json` は変更なし。
- Root が Worker 終了後に独立して `npm test` と、別の直接 CLI 検証を実行した。通常出力は `Hello, world!\n`、オプションありは `HELLO, WORLD!\n`、stdout はそれぞれ1行、stderr は空、exit code は0。未知引数の無視、オプションの完全一致、他引数との併用も確認した。
- Correctness と Ponytail の2つの built-in Reviewer は別々の `fresh` context で完了。後者には `skill: "ponytail-review"` が指定され、両者とも Work Item / Plan / 実ソース / Root が確認した差分と検証結果を確認した。project code は変更していない。ともに指摘なしで、Root が修正不要と判断した。
- この Root は async workflow 内で検証結果を受け渡す read-only `delegate` checkpoint も使ったが、実際の repository checks / CLI 検証と採否・完了判断は Root 自身が行った。この relay を Skill の必須工程には追加していない。
- 実際の `taskflow_code_review` が `status: "skipped", approved: false` を返し、最終回答は `READY_FOR_MERGE`。Pi プロセスは exit code 0 で終了した。smoke 実行者も終了後に差分、`npm test`、通常 / オプションありの正確な出力・終了コードを独立して再確認した。
- 根拠: fixture の `events.jsonl`、`sessions/subagent-artifacts/*_worker_output.md` / `*_reviewer_output.md`。workflow run `0a928313-583e-4432-979e-d4bc96844bcd` の `workflow-receipt.json` で Worker と両 Reviewer の resolved context / 完了状態を確認した。runtime artifact は一時領域のため恒久保存は保証しない。

### 開始 gate の実行結果

別の各 fixture に同じ承認済み Plan と初期コードをコピーし、該当する不足・矛盾だけを local ticket / 参照先に設けた。これらは停止分岐用のテスト入力であり、新しい承認済み Work Item として公開していない。
`/tmp/pi-taskflow-implementation-gates.3aeq31zj/<case>/events.jsonl` と `final-response.md`、同ディレクトリの `results.json` が根拠。
すべて別の新しい Root セッション、Pi exit code 0。Worker 起動、edit / write、Code Review はなく、`git diff --exit-code HEAD` が成功して追跡ファイルは無変更だった。

| case | 入力の状態 | 最終状態 |
| --- | --- | --- |
| `missing-work-item` | Work Item が存在しない | `BLOCKED` |
| `missing-plan` | ticket の Approved Plan 参照先が存在しない | `BLOCKED` |
| `incomplete-blocker` | 開始に必須の local Work Item が `OPEN` / 未完了 | `BLOCKED` |
| `unclear-criteria` | 今回の範囲・適用する完了条件を資料から特定できない | `BLOCKED` |
| `pending-decision` | 今実装するか延期するかユーザーの判断が未解決 | `BLOCKED` |
| `replan` | ticket の要求出力が Approved Plan と矛盾する | `REPLAN_REQUIRED` |

### Issue #6 の受け入れ条件との個別照合

「手順」は Skill / Playbook での実装を確認したもの、「実行」は上記の実セッションや公式チェックによる確認。実行していない条件付きの分岐を実行済みとは扱わない。

| 条件 | 根拠・状態 |
| --- | --- |
| Implementation Skill が存在 | Pi の読み込みテストと Feature Root の read |
| Feature Playbook が存在 | Pi の読み込みテストと Feature Root の read |
| 主入力が Work Item 参照 | local ticket path だけの Skill 呼び出しで実行 |
| Work Item から Approved Plan を解決 | ticket 相対リンクと正式な Plan の read |
| Planning 会話に依存しない | コピー対象を正式入力に限定、新しい Root で実行 |
| 永続 Planning Scout 出力を再利用しない | Skill の禁止手順、Scout 出力なしで実行 |
| Work Item 不在では開始しない | `missing-work-item` で実行 |
| Approved Plan 不在では開始しない | `missing-plan` で実行 |
| genuine blocker 未完了では開始しない | `incomplete-blocker` で実行 |
| 完了条件不明では開始しない | `unclear-criteria` で実行 |
| 未解決ユーザー判断では開始しない | `pending-decision` で実行 |
| Plan の前提・設計変更は REPLAN_REQUIRED | 停止手順、`replan` で実行 |
| 現在の Work Item の性質で Playbook を選択 | 選択手順、Feature の実行 |
| Planning の種別を盲目的に継承しない | 現在の Work Item による選択手順 |
| 分類専用 LLM 呼び出しなし | 選択手順、Feature の tool 履歴 |
| 小さい変更は Root が直接調査可能 | Feature で実行 |
| 広い変更は built-in scout を利用可能 | fresh scout の手順。今回の小さい fixture では不要 |
| built-in worker は fresh context | launch 引数と receipt の resolved context |
| Worker 入力は今回必要な情報のみ | 実際の Worker brief の編集範囲・必要情報 |
| Worker 入力の必須6項目 | Work Item、関係 Plan sections、完了条件、制約・対象外、検証方法、現在のコードの事実を実 brief で個別確認 |
| Worker に ponytail を明示追加しない | Worker 手順、実 launch の skill 指定なし |
| Worker は未承認の仕様変更をしない | Worker の禁止手順、実 brief と最終差分 |
| Worker は勝手に範囲拡大しない | Worker の禁止手順、`greet.mjs` のみの差分 |
| Worker は merge / release / deploy しない | 禁止手順、実 brief と実行履歴 |
| Plan 変更が必要なら Root に戻す | Worker の停止・返却手順。Worker 内の発見分岐は今回未発生 |
| repository checks は正式なコマンド | `package.json` の test を確認後 `npm test` 実行 |
| 設定ファイルの存在だけで推測しない | コマンド確認手順、fixture で未定義チェックを実行していない |
| missing lint / formatter を追加しない | 禁止手順、追加のない実差分 |
| checks と直接検証が別工程 | Root の `npm test` と別 tool call の直接 CLI 検証 |
| tests / lint だけでなく実際の結果を実行 | 通常・オプションありの CLI 出力と exit code の実測 |
| fresh Correctness Review | 独立 reviewer の launch / resolved context / 完了結果 |
| 別の fresh Ponytail Review + ponytail-review | 別 reviewer の launch skill / resolved context / 完了結果 |
| Reviewer に Work Item / Plan / diff / check / 直接検証結果 | 実 brief と Root 検証結果の受け渡し、各 Review の結果 |
| Worker 自己申告だけを成功根拠にしない | Root と smoke 実行者の独立した差分・CLI 再確認 |
| Reviewer は通常コードを変更しない | read-only brief、Review 出力、最終差分 |
| 指摘は Worker でなく Root に返る | 返却手順、Root が両 Review 結果を取得 |
| Root が今回直す / 不採用を区別 | 追加試行で実指摘4件の採用理由と不採用なしを明示 |
| accepted findings を単一修正依頼にまとめる | 追加試行で重複指摘を集約し、1回の correction Worker に依頼 |
| 修正後に影響する checks / 検証を再実行 | 追加試行で Root が npm test と12ケースの直接 CLI 検証を再実行 |
| fresh 再レビューは大きさ・リスク次第 | 初回は修正不要で省略。追加試行では引数解釈全体の置換リスクに基づき CLI 境界だけを fresh 再レビュー |
| 設計変更の指摘は REPLAN_REQUIRED | 指摘整理・Code Review Reject の停止手順。設計変更を要求する指摘は今回未発生 |
| 最終完了前に taskflow_code_review を呼ぶ | 実 tool 履歴と skipped 応答 |
| 無効な Code Review は完了を妨げない | skipped 後に READY_FOR_MERGE で実行完了 |
| 有効な Code Review はユーザー承認必須 | 追加試行で承認前は tool / workflow 未完了、実際の browser Approve による approved / approved:true の後に完了 |
| 最終状態は指定4種類のいずれか | 4状態の報告手順、READY_FOR_MERGE / BLOCKED / REPLAN_REQUIRED の実行 |
| 代表 Feature が E2E 成功 | 開始から Worker・Root 検証・独立2 Review・実 gate・最終状態まで完了 |

### 指摘後の修正・fresh 再レビューと有効な Code Review の追加実行

2026-10-08、ユーザーの依頼により、初回で未実行だった2経路を1つの隔離 E2E で確認した。Pi / Root model は初回と同じ。
fixture は `/tmp/pi-taskflow-implementation-extra.57Zbcz/fixture`。元の承認済み Plan / 確認済み ticket / 初期コードだけをコピーし、署名をこの fixture commit のみ無効にして baseline を記録した。
Code Review は fixture の `.pi/settings.json` に `taskflow.plannotatorCodeReview: true` を置いて有効化し、Pi の `--approve` でこの fixture の project 設定を信頼した。global 設定、本リポジトリの設定、third-party dependencies は変更していない。

#### 試験方法と検証用 client の再開

- 実際の公開 RPC Root セッションを使い、built-in Worker の正常な3行実装と Root の正式チェック・直接検証が完了してから、別の呼び出しで2つの fresh Review を開始した。
- test host が最初の Reviewer 起動時に `greet.mjs` のみを26行の試験用ソースへ一度だけ変更した。完全一致を前方一致に変える不具合と、不要な parser / class / 未使用設定状態を実際に注入した。Plan / ticket は変更せず、Reviewer の指摘・応答は模擬していない。
- Root / Reviewer には現在の実ソースを必ず読むよう依頼し、初回の検証結果は注入後のコードの成功証拠ではないと区別した。模擬 findings や想定される指摘内容を Review 入力に渡していない。
- 初回の検証用 RPC client は、非同期 Worker 待ちの中間 `agent_settled` を最終完了と誤認して stdin を閉じた。これは製品の不具合とは区別し、その試行を成功と扱っていない。先行 Worker の run / 部分差分を確認し、client を修正して同じ保存済み Implementation Root セッションを RPC で再開した。Root は公開 `subagent status` で先行 Worker の complete と結果を取得してから再検証した。Planning の会話は継承せず、重複 writer も起動していない。
- 修正した client は非同期工程の中間 `agent_settled` では接続を閉じず、実 Code Review の承認後の最終状態まで継続した。client / 注入コード / ログはリポジトリ外の一時領域に限定し、製品に試験用 infrastructure を追加していない。

#### 実際に得られた指摘と修正結果

| 工程 | 観測結果 |
| --- | --- |
| Correctness Review（fresh built-in reviewer） | P1: `startsWith("--uppercase")` が `--uppercase=false` / `--uppercase-extra` を誤判定。P1: 禁止された parser / class / 設定状態。`Merge verdict: BLOCK` |
| Ponytail Review（別の fresh built-in reviewer + ponytail-review） | P1 / stdlib: parser / loop / flags を標準 includes に置換。P1 / yagni: renderer class / options / layers / instance を削除。`Merge verdict: BLOCK`、23行削減可能 |
| Root の採否 | 現在の実差分を確認し、類似 flag の2ケースで期待 Hello に対する誤った大文字出力を実際に再現。4指摘を採用、不採用なしと理由を明示。同義分を集約し、Plan 変更は不要と判断 |
| correction request | 採用分を1回の fresh built-in Worker 依頼にまとめ、greet.mjs のみを完全一致判定・条件付き大文字化・直接出力の3行へ修正。Root は自分で編集していない |
| 修正後の正式チェック | Root が `npm test` を再実行し exit code 0 |
| 修正後の直接検証 | Root が必須2ケースと未知引数・類似 flag・case・位置・重複・混在の計12ケースを実行し、stdout 完全一致、stderr 空、exit code 0 |
| 限定 fresh 再レビュー | 引数解釈全体の差し替えと検証後のソース変更による回帰リスクを明示して、公開 CLI 境界だけを fresh built-in Reviewer で確認。旧4指摘の解消と新たな回帰なし、`No issues found` / `Merge verdict: OK` |

両初回 Reviewer と再 Reviewer は実ファイルを read で確認し、project code を変更していない。Reviewer の tool allowlist には Git / CLI 実行がないため、実行結果と実 Git 差分・ハッシュは Root の独立した確認に基づく。Reviewer 自身がコマンドを実行したとは扱っていない。

#### 実際のユーザー承認と終了

- Root が修正・再検証・限定再レビュー後に実際の `taskflow_code_review` を呼び、Plannotator が `127.0.0.1:53410` で起動した。
- 承認前に tool execution end と最終完了回答が存在しないこと、Pi プロセスが稼働し Code Review server が LISTEN していることを確認した。Root は明示的な browser Approve まで完了しないと報告した。
- 実際のユーザーがブラウザで差分を確認して Approve。質問 tool の「Approve した」という回答ではなく、実 `taskflow_code_review` の `status: "approved", approved: true, feedback: ""` 応答を承認の根拠にした。
- その応答後に Root が全完了条件と承認対象ソースの同一性を確認し、`READY_FOR_MERGE` を報告した。RPC stdin を閉じ、Pi は exit code 0 で終了した。
- smoke 実行者も終了後に `npm test`、12ケースの CLI、`git diff --check` を独立して再実行した。全成功。最終差分は `greet.mjs` のみ、staged 差分なし、Plan / ticket / package.json / fixture settings は baseline と一致。最終ソース SHA-256 は `48835bae9d6774a194cedf098a2f973e4368a689df7d96eac336923dda4eb9ce`。
- commit / push / merge / release / deploy / GitHub 公開は Root / 子 Agent とも行っていない。fixture 準備用の baseline commit だけを test host が作成した。

根拠は `/tmp/pi-taskflow-implementation-extra.57Zbcz/` の `events.jsonl`、`milestones.jsonl`、`injected.diff`、`before-injection.diff`、`final-response.md`、`independent-verification.json`、`sessions/subagent-artifacts/*_output.md`。初回 client の途中終了ログは `attempt-1-*` に残した。
初回 Review workflow run は `af9510fa-4f62-4c51-aec1-7ebd6871d10d`。receipt で別々の fresh resolved context / 完了を確認した。correction Worker は `9fccac1e-9343-4ff3-88ea-8d02188f639e`、限定再 Reviewer は `30461fec-0530-4ef4-aa27-7dc7ef65de51` で、launch はともに fresh。
一時領域のためログの恒久保存は保証しない。上記2経路は実行確認済みであり、手順確認のみではなくなった。

### 未実行の条件付き分岐と残る制約

- 広い変更の Scout、Worker 内での Plan 変更発見、設計変更を要求する Review 指摘は手順確認のみ。全 workflow 分岐の網羅的 E2E を行ったとは報告しない。
- Code Review 有効時の実 Approve 経路は追加確認済み。人間による Reject / Cancel の workflow E2E は今回未実行で、既存 tool tests の確認と区別する。追加試行は全4指摘を採用したため、不採用 findings のある実例も未確認。
- Skill は Agent が読む手順であり、TypeScript の強制的な状態機械ではない。これは承認済み設計に従う制約であり、追加の状態管理や承認 infrastructure は導入していない。

### 2026-10-11 JST の実行結果（Issue #17・tracker 引継ぎ）

- Pi `1.1.0`、model `openai/gpt-6.1-sol`、公開 RPC / subagent protocol を使用。基点は `/tmp/pi-taskflow-17-smoke.jsRS7z`。新版 Planning で承認・保存した設定、正式 Plan、ticket と初期 `greet.mjs` / `package.json` だけを `implementation-retry/` にコピーし、会話・sessions・Scout 出力・AGENTS.md / CLAUDE.md は引き継いでいない。
- 別の新しい Root（session `01a129b8-7ab7-70c4-a34c-16bff179ab55`、initial `messageCount: 0`）の最初の tool は tracker 設定の直接 read。その後 ticket と正式 Plan を取得し、実装開始条件を確認した。
- built-in Worker と独立した Correctness / Ponytail の両 Reviewer が完了。workflow run `cba844fd-e56c-4163-a1ae-c9893782e6a8` の `workflow-receipt.json`（`/var/folders/04/cs5vwntd34d_fdbtdczbxg000000gn/T/pi-subagents-uid-501/async-subagent-runs/` 配下）で全3 child の requested / resolved context が `fresh`、workflow / child が完了であることを確認した。Ponytail の `ponytail-review` Skill 指定もログで確認した。
- Reviewer の shell 権限制約により、Root が実測した diff / CLI 証跡を `subagent_supervisor` 経由で渡した。Reviewer は code / Plan を直接 read して評価しており、Reviewer 自身の CLI 実行ではない。実 `taskflow_code_review` は `status: "skipped", approved: false`、最終状態は `READY_FOR_MERGE`。
- 実行者 Root も独立して `npm test`、CLI 通常 / `--uppercase` / 未知引数単独・併用、`git diff --check` を再確認した。CLI は期待 stdout と末尾改行まで完全一致、stderr 空、exit code 0。変更は `greet.mjs` のみで、設定・Plan・ticket・`package.json` の hash は不変、AGENTS.md / CLAUDE.md は不存在。merge / release / deploy は行っていない。
- 初回 `implementation/` は検証用 RPC の `--tools` に `subagent_supervisor` を入れ忘れ、Reviewer の照会に返信できず `BLOCKED`。履歴・部分 diff を保持して workflow を停止した。必要な tool を加えた別の clean fixture / fresh Root で上記 retry が成功したのであり、初回を成功に数えていない。各 RPC shutdown は exit code 0。

#### tracker 取得・停止 gate の追加観測

各 case は別の fresh Root（initial `messageCount: 0`）で実行し、最初に tracker 設定を直接 read した。Worker 起動・edit / write はなく、入力のコード・設定は無変更、AGENTS.md / CLAUDE.md は不存在。全 RPC shutdown は exit code 0。

| case | 入力と観測結果 |
| --- | --- |
| `current-incomplete-blocker` | 新版 Planning 出力のコピーに `OPEN`・完了条件未達・未着手の手動 seed blocker を追加。設定 → ticket → 正式 Plan → blocker を取得し `BLOCKED`。全 input hash 不変。この入力は停止検証用であり、blocker のチケット公開 E2E ではない |
| `current-no-config` | 新版 Planning 出力のコピーから設定だけを削除。`ENOENT` を確認し、明示 local path から ticket / 正式 Plan を取得、全開始入力条件を満たすと報告。依頼どおり実装前 checkpoint で停止し、設定を新規作成せず全 input 不変。全 Implementation 成功や `READY_FOR_MERGE` とは区別する |
| `tracker-conflict` | Issue #16 の実承認 Local fixture の入力だけをコピー。Local 設定と Issue #17 URL の矛盾により、Issue 本文を取得せず `BLOCKED` / 確認待ち |
| `no-config-number` | 同じ Issue #16 入力から設定を削除し、remote なしで `17` だけを指定。取得先を推測せず `BLOCKED` |
| `unreadable-config` | 同じ Issue #16 入力の既存設定を `chmod 000`。実 read が `EACCES` となり、不存在扱いにせず `BLOCKED`。終了後 fixture のみ `chmod 600` に戻した |

旧入力による `incomplete-blocker` / `no-config-local-path` 試行では Issue #16 Plan のチケット化専用制約による `REPLAN_REQUIRED` 要因も出たため、上表の `current-*` で再確認した。旧試行を新版開始 gate 通過の成功に混ぜていない。

証跡は基点の `implementation-retry-logs/` と各 `<case>-logs/` の `events.jsonl` / `commands.jsonl` / `exit.json`、初回失敗は `implementation-logs/`。一時領域のため恒久保存は保証しない。実行者 Root の独立した source check は `pnpm check` 成功（6 files / 102 tests）だが、Skill loader の成功を手順遵守の証明にはしない。
新版での completed blocker 後の実装、GitHub 書き込み・native 関係、複数 ticket の公開 E2E は未実行。Issue #16 の単体成功や過去の smoke は今回の成功に含めない。
