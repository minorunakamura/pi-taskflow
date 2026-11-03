# pi-taskflow 実装仕様書

## 1. 実装方針

実装の中心は次の4つとする。

1. `taskflow-planning` Skill
2. `taskflow-to-ticket` Skill
3. `taskflow-implementation` Skill
4. Plannotator 連携と設定読み込みのための小さな Extension

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
│   ├── taskflow-implementation/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── playbooks/
│   │           ├── feature.md
│   │           ├── bug-fix.md
│   │           ├── refactoring.md
│   │           └── performance.md
│   │
│   └── taskflow-to-ticket/
│       ├── SKILL.md
│       ├── LICENSE
│       └── references/
│           ├── origin.md
│           └── templates/
│               ├── github.md
│               ├── local.md
│               └── ticket.md
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
    ├── plannotator.test.ts
    ├── planning-skill.test.ts
    ├── implementation-skill.test.ts
    └── to-ticket-skill.test.ts
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

独立2 Reviewer のうち Ponytail Reviewer だけに `ponytail-review` Skill を明示指定し、解決・提示と実ファイルの read・利用を確認する。Correctness Reviewer には指定しない。

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
13. 同梱 taskflow-to-ticket に正式な Plan のパス・全文・追加制約を渡す
14. ticket Skill が tracker 設定・分割・保存公開を個別にユーザーに確認する
15. 承認後に Work Item を保存・公開する
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

Planning Root は保証対象、既存検証、必要な追加と自動化・直接確認の範囲を先に選び、その限定対象ごとに TDD 採否を決める。種別別の既定、明示指定・規約の優先、重い自動化の例外条件は [Planning Skill §5](../skills/taskflow-planning/SKILL.md#5-設計と検証方法を固める) に従う。

今回関係する検証 Skill・手順・必要な helper・Feature Map の適否・不足と再利用価値を確認する。適切な既存資産を優先し、必要時 Create の必要性と初期対象を判断するだけとし、Planning で資産生成や生成手順の成立確認は行わない。

Plan には次を記載する。

- 保証対象・対象外、自動テストと直接確認の範囲・方法・期待結果
- 対象別の TDD の有無と、使用する場合の対象公開インターフェース
- 必要なら追加・拡張しない自動化

非 TDD はテスト不要でも、最後に一括作成する指定でもない。必要なテスト・実動作確認・回帰確認は採否によらず計画する。

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

既存の「動作確認方法」に §11 の選定結果を残し、混在作業の対象別採否を識別できるようにする。全ケースやテストコードは固定しない。
検証資産の参照・選ぶ機能・適否と不足・必要な作成更新範囲（必要時 Create の初期対象を含む）、更新後の再実行と Worker / Root の検証分担も同じ欄に残す。
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

## 16. taskflow-to-ticket

同梱の `skills/taskflow-to-ticket/SKILL.md` を明示的に読み、正式に保存した Approved Plan のパス・全文・Planning の追加制約を渡す。Planning / Feature Playbook からの Markdown リンクは各参照元を基準に解決する。旧 `to-tickets` / setup Skill は不要。

次の処理は prompt-driven `taskflow-to-ticket` に任せる。

- プロジェクトルートの `docs/agents/issue-tracker.md` の直接読み取り・再利用と必要最小限の準備
- Work Item への分割と実際の blocker の整理
- 設定、分割、最終本文・保存先の保存・公開の個別承認（Plan 承認を流用しない）
- GitHub Issues / Local Markdown への保存・公開と readback

Extension で tracker API、抽象化、ticket 分割処理、永続 workflow state を再実装しない。AGENTS.md / CLAUDE.md は設定のために作成・変更しない。

各 Work Item から正式な Approved Plan を参照できるようにする。Local の相対リンクは ticket の場所から解決する。Planning の追加制約として、Plan の保証対象・対象外、自動化範囲、確認方法・期待結果、対象別の TDD 採否を維持し、分割側で独自変更しない。
検証資産の参照・選ぶ機能・必要な作成更新範囲と再実行・検証分担も、正式 Plan 参照と既存の Verification 欄で関係する Work Item に引き継ぐ。
保存・公開後は参照と承認を確認して停止し、Implementation、Worker、merge / release / deploy を自動開始しない。

---

## 17. taskflow-implementation Skill

`skills/taskflow-implementation/SKILL.md` が Implementation 全体を担当する。

基本手順:

```text
1. issue-tracker.md を直接確認し、対象・取得ルールと明示参照の整合を確認して Work Item を取得する
2. Approved Plan を取得する
3. 開始条件を確認する
4. Work Item の内容に合う Implementation Playbook を選ぶ
5. 必要なコードを確認する
6. Worker に実装を依頼する
7. リポジトリのチェックを行う
8. Work Item の結果を実際に確認する
9. 別々の fresh reviewer で Correctness / Ponytail Review を一方の結果を待たず並行起動する（Skill 指定は Ponytail のみ）
10. 両結果取得後、Root Agent が指摘の採否と必要な修正・再検証を判断する
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

Work Item 取得前にプロジェクトルートの `docs/agents/issue-tracker.md` を直接読み、対象 tracker と取得ルールを確認する。AGENTS.md / CLAUDE.md やそこからのリンクに依存しない。
既存設定の読み取り失敗を未設定扱いにせず `BLOCKED` とする。設定と明示された参照が矛盾する場合は、取得先・設定を変更せずユーザーに確認する。
設定がなくても明示 URL / local path と既存の公開 API で取得先が確定する入力は維持する。番号だけで対象が曖昧なら `BLOCKED`。Implementation では tracker のセットアップ・設定作成・更新を行わない。

Work Item から承認済みの正式な Approved Plan を参照する。local ticket の相対リンクは ticket の場所から解決する。

次の場合はコード変更・Worker 起動前に `BLOCKED` として停止する。

- 設定を読めない、設定と明示参照が矛盾する、または取得先が曖昧
- Work Item が取得できない
- 正式な Approved Plan が取得・確認できない
- 実際の blocker が未完了または状態不明。依存の本文と完了理由・結果を確認し、GitHub の close だけでは完了としない
- 完了条件と検証方法が理解できない
- 未決定のユーザー判断が残っている

`ready-for-agent` 等の label だけで開始を許可しない。

Plan の前提や設計を変える必要がある場合は `REPLAN_REQUIRED` とする。

---

## 20. Implementation 開始時のコード確認

Planning の Scout 出力は引き継がない。

現在の Work Item に必要なコードを改めて確認する。
Plan / Work Item の資産参照・選ぶ機能・必要な作成更新範囲と、現在の検証 Skill・手順・必要な helper・Feature Map も読み、適切な既存資産を優先する。不足時だけ Approved Plan 内で共通 `create-verification-skill` を明示 read して利用し、必要な Skill を取得できなければ既存の `BLOCKED` 経路を使う。
公開入口は `/skill:create-verification-skill <対象機能・検証範囲などの自由文>`、検証対象 repository が cwd であり、固定 checkout や独自 wrapper・parser を要求しない。配置・発見・証拠・安全性は [Implementation Skill §3](../skills/taskflow-implementation/SKILL.md#3-現在のコードを確認する) と共通 Skill・対象規約に従い、Taskflow 側で再定義しない。

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

動作確認方法には Plan の保証対象・対象外、自動化範囲、対象別の TDD 採否と Worker / Root の検証分担を含める。通常のテスト詳細はその範囲内で判断する。
検証資産の参照・選ぶ機能・必要な作成更新範囲、必要時 Create の初期対象と明示 read、更新後の再実行・証拠・cleanup の担当も渡し、Root の直接確認と分担する。資産編集も同じ cwd の同時 writer を作らない。

TDD が Plan に指定されている対象にだけ Matt Pocock の `tdd` Skill を指定し、未指定対象へ広げない。

Worker は次を行わない。

- Plan にない仕様変更
- 勝手な範囲拡大
- 勝手な merge
- release
- deploy

Plan を変える必要がある場合は Root Agent に戻す。

---

## 22. リポジトリのチェック

プロジェクトで正式に定義されているチェックだけを使う。Implementation Skill の Worker＝対象テストと focused regression、Root＝正式チェックという分担を維持し、正式 full suite を間引かず、Worker に同じ全正式チェックを機械的に重ねない。

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

リポジトリのチェックとは別に、Root が承認済みの方法で Work Item の完了条件を直接確認する。公開境界は full pipeline と同義ではなく、この直接確認を恒久テスト作成義務にしない。必要な安全性・データ整合性・回帰確認を保ち、自動化対象外の結合部分を小さいテストで同等に保証したことにしない。

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

検証資産を使う場合は関係機能を検証し、変わった手順・helper・Map の関連部分だけ更新して変更した方法を再実行する。`maintain-verification-skill` はユーザーの明示実行のみで、Taskflow から自動起動せず、通常更新で必須化したり無関係な全 Map 点検を要求したりしない。
Create の少なくとも初期対象一機能での成立は、Work Item の全完了条件の確認と区別する。共通 Skill の実行・過去の証拠・Worker 報告で、変更後の Root の実入口からの直接確認・採否・最終受入れを代替しない。保証・設計変更は既存の確認・再計画経路へ戻す。
Taskflow 独自の途中結果保存基盤や一律の専用結果ファイルは要求しないが、共通 Skill と対象規約に従う証拠保存は行う。Map の手順・期待結果と今回の実行記録は分け、過去の成功を変更後へ流用しない。保存・cleanup・証拠参照確認などは §20 の参照先に従い、独自基盤や全証拠 commit・保持期限管理を追加しない。

---

## 24. Review

動作確認後、別々の fresh context の built-in `reviewer` を、一方の結果を待たずに並行起動する。直列化、一人への統合、Worker の self-review で置き換えない。

独立した2回の非同期 `subagent` 呼び出しを基本とし、導入済み `pi-subagents` の公開 Skill / guide に従って fresh と Skill 指定を子ごとに分離する。`options` 内に配置する導入版ではその形式を使う（具体例は Implementation Skill §7）。named `parallel.args.tasks[]` に `skill` / `context` を入れず、`workflow: true` と `options.script` を併用しない。専用 wrapper・Agent 定義・workflow ファイルは追加しない。

### 24.1 Correctness Review

`pi-subagents` の built-in `reviewer` を使う。

主に次を確認する。

- Work Item の完了条件を満たしているか
- Approved Plan に反していないか
- 不具合や回帰がないか
- テストや直接検証に不足がないか
- テストの期待値と直接検証の期待結果自体が Work Item / Approved Plan の正式要求に整合するか（成功や観測結果だけで判断しない）

### 24.2 Ponytail Review

この fresh `reviewer` だけに `ponytail-review` Skill を明示指定し、提示された実ファイルを read して利用させる。

過剰な実装、不要な抽象化、既存機能や標準機能で置き換えられるコードなどを確認する。Root は既存の起動記録・child 情報・結果から、別 run・両方の fresh・一方を待たない両起動と、Ponytail 側だけの Skill 解決・提示および read・利用を確認する。Skill 未解決は warning のみで起動する場合があるため、起動成功だけで済ませない。

### 24.3 Reviewer への入力

両方の Reviewer に必要な範囲で次を渡す。

```text
正式な Work Item / Approved Plan
要求の解釈・重要な前提に関係する設計・仕様等の資料と参照箇所
対象 cwd、実際の差分とその確認方法
Root の正式なリポジトリチェック結果
直接検証の期待結果・観測結果・証拠と未確認範囲
```

Plan の保証対象・対象外、自動化範囲、対象別の TDD 採否（非 TDD を含む）と Worker / Root の検証分担も渡す。承認済みの変更を考慮し、変更前の資料を無条件に優先しない。検証不足は具体的な保証に結び付け、一般論で重い自動化を追加しない。

Worker の自己申告だけを根拠にしない。

Reviewer は原則としてコードを変更しない。

Root は両方の結果を取得する。起動・実行失敗、結果未取得、Ponytail の Skill 未解決を「指摘なし」と扱わず、片方だけで Code Review gate に進まない。不足や失敗は既存の `BLOCKED` / `FAILED` 経路で理由と再開条件を報告する。

---

## 25. 指摘の整理と修正

Reviewer の指摘を直接 Worker に渡さない。

Root Agent は両方の Review 結果を取得した後にまとめ、各指摘の採否と必要な修正・再検証を判断する。

最低限、次を区別する。

```text
今回直す
今回は直さない
```

完了を妨げる重大な問題は、その理由を明確にする。

修正する指摘はまとめて1回の修正依頼にする。

対象外自動化や Plan の保証・設計の変更が必要なら、既存の確認・再計画経路へ戻る。
修正後は Implementation Skill の共通基準で影響した保証を選び直し、必要なチェックと直接確認を Root が再実行する。テスト側の同期・入力手順の失敗と製品不具合を区別し、根拠のない再試行や timeout 延長で解決扱いにしない。

修正内容が大きい場合だけ必要な範囲を fresh Reviewer で再確認する。

仕様や設計を変える必要が出た場合は `REPLAN_REQUIRED` とする。

---

## 26. taskflow_code_review

Extension は `taskflow_code_review` tool を登録する。

両方の自動レビュー結果の取得、Root の採否判断、必要な修正・影響に応じた再検証と必要時の再レビューを終えてから、Root が呼ぶ。

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
    "plannotatorCodeReview": true
  }
}
```

v1 の独自設定はこの1項目だけとする。

デフォルトは `true`。未設定時も有効とし、明示的に `false` を設定した場合のみ無効にする。

Project 設定は Global 設定を上書きする。

Project trust を尊重する。

不正な値は黙って無視せず、警告または明確なエラーとして扱う。

設定取得専用の `taskflow_config` tool は作らない。

`taskflow_code_review` など、設定を必要とする Extension 処理が内部で Pi の公開 `SettingsManager` を使って有効な設定を取得する。

Agent の model や thinking level は `subagents` 側で設定する。

Work Item の保存先は `taskflow-to-ticket` が準備するプロジェクトルートの `docs/agents/issue-tracker.md` を使う。Implementation は直接読み取り、作成・更新しない。

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

Skill と Playbook は、細かい unit test より実際のシナリオで確認する。検証範囲を先に選ぶ判断、混在対象別の TDD 採否、Plan → Work Item → Worker / Review での範囲維持、直接確認と恒久自動化の区別を照合する。文書の机上照合や loader 成功を、実 Agent の実行遵守や時間削減の証明にしない。

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
別々の fresh Correctness / Ponytail Review の並行起動（Ponytail のみ Skill 解決・提示・利用）
両結果取得 → Root の採否 → 必要な修正・再検証・再レビュー → taskflow_code_review
片方の起動失敗・結果未取得・Skill 未解決で停止
REPLAN_REQUIRED
Plannotator Code Review 有効
```

ticket Skill の Pi loader・同梱参照の解決テストと、実 Root・人間承認による設定・分割・保存公開・停止の smoke を分ける。Planning 接続と fresh Implementation の設定引継ぎ、未完了 blocker、設定矛盾、設定なし明示 local path も隔離 fixture で観測する。文章一致や loader 成功を Agent の実行遵守の証明にしない。GitHub 書き込みは明示的な許可がある検証先だけで行う。
Extension に tracker 機能を再実装したり、全 workflow を強制する状態機械を追加したりしない。

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
