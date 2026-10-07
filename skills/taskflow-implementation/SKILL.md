---
name: taskflow-implementation
description: Implement a Work Item in a new Pi session using its referenced Approved Plan. Inspect current code, delegate to built-in worker, verify actual behavior, run independent Correctness and Ponytail reviews, and honor the taskflow_code_review approval gate. Report READY_FOR_MERGE, BLOCKED, REPLAN_REQUIRED, or FAILED without merging, releasing, or deploying.
---

# Taskflow Implementation

Root Agent が全体の進行、Playbook の選択、子 Agent への依頼、指摘の採否、最終判断を担当する。
Planning とは別の新しい Root セッションで開始し、正式な入力は Work Item と参照された Approved Plan だけとする。
Planning の会話履歴に依存せず、永続化された Planning Scout 出力も再利用しない。必要なコードは現在のリポジトリから改めて確認する。

## 1. Work Item と Approved Plan を取得する

主入力は Work Item の参照（GitHub Issue URL / 番号、local ticket path など）。
プロジェクトの既存の tracker / 公開 API を使い、本文、完了条件、コメント、`Blocked by` を含む最新の内容を取得する。
Work Item のリンクや正式なパスから Approved Plan を解決し、関係する設計・仕様・ADR も読む。
local ticket の相対リンクは ticket の場所を基準に解決する。Plan の参照が曖昧なら推測で別の Plan を採用しない。

コード変更や Worker 起動の前に、次のすべてを確認する。

- Work Item を取得できる。
- Work Item が参照する Approved Plan を取得でき、承認済みの正式な内容として確認できる。Draft や会話中の案で代用しない。
- `Blocked by` などに列挙された依存 Work Item をすべて取得し、実際に作業開始を妨げる依存が完了している。単なる関連リンクとは区別するが、根拠なく blocker を除外しない。GitHub の close だけで完了とせず、完了理由・結果を確認する。状態不明や未完了なら止める。
- 今回の完了条件と検証方法を理解できる。
- 未解決のユーザー判断が残っていない。事実はコードや資料から調べ、ユーザーしか決められない内容は Root が確認し、解決まで開始しない。

入力不足、未完了の blocker、不明な完了条件、未決定の判断は `BLOCKED` とし、理由と再開条件を報告する。
Work Item、Approved Plan、現在のリポジトリが矛盾し、Plan の前提・仕様・設計を変える必要がある場合は `REPLAN_REQUIRED` として停止する。
Root も Worker も未承認の Plan 変更、別 Work Item の実装、範囲拡大で解消しない。

## 2. 現在の Work Item から Playbook を選ぶ

Root Agent が名前や Planning 全体の種別ではなく、現在の Work Item の実際の内容から選ぶ。
Planning が Feature でも、各 Work Item が Feature とは限らない。分類だけのために追加の LLM 呼び出しを行わない。

- 新しい動作、動作変更は [Feature Playbook](references/playbooks/feature.md) を読む。
- 期待と異なる動作の修正は Bug Fix、動作を変えない構造変更は Refactoring、計測できる性能問題は Performance として識別する。
- `hotfix` は原則 Bug Fix。`chore` は名前ではなく内容から判断する。
- この初期フローで提供する専門 Playbook は Feature のみ。他の専門手順は別途追加されるため、ここで再実装しない。それらや専門種別に当てはまらない作業は、Approved Plan の検証方法に従って共通手順を使う。`generic` Playbook は作らない。

Skill 内の参照パスはこの Skill のディレクトリを基準に解決する。
利用する Skill は実行前に読み、Agents / tools は公開 `pi-subagents` API に従って使う。
必要なコンポーネントが利用できない場合は `BLOCKED` とし、独自 Agent、代替 tool、child Extension 配線で置き換えない。
Agent の model / thinking level は `subagents` の設定に任せ、この workflow に設定しない。

## 3. 現在のコードを確認する

プロジェクトの規約、関連コード、入口と処理の流れ、呼び出し元、公開インターフェース、テスト、設定、変更の影響を確認する。
小さい変更は Root Agent が直接確認してよい。範囲が広い場合は built-in `scout` を `context: "fresh"` で使い、調査範囲と問い、コードを変更しないことを指定する。
大量のコード本文ではなく、根拠となるパス、重要な事実、制約、不明点を受け取る。
Planning Scout 出力を入力にせず、現在の Work Item に必要な事実だけを調べる。

正式なチェックは package scripts、Makefile などの task 定義、CI、README / 開発ドキュメントから確認する。
設定ファイルの存在だけで lint / formatter / typecheck コマンドを推測しない。不足する lint / formatter infrastructure を勝手に追加しない。
Work Item ごとの直接検証方法も確認し、リポジトリのチェックとは区別する。
既存の公開 API、Skills、Extensions、Agents、依存関係を優先し、Approved Plan の範囲で必要最小限の変更を決める。
実装開始前の差分を確認し、既存のユーザー変更や別 Work Item の変更を巻き込まない。

## 4. fresh Worker に実装を依頼する

実装には `pi-subagents` の built-in `worker` を新しいコンテキストで使う。Root は Implementation 全体や承認判断を委譲しない。
Worker への依頼は現在の Work Item に必要な情報だけとし、次を含める。

- Work Item の参照と今回の内容
- relevant Approved Plan sections（正式な参照と関係部分）
- completion criteria
- constraints / out-of-scope items
- verification method（正式なチェックと直接検証方法、期待結果）
- relevant facts discovered from the current code（根拠となるファイルと重要事項）
- 対象 cwd と編集範囲、結果として変更ファイル・実行結果・未解決事項を報告すること

公開 tool の最小の呼び出しは次の形。

```js
subagent({
  agent: "worker",
  context: "fresh",
  task: "上記の必要情報と編集範囲を含む実装依頼"
})
```

Planning の会話全文、Scout の途中結果、無関係な Plan sections を渡さない。
Ponytail Extension は常時有効であるため、Worker に `ponytail` Skill を明示的に追加しない。
Approved Plan が TDD を指定している場合だけ、既存の `tdd` Skill を Worker に指定し、承認済みの公開インターフェースをテストする。

Worker に以下の境界を明示する。

- Plan にない仕様変更、未承認の設計判断、独自の範囲拡大をしない。
- 第三者依存を変更せず、不要な抽象化、状態管理、永続化、設定、infrastructure を追加しない。
- merge、release、deploy をしない。
- Plan の前提・設計を変える必要があれば作業を止め、理由と現在の変更を Root Agent に返す。Root は `REPLAN_REQUIRED` を判断し、未承認の変更を続行させない。

Worker 実行中は同じファイルを別の writer が変更しない。失敗や部分実装を成功扱いせず、Root が実際の差分と結果を確認する。

## 5. リポジトリのチェックを行う

Worker の終了後、Root が実際の変更を確認し、プロジェクトで正式に定義された関連チェックとテストを実行する。
実行したコマンド、終了コード、成功 / 失敗、実行できなかった理由を確認する。Worker の自己申告だけを成功の証拠にしない。
チェックが失敗した場合は原因を確認し、今回の範囲内の不具合なら修正を依頼する。未解決の失敗は完了扱いにしない。
既存の失敗や環境制約も隠さず報告し、完了条件を証明できないまま `READY_FOR_MERGE` にしない。

## 6. 完了条件を直接検証する

リポジトリのチェックとは別の工程として、Approved Plan の方法で Work Item の実際の結果を確認する。
API は実際のリクエスト、CLI は実行、UI は操作など、可能な範囲で実際の入口から新しい動作と維持する動作を観測する。
テスト / lint が通ったことだけでこの工程を済ませない。期待結果、観測結果、未確認の条件を区別する。
実行できない場合は理由と代替の根拠を明記する。必須の完了条件が未確認なら止める。
途中結果の専用保存機構は作らない。

## 7. 独立した2つの fresh Review を行う

動作確認後、別々の新しいコンテキストで次の両方を実行する。Worker の self-review で置き換えない。

1. **Correctness Review**: built-in `reviewer`、`context: "fresh"`。完了条件、Approved Plan との整合、不具合・回帰、テストと直接検証の不足を確認する。
2. **Ponytail Review**: 別の built-in `reviewer`、`context: "fresh"`、`skill: "ponytail-review"`。不要な範囲、抽象化、既存機能や標準機能の再実装を確認する。

両 Reviewer に必要な範囲で Work Item、Approved Plan、実際の差分（参照できるファイルと確認方法を含む）、repository-check results、direct verification results を渡す。
Reviewer は原則コードを変更せず、根拠のある指摘を Root Agent に返す。Worker の自己申告だけを入力や成功の証拠にしない。
Reviewer から Worker に直接修正を指示させない。レビューの実行失敗や未取得の結果を「指摘なし」と扱わない。

## 8. Root が指摘を整理して修正する

Root Agent が各指摘の根拠、影響、今回の範囲を確認し、次を区別して理由を示す。

- 今回直す（accepted findings）
- 今回は直さない（不採用、対象外、別 Work Item で扱うもの）

重大な問題を未解決のまま完了にしない。仕様や設計を変える指摘なら `REPLAN_REQUIRED` として停止する。
採用した指摘は、可能な限り単一の correction request にまとめ、built-in `worker` に同じ境界を守って修正を依頼する。
修正後は実際の差分を再確認し、影響したチェックと直接検証を再実行する。
修正の大きさやリスクから必要な場合だけ、影響範囲を fresh `reviewer` で再レビューする。小さい修正に無条件の全レビュー loop を追加しない。

## 9. 必ず taskflow_code_review を呼ぶ

自動レビューと必要な修正・再確認が完了した後、最終完了の前に Root が `taskflow_code_review` を呼ぶ。
この tool が Pi の有効な `taskflow.plannotatorCodeReview` 設定を内部で解決するため、独自の設定読み込みや `taskflow_config` tool を作らない。

- `status: "skipped"`: Code Review 無効。Plannotator を開かず、この gate は完了を妨げない。2つの自動レビューは省略しない。
- `status: "approved"` かつ `approved: true`: Code Review 有効時の明示的なユーザー Approve。この結果だけを承認とする。
- Reject: Root が `feedback` の採否を判断する。設計変更なら `REPLAN_REQUIRED`。範囲内の修正なら Worker にまとめて依頼し、影響したチェック・直接検証と必要な再レビューの後に再提出する。修正後の差分に対する Approve が必要。
- Cancel、ブラウザを閉じる・放置すること、利用不可、不正な設定・応答、tool エラーは承認ではない。承認待ちやコンポーネント不足なら `BLOCKED`、実行失敗なら `FAILED` とし、成功として終了しない。

## 10. 最終状態を報告して終了する

Work Item とすべての完了条件を個別に読み直し、最終差分を correctness、regressions、不要な範囲・抽象化、偶発的な変更の観点で確認する。
最終回答で次のいずれかを明示する。専用の永続 State や結果オブジェクトは作らない。

- `READY_FOR_MERGE`: 全完了条件を満たし、関連チェック・直接検証・2つの自動レビューが完了、採用した指摘が解決済み、Code Review gate は skipped または明示的に approved。
- `BLOCKED`: 入力・依存・ユーザー判断・承認・必要なコンポーネントなどが不足。理由と再開条件を示す。
- `REPLAN_REQUIRED`: Approved Plan の前提・仕様・設計を変える必要がある。矛盾と再計画が必要な範囲を示す。
- `FAILED`: 実装・チェック・検証・レビューなどが失敗して未解決。部分変更と失敗の根拠を示す。

変更内容、実行したチェック / テストと結果、直接検証、完了条件ごとの状態、指摘の採否、残るリスク・未解決事項を簡潔に報告する。
`READY_FOR_MERGE` は merge の許可や実行ではない。ここで終了し、merge、release、deploy、無関係な follow-up を実行しない。
