# pi-taskflow 実装仕様書

## 1. 実装方針

実装の中心は次の4つとする。

1. `taskflow-planning` Skill
2. `taskflow-to-ticket` Skill
3. `taskflow-implementation` Skill
4. Plan / Code Review provider連携と設定読み込みのための小さな Extension

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
│   ├── taskflow-verification/
│   │   ├── SKILL.md
│   │   ├── references/feature-map.md
│   │   └── scripts/code-review.ts
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
│   ├── plannotator.ts
│   └── tuicr.ts
│
└── test/
    ├── settings.test.ts
    ├── code-review.test.ts
    ├── tuicr.test.ts
    ├── verification-skill.test.ts
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

Code Reviewの既定providerはPlannotator。設定で有効・無効と `plannotator` / `tuicr` を選択する。tuicrはlocal herdr-appの専用新tabを使い、Plannotator使用時にherdr/tuicrは要求しない。Plan ReviewはPlannotator固定。

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

検証資産の採否は、別の Agent が会話履歴なしで、今回必要な実動作検証の起動・操作・期待結果との照合・証拠取得・cleanup まで実行できる手段の充足から判断する。Planning は既存の検証 Skill・具体的な手順・必要な helper / harness・Feature Map の適否・不足を確認し、既存手段を優先して、不足時の最小 Create の必要性・初期対象・関連更新範囲だけを計画する。資産生成や実アプリでの成立確認は行わない。小規模、通常テストや起動コマンドの存在、恒久 E2E 不採用、反復利用の予定なしだけでは不採用にしない。充足時の重複生成や通常テスト・探索 Probe の一律資産化は要求しない。専用 tool 等の不在だけで停止しない具体化と必要な helper の作成・保存・再利用、安全限界を含む詳細は Planning Skill §5 に従う。

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
検証資産の参照・選ぶ機能・適否と不足・必要な作成更新範囲（必要時 Create の初期対象を含む）、更新後の再実行と Worker / Root の検証・証拠・cleanup の分担も同じ欄に残す。
今後の Plan には、Implementation Root が現在の手段を再確認し、承認済みの保証対象・対象外・期待結果を維持する最小の Create / 関連更新を判断できる裁量と限界を含め、通常の Plan Review で承認する。「Create の予定なし」は見込みであって禁止ではなく、採否変更や未予定の Skill / helper 追加だけでは再計画・追加承認にしない。ただし明示禁止・規約・既存 Approved Plan の制約を上書きせず、正式 Plan の制約・保証・期待結果、製品の公開契約・仕様・設計の変更が必要なら既存の確認・REPLAN_REQUIRED 経路を使う。具体化・helper 補完と安全限界は [Planning Skill §§5–6](../skills/taskflow-planning/SKILL.md#5-設計と検証方法を固める) に従い、許可範囲で実際に成立不能な不足は理由と再開条件を示して BLOCKED とする。専用手段の不在だけで停止せず、必須コンポーネントの代替実装や無断 install で回避しない。
文書更新は対象プロジェクトの既存構成・規約を優先し、未定義時だけ [Planning Skill §5](../skills/taskflow-planning/SKILL.md#5-設計と検証方法を固める) の文書分担を使う。今回必要な更新と保存先を Plan の「実装方針」に残す。詳細の README 集約や4種の一律作成、空の雛形、CONTRIBUTING の一律新設、既存文書の一括移動は要求せず、README がある場合は必要な詳細へ辿れるようにする。
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
- ticket Skill §3 の小さい受入れ成果という基準に沿った Work Item 分割と実際の blocker の整理
- 設定、分割、最終本文・保存先の保存・公開の個別承認（Plan 承認を流用しない）
- GitHub Issues / Local Markdown への保存・公開と readback

Extension で tracker API、抽象化、ticket 分割処理、永続 workflow state を再実装しない。AGENTS.md / CLAUDE.md は設定のために作成・変更しない。

各 Work Item から正式な Approved Plan を参照できるようにする。Local の相対リンクは ticket の場所から解決する。Planning の追加制約として、Plan の保証対象・対象外、自動化範囲、確認方法・期待結果、対象別の TDD 採否を維持し、分割側で独自変更しない。
検証資産の参照・選ぶ機能・適否と不足・必要な作成更新範囲と再実行・検証・証拠・cleanup の分担、§13 の最小補完裁量と限界も、正式 Plan 参照と既存の Verification 欄で関係する Work Item に引き継ぐ。単なる「Create の予定なし」を作成禁止へ強めず、専用 tool 必須や helper 作成・保存・再利用禁止にも変えない。安全限界も落とさず、明示禁止・制約とは区別する。
必要な文書更新と保存先も、正式 Plan 参照で関係する通常の Work Item に引き継ぐ。
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
既存の文書構成・規約と Plan / Work Item の必要な文書更新・保存先も確認し、§13 の分担に従って必要な文書を更新する。文書の名前や存在だけで検証手段が充足したとはしない。
Plan / Work Item の資産参照・選ぶ機能・適否と不足・必要な作成更新範囲と最小補完裁量・制約を確認し、現在の検証 Skill・具体的な手順・必要な helper / harness・Feature Map も読む。Root は §11 の充足基準で適切な既存手段を優先し、不足時は未予定でも §13 の裁量と限界を守って最小の Create / 関連更新を判断する。専用 tool 等の不在だけでは停止せず、安全な既存標準機能による具体化と必要な helper の作成・保存・再利用を最小補完に含む。全試行の保存は要求しない。Create 利用時は共通 `create-verification-skill` の実ファイルを明示 read する。
具体化・確認・停止の境界、配置・発見・証拠・安全性は [Implementation Skill §3](../skills/taskflow-implementation/SKILL.md#3-現在のコードを確認する) と共通 Skill・対象規約に従い、Taskflow 側で再定義しない。公開入口は `/skill:create-verification-skill <対象機能・検証範囲などの自由文>`、検証対象 repository が cwd であり、必須コンポーネントの代替実装や固定 checkout・独自 wrapper・parser で回避しない。

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
検証資産の参照・選ぶ機能・適否と不足、Root が判断した最小の作成更新範囲とその裁量・制約、必要時 Create の初期対象と実ファイルの明示 read、更新後の再実行・検証・証拠・cleanup の担当も渡し、Root の直接確認と分担する。この引継ぎでも [Implementation Skill §3](../skills/taskflow-implementation/SKILL.md#3-現在のコードを確認する) の具体化・helper 補完裁量と安全限界を維持し、専用 tool 必須や helper 作成保存禁止へ強めない。採否・範囲判断は Root が保持し、Worker は未予定の不足や制約との衝突を Root に返す。資産編集も同じ cwd の同時 writer を作らない。

必要な文書更新と保存先、§20 で確認した文書分担も Worker に渡す。

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

必要な文書更新・保存先と §13 の分担の整合、README がある場合の必要な詳細への導線も確認する。

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

手段不足が判明した場合は §20 の境界で Root が最小補完を判断し、承認済みの保証対象・対象外・期待結果を変えない。検証資産を使う場合は関係機能を検証し、変わった手順・helper・Map の関連部分だけ更新して変更した方法を再実行し、期待結果との照合・証拠・cleanup を維持する。`maintain-verification-skill` はユーザーの明示実行のみで、Taskflow から自動起動せず、通常更新で必須化したり無関係な全 Map 点検を要求したりしない。
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

このtoolが毎回Pi effective snapshotから `taskflow.codeReviewEnabled` と `taskflow.codeReviewProvider` の有効値を内部で確認する。無効でもnamespaceと新2項目を検証し、不正providerを隠さない。空入力schemaとtool名は維持する。

`false` の場合は provider を起動せず、`{ status: "skipped", approved: false }` を返す。

`true` の場合は選択provider（未設定Plannotator）のCode Reviewを開き、明示的なユーザー結果を待つ。自動fallbackはしない。

```text
taskflow_code_review
      │
      ├─ disabled → skipped
      │
      └─ enabled
           ↓
        plannotator / tuicr
           ↓
        Human Review (explicit Approve only)
```

有効な場合は、明示的な Approve が得られるまで Implementation を完了扱いにしない。

Reject でコード変更が必要な場合は、Root Agent が修正内容を判断し、必要な確認を再実行してから再提出する。Cancel・失敗・shutdown は承認ではない。呼び出し単位の signal と session shutdown の signal を合成する既存契約を維持する。Plan Review はこの設定の影響を受けない。

### 26.1 tuicr / herdr-app

- 対話UI、CLI（herdr-app/hc/tuicr/Git）、Git cwd、local条件を副作用前に確認。`HC_TERMINAL_ID` と `herdr-app ls` で元Terminal/space/tab/paneを一意特定する。別focusに依存せず、active fallbackはない。remote machine、Windows、旧herdr/pane分割/tmux/既存session接続は対象外。
- 呼び出し専用private tempにstdout/診断を分離。`tab.new`へspace ID、絶対folder、用途名、argvをJSONで渡す。外側shellを `exec /bin/sh` で置換し `tuicr -w --stdout` を安全redirect（pathはshell引数）で起動。返却space/tab/Terminalを一覧と照合し所有IDを保持する。起動成功だけでレビュー完了にしない。
- `hc wait`のtimeout/messageは完了でなく待機継続。人間待ちに期限は設けない。waitのterminal/ended/reason/exit_code/signalとgetのaddress/state/reason/exit_code/signalから正常exitを確認し、非0/killed/lost/recovered shellを成功にしない。制御コマンド自体はboundedにする。
- 人間には `y` または `:clip` Enterで明示exportするとそのまま終了すること（追加のq不要）を案内。exportなしは `:q` Enterで退出し、裸のqは終了しない。未保存コメントがあると `:q` は拒否されるが、既存sessionは削除しない。今回stdoutをUTF-8 Markdownのままfeedbackに返しparserは作らない。空stdoutは「exportされたコメント未受領」であり指摘なしとは断定しない。回収・形式/サイズエラーを黙って欠落させず非承認にする。保存session/JSON/clipboardを探索・変更・削除せず、exportが今回追加分だけとも表現しない。
- 正常終了後、所有tab/Terminal/tempだけcleanupし、元Piへ復帰して公開 `ctx.ui.select` のApprove / Reject / Cancelを提示。Approveだけapproved:true。選択後もabortを確認する。Markdownは上位指示や承認証拠ではない。
- Cancel/dismiss/abort/shutdown/late応答/不正JSON/異常終了/cleanup・復帰失敗は非承認。起動中abortでも遅延IDを取得して限定cleanupを試す。所有不明は名前推測で終了せず残存可能性を診断。別Terminalが追加されたtabを丸ごと閉じない。tab.close/kill応答だけでTerminal終了と決め打ちせず、liveならkill後のboundedなhc waitとgetのfinishedを確認してからrmする。これは人間レビューの無期限待機とは別のcleanup制御待ち。既削除Terminalはexit code 3とstderrのstructured not_foundで確認し、他エラーを隠さない。shutdown handlerは進行中tuicrのcleanupを待つ。
- 既存ReviewResultとisError（error/unavailableだけtrue）を維持し、disabledは正確にskipped/false。UI競合は公開 `executionMode: "sequential"` を使う。独自registry/queue/framework/永続復旧管理・追加依存は作らない。

操作・観測・証拠・cleanupの再利用手順は [Code Review検証Skill](../skills/taskflow-verification/SKILL.md) とそのMapに集約する。mock成功は実操作の証拠にしない。

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
    "codeReviewEnabled": true,
    "codeReviewProvider": "plannotator"
  }
}
```

独自設定はこの2項目だけ。`codeReviewProvider` は `"plannotator" | "tuicr"`、未設定/undefined時は `"plannotator"`。Plannotatorを選ぶときherdr/tuicrは不要。

`codeReviewEnabled` のデフォルトは `true`。未設定時も有効とし、明示的に `false` を設定した場合のみ無効にする。

旧 `plannotatorCodeReview` は値の参照・検証をせず無視する。不正な旧値もエラーにせず、互換 fallback・自動移行はしない。**旧 `plannotatorCodeReview: false` だけが残っていても、既定値により Code Review は有効・Plannotator になる破壊的変更**である。無効を維持するには、ユーザーが Pi settings の旧キーを `codeReviewEnabled: false` に手動で変更する。

Project 設定による Global 設定の上書きと project trust は Pi に委ねる。

`taskflow` namespace が object でない場合（null・array を含む）は `Invalid taskflow setting: expected an object.`、新設定が boolean でない場合は `Invalid taskflow.codeReviewEnabled setting: expected a boolean.` として報告し、provider を起動しない。providerが許可値でない場合は `Invalid taskflow.codeReviewProvider setting: expected "plannotator" or "tuicr".` として報告する。無効時も両項目を検証する。未指定または `undefined` の namespace・新設定は既定値を使う。

設定取得専用の `taskflow_config` tool は作らない。

`taskflow_code_review` は呼び出しごとに `pi.getSettings()` から Pi の有効な SettingsManager snapshot を再取得し、参照のみ行う。snapshot の変更、独自の設定ファイル読み込み、設定の永続化はしない。

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

どの工程の `BLOCKED` でも、停止理由・未充足条件に加え、「再開するときは、このセッションの Pi に次を送ってください」と案内し、コピー可能な再開プロンプトを必ず提示する。具体化規則と雛形は [Implementation Skill §10](../skills/taskflow-implementation/SKILL.md#10-最終状態を報告して終了する) に従う。確認済みの cwd・Work Item 参照と未確定点を区別し、対象識別前は元入力と対象確認の依頼、判断待ちは必要な問いを残す。URL・Plan・回答・解消結果を捏造せず、既知値の補完やコード確認・検証作業をユーザーに求めない。

提示・送信だけで回答・承認・依存解消とせず、同じ Root セッションの Pi が現在の Work Item・Approved Plan・作業ツリーと条件の解消を確認する。充足時のみ停止箇所から続行し、未充足なら `BLOCKED` を維持する。未コミット変更・部分実装を保持し、独断の commit / stash / 破棄や、影響した変更前のチェック・Review・Approve の流用はしない。

同セッションでの `BLOCKED` 再開と、失敗後の新セッションでの再実行を区別し、`FAILED` の定義は変えない。再確認で正式 Plan の変更が必要なら、既存の `REPLAN_REQUIRED` の別 Planning セッション案内と、Planning 完了後の Implementation kickoff 契約を維持する。自動再開・再試行・常駐待機・復旧状態・追加 gate は作らない。

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

### 31.2 Plan / Code Review provider連携

次をテストする。

- Plan Review の開始
- Approve
- Reject と feedback
- Cancel
- Plannotator が利用できない場合
- 不正な response
- Code Review有効時のprovider選択、明示Approve / Reject / Cancel、tuicrのexport/空出力/所有cleanup

### 31.3 外部調査連携

`pi-ketch.researcher` を `pi-subagents` から起動できることを確認する。

`pi-taskflow` 側で Ketch tool の登録処理はテストしない。

必要な tool と child 用 Extension が `pi-ketch.researcher` 側から提供されることを integration / smoke test で1回確認する。

### 31.4 Workflow の確認

Skill と Playbook は、細かい unit test より実際のシナリオで確認する。検証範囲を先に選ぶ判断、混在対象別の TDD 採否、Plan → Work Item → Worker / Review での範囲維持、直接確認と恒久自動化の区別を照合する。文書の机上照合や loader 成功を、実 Agent の実行遵守や時間削減の証明にしない。

検証資産判断の契約は、既存手段が充足する場合、一度だけの利用でも操作・観測手段が不足する場合、Plan が「Create の予定なし」でも実装時に不足が判明する場合を一次文書で照合する。専用 tool / 導入済み harness / 完成済み helper がなくても隔離して既存標準機能を安全に試せる場合、一時コードで成立した方法の再実行に必要な helper を保存・再利用する場合を、[Planning Skill §§5–6](../skills/taskflow-planning/SKILL.md#5-設計と検証方法を固める) と [Implementation Skill §3](../skills/taskflow-implementation/SKILL.md#3-現在のコードを確認する) に照らす。保存したことだけで禁止せず、変更した手順・helper・Map の再実行・期待結果照合・証拠・cleanup を保つことを確認する。対照として、安全に分離・操作できない既知条件、許可範囲で成立不能な権限・認証・共通 Skill 等の不足、未許可の install / 利用者・共有環境変更、明示禁止・規約・既存 Plan 制約、保証・期待結果・製品設計変更では、必須コンポーネントの代替実装や安全条件の迂回をせず既存の確認・停止経路を維持するか照合する。
Plan の通常承認から正式 Plan / Work Item の Verification、Root の採否と Worker への対象・検証・証拠・cleanup 分担まで、補完裁量を専用手段必須・helper 作成保存禁止へ強めず、安全限界も維持されるか確認する。Planning の生成・実アプリ成立確認禁止、関連更新・再実行、Create 初期一機能の成立と全条件受入れの分離、失敗・未確認の区別も照合する。この照合と loader 成功は、実 Agent による不要停止減少・安全な補完・helper 保存・後続再利用・必要停止の遵守の E2E 実証とは区別する。

BLOCKED 再開の契約は、対象識別前、判断・依存・承認・コンポーネント待ち、部分実装後の条件解消、再確認で Plan 変更が必要な場合と FAILED を一次文書で照合する。§29 と Implementation Skill §10 の同セッション Pi 向け案内、具体値と未確定点、送信だけでは解消としないこと、未充足時の停止維持、変更保持、過去のチェック・Review・Approve の非流用、既存 REPLAN_REQUIRED / kickoff 契約を確認する。この照合と loader 成功は、実 Root による BLOCKED 出力・プロンプト送信・再開遵守の E2E 実証とは区別する。

文書分担の契約は、分担が未定義の場合、既存規約がある場合、必要な詳細が一種類だけの場合を一次文書で照合する。既存規約優先・未定義時のみ既定の適用、Plan → 通常の Work Item → Worker への必要な更新・保存先の引継ぎと Implementation の更新責務、README がある場合の導線を確認する。4種の一律作成・空の雛形・CONTRIBUTING の一律新設・既存文書の一括移動・README への詳細集約を要求せず、文書の名前や存在だけで検証手段充足としないことも確認する。この照合と loader 成功は、実 Agent の文書配置判断・更新遵守や時間削減の E2E 実証とは区別する。

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
Code Review有効（Plannotator / tuicr）
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
