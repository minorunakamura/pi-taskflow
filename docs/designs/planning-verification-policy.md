# Planning と Implementation の検証範囲・TDD 方針

## 目的と現在地

今後の Taskflow Planning が過大な自動テストを計画し、Implementation / Review でさらに増やすことを抑える。必要な保証を保ちながら、軽微な変更でも Worker が長い検証待ちと timeout・再開を繰り返す負担を減らす。

本書は Design Discussion で合意した基本方針と根拠を引き継ぐ設計文書であり、Approved Plan や実装開始の許可ではない。2026-11-03 JST 保存。Skill の具体的な改訂文面・実装手順は後続の Planning で定め、方針の実行遵守と時間削減効果は未検証として残す。

## 範囲と制約

- 対象は今後の Planning の判断基準と、Plan → Work Item → Implementation / Review への引継ぎ。
- 既存リポジトリのテスト削除・整理、規約変更、既存 Approved Plan の変更は今回扱わない。
- pi-skills Issue #20 と、その Approved Plan / Work Item は変更しない。
- CI の選択実行・頻度、Worker の timeout 設定は別論点とする。
- 新しい Skill、設定、承認段階、workflow、テスト戦略の型・保存形式、必須の管理表は追加しない。
- 既存の未コミット変更を保持し、独断で編集・commit / stash / 破棄しない。
- pstack / yazi の自律実行・commit・承認方針全体を導入するものではない。

## 確認した現行と問題

Taskflow は Planning が TDD の採否と対象公開インターフェースを決め、Plan に記載する構造である。Implementation は Approved Plan が指定した場合だけ既存の `tdd` Skill を Worker に渡す。一方、Planning 共通 §5 と Feature Playbook には、TDD の採用条件や、追加する自動テストの規模を選ぶ基準が不足している。

現在の `tdd` Skill は主に、採用後の Red → Green、事前合意した公開境界、振る舞いを確認するテスト品質を定義している。公開境界でテストできることと、test-first を選ぶ理由は別である。

Implementation 共通 §§3–8 には既に、要求・回帰リスクに基づく最小の検証経路、既存テストの優先、Worker の対象テストと Root の正式チェックの分担、影響に応じた再検証がある。今回これを再定義せず、Planning で選ぶ対象・対象外と接続する。

## 合意した方針

### 検証対象の選定を TDD の採否より先に置く

Planning Root は要求と具体的な回帰リスクから、保証したい動作・契約、既存テストで確認できる範囲、必要な追加を判断する。調べれば分かることや通常のテスト設計をユーザーへ丸投げしない。

自動テストにする対象・対象外と、最小の実用的な検証経路を選び、その対象への TDD 採否を判断する。これは新しい必須工程ではなく、既存の設計・検証方法の判断基準である。

- テストが必要、変更が非自明、公開境界でテスト可能という理由だけで TDD を選ばない。
- TDD を採用しても、それを理由に対象・ケース・検証環境を拡大しない。
- 必要なテスト・実動作確認・回帰検証は、TDD の有無にかかわらず計画する。非 TDD はテスト不要や、テストを最後にまとめて書く指定ではない。
- Refactoring 前に現在の実装で成功する characterization test を置くことや、最適化前に baseline を測ることを、失敗テストから始める TDD と混同しない。

### 自動化の規模を直接制御する

必要な保証を、既存の検証と最小の追加で確認する。全経路・全組合せの自動化を目標にしない。

- 大きな環境準備、長い実時間待機、広い操作シナリオ、新しい検証基盤を伴う自動テストは、既定では追加・拡張しない。
- 既存のテスト用の仕組みが使えることや、設計時の一時的な実験が成功したことだけを、恒久テストの追加理由にしない。
- 実動作確認が必要であることを、恒久的な自動テストや新しいテスト用プログラムの作成要求へ直結させない。
- PTY、実 Git、browser、HTTP などの技術名だけで一律に決めない。公開境界も、必ずアプリ全体や別 process を起動するという意味ではない。
- process を起動しないテストでも、全条件・全組合せを増やしてよいわけではない。テストのためだけに公開 API・抽象化・大きな fake を追加しない。

例外は「回帰防止に役立つ」という一般論ではなく、今回必要な保証のうち、既存テストや小さい検証・直接操作では何が不足し、追加の自動化を維持する価値があるかを根拠に判断する。

必要な安全性・データ整合性の確認は省かない。ただし、保証の必要性と、それを全経路で自動化することは区別する。自動テストから除外した部分を、別の小さいテストで同等に保証した扱いにはしない。

### 種別と TDD の関係

当初の「Feature は既定で非 TDD」を中心に抑制する案から、検証範囲を直接制御し、その範囲内で採否を決める方針へ見直した。Feature の TDD は全面禁止しない。

| 作業内容 | 方針 |
| --- | --- |
| Feature | 選定した限定対象に test-first の具体的な利点があれば採用できる。機能全体・非自明なロジック全般への一括指定にしない。 |
| Bug Fix | 意図した動作・原因が確認され、対象の不具合による失敗を確認できる明確で軽い local test path があれば採用する。不明確・高コスト・大規模な integration 準備が必要なら強制せず、実行可能な再現・回帰検証を選ぶ。 |
| Refactoring | 既定で TDD を要求しない。不変条件、既存テスト、必要な characterization checks、変更前後の等価性を確認する。 |
| Performance | 既定で TDD を要求しない。同条件の baseline / 再計測、成功条件、動作維持の回帰検証を行う。 |

Bug Fix の TDD 不採用を、必要な自動テストまで除外する根拠にしない。TDD の実行には既存の `tdd` Skill を使い、独自の代替 Skill は作らない。通常のテスト方針を決めるだけで `tdd` Skill を実行する必要はない。

ユーザーの明示指定・適用されるプロジェクト規約は通常の既定値より優先する。「回帰テストを追加して」を test-first の指定に読み替えない。指定・規約の衝突、実行不能、要件・公開契約・範囲や保証の変更が必要な場合だけ既存の確認経路へ戻り、通常の採否に個別承認を増やさない。

### Plan と実装への接続

Plan の既存の「動作確認方法」に、今回の保証対象、自動テストと直接確認の範囲・方法・期待結果、TDD の有無と適用対象を残す。必要な場合は、追加・拡張しない自動化の範囲も明記する。全テストケースやテストコードは固定しない。

採否は Plan 全体の種別ではなく対象作業に適用する。Feature Plan 内の Bug Fix / Refactoring などを一括指定せず、混在時は対象を識別できるようにする。チケット分割ではその範囲と正式 Plan の参照を維持し、採否を独自に追加・変更しない。

Implementation Root は検証対象・対象外・TDD の適用範囲・分担を Worker に渡す。通常のテスト詳細はその範囲内で判断する。TDD 指定がない対象に独自に `tdd` Skill を追加しない。

- Worker は対象テストと focused regression、Root は正式チェックと直接検証という既存の分担を維持する。Worker に Root と同じ全正式チェックを機械的に重ねない。
- Root の直接確認を、恒久テストや新しいテスト用の仕組みを作る義務にしない。承認済みの直接操作・利用者確認などと、自動テストを区別する。
- Review は検証不足を具体的な保証に結び付け、一般論だけで重い自動化を追加しない。対象外とした自動化や Plan の保証・設計を変える必要があれば、黙って拡大せず既存の確認・再計画経路へ戻る。
- 修正後は現行の「影響した保証を選び直す」基準を使う。全変更で無条件に全体検証を増やさず、正式チェックを勝手に間引くルールにも変えない。
- テスト側の同期・入力手順の問題と、製品側の不具合を区別する。失敗を根拠なく再試行や timeout 延長で隠さない。

## 具体例と境界

TUI では、イベントを直接渡して状態やメモリ上の描画 buffer を確認する方法と、PTY で実製品を起動・操作する方法を区別する。前者は実キー入力の変換、IME、実端末表示、端末復元を保証しない。どちらも全条件の自動化を既定にはしない。

commit Skill では、入力受付・形式・外部結果に対する判定の変更だけで、repository・履歴・remote・commit → push → PR の一式を当然には追加しない。実操作の結果を変える場合は、その契約に対応する限定的な検証を選ぶ。Git index や commit の確認は操作結果の確認でもあるため、「内部実装の検査だから禁止」とは扱わない。Git の応答を与えるテストで実 Git の状態取得・実操作まで保証したことにせず、本番の判定処理を成功固定の stub に置き換えない。

## 変更対象と責務

以下のパスは pi-taskflow リポジトリルート基準。ここではファイルの責務を定め、詳細な作業手順は定めない。

| 対象 | 責務 |
| --- | --- |
| `skills/taskflow-planning/SKILL.md` §5 と Plan 作成・引継ぎの関連箇所 | 判断基準の本体。対象・対象外、自動化範囲、TDD 採否、Plan / Work Item への接続。 |
| Planning `references/playbooks/feature.md` / `bug-fix.md` | 共通基準への接続と Bug Fix 固有の採用・代替検証条件。共通基準を複製しない。 |
| `skills/taskflow-implementation/SKILL.md` §§3–8 | Worker 依頼、直接検証、Review、修正時に選定範囲を維持する。現行の検証分担・再検証基準を再利用する。 |
| `docs/pi-taskflow-basic-design.md` / `docs/pi-taskflow-implementation-spec.md` の TDD・関連箇所 | 判断責務と Plan / Implementation の契約を整合させる。 |
| `docs/testing/planning-feature.md` / `planning-specialized.md` など既存の確認用文書 | 明示指定なしの採否、対象範囲の選択と引継ぎを確認する観点を補う。 |

Refactoring / Performance Playbook、Implementation の専門 Playbook、チケット Skill は関連契約を照合し、矛盾がなければ変更を増やさない。外部 `tdd` Skill、Extension、loader tests の変更や、採否基準のチケット Skill への複製は不要と考える。

## 根拠と、断定しないこと

### 一次資料

2026-11-02 に pstack の main をキャッシュなしで取得した。

- [Feature Playbook](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/feature.md)：標準手順で TDD を要求しない。
- [Bug Fix Playbook](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/bug-fix.md) と [tdd Skill](https://github.com/cursor/plugins/blob/main/pstack/skills/tdd/SKILL.md)：軽い local test path で failing-test-first を使い、不明確・高コスト・integration-heavy な場合は強制しない。回帰検証は維持する。description の regression test 要求を TDD 起動条件とする扱いは、そのまま導入しない。
- [yazi AGENTS.md](https://github.com/sxyazi/yazi/blob/ed3322186eaaed20132edd0f798a783b6b6f4cd2/AGENTS.md)：依頼がなければテストを追加・変更しない一方、再現調査には simulated terminal を案内する。必要な動作確認と恒久テストの追加が別判断である例。全ソースを精査して PTY テストの不存在を証明したものではなく、同方針全体の導入でもない。
- ローカルの `/Users/minoru/.pi/agent/skills/tdd/SKILL.md`、`tests.md`、`mocking.md`：採用後の Red → Green、合意した公開境界、振る舞いのテスト品質。これは確認時の導入先であり、配布 Skill に絶対パスを埋め込まない。

### 実セッション

- リバーシ Planning `01a14325-805b-7497-bb68-65ea937f2176`：依頼・入力設計に TDD 指定はなく、Planning がルール・CPU・controller の TDD を指定した。検証対象は具体的だが、test-first を選ぶ理由は独立して示されていない。選択原因や負担までは断定しない。
- backlog-cli 設計確認 `01a177a1-dacb-71d4-989d-e6bb69dd88a8`：開始時点で設計書は既存。端末・editor の成立性を一時ディレクトリの PTY 実験で確認し、結果と限界を設計書へ記録した。製品の恒久的 PTY テストや TDD を要求・合意した記録は見つからない。
- backlog-cli Planning `01a17952-c4df-71d4-989d-e6bf6be6ee18`：製品の TDD 境界に TestBackend と PTY をまとめて指定し、個別 Work Item にも PTY、全件共通に「非自明なロジックを TDD」を引き継いだ。TDD が PTY 採用の原因だったか、設計時の実績が採用理由だったかは明記されていない。

原ログの所在は `/Users/minoru/.pi/agent/sessions/` 配下の pi-demo / backlog-cli の cwd 別ディレクトリ。現在の規約に TDD / PTY があることを、最初からユーザーがその方法を要求した証拠にはしない。

### backlog-cli の保存レポート

正本：`/Users/minoru/Documents/mywork/cli-dev/backlog-cli/.pi/taskflow-reports/97a8acf1-f8fd-4697-9aff-3b482e74dae3/report.json`。
集計日時は `2026-11-02T16:44:08.148Z`、contentDigest は `498dc6bf0be161e1039cc15563c14680e071a0520426b1c20c15aea64741ee3c`。読取時に JSON digest の一致と HTML への同 digest の記載を確認した。レポートは非公開の調査資料として扱い、本文全体を本書へ転載しない。

- 収録は Planning 1 Root と Issue #13 / #14 / #15 / #16 / #19 の Implementation。#13 と #19 に約30分の Worker timeout と再開がある。Worker 全体の時間をテスト時間と同一視しない。
- #13 は最終の小さな footer 変更後の全対象テストが外側の上限で中断し、再開時は追加コード変更なしで179件成功を報告した。出典：Root `01a18155-7fef-71d4-989d-e6e03d0093ea` の再開依頼 entry `a82bb4b4`、結果 `8ee45f96`。
- #16 のある全対象実行は Tool 結果の wall time が232.6秒、`tui_process` は23.96秒、`tui_shell` は0.02秒。同じチェック系列には約60秒・約30秒の他の対象群もあり、実時間 timeout 検証も記録されている。負担全体を PTY だけに帰せない。出典：Root `01a1831e-820a-71d4-989d-e6e75ab3c462` の `21b7d88e` / `e50e2531`。
- #19 では、遅れて届く preview のエラー popup が待機対象を隠し、テストが q を送れず停止した。テスト4行追加・2行削除と記録だけの修正でも Worker は約11分49秒かかり、反復・関連テスト・全対象302件などを確認している。自動操作の同期を維持する負担の実例。各検証がすべて不要だったとは断定しない。出典：Root `01a18a71-d78f-7479-8828-f54b37c284dd` の `cb377b81`、Worker `01a18b31-a222-77d9-b8bb-50887785ea36` の `5887dc5d`、run `6a78bfb9-d282-4d0e-8682-1d4fe4b5d5fc`。
- Review が signal handler の有効化前の中断や editor 異常終了後の raw / noecho 残存など、実際の製品不具合を検出した記録もある。PTY テストをすべて無価値とは扱わない。

全26 Issue を網羅したレポートではなく、21 Issue に別 Taskflow との所属競合がある。一部の子 Artifact は取得不能・抜粋あり。未取得を未実施とせず、Agent の報告と Tool 観測、現在の取得状況を区別した。Root / 子 / wrapper の時間・Usage は単純合算していない。TDD 有無の比較実験ではなく、TDD が増やした時間や削減可能量は算出できない。

## 後続で具体化・確認すること

主要方針は合意済み。後続の Planning では共通手順と既存契約を照合し、判断基準の重複や「検証が必要だから TDD / 重い自動化」という読み戻りを防ぐ短い文面に具体化する。

期待する結果は、TDD 採用率の低下ではなく、必要な保証を保ちながら、追加する自動化の規模と Worker の負担を小さくできることである。

- 小さい Feature で軽い対象に留まり、広い操作テストを追加しないか。
- 軽い再現経路がある Bug Fix では failing-test-first を選び、重い経路しかない場合は無理にそのための環境を作らないか。
- 混在作業とチケット分割で TDD の適用対象・対象外が維持されるか。
- Review の一般的なテスト追加要求から、対象外の自動化が増えないか。
- 直接確認と恒久テスト作成、通常のテスト詳細と Plan の範囲変更が区別されるか。

文章一致や Skill loader の成功だけで実行遵守を証明したことにしない。実運用の選択結果と時間改善は後続で観測する。既存規約・Approved Plan の要求が優先される案件では、新しい既定方針だけで負担がなくなるわけではない。除外により自動で検出しなくなる結合部分は、同等保証と誤認せず明示する。
