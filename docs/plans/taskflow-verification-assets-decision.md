# Taskflow の検証資産判断・BLOCKED 再開案内・文書分担

## 目的

必要な実動作検証の手段が不足したまま、Implementation が使い捨ての操作コードを組み立て続ける状態を減らす。Planning の採否見込みと Implementation の現物判断を接続する。あわせて、Implementation の BLOCKED 全般に Pi 向けの再開プロンプトを定め、文書の役割と更新責務を接続する。

- 対象プロジェクト／cwd: `pi-taskflow`／`/Users/minoru/Documents/mywork/pi-dev/pi-taskflow`
- 正式 Plan 保存先: `docs/plans/taskflow-verification-assets-decision.md`
- 変更対象は Agent が読む Markdown の手順契約と関係する設計・仕様。Extension の実行ロジックは変更しない。

## 根拠と確認済みの現在地

パスは特記しない限りリポジトリルート基準。

- 入力設計: `docs/designs/taskflow-verification-assets-decision.md` 全文。特に §§1–3 の採否基準・責務・再計画境界、§4 の BLOCKED 再開、§5 の文書分担と「後続の Planning への引継ぎ」を具体化する。主要方針に未決定事項はなく、入力設計は変更しない。
- 維持する契約: `docs/designs/taskflow-verification-review-slicing.md` §1、`docs/designs/planning-verification-policy.md` の「合意した方針」。保証対象・対象外、TDD、正式チェック、Worker／Root の検証分担、Root の直接確認と最終受入れ、Maintain の明示実行限定を維持する。
- 現在の入口: `skills/taskflow-planning/SKILL.md` §§2・5–6・9、`skills/taskflow-implementation/SKILL.md` §§3–4・6・10。資産確認・Create 利用・関連更新の接続は既にあるが、手段の充足を基準とする採否、未予定の不足補完、BLOCKED のコピー可能な再開案内、文書分担は具体化が必要。
- `skills/taskflow-to-ticket/SKILL.md` §§2–5 と `references/templates/ticket.md` は、正式 Plan 参照と新セッションで実行・観測できる Verification を既に扱う。今回の採否基準を重複配置せず、Planning 側から通常の引継ぎに載せる。
- 共通 Create／Maintain の実ファイルは、調査時 `../pi-skills/skills/create-verification-skill/SKILL.md`／`../pi-skills/skills/maintain-verification-skill/SKILL.md` で確認した。調査時 HEAD は `b42d035760179124241cdd5f0df4fb2de90586d6`。隣接 checkout は調査資料の所在であり、配布 Skill の実行時固定配置にはしない。利用時は現在の共通 Skill を明示 read する。
- 正式チェックは `package.json` と `.github/workflows/ci.yml` の `pnpm check`。Planning 中は成功（6 files／121 tests）したが、改訂後の確認結果には流用しない。
- 調査時の既存変更は、入力設計書が未追跡であることのみ。tracked／staged diff はなく、既存変更を保持する。

## 要件・決定事項

### 1. 検証手段の充足を基準に採否を判断する

Planning／Implementation は、今回必要な実動作検証を、別の Agent が会話履歴なしで起動・操作・期待結果との照合・証拠取得・後始末まで実行できる既存手段があるか確認する。適切な既存の検証 Skill、具体的な手順、必要な helper／harness を優先する。

不足する場合は共通 `create-verification-skill` による最小の資産を選ぶ。小規模アプリ、通常テストや起動コマンドの存在、恒久 E2E を追加しないこと、反復利用の予定がないことだけを不採用理由にしない。一方、手順と操作手段が既に充足していれば重複作成しない。通常テスト・正式チェック・探索 Probe を一律に資産化せず、毎回の Create、全機能の資産化、恒久 E2E／CI／独自 runner を要求しない。

### 2. Planning の見込みと Implementation の不足補完を接続する

Planning は既存手段の参照・適否と不足、必要と分かる Create の初期対象、関連更新範囲を Plan の既存の「動作確認方法」に残す。Planning 自身は資産生成も生成手順の成立確認も行わない。

今後作る Plan は、Implementation が現在の手段を再確認し、承認済みの保証対象・対象外・期待結果を維持して、検証手段を具体化・補完する最小の Create／関連更新を判断できる契約を含める。この裁量を通常の Plan Review で承認し、正式 Plan 参照と既存 Verification 欄を通じて Work Item に引き継ぐ。単なる「Create の予定なし」を分割時に作成禁止へ強めない。専用の包括許可や追加 gate は作らない。

Implementation Root は、Planning で未予定でも、現物から不足を確認すれば最小の Create／関連更新を判断できる。採否変更や未予定の Skill／helper ファイル追加だけでは再計画・追加承認を要求しない。使い捨て操作コードで不足を埋めようとしている場合も、必要な方法を資産として整える必要性を判断する。試行錯誤の全ファイル保存は求めない。

ただしユーザー・規約・既存 Approved Plan による明示禁止や制約は維持し、新方針で読み替えない。正式 Plan の制約、保証、期待結果、製品の公開契約・仕様・設計の変更が必要なら既存の確認・REPLAN_REQUIRED 経路を使う。必要な共通 Skill／権限がないだけなら BLOCKED とし、自動的に再計画へ送らない。

採否・範囲判断は Root が保持する。Worker に作成・更新を依頼する際は対象と検証・証拠・cleanup の分担を渡し、同じ cwd の同時 writer を作らない。共通 Create の明示 read、配置・発見・安全性、初期対象の少なくとも一機能での成立確認、関連部分だけの更新と再実行を維持する。Create の成功を Work Item 全完了条件や Root の直接確認・最終受入れの代わりにしない。

### 3. BLOCKED 全般で同じ Pi セッションへの再開プロンプトを示す

Implementation §10 の共通終了規定で、どの工程の BLOCKED にも、理由・未充足条件とコピー可能な再開プロンプトを要求する。「再開するときは、このセッションの Pi に次を送ってください」と明記し、ユーザー自身にコード確認・検証作業を命じるのではなく、Pi に確認と続行を依頼する文章とする。

プロンプトには確認済みの cwd、Work Item 参照、今回の停止理由・未充足条件、現在の Work Item／Approved Plan／作業ツリーと条件の解消を確認し、充足時のみ停止箇所から続行する指示を含める。未コミット変更・部分実装を保持し、不足が残れば停止を維持する。

Work Item 識別前なら、元の入力と未確定点を明記し、その確認から依頼する。未取得の Plan 参照・URL、ユーザー回答、解消結果を捏造しない。判断待ちなら回答が必要な問いを残し、既知の値をユーザーに補完させる未完成の雛形にはしない。

提示・送信自体を回答・承認・依存解消の証拠にしない。部分変更を独断で commit／stash／破棄せず、影響した変更前のチェック・Review・Approve を現在の差分へ流用しない。再確認で正式 Plan の変更が必要なら既存 REPLAN_REQUIRED 経路を使う。

REPLAN_REQUIRED は現行どおり別の Planning セッションへの依頼文とし、Planning 完了後の Implementation kickoff の契約も維持する。BLOCKED に新セッションや Planning を一律に要求せず、自動再開・再試行・常駐待機・復旧状態・追加 gate を作らない。FAILED と BLOCKED の状態定義は変更しない。

### 4. 文書の役割と更新先を接続する

対象プロジェクトの既存の文書構成・規約を優先する。未定義の場合だけ次を既定とする。

- README: 概要・導入・基本操作と詳細文書へのリンク。
- CONTRIBUTING などの開発文書: 開発環境・詳細な開発手順・チェック方法。
- 設計文書: 設計・実装上の判断と理由。
- 検証 Skill: Agent が実動作を検証する具体的な手順。

Planning は必要な更新と保存先を Plan に残し、Work Item へ引き継ぐ。Implementation はその分担に従い必要な文書を更新し、詳細を安易に README へ集約しない。README がある場合は必要な詳細へ辿れるようにする。4種の一律作成、空の雛形、CONTRIBUTING の一律新設、既存文書の一括移動は要求しない。文書の名前や存在だけで検証手段が充足したとしない。

## 制約・対象外

- 検証資産の採否・責務・引継ぎ、BLOCKED 全般の再開案内、文書分担と Planning／Implementation の接続だけを変更する。
- 検証ケース数・実行頻度の最適化、正式チェック、TDD 方針、Review、Work Item 粒度、CI、共通 Create／Maintain 自体は変更しない。
- Extension／production code、新依存、Agent 定義、独自 Skill・wrapper・runner・registry・保存基盤・永続 workflow state・復旧工程・承認段階を追加しない。
- 既存 Approved Plan／Work Item、入力設計、今回の一時検証ファイルを変更しない。既存のユーザー変更を独断で編集・commit／stash／破棄しない。
- 既存の Playbooks、ticket Skill／templates、tests、`docs/testing/` は照合・参照のみとし、今回の判断基準を重複追加しない。README／CONTRIBUTING の新設や文書移動も予定しない。
- 文書契約の整合と実 Agent の実行遵守を区別する。実 Taskflow による採否・Create・後続再利用・BLOCKED 再開の E2E、全アプリ・全 OS、時間短縮・手戻り削減量は今回の必須実証対象にしない。未実行を成功と報告しない。

## 実装方針

1. `skills/taskflow-planning/SKILL.md`
   - §2 の調査と §5 の採否基準に、別 Agent が実行できる手段の充足を接続する。反復利用は利点であって必須条件ではないことを明確化する。
   - §§5–6・9 で、現時点の見込み、Implementation の最小補完裁量、明示禁止・制約を区別して Plan／Verification に引き継ぐ。
   - 調査・設計・Plan 作成の既存箇所に、文書構成の確認と必要な更新先の計画を短く接続する。
2. `skills/taskflow-implementation/SKILL.md`
   - §§3–4・6 に、現物に基づく採否、未予定時の不足補完とその限界、Root 判断・Worker 分担・関連更新・再実行を接続する。既存の共通 Skill 契約や Root の受入れ境界を重複再実装しない。
   - 必要な文書更新を、正式 Plan と対象プロジェクトの文書分担へ接続する。
   - §10 に BLOCKED 共通の再開案内を追加し、入力設計 §4 の基本形をもとに具体化規則・未確定点・同セッション再開と停止条件維持を定める。各停止箇所に同じ雛形を複製しない。
3. `docs/pi-taskflow-basic-design.md`
   - §§11・14–15・19–20 の判断・Plan／Work Item／Worker 引継ぎと、必要な Planning／Implementation の文書責務を整合させる。
   - §24 の保存・復旧に、通常の BLOCKED 同セッション再開と失敗後の新セッション再実行を混同しない説明を接続する。詳細な再開文面は Implementation §10 を参照する。
4. `docs/pi-taskflow-implementation-spec.md`
   - §§11・13・16・20–21・23・29・31.4 の関係箇所に、採否、引継ぎ、直接確認、文書責務、BLOCKED 終了案内と検証の限界を同期する。判断基準の本体は Skill 側に置く。

上記4ファイルが予定する改訂対象。検証資産判断、BLOCKED 案内、文書分担はそれぞれ関係する仕様更新と照合を含む受入れ可能な成果とし、正式な分割・依存は承認後に ticket Skill で確認する。共有文書を編集することだけを blocker にせず、Implementation は同じ cwd の同時 writer を作らない。

## 完了条件

1. 検証資産の採否が手段の充足から判断され、既存手段優先と不足時の最小補完が接続されている。小規模・通常テスト・反復回数だけを不採用理由にしない。
2. Planning は必要性・初期対象・更新先だけを計画し、今後の Plan／Work Item に Implementation の不足補完裁量と明示制約を保持する。未予定の Create だけでは再計画せず、保証・仕様・設計変更や明示制約との衝突は既存の確認経路を使う。
3. 共通 Skill の利用、関連更新・再実行、証拠・cleanup、同時 writer 禁止、Create 成立と Root の受入れの分離、Maintain の明示実行限定が維持されている。
4. Implementation のどの工程の BLOCKED にも、同じ Pi セッション向けに確認済み具体値と未確定点を区別した再開依頼文が定義され、未解消の条件・回答・承認を飛ばさない。REPLAN_REQUIRED／FAILED の既存契約を壊さない。
5. 既存規約優先／未定義時の文書分担、Planning の更新先計画、Implementation の必要な更新が接続され、README への集約や不要な文書一律新設を要求しない。
6. 担当する各成果について下記の正式チェックと契約照合を実施し、4ファイルの関連記述・参照が整合する。実行した確認と未確認範囲、対象外への変更がないことを報告する。

## 動作確認方法

### 保証対象・自動テスト・TDD

今回保証するのは、上記 Markdown 手順契約と既存契約の整合である。検証資産判断、BLOCKED 再開案内、文書分担の全対象に TDD は指定しない。文言テストの Red → Green では Agent の判断・実行遵守を保証できず、新しい実行ロジックも追加しないためである。非 TDD を検証不要とはしない。

- Worker: 担当差分を入力設計・正式 Plan・既存契約と照合し、`pnpm exec vitest run test/planning-skill.test.ts test/implementation-skill.test.ts test/to-ticket-skill.test.ts` で既存 loader／参照解決を確認する。
- Root: 最終差分・追加／未追跡ファイルを確認し、`pnpm check` と `git diff --check` を自ら実行する。正式 full suite を間引かず、Worker と同じ focused tests を主体変更だけでさらに反復しない。
- 新規の本文文字列一致テスト、汎用 Markdown validator、模擬 Agent／承認、恒久 E2E・smoke runner、外部 Skill を固定 checkout から読むテストを追加しない。既存 tests／CI は変更しない。

### Root の直接確認：一次文書による契約照合

Root は正式チェックと別に、改訂した実ファイルを読み、入力設計、正式 Plan、共通 Skill、Plan → ticket Verification → Worker／Root の既存契約を次の具体的入力で追う。各 Work Item は関係する行と不変条件を引き継ぐ。Correctness Reviewer は実差分と照合結果を正式要求に照らして確認する。専用の判定表・状態管理ファイルは作らず、結果は通常の報告に含める。

| 入力・状況 | 期待する契約 |
| --- | --- |
| 既存の手順・操作手段で対象の起動から cleanup まで実行可能 | 参照と関係機能を引き継いで再利用し、Create・全 Map 実行・重複資産作成を要求しない |
| unit test と起動コマンドはあるが必要な実操作・観測手段がない。利用は一度だけ | 小規模や反復回数を理由に除外せず、Planning が不足に限定した Create の必要性・初期対象を残す。Planning 自身は生成・成立確認しない |
| Plan は「Create の予定なし」、実装時に手段の不足が判明 | 正式 Plan／Verification に承認された最小補完裁量が維持され、Root が保証・対象範囲・期待結果を変えず採否を判断する。未予定のファイル追加だけでは再計画・追加承認にしない |
| 明示禁止・規約・既存 Approved Plan の制約がある | 見込みと区別し、新方針で上書きしない。確認し、正式 Plan の変更が必要なら REPLAN_REQUIRED |
| 必要な共通 Skill／権限がない／実ブラウザ確認を unit test だけへ変える必要がある | 前者は不足と再開条件を示して BLOCKED、後者は保証変更として REPLAN_REQUIRED。独自代替や無断 install で回避しない |
| selector／入口が変更され既存資産に影響／初期一機能で Create 成立 | 関連手順・helper・Map のみ更新・再実行し、証拠・cleanup と writer 分担を保つ。Maintain や全件点検は要求せず、一機能の成功を全完了条件や Root 直接確認の代わりにしない |
| Work Item 識別前に入力不明で BLOCKED | 確認済み cwd、元入力、未確定点を明示し、Pi に対象確認から依頼する。URL／Plan を捏造せず、既知値の補完をユーザーへ丸投げしない |
| 判断待ち、依存未完了、承認待ち、コンポーネント不足で BLOCKED | 停止理由・未充足条件・必要な問いを具体化した同セッション Pi 向けプロンプトを示す。送信だけで解消・回答・承認とせず、未充足なら停止維持 |
| 部分実装後の BLOCKED と再開条件の解消 | 現在の Work Item／Plan／作業ツリーと解消を Pi が確認してから停止箇所から続行する。変更を保持し、影響した変更前のチェック・Review・Approve は流用しない |
| 再確認で Plan の変更が必要／FAILED | 前者は既存 REPLAN_REQUIRED の別 Planning セッション案内へ戻る。後者を機械的に BLOCKED へ読み替えない。Planning 完了前の実装再開案内・自動起動はしない |
| 文書分担が未定義／既存規約あり／詳細は一種類だけ必要 | 未定義時だけ既定を使い、既存規約を優先する。Plan に必要な更新先を残して Implementation に引き継ぎ、4文書の一律作成・移動・README 集約を要求しない。文書の存在だけで検証手段充足とはしない |

### 再利用する検証資産と不足・分担

- `test/planning-skill.test.ts`、`test/implementation-skill.test.ts`、`test/to-ticket-skill.test.ts` は loader／参照解決に適し、上記の意味的契約や Agent 実行を証明しない。tests は再利用のみ。
- `docs/testing/planning-feature.md` と `docs/testing/implementation-feature.md` は、隔離 fixture、実 Root／人間の承認、実履歴、差分、未実行範囲の区別という既存 smoke 手順を提供する。今回選ぶ対象は本 Plan に記した契約照合であり、これらの過去結果を新版の成功として流用しない。Create の採否・生成・後続再利用と BLOCKED 再開の結合全体を実証する手順としては不足があり、それらの実 E2E は今回未実行として残す。古い「Code Review は未設定で無効」の記述も流用せず、現行の未設定で有効・明示 false のみ無効を維持する。
- この文書契約改訂の確認には、正式チェック、一次文書、上記の具体的な照合手順が揃うため、現時点では Taskflow 自身の検証 Skill／Feature Map／helper の Create を予定しない。これは作成禁止ではない。Implementation Root は現物確認で承認済みの確認を成立させる手段の不足が分かれば、保証対象・対象外・期待結果を維持する最小の Create／関連更新を判断できる。必要時は共通 Skill の実ファイルを明示 read し、初期対象を不足する確認経路に限定する。実 Agent E2E へ保証を拡大する許可にはしない。
- Worker は担当差分の照合と focused tests、Root は正式チェック・一次文書の直接照合・最終受入れを担当する。資産補完が必要なら Root が対象・担当・証拠・cleanup の分担を明示し、関連部分の更新後は変更した方法を再実行する。同じ cwd の同時 writer は作らない。
- 本確認で READY とできるのは文書契約改訂の完了条件まで。実 Agent の採否・Create・後続再利用・再開遵守、一般的な時間削減・負担削減は未検証と明記し、loader 成功・机上照合をその実証にしない。

## 保存・引継ぎ・終了

明示的な Plannotator Approve 後だけ正式 Plan を保存し、承認内容との一致を確認する。ticket Skill で tracker 設定、分割、最終本文・保存先の保存公開を各契約に従って別々に確認する。各 Work Item に正式 Plan 参照と関係する要求・保証対象／対象外・確認方法／期待結果・非 TDD・検証分担・必要時の最小補完裁量と限界を維持する。

この Planning は正式 Plan とユーザー確認済み Work Items の保存・公開で終了する。Implementation、検証資産生成、Worker 起動、merge、release、deploy は開始しない。