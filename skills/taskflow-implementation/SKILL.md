---
name: taskflow-implementation
description: Implement a Work Item in a new Pi session using its referenced Approved Plan. Inspect current code, delegate to built-in worker, verify actual behavior, run independent Correctness and Ponytail reviews, and honor the taskflow_code_review approval gate. Report READY_FOR_MERGE, BLOCKED, REPLAN_REQUIRED, or FAILED without merging, releasing, or deploying.
disable-model-invocation: true
---

# Taskflow Implementation

Root Agent が全体の進行、Playbook の選択、子 Agent への依頼、指摘の採否、最終判断を担当する。
Planning とは別の新しい Root セッションで開始し、正式な入力は Work Item と参照された Approved Plan だけとする。
Planning の会話履歴に依存せず、永続化された Planning Scout 出力も再利用しない。必要なコードは現在のリポジトリから改めて確認する。

## 1. Work Item と Approved Plan を取得する

主入力は Work Item の参照（GitHub Issue URL / 番号、local ticket path など）。
Work Item の取得前に、対象プロジェクトのルートにある `docs/agents/issue-tracker.md` を直接 read する。AGENTS.md / CLAUDE.md やそこからのリンクに依存しない。

- 設定が存在する場合は対象 tracker、repo / 保存先、Work Item と依存の取得ルールを確認し、既存の公開 API で取得する。
- ファイル不存在と読み取り権限等の失敗を区別する。既存設定を読めない場合は未設定扱いで進まず、`BLOCKED` として理由と再開条件を報告する。
- 設定と明示された Work Item の URL / local path 等の参照が矛盾する場合は、取得先や設定を勝手に変更せず、コード変更・Worker 起動前に `BLOCKED` としてユーザーに確認する。
- 設定がなくても、明示された URL / local path と既存の公開 API で取得先が確定する入力は維持する。番号だけで対象が曖昧なら推測せず `BLOCKED` とする。

Implementation では tracker 設定の作成・更新・セットアップを行わない。不足があれば報告して停止する。
取得先を確認した上で、本文、完了条件、コメント、`Blocked by` を含む最新の内容を取得する。

対象 Work Item の取得先・識別が確認できた直後、Approved Plan / blocker gate による停止より前かつ Worker 起動前に、Root に `taskflow_evaluation_link` が提示され利用可能な場合だけ `{ operation: "implementation", issue: <取得確認済み ref> }` を Root が通知する。
GitHub ref は https の完全な Issue URL または `{ kind: "github", host, owner, repo, number }` の明示構造、local ref は現在 cwd 内の project-relative ticket path を使う。番号だけやタイトルから推測せず、Taskflow ID を手入力しない。
Tool 未導入・非アクティブ・通知失敗・保存未確認・未保存 leaf による追加停止・呼び忘れでも、本体の入力・進行・承認条件は変えない。通知のための保存待ち・再解決・補修手順、独自 Tool / manifest / collector、終了認定は追加しない。その後 `BLOCKED` / `REPLAN_REQUIRED` になる実行も通知対象だが、通知の成否は以下の通常の停止・承認 gate を緩める理由にはしない。

Work Item のリンクや正式なパスから Approved Plan を解決し、関係する設計・仕様・ADR も読む。
local ticket の相対リンクは ticket の場所を基準に解決する。Plan の参照が曖昧なら推測で別の Plan を採用しない。

コード変更や Worker 起動の前に、次のすべてを確認する。

- Work Item を取得できる。
- Work Item が参照する Approved Plan を取得でき、承認済みの正式な内容として確認できる。Draft や会話中の案で代用しない。
- `Blocked by` などに列挙された依存 Work Item をすべて取得し、実際に作業開始を妨げる依存が完了している。単なる関連リンクとは区別するが、根拠なく blocker を除外しない。GitHub の close だけで完了とせず、完了理由・結果を確認する。状態不明や未完了なら止める。
- 今回の完了条件と検証方法を理解できる。`ready-for-agent` 等の label だけを開始許可の根拠にしない。
- 未解決のユーザー判断が残っていない。事実はコードや資料から調べ、ユーザーしか決められない内容は Root が確認し、解決まで開始しない。

入力不足、未完了の blocker、不明な完了条件、未決定の判断は `BLOCKED` とし、理由と再開条件を報告する。
Work Item、Approved Plan、現在のリポジトリが矛盾し、Plan の前提・仕様・設計を変える必要がある場合は `REPLAN_REQUIRED` として停止する。
Root も Worker も未承認の Plan 変更、別 Work Item の実装、範囲拡大で解消しない。

## 2. 現在の Work Item から Playbook を選ぶ

Root Agent が名前や Planning 全体の種別ではなく、現在の Work Item の実際の内容から選ぶ。
Planning が Feature でも、各 Work Item が Feature とは限らない。分類だけのために追加の LLM 呼び出しを行わない。

- 新しい動作、動作変更は [Feature Playbook](references/playbooks/feature.md) を読む。
- 期待と異なる動作の修正は [Bug Fix Playbook](references/playbooks/bug-fix.md) を読む。
- 動作を変えない構造変更は [Refactoring Playbook](references/playbooks/refactoring.md) を読む。
- 計測できる性能問題は [Performance Playbook](references/playbooks/performance.md) を読む。
- `hotfix` は原則 Bug Fix。`chore` は名前ではなく内容から判断する。
- 専門種別に当てはまらない作業は、Approved Plan の検証方法に従って共通手順を使う。`generic` Playbook は作らない。

Skill 内の参照パスはこの Skill のディレクトリを基準に解決する。
利用する Skill は実行前に読み、Agents / tools は公開 `pi-subagents` API に従って使う。
必要なコンポーネントが利用できない場合は `BLOCKED` とし、独自 Agent、代替 tool、child Extension 配線で置き換えない。
Agent の model / thinking level は `subagents` の設定に任せ、この workflow に設定しない。

## 3. 現在のコードを確認する

プロジェクトの規約、関連コード、入口と処理の流れ、呼び出し元、公開インターフェース、テスト、設定、変更の影響を確認する。
小さい変更は Root Agent が直接確認してよい。範囲が広い場合は built-in `scout` を `context: "fresh"` で使い、調査範囲と問い、コードを変更しないことを指定する。
大量のコード本文ではなく、根拠となるパス、重要な事実、制約、不明点を受け取る。
Planning Scout 出力を入力にせず、現在の Work Item に必要な事実だけを調べる。
Scout の報告のうち、実装方針・変更範囲・既存動作の維持に影響する重要な事実は、Root が根拠となるコード・テスト・設定などの一次情報を直接確認してから Worker に渡す。
確認できない重要な前提は推測で補わず、必要な追加調査や実行確認を行う。

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

Worker に以下の境界を明示し、Root 自身の判断・依頼・受入れにも適用する。

- Plan にない仕様変更、未承認の設計判断、独自の範囲拡大をしない。
- 未指定の挙動を「安全側」という理由だけで、新しい拒否条件、関連付け条件、永続状態、復旧契約などにしない。Root は追加しようとする挙動の必要性を、Work Item / Approved Plan、既存契約・プロジェクト規約、または具体的な安全性・データ整合性上のリスクに照らして確認する。
- 第三者依存を変更せず、不要な抽象化、状態管理、永続化、設定、infrastructure を追加しない。
- merge、release、deploy をしない。
- Plan の前提・仕様・設計を変える必要があれば作業を止め、理由と現在の変更を Root Agent に返す。Root は `REPLAN_REQUIRED` を判断し、未承認の変更を続行させない。

Worker から相談された場合も、Root は通常の実装詳細と未決定の仕様・設計判断を区別する。
通常の実装詳細は Root が判断する。既存仕様の不明点は調査し、必要な場合だけユーザーに確認する。
ユーザーの回答を含め、Approved Plan の前提・仕様・設計を変える必要がある場合は `REPLAN_REQUIRED` として停止する。ユーザーの回答を、改訂 Plan の正式な承認の代わりにしない。
未決定のユーザー判断が残る間は `BLOCKED` とし、開始・続行しない。再計画後は正式な Approved Plan と、それに整合する Work Item を確認してから再開する。

Worker 実行中は同じファイルを別の writer が変更しない。失敗や部分実装を成功扱いせず、Root が実際の差分と結果を確認する。

## 5. リポジトリのチェックを行う

Worker の終了後、Root が実際の変更を確認し、プロジェクトで正式に定義された関連チェックとテストを実行する。
実行したコマンド、終了コード、成功 / 失敗、実行できなかった理由を確認する。Worker の自己申告だけを成功の証拠にしない。
チェックが失敗した場合は原因を確認し、今回の範囲内の不具合なら修正を依頼する。未解決の失敗は完了扱いにしない。
lint などが成功終了しても、警告を確認する。今回の変更に起因する警告は、原因を確認して必要最小限の修正を依頼する。
既存の警告は今回の変更との関係と影響を判断し、無関係な一括修正はしない。
警告を残す場合は理由と影響を報告し、必要な是正をルールの無効化や根拠のない抑制で代用しない。
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

Correctness Review では、テストの成功や観測された挙動だけで、実装が要求に適合していると判断しない。テストの期待値と直接検証の期待結果も、Work Item / Approved Plan の要求動作と照合する。
Root は、要求の解釈や重要な前提の確認に必要な資料・参照箇所も Correctness Reviewer に渡す。Reviewer は必要に応じてそれらを確認し、Approved Plan に明示された承認済みの変更を考慮する。変更前の資料を無条件に優先しない。

Reviewer は原則コードを変更せず、根拠のある指摘を Root Agent に返す。Worker の自己申告だけを入力や成功の証拠にしない。
Reviewer から Worker に直接修正を指示させない。レビューの実行失敗や未取得の結果を「指摘なし」と扱わない。

## 8. Root が指摘を整理して修正する

Review 指摘は、そのまま修正仕様や範囲拡大の許可にはならない。
Root は採用前に、今回の完了条件、維持すべき既存動作、安全性・データ整合性との関係を確認し、問題を解消するために必要な最小の修正範囲を判断する。
その関係は具体的な影響と根拠で確認する。「安全側」という理由だけで、今回使わない情報の検証や対象外の問題解決へ範囲を広げない。
完了条件に明記されていない既存動作の回帰や security・データ整合性の問題も、具体的な関係と根拠があれば修正対象として判断する。
Root Agent が次を区別して理由を示す。

- 今回直す（accepted findings）
- 今回は直さない（不採用、対象外、別 Work Item で扱うもの）

重大な問題が現 Plan の範囲内で修正可能なら修正する。指摘への対応で新しい仕様・設計判断が必要になった場合は、Worker に実装させる前に section 4 の確認・再計画手順へ戻る。
Plan の変更が必要なら `REPLAN_REQUIRED` とする。解消できない場合は、既存の停止・失敗状態として原因と再開条件を報告する。
「過剰実装を避ける」ことを理由に、必要な trust boundary の検証、セキュリティ対策、データ整合性の保護、エラー処理を省略せず、重大な問題を未解決のまま完了扱いにしない。
採用した指摘は、可能な限り単一の correction request にまとめ、built-in `worker` に同じ境界を守って修正を依頼する。
修正後は実際の差分を再確認し、影響したチェックと直接検証を再実行する。
修正の大きさやリスクから必要な場合だけ、影響範囲を fresh `reviewer` で再レビューする。小さい修正に無条件の全レビュー loop を追加しない。

## 9. 必ず taskflow_code_review を呼ぶ

自動レビューと必要な修正・再確認が完了した後、最終完了の前に Root が `taskflow_code_review` を呼ぶ。
この tool が Pi の有効な `taskflow.plannotatorCodeReview` 設定を内部で解決するため、独自の設定読み込みや `taskflow_config` tool を作らない。未設定時は有効で、明示的な `false` の場合のみ無効になる。

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
