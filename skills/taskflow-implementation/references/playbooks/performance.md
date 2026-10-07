# Performance Implementation Playbook

計測できる性能問題の改善に使う。
`taskflow-implementation` の共通手順を以下の観点で補う。Worker、正式なリポジトリチェック、独立した Correctness Review / Ponytail Review、指摘の採否・修正・再確認、Code Review gate、最終状態は共通手順に戻る。

## Worker 開始前に baseline と計測方法を確認する

- Approved Plan の実測 baseline、metric と単位、workload、環境、実行コマンド、warm-up・反復回数・集計方法、合意した目標値と合格条件を確認する。
- 現在のコードと計測対象を確認し、Plan の方法が実行可能で baseline と比較できる条件であることを確かめる。必要な事前計測は Plan に従う。推測した数値や Planning の Probe 結果で baseline を置き換えない。
- 計測条件が不足する場合は開始せず、不足と再開条件を報告する。baseline・計測方法・目標や設計の実質的な変更が必要なら共通手順で `REPLAN_REQUIRED` とする。

## 承認済みの改善を実装する

- 共通の Worker 依頼に、baseline、計測方法、目標、不変条件、承認済みの改善方針を含める。性能目標を満たすために公開動作や許可されていない trade-off を変更しない。
- workload、反復数、集計方法などを都合よく変えて成功扱いにしない。Plan 変更が必要になった場合は Worker から Root に戻す。

## 再計測して目標と比較する

- 実装後、正式チェックとは別に Plan と比較可能な環境・同じ workload・方法で実際に再計測する。metric、観測値、baseline 比、合意した目標との比較、計測条件を Root が確認する。
- 維持する動作の回帰検証も行い、計測結果と直接検証結果を共通の両 Review に渡す。修正が計測対象に影響したら再計測する。
- 機能テストが通っていても、合意した性能条件が未達または未確認なら Work Item を成功扱いにしない。範囲内の修正・再計測は共通手順に戻り、未解決の未達は `FAILED`、Plan 変更が必要なら `REPLAN_REQUIRED` とする。共通の正式チェックと両 Review を省略しない。
