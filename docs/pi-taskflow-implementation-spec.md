# pi-taskflow 実装仕様書

## 1. 実装方針

実装の中心は次の3つとする。

1. `taskflow-planning` Skill
2. `taskflow-implementation` Skill
3. Plannotator 連携と設定読み込みのための小さな Extension

Workflow の進行そのものを TypeScript の状態機械として実装しない。

具体的な進行は Skill と Playbook に書く。

TypeScript は、Skill だけでは実行できない連携処理に限定する。

---

## 2. ディレクトリ構成

```text
pi-taskflow/
├── package.json
│
├── skills/
│   ├── taskflow-planning/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── playbooks/
│   │           ├── feature.md
│   │           ├── bug-fix.md
│   │           ├── refactoring.md
│   │           └── performance.md
│   │
│   └── taskflow-implementation/
│       ├── SKILL.md
│       └── references/
│           └── playbooks/
│               ├── feature.md
│               ├── bug-fix.md
│               ├── refactoring.md
│               └── performance.md
│
├── extensions/
│   └── taskflow.ts
│
├── src/
│   ├── settings.ts
│   └── plannotator.ts
│
└── test/
    ├── settings.test.ts
    └── plannotator.test.ts
```

Planning と Implementation の両方に Playbook を持つ。

ただし Implementation では Planning 全体の作業種別を引き継ぐのではなく、現在の Work Item の内容に合う Playbook を選ぶ。

---

## 3. 外部依存

### 3.1 pi-subagents

次の built-in agent を使用する。

```text
scout
oracle
worker
reviewer
```

独自 Agent は、必要性が確認されるまで作成しない。

### 3.2 pi-ketch

外部調査には `pi-ketch.researcher` package agent を使用する。

`pi-ketch.researcher` が次を自分で定義する。

- `ketch_search`
- `ketch_scrape`
- `ketch_code`
- `ketch_docs`
- Ketch tool を登録する child 用 Extension

そのため `pi-taskflow` は Ketch tool 名、Extension path、`subagentOnlyExtensions` を管理しない。

`pi-subagents` の built-in `researcher` は利用しない。

### 3.3 Plannotator

次の2用途で使う。

```text
Plan Review
Code Review
```

Plan Review は必須。

Code Review は設定で切り替える。

### 3.4 Ponytail

Ponytail Extension は Pi で常時有効になっている前提とする。

Worker に `ponytail` Skill を追加しない。

Review では `ponytail-review` Skill を明示的に使用する。

### 3.5 pi-ask-user-question

Root Pi セッションに登録された `ask_user_question` tool を Grilling から使用する。

Grilling と `ask_user_question` は subagent ではない。

### 3.6 Matt Pocock Skills

次を利用する。

```text
grilling
grill-with-docs
domain-modeling
tdd
to-tickets
```

`grill-me` は `grilling` の入口なので、別工程として扱わない。

---

## 4. taskflow-planning Skill

`skills/taskflow-planning/SKILL.md` が Planning 全体を担当する。

基本手順:

```text
1. 作業内容を確認する
2. 必要なら Planning Playbook を読む
3. 必要なコードを調査する
4. 必要なら pi-ketch.researcher で外部調査する
5. 未決定事項があれば Root で Grilling を行う
6. 必要なら Probe を行う
7. 設計を固める
8. テスト・動作確認方法を決める
9. 必要なら Oracle に確認する
10. Plan を作成する
11. taskflow_plan_review を呼ぶ
12. Approved Plan を保存する
13. to-tickets を使って Work Item に分ける
14. Work Item の分割をユーザーに確認する
15. Work Item を保存・公開する
16. Planning を終了する
```

Planning から Implementation を続けて開始してはならない。

---

## 5. Planning Playbook の選択

v1 では次の4つだけを用意する。

```text
feature
bug-fix
refactoring
performance
```

どれにも当てはまらない場合は、`taskflow-planning` の共通手順をそのまま使う。

`generic` Playbook は作らない。

判定の目安:

```text
新しい動作、動作変更
→ feature

期待と異なる動作の修正
→ bug-fix

動作を変えない構造変更
→ refactoring

計測できる性能問題
→ performance
```

`hotfix` は原則 `bug-fix` として扱う。

`chore` は名前だけで判断せず、実際の作業内容を見る。

作業種別を判定するためだけの追加 LLM 呼び出しは行わない。

---

## 6. Scout

コード調査が必要な場合は `pi-subagents` の built-in `scout` を新しいコンテキストで使う。

基本的な確認内容:

```text
- 関係するコード
- 処理の入口
- 主な処理の流れ
- 関係するテスト
- 変更の影響
- 制約
- 分からない点
```

大量のコード本文ではなく、Root Agent が判断するために必要な内容を返させる。

小さく明らかな変更では Scout を省略してよい。

Scout の結果を永続ファイルとして保存することは必須にしない。

---

## 7. 外部調査

外部情報が必要な場合は、`pi-subagents` から `pi-ketch.researcher` を起動する。

概念上は次の形とする。

```js
await runs.run("research", {
  agent: "pi-ketch.researcher",
  task: researchTask
});
```

`pi-ketch.researcher` は `defaultContext: fresh` を持つため、通常は `context: "fresh"` を重ねて指定する必要はない。

`pi-taskflow` は Ketch tool の child 配線を行わない。

外部調査の結果から、Planning に必要な結論だけを Root Agent が利用する。

---

## 8. Grilling

仕様、範囲、優先度、方針などに未決定事項がある場合は、Root Agent が `grilling` Skill を使う。

ユーザーへの各質問は Root Agent が `ask_user_question` tool を使って表示する。

Grilling 自体を subagent として起動しない。

`ask_user_question` を child に渡すための Extension 配線も行わない。

次のルールを守る。

```text
Repository fact
→ Scout またはコード確認

External fact
→ pi-ketch.researcher

実験で確認できるもの
→ Probe

ユーザーしか決められないこと
→ Grilling + ask_user_question
```

Grilling の途中で事実確認が必要になった場合は、その事実確認だけを `scout` または `pi-ketch.researcher` に委譲する。

未決定事項がない場合は Grilling を省略してよい。

---

## 9. grill-with-docs と domain-modeling

次の場合は Root Agent が `grill-with-docs` を使う。

- 新しい重要な用語が出る
- 用語の意味があいまい
- Domain の境界を決める必要がある
- 後から理由が分かりにくい重要な設計判断がある

`grill-with-docs` は `grilling` と `domain-modeling` を組み合わせるため、別に `grilling` を先に実行しない。

必要な場合だけ `GLOSSARY.md`、`GLOSSARY-MAP.md`、ADR を作成する。

---

## 10. Probe

Probe を行う場合は、次を明確にする。

```text
何を確認するのか

何を観測すれば答えになるのか

最小の実験は何か

どこまで確認したら終了するのか
```

Probe は本番実装にしない。

Probe の結論が実装方針に影響する場合、その結論を Plan に反映する。

Probe の途中ファイルを永続化する仕組みは作らない。

---

## 11. TDD

TDD は Matt Pocock の `tdd` Skill を使う。

Planning では次を決める。

- TDD を使うか
- どの公開インターフェースをテストするか
- TDD を使わない場合の動作確認方法

TDD を使う場合は、その内容を Plan に記載する。

Plannotator で Plan が承認された時点で、記載したテスト対象も承認済みとみなす。

独自の `TestStrategy` 型や保存形式は作らない。

---

## 12. Oracle

設計に別の視点が必要な場合は、`pi-subagents` の built-in `oracle` を使う。

Oracle に渡す情報は必要な範囲に絞る。

例:

```text
依頼の目的
重要なコード調査結果
重要な外部調査結果
ユーザーが決定した内容
設計案
制約
動作確認方法
```

会話全文を渡さない。

Oracle はコードを変更しない。

Oracle は Plan を承認しない。

単純で明らかな変更では Oracle を省略してよい。

---

## 13. Plan 作成

Root Agent が最終的な Plan を Markdown で作成する。

Plan には、未確認の推測を確定事項のように書かない。

基本的な内容:

```markdown
# タイトル

## 目的

## 要件・決定事項

## 制約・対象外

## 実装方針

## 完了条件

## 動作確認方法
```

必要な場合だけ、設計の詳細、テスト方針、リスク、Bug Fix や Performance 固有の情報を追加する。

---

## 14. taskflow_plan_review

Extension は `taskflow_plan_review` tool を登録する。

入力:

```ts
type PlanReviewInput = {
  planContent: string;
  planFilePath?: string;
};
```

処理:

```text
taskflow_plan_review
      ↓
plannotator:request
      ↓
action = plan-review
      ↓
Human Review
      ↓
plannotator:review-result
```

Plan Mode には切り替えない。

明示的な Approve のみを承認として扱う。

Reject、Cancel、ブラウザを閉じた場合、Plannotator のエラーは承認として扱わない。

Reject の場合は feedback を使って Plan を修正し、再提出する。

---

## 15. Approved Plan の保存

承認後の Plan を正式な Approved Plan として保存する。

標準:

```text
docs/plans/<slug>.md
```

プロジェクトに既存の置き場所がある場合は、そのルールを優先する。

複数の Draft を管理する独自機能は作らない。

---

## 16. to-tickets

Approved Plan を `to-tickets` に渡す。

次の処理は `to-tickets` に任せる。

- Work Item への分割
- 依存関係の整理
- ユーザーへの分割確認
- configured tracker への保存・公開

`pi-taskflow` 側で tracker 抽象化や ticket 分割処理を再実装しない。

各 Work Item から Approved Plan を参照できるようにする。

---

## 17. taskflow-implementation Skill

`skills/taskflow-implementation/SKILL.md` が Implementation 全体を担当する。

基本手順:

```text
1. Work Item を取得する
2. Approved Plan を取得する
3. 開始条件を確認する
4. Work Item の内容に合う Implementation Playbook を選ぶ
5. 必要なコードを確認する
6. Worker に実装を依頼する
7. リポジトリのチェックを行う
8. Work Item の結果を実際に確認する
9. Correctness Review と Ponytail Review を行う
10. Root Agent が指摘を判断する
11. 必要なら修正を1回分まとめて依頼する
12. 影響した確認を再実行する
13. 必要なら再レビューする
14. taskflow_code_review を呼ぶ
15. 最終結果を返す
```

Implementation の Playbook 選択は現在の Work Item に対して行う。

Planning 全体の作業種別をそのまま使わない。

作業種別を判定するためだけの追加 LLM 呼び出しは行わない。

---

## 18. Implementation Playbook

v1 では次の4つを用意する。

```text
feature
bug-fix
refactoring
performance
```

どれにも当てはまらない場合は、`taskflow-implementation` の共通手順をそのまま使う。

### 18.1 Feature

```text
必要なコードを確認
 ↓
Worker
 ↓
リポジトリのチェック
 ↓
実際の動作確認
 ↓
Review
```

### 18.2 Bug Fix

```text
再現条件・原因を確認
 ↓
Plan に従って必要なら TDD
 ↓
Worker
 ↓
元の再現手順で修正を確認
 ↓
リポジトリのチェック
 ↓
Review
```

### 18.3 Refactoring

```text
変えてはいけない動作を確認
 ↓
Worker
 ↓
変更前後で同じ動作であることを確認
 ↓
リポジトリのチェック
 ↓
Review
```

### 18.4 Performance

```text
基準値と計測方法を確認
 ↓
Worker
 ↓
変更後を再計測
 ↓
目標値と比較
 ↓
リポジトリのチェック
 ↓
Review
```

---

## 19. Implementation の入力と開始条件

入力は Work Item の参照とする。

例:

```text
GitHub Issue
local ticket path
```

Work Item から Approved Plan を参照する。

次の場合は実装を開始しない。

- Work Item が取得できない
- Approved Plan が取得できない
- 依存 Work Item が未完了
- 完了条件が理解できない
- 未決定のユーザー判断が残っている

Plan の前提や設計を変える必要がある場合は `REPLAN_REQUIRED` とする。

---

## 20. Implementation 開始時のコード確認

Planning の Scout 出力は引き継がない。

現在の Work Item に必要なコードを改めて確認する。

範囲が広い場合は built-in `scout` を使ってよい。

小さい変更では Root Agent 自身の確認だけでもよい。

---

## 21. Worker

`pi-subagents` の built-in `worker` を新しいコンテキストで使う。

Worker には現在の Work Item に必要な内容だけを渡す。

```text
Work Item

Approved Plan の関係部分

完了条件

制約・対象外

動作確認方法

現在のコードから確認した重要事項
```

Ponytail Extension は常時有効であるため、Worker に `ponytail` Skill を指定しない。

TDD が Plan に指定されている場合だけ Matt Pocock の `tdd` Skill を指定する。

Worker は次を行わない。

- Plan にない仕様変更
- 勝手な範囲拡大
- 勝手な merge
- release
- deploy

Plan を変える必要がある場合は Root Agent に戻す。

---

## 22. リポジトリのチェック

プロジェクトで正式に定義されているチェックだけを使う。

確認先の例:

```text
package scripts
Makefile などの task 定義
CI 設定
README や開発ドキュメント
```

実行対象の例:

```text
test
lint
formatter check
typecheck
CI と同等のコマンド
```

設定ファイル名だけを見てコマンドを推測しない。

不足している lint や formatter を `pi-taskflow` が勝手に追加しない。

---

## 23. 実際の動作確認

リポジトリのチェックとは別に、Work Item の完了条件を直接確認する。

例:

```text
API
→ 実際にリクエストする

CLI
→ 実際にコマンドを実行する

UI
→ 実際に操作する

Bug Fix
→ 元の再現手順で直ったことを確認する

Performance
→ 実際に再計測する

Refactoring
→ 変更前後で同じ結果になることを確認する
```

結果を専用ファイルとして保存することは必須にしない。

---

## 24. Review

動作確認後は、原則として2つの fresh review を行う。

### 24.1 Correctness Review

`pi-subagents` の built-in `reviewer` を使う。

主に次を確認する。

- Work Item の完了条件を満たしているか
- Approved Plan に反していないか
- 不具合や回帰がないか
- テストや動作確認に不足がないか

### 24.2 Ponytail Review

別の fresh `reviewer` に `ponytail-review` Skill を指定する。

過剰な実装、不要な抽象化、既存機能や標準機能で置き換えられるコードなどを確認する。

### 24.3 Reviewer への入力

両方の Reviewer に必要な範囲で次を渡す。

```text
Work Item
Approved Plan
実際の差分
チェック結果
実際の動作確認結果
```

Worker の自己申告だけを根拠にしない。

Reviewer は原則としてコードを変更しない。

---

## 25. 指摘の整理と修正

Reviewer の指摘を直接 Worker に渡さない。

Root Agent が両方の Review 結果をまとめ、各指摘について判断する。

最低限、次を区別する。

```text
今回直す
今回は直さない
```

完了を妨げる重大な問題は、その理由を明確にする。

修正する指摘はまとめて1回の修正依頼にする。

修正後は影響したチェックと動作確認を再実行する。

修正内容が大きい場合だけ必要な範囲を fresh Reviewer で再確認する。

仕様や設計を変える必要が出た場合は `REPLAN_REQUIRED` とする。

---

## 26. taskflow_code_review

Extension は `taskflow_code_review` tool を登録する。

この tool が `taskflow.plannotatorCodeReview` の有効値を内部で確認する。

`false` の場合は Plannotator を開かず、`skipped` を返す。

`true` の場合は Plannotator Code Review を開き、ユーザーの結果を待つ。

```text
taskflow_code_review
      │
      ├─ disabled → skipped
      │
      └─ enabled
           ↓
        Plannotator
           ↓
        Human Review
```

有効な場合は、明示的な Approve が得られるまで Implementation を完了扱いにしない。

Reject でコード変更が必要な場合は、Root Agent が修正内容を判断し、必要な確認を再実行してから再提出する。

---

## 27. 設定

Pi 標準の設定ファイルを使う。

Global:

```text
~/.pi/agent/settings.json
```

Project:

```text
.pi/settings.json
```

`pi-taskflow` の設定は `taskflow` namespace に置く。

```json
{
  "taskflow": {
    "plannotatorCodeReview": false
  }
}
```

v1 の独自設定はこの1項目だけとする。

デフォルトは `false`。

Project 設定は Global 設定を上書きする。

Project trust を尊重する。

不正な値は黙って無視せず、警告または明確なエラーとして扱う。

設定取得専用の `taskflow_config` tool は作らない。

`taskflow_code_review` など、設定を必要とする Extension 処理が内部で Pi の公開 `SettingsManager` を使って有効な設定を取得する。

Agent の model や thinking level は `subagents` 側で設定する。

Work Item の保存先は `to-tickets` 側の設定を使う。

---

## 28. Extension

`extensions/taskflow.ts` の責任を次だけに限定する。

```text
taskflow_plan_review
taskflow_code_review
```

Extension 自身は次を持たない。

```text
workflow state machine
stage transition
progress card
TUI
workflow percentage
mission persistence
```

設定を Agent に返すだけの専用 tool は作らない。

Grilling の質問も Extension-to-Extension API から直接開始しない。

Grilling は Root Agent が `ask_user_question` tool を呼んで進める。

---

## 29. 最終結果

Implementation は次のいずれかの状態で終了する。

```text
READY_FOR_MERGE
BLOCKED
REPLAN_REQUIRED
FAILED
```

専用の永続 State や結果オブジェクトを作る必要はない。

Root Agent が最終回答で状態と理由を明確にする。

---

## 30. 呼び出し方法

Skill を直接利用する。

```text
/skill:taskflow-planning <依頼>

/skill:taskflow-implementation <Work Item>
```

`/wf-*` command は作らない。

---

## 31. テスト

### 31.1 設定読み込み

次をテストする。

- 設定なし
- Global 設定
- Project override
- Project が未信頼
- 不正な値
- `taskflow_code_review` 無効時の `skipped`

### 31.2 Plannotator 連携

次をテストする。

- Plan Review の開始
- Approve
- Reject と feedback
- Cancel
- Plannotator が利用できない場合
- 不正な response
- Code Review 有効時の Approve / Reject

### 31.3 外部調査連携

`pi-ketch.researcher` を `pi-subagents` から起動できることを確認する。

`pi-taskflow` 側で Ketch tool の登録処理はテストしない。

必要な tool と child 用 Extension が `pi-ketch.researcher` 側から提供されることを integration / smoke test で1回確認する。

### 31.4 Workflow の確認

Skill と Playbook は、細かい unit test より実際のシナリオで確認する。

Planning:

```text
Feature
Bug Fix
Refactoring
Performance
Grilling を省略できる明確な依頼
Grilling + ask_user_question
外部調査 + pi-ketch.researcher
Probe が必要な依頼
Plannotator Reject → 修正 → Approve
複数 Work Item
```

Implementation:

```text
Feature Playbook
Bug Fix Playbook + TDD
Refactoring Playbook
Performance Playbook
共通フロー
チェック失敗
Correctness Review + Ponytail Review
Reviewer 指摘 → 修正
REPLAN_REQUIRED
Plannotator Code Review 有効
```

`to-tickets` 自体の tracker 機能は `pi-taskflow` で再実装・再テストしない。

---

## 32. 実装順

1. `taskflow-planning` の4つの Playbook を作る。
2. `taskflow-planning/SKILL.md` を作る。
3. `taskflow-implementation` の4つの Playbook を作る。
4. `taskflow-implementation/SKILL.md` を作る。
5. Pi `settings.json` の `taskflow` 設定読み込みを実装する。
6. Plannotator bridge を実装する。
7. `taskflow_plan_review` を実装する。
8. `taskflow_code_review` を実装する。
9. 設定読み込みのテストを作る。
10. Plannotator 連携のテストを作る。
11. `pi-ketch.researcher` 連携を確認する。
12. Planning のシナリオを確認する。
13. Implementation のシナリオを確認する。

StateStore、ArtifactStore、WorkflowLock、TUI、途中復旧機構から実装を始めない。
