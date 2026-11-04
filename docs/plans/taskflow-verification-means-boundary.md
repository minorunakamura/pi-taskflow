# Taskflow の検証手段の不足補完と停止境界

## 目的

専用の操作 tool・導入済み harness・完成済み helper が見つからないだけで停止し、Agent が調べられる操作手段をユーザーへ差し戻す解釈をなくす。承認済み検証の安全な具体化と、必要な helper の作成・保存・再利用を、Taskflow の既存の最小補完裁量につなげる。

対象 cwd は `/Users/minoru/Documents/mywork/pi-dev/pi-taskflow`。正式 Plan の保存先は `docs/plans/taskflow-verification-means-boundary.md`。変更対象は Agent が読む手順契約と関係する基本設計・実装仕様であり、Extension の実行ロジックは変更しない。

## 根拠と確認済みの現在地

パスは特記しない限り repository root 基準。

- 入力設計は `docs/designs/taskflow-verification-means-boundary.md` 全文。§1 の具体化・helper 保存・停止境界、§2 の Planning／Implementation の責務、「維持する範囲と後続への引継ぎ」を具体化する。主要方針に未決定事項はなく、入力設計は変更しない。
- 既存の設計 `docs/designs/taskflow-verification-assets-decision.md` §§1–3 と、現行 Planning §§5–6・9、Implementation §§3–4・6 は最小補完を認める。一方、Planning §1・§6、Implementation §2・§3 の広い代替禁止・停止文言との適用関係が明確でなく、小さい操作 helper まで禁止と読める余地がある。
- 入力設計が参照する原 Session を Root が確認した。専用 harness 未確認を理由として独自 harness を作らず停止した記録と、その後、既存 Chrome／Node 標準機能による操作・証拠取得・cleanup が成立した tool 結果がある。過去事例は調査根拠であり、今回の改訂後の成功ではない。非公開 report／原ログは転載しない。
- Bug Fix Playbook を適用するが、今回確認した不具合は上記の停止解釈を許す手順契約の曖昧性である。文言が Agent の停止を引き起こしたという一般的因果や、改訂後の不要停止減少を実証済みとはしない。Planning 中に実アプリでの成立確認や資産生成は行わない。
- 共通 Create／Maintain は調査時の `../pi-skills/skills/create-verification-skill/SKILL.md`／`../pi-skills/skills/maintain-verification-skill/SKILL.md` と関連参照を直接確認した。Create は必要な helper の生成・実行を既に認め、危険な代替・無断 install を禁じる。今回の入力との具体的矛盾は見つからない。隣接 checkout は調査資料の所在であり、実行時固定配置にはしない。
- `skills/taskflow-to-ticket/SKILL.md` §§2–5 と `references/templates/ticket.md` は正式 Plan 参照と Verification を持つ。判断基準を ticket Skill へ重複追加せず、Planning の既存の追加制約から引き継ぐ。
- `package.json` と `.github/workflows/ci.yml` の正式チェックは `pnpm check`。Planning 中の baseline は成功（6 files／121 tests）、既存3 Skill の focused loader tests も成功（3 files／7 tests）。改訂後の結果には流用しない。
- 調査時の既存変更は入力設計書が未追跡であることのみ。既存変更は保持する。

## 要件・決定事項

### 安全な具体化と最小 helper

承認済みの検証範囲内で、追加 install や利用者・共有環境の変更をせず、隔離した環境で既存の標準機能を安全に試せる場合は、Agent が操作・観測方法の成立確認を進める。適切な既存手段を優先するが、専用 tool／harness／完成済み helper の発見を開始の必須条件にしない。調べられる操作手段をユーザーへ差し戻さない。

必要な接続・入力・観測の小さいコードを作り、成立した方法の再実行に必要な部分を helper として保存することは、既存の Create／関連更新による最小補完に含める。「一時コードなら許可、保存すると独自 harness として禁止」という扱いにしない。全探索コードの保存、毎回の Create、全機能の資産化は求めない。

「標準機能」「小さいコード」という名称だけで安全とは判断しない。共通 Skill の環境分離・秘密保護・所有対象だけの cleanup、対象プロジェクトの規約を維持する。Chrome／CDP は例であり、全プロジェクトの固定方式にしない。

### 確認・停止の境界

「独自代替の禁止」は必須の権限・安全条件・保証の迂回や、未承認の別基盤への置換を禁じるためのものとする。共通 Skill・必須 Agent／tool／child Extension の代替実装を許可する規定にはしない。

- 権限・認証・必要な共通 Skill などが実際に不足し、許された範囲で成立させられない場合は、不足と再開条件を報告して停止する。Implementation では既存の BLOCKED を使い、共通 Skill 自体を独自実装で置き換えない。
- 安全に分離・操作できないと既に判明している場合、標準機能が存在しても試行を強制しない。
- 追加 install や利用者・共有環境の変更に必要な許可が未取得なら、無断実行せず既存の確認経路を使う。
- ユーザーの明示禁止、規約、既存 Approved Plan の制約を新裁量で読み替えない。
- 正式 Plan の制約・保証対象／対象外・期待結果、製品の公開契約・仕様・設計の変更が必要なら、既存の確認・REPLAN_REQUIRED 経路を使う。
- 試した方法、失敗、未確認の方法・不足を区別する。未成立の手順を成功扱いせず、期待値を緩めて隠さない。BLOCKED の同セッション再開案内と未解消時の停止維持は変えない。

### Planning から Implementation への引継ぎ

Planning は既存手段の適否・不足と、最小補完裁量・上記の限界を Plan／Work Item に残す。専用 tool 不在を単独の BLOCKED 条件や helper 作成・保存禁止に強めない。Planning 自身は資産生成・実アプリでの成立確認を行わない。

Implementation Root は現物から手段を具体化し、採否・範囲・最終受入れを保持する。Worker に作成・更新を依頼する場合も同じ境界、検証・証拠・cleanup の分担を渡し、同じ cwd の同時 writer を作らない。変えた方法は再実行し、期待結果との照合と証拠を保つ。Create の初期一機能の成立や資産実行を、Root の直接確認・全完了条件の受入れの代わりにしない。

## 制約・対象外

- 共通 Create／Maintain 自体の実行方針・生成物の通知・License は変更しない。Maintain は引き続きユーザーの明示実行に限定し、Taskflow から起動しない。
- 既存の設計履歴、既存 Approved Plan／Work Item、入力設計、他 repository の成果物は書き換えない。
- 正式チェック、TDD 方針、Review、Root 直接確認、BLOCKED 再開案内、文書分担の既存契約は変更しない。
- production code、依存、CI、恒久 E2E、独自 runner・registry・復旧状態・承認段階・wrapper・独自 Create、既存生成物の一括移行は追加しない。
- ticket Skill／templates、各 Playbook、既存 tests、`docs/testing/` は照合・参照のみとし、同じ判断基準を重複配置しない。README／CONTRIBUTING の新設や文書移動も行わない。
- 今回の保証は文書契約の改訂・整合。実 Taskflow による不足補完・helper 保存・後続再利用・必要停止の遵守 E2E、全 OS／全アプリ、不要停止減少や一般的な時間・cost 削減率は必須実証対象にしない。未実行を成功と報告しない。

## 実装方針

予定する更新先は次の4ファイルに限定する。既存の関係段落を短く改訂し、共通契約の内部方針や新しい workflow を再定義しない。

1. `skills/taskflow-planning/SKILL.md`
   - §1 の必須コンポーネント代替禁止と §§5–6 の検証手段最小補完の適用関係を明確にする。必要なら短い参照・限定で接続する。
   - §§5–6 に、専用 tool 不在だけでは停止しないこと、安全な標準機能の具体化と必要 helper の作成・保存を補完裁量に含むこと、不足の解消に何が必要かで確認・停止を分けることを反映する。
   - §9 の通常の Plan／Verification 引継ぎで、補完裁量を専用 tool 必須・helper 作成保存禁止へ強めないよう明確にする。
2. `skills/taskflow-implementation/SKILL.md`
   - §2 の必須コンポーネント置換禁止との関係を明確にし、§3 の現物確認・補完・停止判断へ上記境界を適用する。
   - §§4・6 は既存の参照・引継ぎで足りる箇所を複製せず、Worker に同じ補完裁量・限界が渡り、関連更新後の再実行・証拠・cleanup と Root 受入れが保たれるよう必要箇所だけ整合させる。
3. `docs/pi-taskflow-basic-design.md`
   - §§11・14–15・19・20.2 の関係箇所を照合し、Plan／Work Item／Worker への引継ぎと具体化・停止境界を Skill に合わせる。判断基準の本体は Skill 側に置く。
4. `docs/pi-taskflow-implementation-spec.md`
   - §§11・13・16・20–21・23 の同じ契約を整合させ、§31.4 の既存の契約照合に安全な最小 helper の作成・保存・再利用と必要停止の対照を反映する。
   - 文書照合・loader 成功と実 Agent の実行遵守を区別する既存の記述を維持する。

入力設計の変更や設計方針の追加は予定しない。正式な Work Item 分割・依存関係は承認後に ticket Skill で確認する。

## 完了条件

1. 上記4ファイルで、専用 tool／harness／完成済み helper がないだけでは停止せず、安全に可能な既存標準機能による具体化を Agent が担う契約が一致している。
2. 必要な小さい helper の作成・保存・再利用が最小補完に含まれ、保存したことだけで独自代替禁止にならない。全試行保存や新しい操作基盤を要求しない。
3. 実際に成立させられない権限・認証・共通 Skill 等の不足、安全に試せない既知条件、未取得の環境変更許可、明示禁止、保証・設計変更が、既存の確認・停止経路と一致する。必須コンポーネント代替禁止との関係が曖昧に残らない。
4. Plan → Work Item の Verification → Worker／Root で補完裁量・限界を強めず引き継ぎ、Planning の生成禁止、Root 判断、同時 writer 禁止、再実行・証拠・cleanup・最終受入れの分担が維持される。
5. 共通 Skill、既存 Approved Plan／Work Item、その他対象外を変更せず、正式チェックと以下の直接照合を完了する。実行結果と未確認範囲を区別して報告する。

## 動作確認方法

### 保証対象・自動テスト・TDD

保証対象は上記の文書契約と既存契約の整合。全改訂対象で TDD は採用しない。文言一致の Red → Green では Agent 判断を保証できず、新しい実行ロジックも加えないためである。非 TDD を検証不要とはしない。

- Worker は担当差分を入力設計・正式 Plan・共通契約と照合し、`pnpm exec vitest run test/planning-skill.test.ts test/implementation-skill.test.ts test/to-ticket-skill.test.ts` で既存 loader・同梱参照の回帰を確認する。
- Root は最終差分・未追跡ファイル・対象外の不変を確認し、`pnpm check` と `git diff --check` を自ら実行する。正式 full suite は間引かない。
- 本文文字列一致／禁止語 assert、模擬 Agent・承認、汎用 Markdown validator、固定 checkout に依存するテスト、恒久 E2E・smoke runner は追加しない。

### Root の直接確認：一次文書で境界と引継ぎを追う

正式チェックとは別に、Root が改訂した実ファイル、入力設計、共通 Skill、ticket の通常 Verification 契約を直接読み、次の具体的入力で期待する契約を照合する。結果は通常の検証報告に残し、新しい管理ファイルは作らない。Correctness Reviewer には差分と照合結果を渡し、正式要求と照らして確認してもらう。

| 入力・状況 | 期待する契約 |
| --- | --- |
| 専用 tool／導入済み harness／helper はないが、隔離して既存標準機能を安全に試せる | tool 不在だけで停止せず Agent が具体化する。適切な既存手段は優先するが発見必須にしない。ユーザーに手段調査を差し戻さない |
| 一時コードで成立し、再実行には接続・入力・観測 helper が必要 | 共通 Create／関連更新の範囲で必要部分を保存できる。保存だけで禁止にならず、手順・helper・Map の関連部分を整え、変えた方法を再実行して期待結果照合・証拠・cleanup を保つ |
| 標準機能はあるが安全な分離・操作が不可能と既に分かる | 試行を強制しない。不足と再開条件を示し、危険な代替で続行しない |
| 必要な権限・認証・共通 Skill がなく、許可範囲内で成立不能 | 不足と再開条件を報告し、Implementation は BLOCKED。共通 Skill や必須コンポーネントを独自実装で置換しない |
| 解消に追加 install／利用者・共有環境変更が必要だが許可なし | 無断実行せず確認する。「小さい helper」を名目に迂回しない |
| 明示禁止・規約・既存 Approved Plan の制約あり | 新方針で上書きしない。必要な確認を行い、正式 Plan 制約の変更が必要なら REPLAN_REQUIRED |
| 実ブラウザ保証を unit test のみに変える等、保証・期待結果・製品設計の変更が必要 | 手段の具体化と区別して既存 REPLAN_REQUIRED 経路へ戻る。期待値を緩めない |
| Plan／Verification／Worker 依頼へ引き継ぐ | 補完裁量を専用 tool 必須・helper 禁止へ強めず、安全限界も落とさない。Planning は生成せず、Root 採否・同時 writer 禁止・証拠と cleanup 分担を維持する |
| 初期一機能で Create 成立／試行失敗や方法未確認 | Create 成功を全条件の受入れにしない。失敗・未確認は区別し、過去の成功を流用しない。Maintain 自動起動や BLOCKED 再開条件の緩和はしない |

### 再利用する検証手段・不足と分担

- 上記3つの既存 loader tests は読み込み・参照解決の確認に再利用する。意味的境界や実 Agent の遵守を保証するものではない。
- `docs/testing/planning-feature.md`／`docs/testing/implementation-feature.md` は隔離 fixture・正式入力・実承認・履歴観測の既存手順を持つが、今回の helper 補完・保存・fresh 再利用を実証するシナリオとしては不足する。今回はその E2E を必須保証にせず、過去結果を新版の成功に流用しない。古い「Code Review 未設定で無効」の説明も流用せず、現行の未設定で有効・明示 false のみ無効を維持する。
- 今回選んだ文書契約の保証には、一次文書、正式チェック、上記の具体的照合手順が揃うため、現時点では検証 Skill／Feature Map／helper の Create を予定しない。既存手順の不足を隠して実 Agent E2E の保証へ読み替えない。
- 「Create の予定なし」は禁止ではない。Implementation Root は現物から再確認し、承認済みの保証対象・対象外・期待結果を維持するために不足する手段があれば、最小の Create／関連更新を判断できる。必要時は共通 Skill の実ファイルを明示 read し、初期対象を不足する確認経路に限定する。未予定の Skill／helper 追加だけでは再計画・追加承認を要しない。
- その裁量でも明示禁止・規約・既存 Approved Plan の制約、安全条件は保持する。必要な共通 Skill／権限等が実際に不足して許可範囲で成立しなければ BLOCKED。正式 Plan の制約・保証・期待結果、製品仕様・公開契約・設計を変える必要があれば既存の確認・REPLAN_REQUIRED 経路へ戻る。無断 install・独自代替で回避しない。
- Worker は担当差分の照合と focused tests、Root は正式チェック・一次文書の直接照合・最終受入れを担当する。資産補完が必要なら Root が対象・担当・証拠・cleanup の分担を明示し、関連更新後は変えた方法を再実行する。同時 writer は作らない。
- 本改訂の完了と、実 Agent の不要停止減少・安全な最小補完・helper 再利用・必要停止の遵守の実証は別である。後者は後続実行で確認する未検証事項として残し、今回の loader／契約照合を代用しない。

## 保存・引継ぎ・終了

Plannotator の明示 Approve 後だけ、この全文を正式 Plan として保存し一致を確認する。ticket Skill で tracker 設定、分割、最終本文・保存先の保存公開を、それぞれの承認契約に従って扱う。関係 Work Item は正式 Plan 参照と既存 Verification を通じ、保証対象・対象外・確認方法・期待結果・非 TDD・必要文書更新・最小補完裁量と限界・検証分担を維持する。

正式 Plan とユーザー確認済み Work Items の保存・公開で Planning を終了する。Implementation、Worker、資産生成、merge、release、deploy は開始しない。
