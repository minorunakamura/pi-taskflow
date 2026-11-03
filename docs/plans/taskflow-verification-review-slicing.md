# Taskflow の検証資産連携・同時 Review・Work Item 粒度

## 目的

必要な保証と既存の承認・停止経路を維持しながら、直接検証の作り直し、Review 起動の手戻り、大きすぎる Work Item の確認負担を減らす。既存の prompt-driven Skills と設計文書の関係箇所を改訂する。

- 対象プロジェクト: `pi-taskflow`
- 対象 cwd: `/Users/minoru/Documents/mywork/pi-dev/pi-taskflow`
- 正式 Plan 保存先: `docs/plans/taskflow-verification-review-slicing.md`

## 根拠と確認済みの現在地

パスは、特記しない限り pi-taskflow リポジトリルート基準。

- 入力設計: `docs/designs/taskflow-verification-review-slicing.md`。§1 の検証資産の責務・既存検証との境界、§2 の同時 Review、§3 の粒度判断を具体化する。
- 維持する検証方針: `docs/designs/planning-verification-policy.md` の「合意した方針」、現行 Planning §§5–6・9、Implementation §§3–9。保証対象・対象外、対象別 TDD、Worker の focused regression、Root の正式チェックと直接確認、影響に応じた再検証を変えない。
- 現行入口: `skills/taskflow-planning/SKILL.md`、`skills/taskflow-implementation/SKILL.md`、`skills/taskflow-to-ticket/SKILL.md`。関連する基本設計は `docs/pi-taskflow-basic-design.md`、実装仕様は `docs/pi-taskflow-implementation-spec.md`。
- 共通検証 Skill の公開契約: 隣接 repository `../pi-skills` の `skills/create-verification-skill/SKILL.md`（呼び出しと責務、配置・Feature Map・証拠・発見、生成手順の実行確認）、`skills/maintain-verification-skill/SKILL.md`（明示実行と通常更新の境界）、`docs/plans/reusable-verification.md`（要件・決定事項）。調査時 HEAD は `b42d035760179124241cdd5f0df4fb2de90586d6`。共通2 Skill の実ファイルと後続 Plan の契約を Root が直接確認した。
- 入力設計の「連携先が未実装」「正式名称・配置等は後続で具体化」は設計時点の記述であり、現在は上記公開契約が存在する。本 Plan はその具体化を用いる。責務・目的の変更ではなく、入力設計書は編集しない。隣接 checkout は今回の調査資料の所在であり、配布 Skills の実行時固定配置にしない。
- `pi-subagents` の導入済み公開 Skill / guide の parameter reference と agents の Skills 節を確認した。具体的な呼び出しは Implementation 時の導入版の公開 API に従う。

## 要件・決定事項

### 1. 再利用可能な検証資産との連携

Planning は、今回関係する既存の検証 Skill・手順・必要な helper・Feature Map を確認し、適否・不足を判断する。適切な資産を優先し、不足に再利用価値がある場合だけ Create の必要性と初期対象を Plan の既存の「動作確認方法」に含める。既存資産の参照、選ぶ機能、必要な作成・更新範囲を、会話履歴なしで Implementation に渡せるようにする。Planning で資産生成や生成手順の成立確認は行わない。

Implementation は現在の資産を改めて確認し、適切な既存資産を再利用する。必要な資産がなければ Approved Plan の範囲で共通 `create-verification-skill` を明示的に読み込んで利用する。公開入口は `/skill:create-verification-skill <対象機能・検証範囲などの自由文>`。検証対象 repository が cwd であり、独自 parser・wrapper・固定絶対パスで呼び出さない。必要な共通 Skill を取得できなければ既存の不足報告・停止経路を使う。

共通契約の概要は次のとおり。詳細を Taskflow 側で再定義せず、実行時に共通 Skill と対象プロジェクトの規約を読む。

- 既存規約と適切な既存資産を優先する。既定の生成先は `.pi/skills/verify-project/`、本文は `SKILL.md`、Map は `references/feature-map.md`。helper は必要時だけで、必要な出典通知は共通 Create の指示どおり生成先に同梱する。
- Pi 標準の project Skill 探索と project trust、新セッションまたは `/reload`、明示呼び出しまたは実ファイルの読み込みで利用する。自動選択は保証しない。独自 registry を作らない。
- 証拠は既存規約を優先し、なければ `.pi/verification-evidence/<run>/`。Git 管理対象外を基本とし、必要な ignore の最小更新・機密情報の取得回避・安全な環境分離・自分が作った環境だけの cleanup・cleanup 後の証拠参照確認は共通契約に従う。独自保存基盤、全証拠 commit、保持期限管理を追加しない。
- Map は再利用する手順と期待結果であり、今回の観測・成否を示す実行記録とは区別する。過去の成功を変更後の成功に流用しない。

Create 自体の成立確認は少なくとも対象一機能だが、それだけで今回の Work Item の全完了条件を満たしたとはしない。Root は承認済みの保証対象を実際の入口から自ら確認する。

関連機能の変更では、今回関係する検証を実行し、変わった手順・helper・Map の関連部分だけ更新して、変更した検証方法も再実行する。Worker に担当させる内容と Root の確認分担を依頼に明示し、同じ cwd の同時 writer を作らない。

`maintain-verification-skill` はユーザーの明示実行だけに限定する。Taskflow から自動実行せず、通常の関連更新に Maintain や無関係な全 Map の実行を要求しない。

通常テスト・正式チェック・使い捨て Probe と、必要時に使う検証資産を区別する。全探索ファイルの保存、毎回の Create、全プロジェクトへの導入、CI 自動追加は要求しない。共通 Skill は Root の採否・直接確認・最終受入れを代行しない。保証・設計を変える必要があれば既存の確認・再計画経路へ戻る。

### 2. 独立した Correctness / Ponytail Review の同時実行

動作確認後に、別々の fresh context の built-in `reviewer` を、一方の完了を待たずに並行起動する。直列化や一人への統合はしない。

- Correctness: 要求適合、不具合・回帰、検証不足に加え、テストと直接確認の期待結果自体が正式要求に整合するかを確認する。
- Ponytail: この Reviewer だけに `ponytail-review` を明示指定し、不要な範囲・抽象化・既存機能の再実装などを確認する。
- 両者へ必要な正式入力と関係資料、差分の確認方法、Root のチェック結果、直接検証の証拠・未確認範囲、Plan の保証範囲と TDD・検証分担を渡す。原則 read-only とする。
- 独立した2回の非同期 `subagent` 呼び出しを基本とする。fresh と Skill 指定を子ごとに分離し、導入版が `options` に配置する項目はその公開形式を使う。named `parallel.args.tasks[]` に `skill` / `context` を詰め込まない。scripted workflow を利用する場合も公開 API のみを使い、`workflow: true` と `options.script` を併用しない。専用 wrapper・workflow ファイル・Agent 定義は追加しない。
- Root は両方の結果を取得してから採否・修正・再検証を判断し、その後 `taskflow_code_review` へ進む。片方の起動失敗、未取得、Skill 未解決を「指摘なし」と扱わない。不足や失敗は既存の停止経路で報告する。

無条件の全チェック再実行・全レビュー loop は追加せず、修正後の再検証・必要な再レビューは既存の影響基準を維持する。Code Review の設定・承認条件は変えない。

### 3. 小さく受け入れられる Work Item

「1セッションに収まりそうな最大量」ではなく、実装・検証・Review・人間の受入れまで扱いやすい小さい成果を判断基準にする。ticket Skill は最初の分割案を提示する前に次を点検する。

- 独立して確認できる主要な振る舞い、異なる検証・Review 対象をまとめすぎていないか。
- 一度確認して受け入れる価値のある中間到達点がないか。
- 分割で本当に使い捨て実装、重複編集、不自然な引継ぎが増えるか。
- まとめる場合、その結合の必要性を説明できるか。

既存の縦スライス、本当の blocker、正式 Plan 参照、保証・検証範囲・対象別 TDD の継承、個別承認を維持する。中間成果では残る最終要件を明示する。固定件数・行数・時間による一律分割、層別分割、不要な細分化はしない。判断基準の本体は ticket Skill に置き、Planning は引継ぎ制約として接続する。

## 制約・対象外

- 変更は下記5ファイルの関係箇所に限定する。既存 Playbooks・ticket templates は照合のみとする。
- Extension / production code、新依存、設定 schema、Agent 定義、独自 wrapper・runner・registry・永続 workflow state・復旧工程・承認段階を追加しない。
- `pi-skills` 自体、外部 Skill、既存 Approved Plan / Work Item、既存テスト、CI 頻度は変更しない。共通 Create / Maintain の機能を Taskflow 内に再実装しない。
- 今回の Taskflow 改修だけを理由に、Taskflow プロジェクト自身の検証 Skill や Feature Map を新規作成することは要求しない。
- `docs/testing/` は変更しない。今回必要な確認は本 Plan に記載する。既存 smoke にある Code Review の「未設定で無効」は古いため、流用時も現行の未設定で有効・明示 false のみ無効と実 tool 結果を優先し、今回の設定変更としない。
- 入力設計書と既存未コミット変更を保持し、commit / stash / 破棄を独断で行わない。調査時は入力設計書のみ未追跡で、tracked diff はなかった。
- 検証資産との実 Taskflow 結合全体、Create / Maintain 単体の再検証、全アプリ種別・全 OS、粒度判断の一般的な精度・継続的な時間短縮は今回の実証対象外。文書契約照合や代表実行を同等保証と報告しない。

## 実装方針

1. `skills/taskflow-planning/SKILL.md`
   - 調査・検証設計に既存資産の確認と必要時 Create の判断を接続する。Planning で生成しない境界を明記する。
   - Plan の既存の検証項目と ticket への引継ぎに資産参照・対象・必要範囲を含める。粒度についても ticket Skill の小さい受入れ成果という基準へ接続する。
2. `skills/taskflow-implementation/SKILL.md`
   - §§3–4・6 を中心に、現資産の確認、再利用・必要時 Create、関連更新と再実行、Worker / Root の分担を接続する。
   - 「途中結果の専用保存機構は作らない」を Taskflow 独自基盤の禁止として明確化し、共通 Skill に従う検証証拠保存と矛盾させない。
   - §§7–9 を中心に、2つの fresh Review の並行起動・条件分離・両結果待ち・採否後 gate を明確化する。
3. `skills/taskflow-to-ticket/SKILL.md`
   - §3 に初案前の粒度点検を短く追加し、既存の縦スライス・依存・承認手順を維持する。
4. `docs/pi-taskflow-basic-design.md`
5. `docs/pi-taskflow-implementation-spec.md`
   - Planning の検証設計、Work Item、Worker 依頼、直接検証、Review の関係箇所を整合させる。判断の詳細を複製しない。
   - Review の「原則として2つ」という例外を示唆する表現と、実装仕様 §3.4 の Review 全般への `ponytail-review` 指定を、独立2 Reviewer の同時実行・Ponytail のみへの指定へ揃える。必要な流れ図・手順列も同じ意味に揃える。

検証資産連携、同時 Review、粒度判断はそれぞれ独立して確認・受入れできる成果として扱う。正式な件数・依存・分割は Plan 承認後に ticket Skill で別途ユーザー確認する。文書ファイルが共通するだけでは blocker にしない。

## 完了条件

1. Planning → Plan → Work Item → Implementation / Review に、既存資産の参照・再利用、必要時 Create の範囲、関連更新・再実行が接続され、Planning が生成しないことと Maintain の明示実行限定が維持されている。
2. 共通 Skill の公開契約と Taskflow の証拠保存・Root 受入れ・正式チェック・TDD 方針が矛盾せず、固定 checkout や独自基盤・追加 gate を要求しない。
3. 2つの fresh Reviewer が並行起動され、Ponytail のみに Skill が指定され、両結果取得後に Root の採否と Code Review gate へ進む。下記の実行観測で確認できる。
4. ticket 初案前の判断基準が小さい受入れ成果へ変わり、縦スライス・本当の blocker・残要件・個別承認が保たれている。
5. 5ファイルの本文・関連手順・流れ図が整合し、対象外への変更がない。
6. 担当 Work Item に対応する下記のチェック・契約照合・直接観測を実施し、結果と未確認範囲を報告する。

## 動作確認方法

### 自動テスト・正式チェック・TDD

本改修の3対象（検証資産連携、同時 Review、粒度判断）すべてに TDD は指定しない。変更は Markdown の手順契約であり、文言テストの Red → Green で Agent の振る舞いは保証できない。必要な検証を省く意味ではない。

- Worker は担当差分と既存契約を照合し、`pnpm exec vitest run test/planning-skill.test.ts test/implementation-skill.test.ts test/to-ticket-skill.test.ts` で既存 loader・参照解決を確認する。
- Root は最終差分・未追跡ファイルを確認し、`pnpm check` と `git diff --check` を自ら実行する。正式 full suite を間引かず、focused tests を主体変更だけでさらに繰り返さない。
- 新規の本文文字列一致テスト、汎用 Markdown validator、恒久的な E2E・smoke runner、外部 Skill を固定 checkout から読むテストは追加しない。既存 tests は変更しない。
- Planning 中の既存 focused tests は3ファイル・7件成功したが、改修後の成功や実行遵守の証拠には流用しない。

### Root の契約照合

正式チェックと別に、担当差分の改訂本文を実際に読み、入力設計・共通 Skill・本 Plan と次の具体的な経路を照合する。各 Work Item は関係する範囲を引き継ぐ。

| 対象・入力 | 期待する契約 |
| --- | --- |
| 適切な既存検証資産がある | Planning が参照と関係機能を Plan に残し、Implementation は現在の資産からその範囲を再実行する。Create・全 Map 実行・過去証拠による成功認定を要求しない |
| 資産が不足し、Plan で限定 Create を選ぶ | Planning は必要性と初期範囲だけを残し生成しない。Implementation は共通 Skill を明示 read して利用する。一機能での Create 成立と Work Item 全完了条件の確認を区別する |
| 関連する入口や手順が変わる | 関連手順・helper・Map を更新してその方法を再実行する。Maintain や無関係な全件点検へ拡大しない |
| 証拠保存・cleanup、共通 Skill 不足、保証変更が必要 | 共通の安全性・証拠方針と Root 直接確認を保ち、不足や設計変更は既存の停止・再計画経路を使う。Taskflow 独自保存基盤を作らない |
| 別々に受入れ可能な振る舞いが複数ある | 初案前に中間成果・異なる検証対象を点検し、独立した成果を候補にする。残る最終要件を隠さず、層別・固定件数にしない |
| 分割すると本当に使い捨て実装等が増える小さい変更 | 無理に細分化せず、まとめる結合理由を示せる。単に1セッションに入りそうという理由だけで全機能を一件にしない |
| Review の片方が失敗・未取得、修正が必要 | 片方だけで gate に進まず、指摘なし扱いにしない。両結果後の採否・修正・影響に応じた再検証を保つ |

これは文書契約の照合であり、資産連携の実 Taskflow E2E や粒度判断の継続的な効果の実証とは区別して報告する。

### 同時 Review の直接観測

同時 Review を改訂する Work Item 自身の実レビューで確認する。改訂後の手順を Root が読み、実際の差分・正式入力・チェック結果・上記照合結果を渡して、公開 API から2つの built-in `reviewer` を別々の非同期呼び出しで起動する。専用 fixture や反復 smoke を作らない。

Root は既存の呼び出し記録と各 child の起動情報・結果から、次を確認する。

1. 別 run で、両方に fresh が指定されている。
2. 一方の結果を待たず両方が起動され、Ponytail 側だけに `ponytail-review` が解決・提示され、利用されている。指定文字列だけで Skill 未解決を見逃さない。
3. 必要な正式入力・差分・Root の確認結果・未確認範囲が各 Reviewer に渡り、原則 read-only で結果が取得できる。
4. 両結果取得後に Root が採否を判断し、必要な修正・再検証の後で実際の `taskflow_code_review` を呼ぶ。設定上有効なら実ユーザーの Approve を待つ。

入力形式の照合や loader 成功だけでこの観測を済ませない。起動失敗・結果不足・必須の未確認が残る場合は完了扱いにせず、不足・失敗・再開条件を既存の最終報告に記す。模擬 reviewer・模擬承認・新しい記録機構は使わない。

## 保存・引継ぎ・終了

Plannotator の明示 Approve 後に本 Plan を正式保存し、承認内容との一致を確認する。ticket Skill で設定・分割・最終本文と保存先の保存公開をそれぞれ別に確認し、各 Work Item に正式 Plan 参照と関係する保証対象・対象外・検証方法・非 TDD 方針を維持する。

本 Planning では実装・検証資産生成・実 Reviewer の起動を行わず、Work Items の保存・公開後に停止する。Implementation、merge、release、deploy は開始しない。