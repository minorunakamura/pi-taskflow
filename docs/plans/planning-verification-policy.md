# Planning から Implementation / Review へ検証範囲・TDD 方針を引き継ぐ

## 目的

必要な保証、安全性、データ整合性、回帰確認を保ちながら、今後の Planning が過大な自動テストを計画し、Implementation / Review がさらに増やすことを抑える。検証範囲の選定と TDD の採否を分離し、Plan → Work Item → Worker / Review まで対象・対象外を維持する。

対象プロジェクト: `pi-taskflow`。対象 cwd: `/Users/minoru/Documents/mywork/pi-dev/pi-taskflow`。

## 根拠・現行契約

パスはリポジトリルート基準。Implementation は以下の一次資料の関係箇所を改めて確認する。

- 入力設計: `docs/designs/planning-verification-policy.md` の「範囲と制約」「合意した方針」「具体例と境界」「変更対象と責務」「後続で具体化・確認すること」。下記の確認済み範囲変更を除き、合意済み方針を維持して具体化する。
- `skills/taskflow-planning/SKILL.md` §§5–6、9、および Planning の4 Playbooks: 現行は TDD 採否と公開インターフェースを Plan に残すが、その前に自動化範囲を選ぶ判断基準が不足している。
- `skills/taskflow-implementation/SKILL.md` §§3–8: 最小経路、既存テスト優先、Worker / Root の分担、直接検証、影響した保証の再選択は既に存在する。再定義せず、Planning の選定範囲へ接続する。
- `docs/pi-taskflow-basic-design.md` §11、§§14–15、19–21、および `docs/pi-taskflow-implementation-spec.md` §11、§§13、16、21–25、31.4: TDD、正式入力、引継ぎ、チェックと直接確認、Review の既存契約。
- `skills/taskflow-to-ticket/SKILL.md` §§2–5 と `references/templates/ticket.md`: 正式 Plan の参照、対象外、Verification、Plan 変更時の停止は既存機能で足りる。
- `test/planning-skill.test.ts`、`test/implementation-skill.test.ts`、`test/to-ticket-skill.test.ts`: loader と同梱参照の解決を確認する。採否判断・実行遵守・時間改善を証明するテストではない。
- `package.json` と `.github/workflows/ci.yml`: 正式集約チェックは `pnpm check`。

### 入力設計からの確認済み範囲変更

入力設計の「変更対象と責務」には `docs/testing/` の既存確認文書への観点追加が含まれるが、Plan Review 後のユーザー確認で「追記も削除しない」と決定した。今回の確認観点は本 Plan の「動作確認方法」に残せるため、確認用文書への重複追加を避ける。

したがって `docs/testing/` は既存ファイルを保持し、今回一切変更しない。この範囲については入力設計の変更対象表より本 Plan を優先する。入力設計書自体は今回編集せず、後続の更新作業も本 Plan には追加しない。検証範囲・TDD の判断基準と引継ぎ契約は変更しない。

## 要件・決定事項

### 1. 検証対象の選定を TDD より先に置く

Planning Root は要求と具体的な回帰リスクから、保証したい動作・契約、既存検証で確認できる範囲、必要な追加を判断する。自動テストと直接確認の対象・対象外、最小の実用的な経路を選んだ後、その限定対象への TDD 採否を決める。通常のテスト設計をユーザーに丸投げしない。

- テストが必要、非自明、公開境界でテスト可能というだけで TDD にしない。TDD の採用を理由に対象・ケース・環境を拡大しない。
- 非 TDD はテスト不要でも、テストを最後にまとめて書く指定でもない。必要なテスト・実動作確認・回帰確認は採否によらず計画する。
- 変更前に成功する characterization checks、最適化前の baseline と、失敗テストから始める TDD を区別する。

### 2. 自動化の規模を直接選ぶ

必要な保証を既存検証と最小の追加で確認し、全経路・全条件・全組合せの自動化を目標にしない。

- 大きな環境準備、長い実時間待機、広い操作シナリオ、新しい検証基盤を伴う自動テストは、既定では追加・拡張しない。
- 既存のテスト用の仕組みがあることや一時的な Probe の成功だけを、恒久テスト追加の理由にしない。実動作確認の必要性を、恒久テストや新しいテスト用プログラムの作成義務に直結させない。
- PTY、実 Git、browser、HTTP などの技術名だけで禁止・許可しない。公開境界を full application / 別 process 起動と同義にしない。process を起動しない場合もケースを無制限に増やさず、テスト専用 API・抽象化・大きな fake を追加しない。
- 重い自動化の例外は、今回必要な保証について既存テスト・小さい検証・直接操作では何が不足し、追加自動化を維持する価値があるかで判断する。「回帰防止に役立つ」という一般論だけでは追加しない。
- 必要な安全性・データ整合性の確認は省かない。保証の必要性と全経路の自動化を区別し、自動化から除外した結合部分を小さいテストで同等に保証したことにしない。

### 3. TDD は対象作業ごとに判断する

- Feature: 選定した限定対象に test-first の具体的利点がある場合に採用できる。機能全体・非自明なロジック全般への一括指定にしない。
- Bug Fix: 意図した動作と原因が確認され、不具合による失敗を確認できる明確で軽い local test path があれば採用する。不明確・高コスト・大規模 integration 準備が必要なら強制せず、実行可能な再現・回帰検証を選ぶ。不採用を必要な自動テストの除外理由にしない。
- Refactoring / Performance: 既定で TDD を要求せず、不変条件・既存テスト・必要な characterization と前後比較、または同条件の baseline / 再計測・成功条件・動作維持を確認する。
- 明示指定・適用されるプロジェクト規約は通常の既定より優先する。「回帰テストを追加して」を test-first 指定と読み替えない。衝突・実行不能・要件や保証の変更は既存の確認経路へ戻し、通常の採否に個別承認を追加しない。
- TDD の実行は既存の `tdd` Skill を使う。通常のテスト方針を決めるためだけには起動しない。

### 4. Plan・分割・Implementation / Review で範囲を維持する

Plan の既存の「動作確認方法」に保証対象、自動テストと直接確認の範囲・方法・期待結果、TDD の有無・適用対象を残す。必要なら追加・拡張しない自動化も明記し、全ケース・テストコードは固定しない。混在作業は対象を識別し、Plan 全体の種別で一括指定しない。

チケット分割では正式 Plan の参照と選定範囲を維持し、採否を独自変更しない。Implementation Root は保証対象・対象外、自動化範囲、TDD の対象、検証分担を Worker と必要な Review 入力に渡す。通常のテスト詳細はその範囲内で判断し、未指定対象へ `tdd` を追加しない。

既存の Worker＝対象テストと focused regression、Root＝正式チェックと別工程の直接検証という分担を維持する。Root の直接確認を恒久テスト作成義務にせず、Worker に同じ全正式チェックを機械的に重ねない。正式チェック自体を勝手に間引かない。

Review の検証不足は具体的な保証に結び付け、一般論で重い自動化を追加しない。対象外自動化や Plan の保証・設計を変える必要があれば既存の確認・再計画経路へ戻る。修正後は影響した保証を選び直す現行基準を使う。テスト側の同期・入力手順の問題と製品不具合を区別し、根拠のない再試行・timeout 延長で失敗を隠さない。

## 制約・対象外

- 既存リポジトリのテスト削除・整理、規約変更、既存 Approved Plan / Work Item の改訂は行わない。pi-skills Issue #20 とその Approved Plan / Work Item は変更しない。
- `docs/testing/` は追記・削除・修正を行わない。
- CI の選択実行・頻度、Worker timeout、commit・自律実行・承認方針の変更は含めない。
- 新しい Skill、設定、承認段階、workflow、テスト戦略の型・保存形式、管理表、永続状態を追加しない。
- Extension / production code、外部 `tdd` Skill、依存関係、loader tests、ticket Skill / templates は変更しない。Planning の Refactoring / Performance と Implementation の全専門 Playbooks は契約照合に留める。
- 入力設計書と既存未コミット変更を保持し、独断で編集・commit / stash / 破棄しない。文書全体の再構成・無関係な修正をしない。
- 既存の `docs/testing/implementation-feature.md` / `implementation-specialized.md` にある Code Review の「未設定で無効」という古い記述の是正は別件とする。今回設定契約を変えない。smoke を実行する場合は現行 Implementation §9（未設定で有効、明示的な false のみ無効）と実際の tool 結果を優先する。
- 今回の実装完了は文書契約の整合と下記の確認まで。実 Agent の実行遵守、runtime smoke 成功、時間削減の実証を完了条件にしない。これらは後続の実運用で観測する。

## 実装方針

変更対象は以下の6ファイル。短い補足・置換とし、共通の判断基準を複数ファイルへ複製しない。

1. `skills/taskflow-planning/SKILL.md`
   - §5 の既存テスト・TDD 段落を、検証範囲→自動化規模→対象別 TDD という判断基準へ具体化する。上記の作業種別ごとの既定もここに集約する。
   - §6 の Plan 作成と §9 の ticket への追加制約に、保証対象・対象外、自動化範囲、対象別採否の記録・継承を接続する。新しい必須見出しは作らない。
2. `skills/taskflow-planning/references/playbooks/feature.md`
   - 「完了条件と検証方法」を共通 §5 へ接続する。非 TDD＝テスト不適合時だけの代替、という読みにせず、限定対象への具体的な test-first 利点で判断する。
3. `skills/taskflow-planning/references/playbooks/bug-fix.md`
   - 再現・原因確認と修正前後の回帰検証を維持する。軽い明確な failing path での TDD と、不明確・高コスト時の代替検証を共通基準へ接続する。採否条件の本体は複製しない。
4. `skills/taskflow-implementation/SKILL.md`
   - §§3–4 に Plan の対象・対象外と対象別採否の維持を補う。「保証不足は必要な検証を追加する」を維持しつつ、必要な保証と恒久自動化の手段を区別する。Plan を変える追加は既存の確認・再計画へ戻す。
   - §6 に直接確認と恒久テスト作成の区別、§§7–8 に具体的保証に基づく指摘・対象外自動化の非拡大・失敗原因の区別を必要最小限補う。既存分担・再検証・停止・承認 gate は変えない。
5. `docs/pi-taskflow-basic-design.md`
6. `docs/pi-taskflow-implementation-spec.md`
   - 両文書の §11「TDD」を中心に、検証範囲を先に選び対象別に判断する責務を整合させる。Plan、Work Item、Worker / Review の関連箇所も必要最小限接続する。詳細基準の本体は Planning Skill に置く。

## 完了条件

1. 保証対象・自動化範囲の選定が TDD 採否より先になり、種別別の既定、明示指定・規約の優先、例外条件が共通 Planning に一度だけ定義されている。
2. Feature / Bug Fix Playbook と基本設計・実装仕様に、非 TDD＝テスト不要、公開境界＝full pipeline、検証必要＝TDD / 恒久自動化という読み戻りがない。
3. Plan の既存項目→ticket への追加制約→Worker / Review の入力に、保証対象・対象外、自動化範囲と対象別 TDD を追跡できる。通常のテスト詳細の判断と Plan 変更が区別されている。
4. 必要な安全性・データ整合性・回帰確認、Root の正式チェックと直接確認、2つの独立 Review、修正後の必要な再検証、停止・承認 gate が弱まっていない。根拠のない再試行・timeout 延長を解決扱いにしない。
5. 変更は上記6ファイルに限定され、`docs/testing/` を含む対象外の変更・新しい基盤・管理工程がない。
6. 下記の正式チェックとシナリオ照合を実施し、結果・未確認事項を報告する。loader・文章一致・机上照合を実行遵守や負担削減の証明にしない。

## 動作確認方法

### この文書改訂自体の検証

この Work Item には TDD を指定しない。変更は Agent 向け手順と設計文書であり、新規の実行ロジックではない。文字列一致テスト、全組合せ、恒久的な操作テストやテスト用プログラムを追加せず、既存テストを削除・変更しない。

- Worker: 対象文書と入力設計・既存契約を照合し、`pnpm exec vitest run test/planning-skill.test.ts test/implementation-skill.test.ts test/to-ticket-skill.test.ts` で既存の loader・参照解決を確認する。
- Root: 実際の差分と追加・未追跡ファイルを確認し、`pnpm check` と `git diff --check` を自ら実行する。Worker と同じ focused tests を別途もう一度実行することを既定にしない。
- Root: 正式チェックと別に、改訂文書を参照元として下記の具体的入力を机上で追い、要求する保証・担当・経路・停止判断が一貫しているか直接確認する。Correctness Reviewer は実差分とこの照合結果を本 Plan・入力設計に照らして確認する。

### シナリオ照合の期待結果

| 入力・状況 | 照合する期待結果 |
| --- | --- |
| TDD 明示なしの小さな CLI Feature。既存確認と2通りの直接実行で要求を確認できる | 先に保証・自動化範囲を選び、非自明・テスト可能というだけで TDD や広い操作テストを一括指定しない |
| Feature の限定した判定処理には test-first の具体的利点があり、端末操作は直接確認する | TDD は判定処理だけに適用でき、端末・PTY・全経路へ拡大しない。直接確認部分を小さいテストと同等保証にしない |
| 原因確認済みで軽い local failing path がある Bug Fix／大規模環境準備しかない Bug Fix | 前者は対象の失敗を確認する TDD を採用。後者は強制せず実行可能な再現・回帰確認を選び、必要な自動テストを一律除外しない |
| Refactoring の変更前成功 checks／Performance の baseline | TDD と混同せず、等価性／同条件再計測と回帰確認を維持する |
| 「回帰テストを追加して」／明示 TDD・非 TDD 指定／適用規約との衝突 | 回帰テスト要求だけを test-first と解釈しない。指定・規約を優先し、衝突・実行不能は既存の確認経路へ戻る |
| Feature・Bug Fix・Refactoring が混在し、チケットへ分割される | 各対象の保証・自動化範囲・TDD 有無が正式 Plan 参照とともに維持され、分割側・Worker が独自変更しない |
| Root 直接確認を指定した部分／Reviewer が一般論で広い操作テストを要求 | 直接確認を恒久テスト作成義務へ変換しない。指摘は不足する具体的保証で評価し、対象外自動化・保証や設計の変更は既存の確認・再計画へ戻す |
| 小さい修正／共有処理へ影響する修正／操作テストの同期失敗 | 影響した保証を選び直す現行基準と正式チェックを維持する。同期・入力手順の問題と製品不具合を分け、再試行や timeout 延長だけで成功扱いにしない |

これらは文書契約の整合を確認するものであり、実 Agent の判断・実行を観測したことにはしない。実 Root smoke と時間効果の測定は今回の必須確認にせず、後続の実運用で観測する。観測する際は隔離先と実ユーザー承認を使い、実施した範囲だけを成功として報告する。本 Planning 中に検証用の Implementation を起動しない。

Approved Plan と Work Item の確認・保存・公開後も、このセッションでは Implementation、merge、release、deploy を開始せず終了する。
