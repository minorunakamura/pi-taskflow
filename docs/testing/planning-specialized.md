# 専門 Planning Playbook smoke 確認

Issue #4 の Bug Fix / Refactoring / Performance を、独立した実際の Root セッションで Plan Review まで確認する。
`pnpm test` の `planning-skill.test.ts` は Pi の Skill 読み込みと4つの参照先だけを確認する。文章の一致や模擬 approval を workflow 成功の証拠にしない。

## 共通の準備と観測

- Pi の model、`pi-taskflow`、Plannotator Extension、`taskflow_plan_review` を利用可能にする。人間が browser Review に参加する。起動方法・RPC UI の注意は [Feature smoke](planning-feature.md) を参照する。
- 以下の fixture をそれぞれリポジトリ外の別の一時ディレクトリに作り、`git init -q` を行う。これは調査対象であり Implementation ではない。
- `pi -e "$TASKFLOW_REPO" --skill "$TASKFLOW_REPO/skills/taskflow-planning"` で起動し、対応する依頼を送る。`TASKFLOW_REPO` は本リポジトリの絶対パス。
- Root が該当 Playbook と fixture を読み、必要な実行確認を行うことを tool 履歴で確認する。小規模な fixture なので Scout、外部調査、Grilling、Oracle は不要。
- 最終 Plan は共通の必須6項目と以下の種別固有情報を含み、`taskflow_plan_review` に全文が渡されることを確認する。Plan Mode に入らない。
- 人間が実際の Plannotator で内容を確認し、明示的に Approve する。tool が `status: "approved"` / `approved: true` を返した時点を、この smoke の成功 checkpoint とする。自動で approval を送らない。
- checkpoint 後は検証セッションを終了する。これは Planning 全体の完了とは別で、ticket 公開までの共通フローは Feature smoke の対象である。GitHub にテスト Issue を作らない。
- fixture の production 相当のファイルが変更されていないことを確認する。Probe を行った場合は一時ファイルを片付ける。

## Bug Fix（hotfix）

### fixture

`quantity.mjs`:

```js
console.log(Number(process.argv[2]) || 1);
```

`package.json`:

```json
{"type":"module","scripts":{"test":"node quantity.mjs"}}
```

### 依頼

```text
/skill:taskflow-planning hotfix: quantity.mjs に 0 を渡しても 1 が出力されます。
数値引数をそのまま出力し、引数なしだけ 1 を出力する仕様です。
有効な数値引数と引数なしだけを対象に、原因を調査して修正計画を作ってください。
入力仕様の拡張は対象外です。実装は開始しないでください。
```

### 種別固有の合格条件

- `node quantity.mjs 0` で実際の出力 `1` と期待 `0` の差を再現する。
- `0` が falsy なので `|| 1` に置き換わることを実験で確認し、原因の確認後に修正方針を確定する。ユーザーに原因を質問しない。
- Plan に再現手順、確認済みの原因と根拠、修正方針、`0` / 引数なし / 通常の数値の実行可能な回帰検証と期待結果がある。
- `hotfix` を Bug Fix として扱い、診断と検証を省略しない。

### 原因未確認時の停止シナリオ

別の一時ディレクトリで `quantity.mjs` を次の実装にし、同じ `package.json` を使う。

```js
console.log(process.argv[2] === undefined ? 1 : Number(process.argv[2]));
```

```text
/skill:taskflow-planning hotfix: 本番環境の quantity CLI に 0 を渡すと、ときどき 1 が出力されるとの報告があります。
数値引数を数値として出力し、引数なしだけ 1 を出力するのが確定した仕様です。
手元の quantity.mjs を調査して修正計画を作ってください。
対象は有効な数値引数と引数なしだけで、入力仕様の拡張は対象外です。
本番環境・ログ・配布済み revision・正確な入力記録には現在アクセスできません。
この fixture 外には本番に関する根拠はありません。仕様・方針に未決定事項はありません。
tracker は local files のみで、GitHub への公開や実装開始はしないでください。
```

合格条件は、ローカルで再現を試みても `0` は `0` を出力することを確認し、本番原因を未確認として扱うこと。
観測結果、不足する本番の根拠、再開条件を報告して停止し、推測した修正を最終 Plan に確定しない。
`taskflow_plan_review`、正式な Plan 保存、ticket 公開、production code の変更に進まないことを tool 履歴とファイルで確認する。

## Refactoring（chore）

### fixture

`messages.mjs`:

```js
export function greet(name) {
  return `Hello, ${name.trim() || "world"}!`;
}
export function farewell(name) {
  return `Goodbye, ${name.trim() || "world"}!`;
}
```

`check.mjs`:

```js
import assert from "node:assert/strict";
import { greet, farewell } from "./messages.mjs";
for (const [input, normalized] of [[" Alice ", "Alice"], ["", "world"], [" \t", "world"], ["太郎", "太郎"]]) {
  assert.equal(greet(input), `Hello, ${normalized}!`);
  assert.equal(farewell(input), `Goodbye, ${normalized}!`);
}
for (const fn of [greet, farewell]) {
  assert.throws(() => fn(null), TypeError);
}
console.log("behavior verified");
```

`package.json`:

```json
{"type":"module","scripts":{"test":"node check.mjs"}}
```

### 依頼

```text
/skill:taskflow-planning chore: messages.mjs の重複する名前の正規化を private helper にまとめる計画を作ってください。
公開 export、出力、エラー、副作用は変えません。新しい入力のサポートも対象外です。
実装は開始しないでください。
```

### 種別固有の合格条件

- `chore` という名前でなく内容から Refactoring を選び、構造を決める前に現在の動作と `node check.mjs` の結果を確認する。
- Plan に不変条件（export、出力、空白・空文字・Unicode、`null` の TypeError、副作用なし）と目標構造がある。
- 同じ check を変更前後で実行して結果を比較する、実行可能な等価性確認がある。typecheck だけで代用しない。

### 動作変更による再分類シナリオ

別の一時ディレクトリで同じ Refactoring fixture と依頼を使う。初回 Plan Review では Approve せず、人間が Reject し、次の仕様変更を feedback として返す。

```text
空文字・空白だけの入力の既定名を world から guest に変更したいです。
helper 抽出は維持し、その他の出力・export・エラー・副作用は変えません。
```

Root がこれを動作変更と認識し、Feature に再分類して Feature Playbook を読み、計画し直すことを確認する。
修正 Plan に既定名の変更と維持する動作、新仕様に合わせた検証があり、Refactoring の「全動作不変」と矛盾したまま Review に進まないことが合格条件。
人間が改訂版を実際の Plannotator で Approve し、承認応答後に検証セッションを終了する。初回 Reject から正式な Plan や ticket を保存せず、production code も変更しない。

## Performance

### fixture

`unique.mjs`:

```js
export function unique(values) {
  const result = [];
  for (const value of values) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}
```

`bench.mjs`:

```js
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { unique } from "./unique.mjs";
const values = Array.from({ length: 12000 }, (_, i) => `id-${i}`);
unique(values); // warm-up: 1回
const times = [];
for (let i = 0; i < 7; i++) {
  const start = performance.now();
  const result = unique(values);
  times.push(performance.now() - start);
  assert.deepEqual(result, values);
}
assert.deepEqual(unique(["b", "a", "b"]), ["b", "a"]);
assert.deepEqual(unique([]), []);
console.log(JSON.stringify({ node: process.version, count: values.length, repetitions: times.length, medianMs: times.sort((a, b) => a - b)[3] }));
```

`package.json`:

```json
{"type":"module","scripts":{"test":"node bench.mjs"}}
```

### 依頼

```text
/skill:taskflow-planning unique.mjs の文字列 ID の重複除去を高速化する計画を作ってください。
入力は文字列の配列、出力は最初の出現順です。入力は変更しません。
bench.mjs の同一環境・workload・方法で、7回の中央値を実測 baseline の50%以下にすることが目標です。
必要な仮説は小さな Probe で検証してください。本番実装は開始しないでください。
```

### 種別固有の合格条件

- 実際に `node bench.mjs` を実行し、metric（elapsed ms の中央値）、実測 baseline、Node / 環境、12000件、warm-up 1回、7反復、コマンドを記録する。
- 計測・処理回数などの根拠から原因を調べ、コードを読むだけで最適化を選ばない。
- 仮説検証が必要なら一時領域の Probe で候補の等価性と計測結果を観測し、結論を Plan に反映する。`unique.mjs` は変更しない。
- Plan に同条件での再計測、中央値が baseline の50%以下という閾値、出現順・空配列・重複・入力不変の回帰検証がある。

## 確認結果の報告

実行した場合は日時、Pi / model / Plannotator のバージョン、fixture とログの参照、各種別の根拠、Plan Review の結果、production 相当ファイルの変更有無を記録する。
未実行・承認待ち・利用不可はそのまま報告し、シナリオ成功や Issue #4 の全受け入れ条件達成とはしない。

### 2026-10-08 の実行結果

- Pi `1.0.4`、model `openai/gpt-6.1-sol`（thinking: medium）、Node.js `v24.21.0`、Plannotator Extension `0.27.16` を使用。
- fixture: `/tmp/pi-taskflow-specialized-smoke.BCKwBF/{bug-fix,refactoring,performance}`。上記と同じ入力コードと依頼で、独立した公開 RPC セッションを起動した。
- 各セッションが該当 Playbook とコードを読み、共通の必須6項目と種別固有の根拠・検証方法を含む最終 Plan を `taskflow_plan_review` に渡した。
- 各 Review で実際のユーザーが Plannotator から Approve。3件とも tool の実応答が `status: "approved"` / `approved: true` であることを確認した。質問 tool の「レビュー完了」という回答だけを承認の根拠にしていない。
- approval 応答後に RPC の stdin を閉じ、3プロセスとも exit code 0 で終了。Plan Review checkpoint だけの確認であり、Approved Plan の正式保存や Work Items の公開は行っていない。
- 全 fixture の追跡対象（`.mjs` と `package.json`）が初期状態と一致することを `git diff --exit-code HEAD` で確認した。Implementation、GitHub 公開、merge、release、deploy は行っていない。
- 各 fixture の `events.jsonl` に tool 呼び出しと応答、`submitted-plan.md` に提出された Plan、`review-result.json` に承認結果、`invocation.json` に起動引数がある。途中の調査結果を本リポジトリへ持ち込んでいない。一時領域なので恒久保存は保証しない。

| シナリオ | 実際に確認した根拠と Plan 内容 | 結果 |
| --- | --- | --- |
| Bug Fix / hotfix | `0` → `1` を再現。数値0の truthiness と OR fallback を最小実験で確認した後、欠落判定の修正方針を決定。CLI の修正前失敗・修正後成功の回帰検証を定義 | Plan Review approved |
| Refactoring / chore | `npm test` が成功。export、空白・空文字・Unicode、TypeError、trim の receiver・呼び出し回数・例外 identity を実行確認。private helper の目標構造と公開境界の characterization checks を定義 | Plan Review approved |
| Performance | Darwin arm64 / Apple M1 Pro で baseline 中央値 **131.740875 ms** を実測。無変更の benchmark を一時領域で使う Set Probe は **0.525416 ms**、107件の等価性確認が成功。成功閾値 **65.8704375 ms 以下**と同条件の再計測を定義 | Plan Review approved |

### Issue #4 の受け入れ条件との照合

すべての条件を個別に読み直し、以下で照合した。通常の3シナリオに加え、原因未確認時の停止と、Review feedback による Refactoring から Feature への再分類を実セッションで確認した。

| 条件 | 確認方法・根拠 |
| --- | --- |
| Bug Fix: ファイルが存在 | Pi の読み込みテストと実セッションの read |
| Bug Fix: 再現を試みる | CLI の `0` ケースの実行履歴 |
| Bug Fix: 原因確認後に方針確定 | truthiness の実験 → 根拠を含む Plan → Review の順序 |
| Bug Fix: 未確認原因の推測修正を確定しない | 追加の停止シナリオで原因未確認と明示して終了。Review・正式 Plan・ticket・実装に進まないことを確認 |
| Bug Fix: 未決定の仕様・方針だけをユーザーに質問 | Playbook の質問制限を確認。通常シナリオでは事実の質問なし |
| Bug Fix: 実行可能な回帰検証 | Plan に CLI の期待 stdout・stderr・終了コード、修正前後の検証 |
| Bug Fix: Plan Review まで成功 | 実際の approved 応答 |
| Refactoring: ファイルが存在 | Pi の読み込みテストと実セッションの read |
| Refactoring: 現在動作を構造決定前に確認 | `npm test` と公開境界の実行確認 → Plan の順序 |
| Refactoring: 不変条件を明示 | Plan の公開 export・出力・エラー・副作用の定義 |
| Refactoring: 目標構造を記載 | Plan の module-private `normalizeName` と2つの呼び出し元 |
| Refactoring: 等価性の検証方法 | 変更前後に同じ characterization checks を実行する Plan |
| Refactoring: 動作変更は Feature / Bug Fix に再分類 | 追加シナリオで動作変更の Reject feedback 後、Feature と明示して Feature Playbook を読み、計画を見直すことを確認 |
| Refactoring: Plan Review まで成功 | 実際の approved 応答 |
| Performance: ファイルが存在 | Pi の読み込みテストと実セッションの read |
| Performance: baseline の実測 | `node bench.mjs` の実行結果 |
| Performance: metric と方法が明示 | ms、中央値、workload、環境、warm-up、7反復、コマンドを Plan に記載 |
| Performance: コード確認だけで最適化を選ばない | 実測、検索処理回数の根拠、候補の Probe → Plan の順序 |
| Performance: 仮説検証に Probe を利用可能 | 一時領域の Set 候補の計測・等価性確認と削除 |
| Performance: 計測可能な成功閾値 | baseline の50%以下と絶対値を Plan に記載 |
| Performance: Plan Review まで成功 | 実際の approved 応答 |
| Shared: hotfix は診断・検証を省かない Bug Fix | hotfix シナリオで Bug Fix の再現・原因・回帰検証を確認 |
| Shared: chore は実際の作業内容で分類 | chore シナリオで Refactoring Playbook を選択 |
| Shared: 分類専用 LLM 呼び出しを追加しない | 共通 Skill の規則を維持。全シナリオの tool 履歴は read / bash / taskflow_plan_review のみ |

### 停止・再分類分岐の追加確認

初回報告ではこの2分岐の runtime 確認が不足していたため、同じ Pi / model / Plannotator 構成で追加実行した。

- 原因未確認: fixture は `/tmp/pi-taskflow-specialized-smoke.BCKwBF/bug-unconfirmed`。ローカルの数値入力・引数なしを実行確認し、`0` の100回の別プロセス実行でも不具合を再現できなかった。Root は本番原因を未確認と明示し、必要な revision・引数記録・再現条件を報告して停止した。`taskflow_plan_review`、write / edit、正式な Plan 保存、ticket 公開はなく、production 相当のファイルは初期状態のまま。`agent_settled` と exit code 0 を確認した。観測した `-0` の期待値の誤りも再確認して訂正し、不具合原因とは扱わなかった。
- 再分類: fixture は `/tmp/pi-taskflow-specialized-smoke.BCKwBF/refactoring-redirect`。初回は Refactoring Playbook で現在動作と不変条件を調査して Plan Review に提出。人間が Reject し、上記の既定名変更を feedback として送信した実応答を確認した。その後 Root は動作変更なので Feature として計画し直す旨を明示し、`feature.md` を読んだ。改訂 Plan は Feature への切り替え、文字列入力の既定名 guest、新しい期待値の検証、その他の動作を維持する回帰確認を含む。人間による実際の Approve 応答を確認して終了した。Reject → Feature Playbook の read → 改訂 Plan の Review → Approve の順序、正式な Plan / ticket 未保存、production 相当ファイル未変更、exit code 0 を確認した。
- 追加2件の tool 履歴は read / bash / taskflow_plan_review のみ。分類専用の子 Agent や追加 LLM 呼び出しはない。両 fixture の `events.jsonl` が直接の根拠。停止ケースの最終報告は `final-response.md`、再分類の初回・改訂 Plan は `submitted-plan-1.md` / `submitted-plan-2.md` にある。一時領域なので恒久保存は保証しない。


