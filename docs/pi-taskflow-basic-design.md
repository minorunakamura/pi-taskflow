# pi-taskflow 基本設計書

## 1. 目的

`pi-taskflow` は、Pi を使った開発作業を「計画」と「実装」に分けて進めるためのワークフローである。

次の2つを独立したタスクとして扱う。

1. Planning タスク
2. Implementation タスク

Planning と Implementation を1つの長い Pi セッションで続けて実行しない。

Planning タスクは、実装方針を決め、承認済み Plan と Work Item を作成した時点で終了する。

Implementation タスクは、別の新しい Pi セッションで Work Item と承認済み Plan を読み、実装を開始する。

この分離によって、長い会話履歴を引き継ぐ必要をなくし、状態管理や復旧処理をできるだけ持たない構成にする。

---

## 2. 主な用語

### Root Agent

現在の Pi セッションを担当する Agent。

Planning、Implementation ともに Root Agent が全体の判断と進行を担当する。

### Playbook

作業の種類ごとの進め方をまとめた短い手順書。

### Approved Plan

Plannotator でユーザーが承認した Plan。

Implementation に渡す正式な設計情報とする。

### Work Item

1回の Implementation タスクで実装し、結果を確認できる作業単位。

GitHub Issue または local ticket などとして保存する。

### Probe

分からない事実を、小さな実験で確認する作業。

本番実装を目的としない。

---

## 3. 全体構成

```text
Planning タスク
新しい Root Agent
      │
      ▼
taskflow-planning Skill
      │
      ▼
Planning Playbook
      │
      ├─ Scout
      ├─ 必要なら pi-ketch.researcher
      ├─ 必要なら Grilling
      ├─ 必要なら Probe
      └─ 設計
      │
      ▼
必要なら Oracle
      │
      ▼
Plannotator Plan Review
      │
      ▼
Approved Plan
      │
      ▼
to-tickets
      │
      ▼
Work Items
      │
      ▼
END


================================
       Planning / Implementation
          明確な境界
================================


Implementation タスク
新しい Root Agent
      │
      ▼
taskflow-implementation Skill
      │
      ▼
Work Item + Approved Plan
      │
      ▼
Work Item に合う Implementation Playbook
      │
      ▼
必要なコードを確認
      │
      ▼
Worker
      │
      ▼
動作確認
      │
      ▼
Correctness Review
+
Ponytail Review
      │
      ▼
Root Agent が結果を整理
      │
      ▼
必要なら修正
      │
      ▼
必要なら Plannotator Code Review
      │
      ▼
END
```

Planning と Implementation は親子関係ではない。

Planning は実装に必要な情報を作る側、Implementation はそれを使う側とする。

---

## 4. 基本方針

### 4.1 タスクの境界でコンテキストを切る

Planning 中には、Scout が読んだコード、外部調査の途中経過、ユーザーとの質問、採用しなかった案、Probe の途中結果など、多くの情報が発生する。

これらをそのまま Implementation に引き継がない。

Implementation が基本的に受け取るものは次の2つとする。

```text
Approved Plan
+
Work Item
```

Implementation に必要なコード情報は、Implementation 側で改めて確認する。

### 4.2 Root Agent が全体判断を持つ

Root Agent は次を担当する。

- 全体の進行
- Playbook の選択
- 子 Agent への依頼
- ユーザーとのやり取り
- 調査結果やレビュー結果の最終判断

調査、実装、レビューなど、範囲を限定できる仕事だけを子 Agent に渡す。

### 4.3 公開されている機能を優先する

既に公開されている Skill、Extension、Agent を再実装しない。

`pi-taskflow` 自身は、それらを組み合わせる薄いワークフローにする。

### 4.4 分かることをユーザーに質問しない

情報は次の方法で解決する。

```text
コードを読めば分かる
    → Scout または Root Agent によるコード確認

外部を調べれば分かる
    → pi-ketch.researcher

実際に試せば分かる
    → Probe

ユーザーしか決められない
    → Grilling
```

ユーザーには、仕様、優先度、範囲、方針など、ユーザー自身が決める必要があることだけを確認する。

### 4.5 Plan は設計が固まってから作る

未確認の仮説を詳細な Plan に書いて固めない。

先に必要な調査、ユーザー判断、Probe を行う。

Plan は、決まった内容を Implementation に渡すための成果物とする。

### 4.6 実際の結果を確認する

テストや lint が通ったことだけで実装完了としない。

Work Item の完了条件が実際に成立していることを確認する。

### 4.7 共有状態を増やす前に処理を分ける

Lock や共有 State を追加する前に、タスクや書き込み先を分けられないか検討する。

---

## 5. 利用する公開コンポーネント

### 5.1 pi-subagents

主に次の built-in agent を使う。

```text
scout
    コード調査

oracle
    方針への別視点からの確認

worker
    実装

reviewer
    実装後のレビュー
```

Agent の model や thinking level は `subagents` の設定に任せる。

`pi-taskflow` 側に同じ設定を持たない。

### 5.2 pi-ketch

外部調査には `pi-ketch` が提供する package agent、

```text
pi-ketch.researcher
```

を `pi-subagents` から起動する。

`pi-ketch.researcher` 自身が、外部調査に必要な Ketch tool と child 用 Extension を定義する。

そのため `pi-taskflow` は次を管理しない。

- `ketch_search` などの tool 一覧
- pi-ketch の Extension path
- `subagentOnlyExtensions`
- Researcher 用の独自 Agent 定義

`pi-subagents` の built-in `researcher` は利用しない。

### 5.3 Plannotator

次のユーザー承認に利用する。

- Planning の Plan Review
- 設定で有効にした場合の Code Review

Plan Review では Plannotator Plan Mode に切り替えず、完成した Plan を `plan-review` に直接渡す。

### 5.4 Ponytail

Ponytail Extension は Pi で常時有効になっている前提とする。

`pi-taskflow` は Worker に `ponytail` Skill を明示的に追加しない。

コードレビュー時には Ponytail が提供する `ponytail-review` Skill を明示的に利用する。

### 5.5 pi-ask-user-question

Planning 中のユーザーへの質問表示に利用する。

`pi-ask-user-question` が Root Pi セッションに登録する、

```text
ask_user_question
```

tool を Grilling から利用する。

Grilling 自体も `ask_user_question` も subagent として実行しない。

### 5.6 Matt Pocock Skills

次を利用する。

```text
grilling
grill-with-docs
domain-modeling
tdd
to-tickets
```

`grill-me` は `grilling` を呼び出す入口なので、独立した工程にはしない。

---

## 6. Planning タスク

Planning は次の順で進める。

```text
調べる
   ↓
必要なことをユーザーと決める
   ↓
分からない事実を必要に応じて試す
   ↓
設計を固める
   ↓
必要なら Oracle で確認する
   ↓
Plan としてまとめる
   ↓
Plannotator で承認する
   ↓
Work Item に分ける
```

---

## 7. Planning Playbook

Planning では、依頼全体の性質に応じて Playbook を使う。

v1 では次の4つだけを用意する。

```text
feature
bug-fix
refactoring
performance
```

どれにも当てはまらない場合は、`taskflow-planning` の共通手順をそのまま使う。

`generic` 専用 Playbook は作らない。

`chore` は名前だけでは判断せず、実際の作業内容に合う Playbook を選ぶ。

`hotfix` は基本的に `bug-fix` として扱う。緊急であることを理由に原因確認や動作確認を省略しない。

### 7.1 Feature

```text
Scout
 ↓
必要なら外部調査
 ↓
未決定事項があれば Grilling
 ↓
必要なら Probe
 ↓
設計を確定
 ↓
テスト・動作確認方法を決定
 ↓
必要なら Oracle
 ↓
Plan Review
```

### 7.2 Bug Fix

```text
不具合を再現
 ↓
原因を調査
 ↓
原因を確認
 ↓
仕様が不明ならユーザー確認
 ↓
修正方針を決定
 ↓
回帰テスト・動作確認方法を決定
 ↓
必要なら Oracle
 ↓
Plan Review
```

原因が確認できていない状態で、推測した修正を Plan として確定しない。

### 7.3 Refactoring

```text
現在の動作を確認
 ↓
変えてはいけない動作を決める
 ↓
目標とする構造を決める
 ↓
同じ動作であることの確認方法を決める
 ↓
必要なら Oracle
 ↓
Plan Review
```

動作まで変更する必要が出た場合は Feature または Bug Fix として扱う。

### 7.4 Performance

```text
問題を確認
 ↓
基準値を計測
 ↓
何を測るか決める
 ↓
原因を調査
 ↓
必要なら Probe
 ↓
合格条件を決める
 ↓
必要なら Oracle
 ↓
Plan Review
```

コードを読むだけで性能改善を決めない。

---

## 8. Scout と外部調査

コード調査が必要な場合は `pi-subagents` の built-in `scout` を使う。

Scout は次の内容を中心に返す。

- 関係するコード
- 処理の入口
- 主な処理の流れ
- 関係するテスト
- 変更の影響
- 制約
- 分からないこと

大量のコード本文ではなく、Root Agent が判断するために必要な内容を返す。

小さく明らかな変更では、Root Agent 自身の確認だけで十分な場合は Scout を省略してよい。

外部情報が必要な場合は `pi-ketch.researcher` を使う。

例えば次の場合である。

- 外部ライブラリの仕様
- API の仕様
- バージョン差
- 標準仕様
- セキュリティ上の推奨事項

重要な結論だけを Planning に利用し、調査途中の大量の情報を Implementation に渡さない。

---

## 9. Grilling と domain-modeling

仕様や方針について未決定事項がある場合は、Root Agent が `grilling` Skill を使う。

Grilling は subagent ではない。

ユーザーへの各質問は Root Agent が `ask_user_question` tool を使って表示する。

Grilling の途中で事実確認が必要になった場合だけ、必要に応じて次へ委譲する。

```text
リポジトリ内の事実
    → scout

外部の事実
    → pi-ketch.researcher
```

用語の整理や、後から理由が分かりにくい重要な設計判断が必要な場合は、Root Agent が `grill-with-docs` を使う。

`grill-with-docs` は `grilling` と `domain-modeling` を組み合わせるため、別に `grilling` を先に実行しない。

`domain-modeling` では必要な場合だけ次を作成する。

```text
GLOSSARY.md
GLOSSARY-MAP.md
docs/adr/
```

普通の実装内容のために ADR を増やさない。

---

## 10. Probe

Probe は、分からない事実を小さな実験で確認するために使う。

```text
確認したいこと
 ↓
最小の実験
 ↓
結果を観測
 ↓
判断
```

Probe は本番コードを作る工程ではない。

Probe の結論が実装方針に影響する場合、その結論を Plan に反映する。

途中の作業ファイルは原則として保存しない。

---

## 11. TDD

TDD には Matt Pocock の `tdd` Skill を使う。

Planning で TDD を使うかを決める。

TDD を使う場合は、どの公開インターフェースをテストするかを Plan に記載する。

Plannotator で Plan が承認された時点で、そのテスト対象も承認済みとみなす。

適切なテストが作れない場合は、弱いテストを無理に追加せず、代わりの実行可能な確認方法を Plan に記載する。

---

## 12. Oracle

`pi-subagents` の built-in `oracle` は、設計に別の視点が必要な場合に使う。

例えば次の場合である。

- 複数の設計案から選んだ
- 変更範囲が広い
- 後から戻しにくい判断がある
- 重要な前提やリスクを確認したい

Oracle は承認者ではない。

Oracle の意見を採用するかどうかは Root Agent が判断する。

単純で明らかな変更では Oracle を省略してよい。

---

## 13. Plannotator Plan Review

Plan Review は Planning の必須のユーザー承認とする。

Plan Mode は使用しない。

完成した Plan を Plannotator の `plan-review` に直接渡す。

```text
Plan
 ↓
Plannotator
 ↓
ユーザー
 ├─ Reject → 修正して再提出
 └─ Approve → Approved Plan
```

明示的な Approve がない限り承認扱いにしない。

ブラウザを閉じた、キャンセルした、エラーになった、という状態は承認ではない。

---

## 14. Approved Plan

Approved Plan は Planning の正式な成果物とする。

標準の保存先は次とする。

```text
docs/plans/<topic>.md
```

プロジェクトに既存の置き場所がある場合は、そのルールを優先する。

必須の内容は次のとおりとする。

```markdown
# タイトル

## 目的

## 要件・決定事項

## 制約・対象外

## 実装方針

## 完了条件

## 動作確認方法
```

必要な場合だけ次を追加する。

- 設計の詳細
- テスト方針
- リスク
- Bug Fix の再現方法、原因、修正方針
- Performance の基準値、計測方法、目標値

---

## 15. Work Item

Approved Plan の承認後に Matt Pocock の `to-tickets` を使う。

Work Item の分割方法、依存関係、ユーザー確認、保存先は `to-tickets` に任せる。

`pi-taskflow` 側で同じ仕組みを再実装しない。

追加する要件は次の2つとする。

- 各 Work Item から元になった Approved Plan を参照できること
- 1回の Implementation タスクで実装し、結果を確認できる大きさを基本とすること

1つの Planning が Feature でも、そこから作られる Work Item がすべて Feature になるとは限らない。

例えば、1つの Feature Plan から Refactoring、Feature、Performance の Work Item が作られることがある。

---

## 16. Planning タスクの完了条件

次が完了した時点で Planning を終了する。

```text
Approved Plan が保存済み

Work Item の分割をユーザーが確認済み

Work Item が保存・公開済み
```

Planning から Implementation を自動開始しない。

---

## 17. Implementation タスク

Implementation は Work Item と Approved Plan を入力とする。

Planning の会話履歴は正式な入力にしない。

Implementation では、現在の Work Item の性質に合う Playbook を Root Agent が選ぶ。

作業種別判定だけのために別の LLM 呼び出しは行わない。

v1 では Planning と同じ4種類を用意する。

```text
feature
bug-fix
refactoring
performance
```

どれにも当てはまらない場合は、Implementation の共通手順をそのまま使う。

### 17.1 Feature

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

### 17.2 Bug Fix

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

### 17.3 Refactoring

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

### 17.4 Performance

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

## 18. Implementation の開始条件

次を確認する。

- Work Item が存在する
- Approved Plan を参照できる
- 依存する Work Item が完了している
- 完了条件が理解できる
- 未決定のユーザー判断が残っていない

条件を満たさない場合は実装を始めない。

Plan の前提や設計を変える必要がある場合は `REPLAN_REQUIRED` とする。

---

## 19. Worker

実装には `pi-subagents` の built-in `worker` を使う。

Worker に渡すのは、現在の Work Item に必要な情報だけとする。

```text
Work Item

Approved Plan の関係部分

完了条件

制約・対象外

動作確認方法

現在のコードから確認した重要事項
```

Ponytail Extension は常時有効であるため、Worker に `ponytail` Skill を明示的に追加しない。

TDD が Plan に指定されている場合だけ、Matt Pocock の `tdd` Skill を追加する。

Worker は Plan にない仕様変更や範囲拡大を行わない。

Plan を変える必要がある場合は Root Agent に戻す。

---

## 20. 動作確認

実装後は次の2つを確認する。

### 20.1 リポジトリのチェック

プロジェクトで正式に定義されているものを使う。

例:

- test
- lint
- formatter check
- typecheck
- CI と同等のコマンド

設定ファイル名だけを見てコマンドを推測しない。

### 20.2 実際の結果

Work Item の完了条件が実際に成立していることを確認する。

例えば次のように確認する。

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

---

## 21. Review と修正

動作確認後は、原則として2つの fresh review を行う。

```text
Correctness Review
    pi-subagents built-in reviewer

Ponytail Review
    pi-subagents built-in reviewer
    + ponytail-review Skill
```

両方の Reviewer は実際の差分と動作確認結果を見る。

Worker の自己申告だけを根拠にしない。

Reviewer の指摘を直接 Worker に渡さない。

Root Agent が結果をまとめ、各指摘について次を判断する。

```text
今回直す

今回は直さない
```

重大な問題で完了できない場合は、その理由を明確にする。

修正する指摘はまとめて1回の修正依頼にする。

修正後は影響した確認を再実行する。

修正内容が大きい場合だけ必要な範囲を再レビューする。

仕様や設計を変える必要が出た場合は `REPLAN_REQUIRED` とする。

---

## 22. Plannotator Code Review

自動レビューは必須とする。

Plannotator Code Review は設定で有効・無効を切り替える。

デフォルトは無効とする。

有効な場合は、Plannotator の承認が得られるまで完了扱いにしない。

---

## 23. 設定

Pi 標準の設定ファイルを利用する。

```text
Global
~/.pi/agent/settings.json

Project
.pi/settings.json
```

`pi-taskflow` の設定は `taskflow` の下に置く。

```json
{
  "taskflow": {
    "plannotatorCodeReview": false
  }
}
```

v1 の独自設定はこの1項目だけとする。

Agent の model や thinking level は `subagents` 側で設定する。

Work Item の保存先は `to-tickets` 側の設定を使う。

設定取得専用の `taskflow_config` tool は作らない。

設定が必要な処理が Extension 内部で Pi の有効な設定を読み込む。

---

## 24. 保存と復旧

原則:

> タスクをまたいで必要な情報だけ保存する。

主に保存するもの:

- Approved Plan
- Work Items
- 必要な `GLOSSARY.md`
- 必要な ADR
- 実装されたコード
- PR
- 後から確認する価値がある動作確認結果

通常は保存しないもの:

- Scout の途中結果
- 外部調査の途中結果
- Grilling の会話全文
- Probe の作業ファイル
- Oracle の回答全文
- 子 Agent の実行情報
- Review の下書き
- 修正用 prompt

タスク内部の正確な途中状態を保存して復旧することは v1 の目的にしない。

Implementation が途中で失敗した場合は、Approved Plan と Work Item から新しいセッションで再実行できることを優先する。

---

## 25. 安全上のルール

1. Approved Plan がない状態で Work Item を正式公開しない。
2. Work Item と Approved Plan がない状態で Implementation を開始しない。
3. Agent が確認できる事実をユーザーに判断させない。
4. 不明な事実は調査または Probe で確認する。
5. Worker は Plan を勝手に変更しない。
6. 実際の動作確認なしで成功扱いしない。
7. Worker の自己申告だけを成功の証拠にしない。
8. Reviewer の指摘は Root Agent が判断する。
9. Plan の変更が必要なら `REPLAN_REQUIRED` とする。
10. 子 Agent は勝手に merge、release、deploy しない。
11. Plannotator Code Review が有効な場合はユーザー承認を必須とする。
12. Lock や共有 State を増やす前に、処理を分けられないか検討する。

---

## 26. v1 で作らないもの

- Workflow 全体の StateStore
- ArtifactStore
- WorkflowLock
- CAS
- Workflow TUI
- 進捗カード
- 大量の中間 artifact
- 独自の Tracker framework
- 独自の Researcher
- pi-ketch tool の child 配線
- 自動 merge
- 自動 deploy
- pstack への実行時依存

---

## 27. まとめ

`pi-taskflow` は、複雑な状態管理システムを作ることを目的にしない。

中心となる考え方は次の4点である。

```text
Planning と Implementation を分ける

決まった内容だけを Plan に残す

Work Item ごとに適切な実装手順を選ぶ

実装後は実際の結果を確認する
```
