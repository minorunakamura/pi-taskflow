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
既存の文書構成・規約と Plan / Work Item に残された必要な文書更新・保存先も確認する。文書分担は既存規約を優先し、未定義時だけ [Planning Skill §5](../taskflow-planning/SKILL.md#5-設計と検証方法を固める) の既定に従う。必要な文書をその分担に従って更新し、詳細を安易に README へ集約せず、README がある場合は必要な詳細へ辿れるようにする。4種の一律作成、空の雛形、CONTRIBUTING の一律新設、既存文書の一括移動は要求しない。
小さい変更は Root Agent が直接確認してよい。範囲が広い場合は built-in `scout` を `context: "fresh"` で使い、調査範囲と問い、コードを変更しないことを指定する。
大量のコード本文ではなく、根拠となるパス、重要な事実、制約、不明点を受け取る。
Planning Scout 出力を入力にせず、現在の Work Item に必要な事実だけを調べる。
Scout の報告のうち、実装方針・変更範囲・既存動作の維持に影響する重要な事実は、Root が根拠となるコード・テスト・設定などの一次情報を直接確認してから Worker に渡す。
確認できない重要な前提は推測で補わず、必要な追加調査や実行確認を行う。

正式なチェックは package scripts、Makefile などの task 定義、CI、README / 開発ドキュメントから確認する。
設定ファイルの存在だけで lint / formatter / typecheck コマンドを推測しない。不足する lint / formatter infrastructure を勝手に追加しない。
Work Item ごとの直接検証方法も確認し、リポジトリのチェックとは区別する。

Plan / Work Item が引き継いだ検証資産の参照・選ぶ機能・適否と不足・必要な作成更新範囲と最小補完裁量・制約を確認し、現在の検証 Skill・具体的な手順・必要な helper / harness・Feature Map を改めて読む。Root は、別の Agent が会話履歴なしで、今回必要な実動作検証の起動・操作・期待結果との照合・証拠取得・cleanup まで実行できるかを現物から判断し、文書の名前や存在だけで充足したとはしない。

- 既存手段で充足すれば再利用し、重複生成しない。不足時は、Planning で未予定でも、承認済みの保証対象・対象外・期待結果を維持する最小の Create / 関連更新を Root が判断する。「Create の予定なし」を禁止とせず、採否変更や未予定の Skill / helper 追加だけでは再計画・追加承認を要求しない。
- 小規模、通常テストや起動コマンドの存在、恒久 E2E 不採用、反復利用の予定なしだけを不採用理由にしない。使い捨て操作コードで不足を補おうとしている場合も資産として整える必要性を判断するが、全試行の保存や通常テスト・探索 Probe の一律資産化は要求しない。
- ユーザーの明示禁止、規約、既存 Approved Plan の制約は上書きせず、抵触する場合は確認する。正式 Plan の制約・保証・期待結果、製品の公開契約・仕様・設計の変更が必要なら section 4 の確認・REPLAN_REQUIRED 経路へ戻る。必要な共通 Skill / 権限がないだけなら不足と再開条件を示して `BLOCKED` とし、独自代替や無断 install で回避せず、自動的に再計画へ送らない。

Create を利用する際は共通 `create-verification-skill` の実ファイルを明示 read する。公開入口は `/skill:create-verification-skill <対象機能・検証範囲などの自由文>`、検証対象 repository が cwd であり、独自 wrapper・parser や固定 checkout を要求しない。必要な Skill を取得できなければ section 2 の `BLOCKED` 経路を使う。
配置・発見・証拠・安全性の詳細は共通 Skill と対象プロジェクトの規約に従い、Taskflow 側で再定義しない。

- 既存規約がなければ生成先は `.pi/skills/verify-project/`、Map は `references/feature-map.md`。Pi 標準探索と project trust、新セッションまたは `/reload`、明示呼び出しまたは実ファイルの read で利用し、自動選択は保証しない。
- 証拠は既存規約を優先し、なければ `.pi/verification-evidence/<run>/`。Git 管理対象外を基本に、必要最小限の ignore 更新、秘密情報の取得回避、安全な環境分離、自分が作った環境だけの cleanup と cleanup 後の証拠参照確認を共通契約どおり行う。
- Map の再利用手順・期待結果と、今回の観測・成否を示す実行記録を区別し、過去の成功を変更後の成功に流用しない。

Planning が選定した Approved Plan の保証対象・対象外、自動化範囲、対象別の TDD 採否を維持し、その範囲内で通常のテスト詳細を判断する。テスト設計・検証には次の共通基準を適用する。

- 要求と具体的な回帰リスクから保証したい動作・失敗を特定し、承認済み seam（公開境界）、必要な前提状態、最小の実用的な検証経路の順に判断する。
- 適切な既存テストを優先し、保証の重なりを確認する。保証に不要な fixture、履歴、remote、後続操作は準備・実行しない。前提状態を直接用意する場合も必要な整合条件を維持し、接続や状態遷移自体が保証対象ならその経路を実際に通す。
- 公開境界での検証は毎回 full pipeline を起動することと同義ではない。必要な実操作、操作前後など異なる時点の安全確認、必要な拒否条件、trust boundary、安全性、データ整合性、回帰確認は単純な重複として削らない。
- 保証が不足する場合は必要なテスト・検証を追加し、重さだけを理由に見送らない。必要な保証と恒久自動化の手段は区別し、Plan で対象外とした自動化や保証・設計を変える必要があれば section 4 の確認・再計画手順へ戻る。必要な実操作を mock で消したり、テスト専用の公開 API・抽象化を増やしたりして、保証や production code を歪めない。自動化から除外した結合部分を、小さいテストで同等に保証したことにしない。

既存の公開 API、Skills、Extensions、Agents、依存関係を優先し、Approved Plan の範囲で必要最小限の変更を決める。
実装開始前の差分を確認し、既存のユーザー変更や別 Work Item の変更を巻き込まない。

## 4. fresh Worker に実装を依頼する

実装には `pi-subagents` の built-in `worker` を新しいコンテキストで使う。Root は Implementation 全体や承認判断を委譲しない。
Worker への依頼は現在の Work Item に必要な情報だけとし、次を含める。

- Work Item の参照と今回の内容
- relevant Approved Plan sections（正式な参照と関係部分）
- completion criteria
- constraints / out-of-scope items
- verification method（保証対象・対象外、自動化範囲、対象別の TDD 採否、承認済み seam、整合条件を保った必要な前提状態と検証経路、再利用できる適切な既存テスト、正式なチェックと直接検証方法、期待結果）
- section 3 の共通基準のうち今回関係する内容と、Worker / Root の検証分担（fresh Worker が基準を既読と仮定せず、内容を渡す）
- 検証資産の参照・選ぶ機能・適否と不足、Root が判断した最小の作成更新範囲とその裁量・制約、必要時に明示 read する共通 Create とその初期対象、関係手順・helper・Map の更新後再実行、検証・証拠・cleanup の担当と Root の直接確認との分担
- 必要な文書更新と保存先、section 3 で確認した文書分担
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
Worker は対象テストと focused regression を実行し、共有処理など影響が広ければ検証範囲を広げる。Root が後で正式チェックを行うことだけを理由に必要な検証を省略させず、一方で Root と同じ全正式チェックを機械的に要求しない。実行結果と未確認事項は既存の結果報告に含める。
Ponytail Extension は常時有効であるため、Worker に `ponytail` Skill を明示的に追加しない。
Approved Plan が TDD を指定している対象にだけ、既存の `tdd` Skill を Worker に指定し、混在作業の未指定対象へ広げない。TDD にも section 3 の共通基準を適用し、承認済み seam で Red → Green を行う。Plan で承認済みの seam の再承認は求めない。未承認の seam や要件・公開契約・設計の変更が必要な場合は、以下の確認・再計画手順に従う。

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

検証資産の採否・範囲判断は Root が保持する。Worker が未予定の手段不足や制約との衝突を見つけた場合も Root に返し、Root が section 3 の境界で判断する。作成・更新の担当を明示し、同じ cwd に同時 writer を作らない。Worker 実行中は同じファイルを別の writer が変更しない。失敗や部分実装を成功扱いせず、Root が実際の差分と結果を確認する。

## 5. リポジトリのチェックを行う

Worker の終了後、Root が実際の変更を確認し、プロジェクトで正式に定義された関連チェックとテストを自ら実行する。
Worker の対象テスト・focused regression と Root の正式実行は分担が異なり、Root の実行を Worker の報告で代替しない。正式コマンドに full suite が含まれる場合、section 3 の共通基準を理由に間引かない。
Root に必要な正式実行を終えた後は、実行主体が変わったことだけを理由に同じ検証をさらに繰り返さない。修正後の再検証は section 8 に従う。
実行したコマンド、終了コード、成功 / 失敗、実行できなかった理由を確認する。Worker の自己申告だけを成功の証拠にしない。
チェックが失敗した場合は原因を確認し、今回の範囲内の不具合なら修正を依頼する。未解決の失敗は完了扱いにしない。
lint などが成功終了しても、警告を確認する。今回の変更に起因する警告は、原因を確認して必要最小限の修正を依頼する。
既存の警告は今回の変更との関係と影響を判断し、無関係な一括修正はしない。
警告を残す場合は理由と影響を報告し、必要な是正をルールの無効化や根拠のない抑制で代用しない。
既存の失敗や環境制約も隠さず報告し、完了条件を証明できないまま `READY_FOR_MERGE` にしない。

## 6. 完了条件を直接検証する

リポジトリのチェックとは別の工程として、Root が Approved Plan の方法で Work Item の実際の結果を自ら確認する。
API は実際のリクエスト、CLI は実行、UI は操作など、可能な範囲で承認済みの方法・実際の入口から新しい動作と維持する動作を観測する。section 3 の共通基準に従い、保証に無関係な前後工程まで毎回 full pipeline を再現することとは区別する。
テスト / lint の成功や Worker の成功報告だけでこの工程を済ませない。Root が期待結果、観測結果、未確認の条件を区別して確認する。
この直接確認を恒久テストや新しいテスト用プログラムの作成義務に変えず、Plan の承認済みの方法を使う。実際の手段が不足する場合は section 3 の境界で Root が最小補完を判断し、保証対象・対象外・期待結果を変えない。
実行できない場合は理由と代替の根拠を明記する。必須の完了条件が未確認なら止める。
検証資産を使う場合は今回関係する機能を実行し、変わった手順・helper・Map の関連部分だけ更新して、変更した検証方法も再実行する。`maintain-verification-skill` はユーザーの明示実行に限定し、Taskflow から自動起動せず、通常の関連更新に Maintain や無関係な全 Map 点検を要求しない。
Create 自体は少なくとも初期対象の一機能で生成手順の成立を確認するが、それだけで Work Item の全完了条件を満たしたとはしない。共通 Skill の実行・過去の証拠・Worker 報告で、変更後の Root による実際の入口からの直接確認・採否・最終受入れを代替しない。保証・設計の変更が必要なら section 4 の確認・再計画経路へ戻る。
必要な文書更新と保存先が Plan / Work Item と section 3 の文書分担に整合し、README がある場合は必要な詳細へ辿れることも確認する。
Taskflow 独自の途中結果保存基盤は作らない。共通 Skill と対象規約に従う検証証拠の保存はこれと区別し、通常テスト・正式チェック・使い捨て Probe を一律に資産化したり、全証拠の commit や保持期限管理を追加したりしない。

## 7. 独立した2つの fresh Review を並行起動する

動作確認後、別々の fresh context の built-in `reviewer` を、一方の結果を待たずに並行起動する。直列化、一人への統合、Worker の self-review で置き換えない。

1. **Correctness Review**: 完了条件、Approved Plan との整合、不具合・回帰、テストと直接検証の不足、および期待結果自体の正式要求との整合を確認する。
2. **Ponytail Review**: この Reviewer だけに `ponytail-review` を明示指定し、不要な範囲、抽象化、既存機能や標準機能の再実装を確認する。

両 Reviewer に必要な範囲で Work Item、Approved Plan、要求の解釈や重要な前提に関係する設計・仕様等の資料と参照箇所、対象 cwd、実際の差分（参照できるファイルと確認方法を含む）、Root の正式な repository-check results、直接検証の期待結果・観測結果・証拠と未確認範囲を渡す。Plan の保証対象・対象外、自動化範囲、対象別の TDD 採否（非 TDD を含む）と Worker / Root の検証分担も含める。

独立した2回の非同期 `subagent` 呼び出しを基本とし、具体的な引数配置は導入済み `pi-subagents` の公開 Skill / guide で確認する。`context` / `skill` が `options` 内の導入版では、上記の入力と各責務を `task` に含め、次の2呼び出しを一方の結果を待たずに行う。

```js
subagent({
  agent: "reviewer",
  task: "必要な正式入力・関係資料・差分・Root の検証結果を含む Correctness Review 依頼。原則 read-only。",
  options: { context: "fresh" },
  async: true
})
subagent({
  agent: "reviewer",
  task: "同じ必要入力を含む Ponytail Review 依頼。提示された ponytail-review の実ファイルを read して利用し、その参照と確認結果を報告する。原則 read-only。",
  options: { context: "fresh", skill: "ponytail-review" },
  async: true
})
```

named `parallel.args.tasks[]` に `skill` / `context` を入れない。scripted workflow を使う場合も公開 API に従い、`workflow: true` と `options.script` を併用しない。専用 wrapper・Agent 定義・workflow ファイルは追加しない。
`skill` 指定は Skill の metadata / path を子に提示するもので、本文の利用を自動的に保証しない。Root は既存の起動記録・child 情報・結果から、別 run・両方の fresh・一方を待たない両起動と、Ponytail 側だけの Skill 解決・提示、および実ファイルの read と利用を確認する。未解決は warning のみで起動する場合があるため、起動成功だけで済ませない。
独立レビュー自体は無条件の全 suite 再実行を意味しない。各 Reviewer は確認した差分・結果・不足とリスクから必要な追加検証を判断し、必要な追加実行は妨げない。

Correctness Review では、テストの成功や観測された挙動だけで、実装が要求に適合していると判断しない。テストの期待値と直接検証の期待結果も、Work Item / Approved Plan の要求動作と照合する。
Reviewer は必要に応じて関係資料を確認し、Approved Plan に明示された承認済みの変更を考慮する。変更前の資料を無条件に優先しない。

Reviewer は原則コードを変更せず、根拠のある指摘を Root Agent に返す。Worker の自己申告だけを入力や成功の証拠にしない。
Reviewer から Worker に直接修正を指示させない。Root は両方の結果を取得する。起動・実行失敗、結果未取得、Ponytail の Skill 未解決を「指摘なし」と扱わず、片方だけで Code Review gate に進まない。不足や失敗は既存の `BLOCKED` / `FAILED` 経路で理由と再開条件を報告する。

## 8. Root が指摘を整理して修正する

Root は両方の Review 結果を取得した後に指摘の採否と必要な修正・再検証を判断する。Review 指摘は、そのまま修正仕様や範囲拡大の許可にはならない。
Root は採用前に、今回の完了条件、維持すべき既存動作、安全性・データ整合性との関係を確認し、問題を解消するために必要な最小の修正範囲を判断する。
その関係は具体的な影響と根拠で確認する。「安全側」という理由だけで、今回使わない情報の検証や対象外の問題解決へ範囲を広げない。検証不足の指摘は不足する具体的な保証に結び付け、一般論で重い自動化を追加しない。対象外の自動化や Plan の保証・設計の変更が必要なら section 4 の確認・再計画手順へ戻る。
完了条件に明記されていない既存動作の回帰や security・データ整合性の問題も、具体的な関係と根拠があれば修正対象として判断する。
Root Agent が次を区別して理由を示す。

- 今回直す（accepted findings）
- 今回は直さない（不採用、対象外、別 Work Item で扱うもの）

重大な問題が現 Plan の範囲内で修正可能なら修正する。指摘への対応で新しい仕様・設計判断が必要になった場合は、Worker に実装させる前に section 4 の確認・再計画手順へ戻る。
Plan の変更が必要なら `REPLAN_REQUIRED` とする。解消できない場合は、既存の停止・失敗状態として原因と再開条件を報告する。
「過剰実装を避ける」ことを理由に、必要な trust boundary の検証、セキュリティ対策、データ整合性の保護、エラー処理を省略せず、重大な問題を未解決のまま完了扱いにしない。
採用した指摘は、可能な限り単一の correction request にまとめ、built-in `worker` に同じ境界を守って修正を依頼する。
テスト側の同期・入力手順の問題と製品不具合を区別し、根拠のない再試行や timeout 延長で失敗を隠して解決扱いにしない。
修正後は Root が実際の差分を再確認し、section 3 の共通基準で修正が影響した保証を選び直し、必要なチェックと直接検証を自ら再実行する。共有処理など影響が広い場合は full suite も実行する。変更前の成功を、影響した変更後の保証に流用しない。
修正の大きさやリスクから必要な場合だけ、影響範囲を fresh `reviewer` で再レビューする。小さい修正に無条件の全レビュー loop を追加しない。

## 9. 必ず taskflow_code_review を呼ぶ

両方の自動レビュー結果を取得し、Root の採否判断、必要な修正・影響に応じた再検証と必要時の再レビューが完了した後、最終完了の前に Root が `taskflow_code_review` を呼ぶ。
この tool が Pi の有効な `taskflow.plannotatorCodeReview` 設定を内部で解決するため、独自の設定読み込みや `taskflow_config` tool を作らない。未設定時は有効で、明示的な `false` の場合のみ無効になる。

- `status: "skipped"`: Code Review 無効。Plannotator を開かず、この gate は完了を妨げない。2つの自動レビューは省略しない。
- `status: "approved"` かつ `approved: true`: Code Review 有効時の明示的なユーザー Approve。この結果だけを承認とする。
- Reject: Root が `feedback` の採否を判断する。設計変更なら `REPLAN_REQUIRED`。範囲内の修正なら Worker にまとめて依頼し、section 8 の基準で再検証と必要な再レビューを行った後に再提出する。修正後の差分に対する Approve が必要。
- Cancel、ブラウザを閉じる・放置すること、利用不可、不正な設定・応答、tool エラーは承認ではない。承認待ちやコンポーネント不足なら `BLOCKED`、実行失敗なら `FAILED` とし、成功として終了しない。

## 10. 最終状態を報告して終了する

Work Item とすべての完了条件を個別に読み直し、最終差分を correctness、regressions、不要な範囲・抽象化、偶発的な変更の観点で確認する。
最終回答で次のいずれかを明示する。専用の永続 State や結果オブジェクトは作らない。

- `READY_FOR_MERGE`: 全完了条件を満たし、関連チェック・直接検証・2つの自動レビューが完了、採用した指摘が解決済み、Code Review gate は skipped または明示的に approved。
- `BLOCKED`: 入力・依存・ユーザー判断・承認・必要なコンポーネントなどが不足。理由と再開条件に加え、以下の再開案内を必ず示す。
- `REPLAN_REQUIRED`: Approved Plan の前提・仕様・設計を変える必要がある。矛盾と再計画が必要な範囲に加え、以下の再開手順を必ず示す。
- `FAILED`: 実装・チェック・検証・レビューなどが失敗して未解決。部分変更と失敗の根拠を示す。

変更内容、実行したチェック / テストと結果、直接検証、完了条件ごとの状態、指摘の採否、残るリスク・未解決事項を簡潔に報告する。
`READY_FOR_MERGE` は merge の許可や実行ではない。ここで終了し、merge、release、deploy、無関係な follow-up を実行しない。

### BLOCKED の再開案内

どの工程で `BLOCKED` になっても、最終回答に「再開するときは、このセッションの Pi に次を送ってください」と明記し、コピー可能な再開プロンプトを示す。ユーザーが再開方法を質問するまで待たず、ユーザー自身にコード確認・検証作業を命じるのではなく、同じ Root セッションの Pi に確認と続行を依頼する。

以下の雛形は、確認済みの cwd、Work Item 参照、今回の停止理由・未充足条件で具体化し、未確定点とは区別する。対象識別前なら元入力と未確定点を示し、その確認から Pi に依頼する。判断待ちなら回答が必要な問いも残す。未取得の URL・Plan 参照、ユーザー回答・承認、条件の解消結果を捏造せず、既知の値をユーザーが埋め直す雛形にしない。山括弧は確認済みの具体値または未確定である事実に置き換える。

```text
BLOCKED で停止した Implementation の再開可否を確認してください。
対象 cwd: <確認済みの cwd。未確定ならその事実と確認が必要な点>
対象 Work Item: <確認済みの参照。識別前なら元入力と未確定点を示し、対象確認から依頼>
停止理由: <今回停止した理由>
未充足条件: <続行に必要な条件>
未確定点・必要な問い: <未確認事項や回答が必要な問い。なければ「なし」>
現在の Work Item・Approved Plan・作業ツリーと停止条件の解消を確認し、条件を満たしていれば停止箇所から続行してください。
既存の未コミット変更・部分実装は保持してください。未充足の条件があれば停止を維持して報告してください。
```

プロンプトの提示・送信自体を、ユーザー回答・承認・依存完了や不足解消の証拠にしない。Pi が現在の情報で条件の解消を確認してから続行し、未充足なら `BLOCKED` を維持する。未コミット変更・部分実装を独断で commit / stash / 破棄せず、影響した変更前のチェック・Review・Approve を変更後の差分の証拠に流用しない。

再確認で正式 Plan の変更が必要なら、以下の既存 `REPLAN_REQUIRED` 経路へ戻る。通常の `BLOCKED` に新セッションや Planning を一律に要求せず、失敗後の新セッションでの再実行と区別する。`FAILED` を機械的に `BLOCKED` に読み替えず、自動再開・再試行・常駐待機・独自の復旧状態・追加 gate は作らない。

### REPLAN_REQUIRED の再開案内

どの工程で `REPLAN_REQUIRED` になっても、最終回答に、同じ対象プロジェクトの新しい Root セッションで [taskflow-planning Skill](../taskflow-planning/SKILL.md) を使うコピー可能な再計画の依頼文を示す。ユーザーが再開方法を質問するまで待たない。
Implementation 再開用の kickoff はここでは提示せず、改訂 Plan の明示的な Approve・正式保存と、それに整合する Work Item の確認・保存・公開が完了した後、Planning の最終回答で提示する旨を案内する。Plan 承認と Work Item の保存・公開承認は別であり、Planning 完了後も自動で実装を開始しない。

以下の雛形を、確認済みの対象 cwd、Work Item の完全な URL / local path、正式 Plan 参照、停止理由・変更要望で具体化する。未決定事項は未決定として示し、参照先を推測しない。会話履歴や Scout 出力を正式入力にせず、会話での変更要望を Plan 承認として扱わない。

```text
/skill:taskflow-planning <Work Item 参照> を再計画してください。
REPLAN_REQUIRED による再計画です。
対象 cwd: <対象プロジェクト>
正式 Plan: <現在参照している Plan>
停止理由・変更要望: <Approved Plan と変える必要がある点>
未決定事項: <Planning で解決する判断、なければ「なし」>
既存の未コミット変更・部分実装を保持し、変更・破棄しないでください。
改訂 Plan の承認・正式保存と Work Item の確認・保存・公開まで行い、確定した参照で Implementation 再開用の kickoff を提示して、Implementation は開始せず停止してください。
```

部分実装と実施済み / 未確認の検証も簡潔に報告するが、過去のチェック・Review・Code Review Approve を変更後の差分の検証や承認として流用しない。既存変更の commit / stash / 破棄を独断で行わず、再開案内を提示して終了する。このセッションで Plan / Work Item を勝手に更新したり、Planning / Worker を自動起動したりしない。
