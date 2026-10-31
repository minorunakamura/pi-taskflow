# taskflow-implementation のテスト設計・検証分担の調整

## 目的

必要な保証、安全性、データ整合性、回帰確認を維持しながら、不要なテスト準備・処理と、実行主体が変わっただけの重複実行を抑える。TDD や特定の Skill を重さの原因と決めつけず、要求と具体的な回帰リスクから検証方法を選ぶ。

対象 cwd: `/Users/minoru/Documents/mywork/pi-dev/pi-taskflow`

## 要件・決定事項

- 変更対象は `skills/taskflow-implementation/SKILL.md`。共通基準、fresh Worker への依頼、Root の正式チェック・直接検証、修正後の再検証を中心に、既存記述を補足・置換する。
- 保証したい動作・失敗と具体的な回帰リスクを先に特定し、承認済み seam を守って、最小の実用的な検証経路と前提状態を選ぶ。適切な既存テストを優先する。保証の不足があれば必要なテスト・検証を追加し、重さだけを理由に見送らない。
- 保証に不要な fixture、履歴、remote、後続操作は準備・実行しない。前提状態を直接用意しても、必要な整合条件を維持する。接続や状態遷移自体が保証対象なら、その経路を実際に通す。
- 公開境界での検証は、毎回 full pipeline を起動することと同義ではない。既存テストとの保証の重なりを確認するが、操作前後など異なる時点の安全確認を単純な重複として削らない。
- 軽量化のために保証や production code を歪めない。必要な実操作を mock で消したり、テスト専用の公開 API・抽象化を増やしたりしない。
- Root は共通基準の内容と検証分担を fresh Worker に渡す。Worker は対象テストと focused regression を行い、影響が広ければ検証範囲を広げる。Approved Plan が TDD を指定した場合だけ既存の `tdd` Skill を指定し、承認済み seam で Red → Green を行う。TDD にも共通基準を適用し、承認済み seam の再承認を求めない。
- Root は正式な関連チェックと完了条件の直接検証を自ら実行する。Worker の自己申告や成功報告で代替しない。Root に必要な検証まで「重複」として省略しない。
- 修正後は影響した保証を再検証し、共有処理など影響が広ければ full suite も実行する。独立レビューを無条件の全 suite 再実行とはしない。
- 通常のテスト設計は Agent が判断する。必要な拒否条件、trust boundary、安全性、データ整合性、回帰確認、既存の承認 gate を維持する。要件・seam・公開契約・設計の変更は既存の確認・再計画手順に従う。

## 根拠・既存契約との整合

Implementation は次の参照箇所を確認する。外部 Skill のパスは今回確認したローカル導入先であり、配布する Implementation Skill に絶対パスを埋め込まない。

- `skills/taskflow-implementation/SKILL.md` §§3–9：現在のコード確認、Worker 依頼、Root の正式チェックと別工程の直接検証、独立した2つの Review、修正・再提出の既存契約。
- `skills/taskflow-implementation/references/playbooks/feature.md`「チェックと実際の動作確認」：実際の入口から新しい動作と維持する動作を確認する。入口を full pipeline と一律に解釈しない共通基準を補っても、実際の確認を省略しなければ矛盾しない。
- 同ディレクトリの `bug-fix.md`、`refactoring.md`、`performance.md`：元の再現手順、不変条件の前後比較、同条件での再計測は、それぞれ必要な保証として維持する。共通基準を各 Playbook に重複掲載しない。
- `skills/taskflow-planning/SKILL.md` §5、および `skills/taskflow-planning/references/playbooks/feature.md`「完了条件と検証方法」：Plan で TDD の有無と対象公開インターフェースを決める。
- `docs/pi-taskflow-implementation-spec.md` §§11、22–26、31.4：Plan 承認時点でテスト対象も承認済み、Root の正式チェックと直接確認、修正後の再確認、文章一致や loader 成功を Agent の実行遵守の証明にしない契約。
- `/Users/minoru/.pi/agent/skills/tdd/SKILL.md` と同ディレクトリの `tests.md`・`mocking.md`：事前合意した公開 seam、振る舞いの確認、Red → Green、内部構造への結合を避ける既存基準。新たな seam を無断で採用するのではなく、Plan で承認済みの seam を引き継ぐ。
- `test/implementation-skill.test.ts`：Pi loader と同梱参照の解決を確認する既存テスト。今回の手順変更の振る舞いを証明するテストではない。
- `package.json` と `.github/workflows/ci.yml`：正式な統合チェックは `pnpm check`。

この調整のために Feature Playbook、Planning、`tdd` 本体を変更する必要のある重要な矛盾は、確認した範囲ではない。

別件として、`docs/testing/implementation-feature.md` と `docs/testing/implementation-specialized.md` の「Code Review は設定なしでデフォルト無効」は、現行 Implementation Skill と実装仕様書の「デフォルト有効、明示的な false のみ無効」と矛盾する。これは今回のテスト設計・分担変更とは切り離し、既存の設定契約を優先する。今回これらの文書を修正したり、設定の既定値を変更したりしない。実 smoke で無効設定を使う場合は、隔離先の明示設定と実際の tool 結果を確認し、古い記述から skipped を期待しない。

## 制約・対象外

- Feature を含む各 Playbook、Planning、外部 `tdd` Skill 本体、Extension / production code、依存関係、tracker 設定は変更しない。
- 新しい共通基準文書、テスト戦略の保存形式、workflow state、承認段階、固定件数上限、厳格な時間予算、全案件の profile 義務は追加しない。
- 「重ければ新規テストを見送る」という一律の例外や、TDD の一律導入・廃止は追加しない。
- 共通基準を各 Playbook に再掲しない。文書の全体再構成や無関係な修正を行わない。
- 今回の Planning セッションでは対象 Skill の編集、Implementation / Worker 起動、merge、release、deploy を行わない。Approved Plan と Work Item を別途承認・保存した後、実装は別の新しいセッションで行う。

## 実装方針

### 1. 共通基準：§3 に集約する

「正式なチェック」「Work Item ごとの直接検証方法」を確認する既存段落に続けて、短い共通基準を置く。別の管理工程にはしない。

- 要求・回帰リスク → 保証対象 → 承認済み seam → 必要な前提状態と検証経路の順に判断する。
- 既存テストの再利用と保証の重なりを確認し、不要なセットアップ・履歴・remote・後続操作を省く。状態を直接用意する場合の整合条件と、接続・状態遷移を実行すべき場合を明記する。
- 公開境界と full pipeline を区別し、必要な実操作、異なる時点の安全確認、trust boundary とデータ整合性を維持する。
- mock やテスト専用 API・抽象化で保証や production code を歪めない。

### 2. fresh Worker への依頼：§4 を補足・置換する

既存の `verification method` 項目を具体化し、保証対象、承認済み seam、必要な前提状態・経路、再利用できる既存テスト、Worker と Root の検証分担を含める。fresh context の Worker が内容を理解できるよう、共通基準を読んでいるはずだと仮定せず、関係する基準の内容も依頼に渡す。

Worker の担当を対象テストと focused regression とし、共有処理など影響が広ければ範囲を広げる。Root が後で正式チェックを行うことだけを理由に、Worker の必要な検証を省略させない。一方、Worker に Root と同じ全正式チェックを機械的に要求しない。実行結果と未確認事項は既存の結果報告に含め、専用の報告形式は増やさない。

既存の TDD 指定段落に、共通基準の適用、Red → Green、承認済み seam の再承認不要をまとめる。未承認の seam や要件・公開契約・設計の変更は、従来の確認・再計画境界を維持する。

### 3. Root の正式チェックと直接検証：§§5–6 を明確化する

§5 の Root が正式な関連チェックとテストを自ら実行する責務、および失敗・警告・環境制約の扱いは維持する。Worker の focused 実行と Root の正式実行の目的を区別し、Root 自身の正式実行を Worker の報告で済ませない。

Root に必要な正式実行を終えた後、担当者が変わったことだけを理由に同じ検証をさらに繰り返さない。正式コマンドが full suite を含む場合は、共通基準を理由に勝手に間引かない。

§6 の別工程の直接検証を維持し、承認済みの方法・入口で結果を観測することと、無関係な前後工程まで毎回 full pipeline を再現することを区別する。テスト成功だけで済ませず、Root が期待結果・観測結果・未確認条件を確認する。

### 4. 修正後の再検証：§8 を中心に既存経路へ接続する

「影響したチェックと直接検証を再実行する」の既存記述を、修正が影響した保証を選び直し、必要なチェック・直接検証を Root が再実行する内容に具体化する。共有処理など影響が広い場合は full suite も含める。変更前の成功を、影響した変更後の保証に流用しない。

既存の「リスクに応じた再レビュー」を維持する。§7 に、独立レビュー自体は無条件の全 suite 再実行を意味せず、確認した差分・結果・不足とリスクに応じて必要な追加検証を判断する旨を短く補う。Reviewer の独立性や必要な追加実行は妨げない。

§9 の Reject 後も同じ再検証基準を適用するよう短く参照させる。Code Review の再提出・修正後の差分に対する Approve の必要性は変えない。§§7・9 には共通基準を再掲しない。

## 完了条件

1. 共通基準が Implementation Skill に一度だけ記載され、4つの中心箇所と必要最小限の Review / Reject 経路が整合している。
2. fresh Worker に基準の内容と検証分担が伝わり、対象テスト・focused regression・影響に応じた拡大と、TDD 指定時の Red → Green が明確である。承認済み seam の再承認を要求しない。
3. Root の正式チェック、別工程の直接検証、修正後の必要な再検証と広い影響時の full suite が維持され、自己申告による代替や主体変更だけによる機械的な追加反復がない。
4. 必要な拒否条件、trust boundary、安全性、データ整合性、回帰確認、2つの独立 Review、Code Review gate、既存の停止・再計画条件が弱まっていない。
5. 変更差分が対象 Skill に限定され、対象外ファイル・依存関係・新しい必須工程や設定が増えていない。
6. 正式チェックと下記のシナリオ照合を実施し、実際に観測したものと未確認の Agent 実行挙動を区別して報告する。loader 成功・文章一致・机上照合だけで実セッション成功を主張しない。

## 動作確認方法

### 文書変更の検証方針

今回は実行ロジックではなく Agent が読む手順の変更であるため、この Work Item 自体に TDD は指定しない。手順のキーワード一致テストや新しい fixture / runner を追加しない。将来の Implementation で TDD が指定された場合の扱いを文書化することと、この文書編集自体への TDD 導入を区別する。

- Worker は対象 Skill と上記の既存契約を照合し、`pnpm exec vitest run test/implementation-skill.test.ts` で既存の Pi loader・参照解決を確認する。
- Root は実差分を確認し、`pnpm check` を自ら実行する。同じ対象テストを別途もう一度実行することを既定にしない。`git diff --check` も行う。
- Root は正式チェックと別に、変更後の Skill を参照元として次の具体的な入力に対する指示を机上で追い、期待する担当・経路・停止条件になっているか直接確認する。Correctness Reviewer はこの判断を Approved Plan と照合する。

| 入力・リスク | 照合する期待結果 |
| --- | --- |
| 承認済み seam に適切な既存テストがあり、履歴・remote・後続操作は保証対象でない | 既存テストと最小の整合した前提状態を使い、full pipeline や不要な fixture を要求しない |
| 接続・状態遷移そのものが保証対象 | 状態の直置きや mock だけで済ませず、その経路を実行する |
| 操作前と操作後にそれぞれ安全確認が必要 | 同じ確認名であっても単純な重複として削らない |
| TDD 指定・seam 承認済みの Work Item | Worker に基準・分担と `tdd` を渡し、Red → Green と focused regression。seam の再承認なし |
| TDD 指定のない Work Item | `tdd` を追加せず、承認済みの検証方法と共通基準を使う |
| Worker の対象テストは成功したが Root の正式チェックまたは直接検証が未実行・失敗 | Worker の報告で代替せず、必要な確認が未達のまま完了にしない |
| 局所修正／共有処理に広く影響する修正 | 前者は影響した保証を再検証。後者は full suite も含める。独立 Review だけを理由に全 suite を反復しない |
| Reject 後に修正／未承認の seam・公開契約・設計の変更が必要 | 前者は影響した保証の再検証と再提出。後者は既存の確認・再計画手順に戻る |

Skill の実行遵守は机上照合では保証できない。実セッションの smoke を行う場合は、既存の適切な承認済み fixture を優先し、変更した分担や経路の観測に必要な範囲だけを隔離先で実行する。既存 smoke 全体の一律再実行、検証だけのための Planning・tracker 公開・remote 準備は要求しない。正式な入力・承認 gate を模擬せず、利用できる入力や人間参加がなければ未実行理由と残るリスクを報告し、机上照合を smoke 成功に読み替えない。必須の完了条件を確認できない場合は既存の停止手順に従う。

本 Planning 中には実 smoke、Implementation、Worker 起動を行わない。
