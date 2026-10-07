# Feature Implementation Playbook

現在の Work Item が新しい動作や既存の動作変更を扱う場合に使う。
`taskflow-implementation` の共通手順を次の観点で補う。開始条件、Worker の境界、レビュー、Code Review gate、最終状態は共通手順に従う。

## 必要なコードを確認する

- Work Item と relevant Approved Plan sections から、追加・変更する動作、維持する動作、制約・対象外、観測できる完了条件を確認する。
- Planning の会話や Scout 出力を再利用せず、現在の入口、公開インターフェース、処理の流れ、呼び出し元、関連テストを改めて読む。
- 小さい変更は Root が直接確認してよい。範囲が広い場合は built-in `scout` を fresh context で使う。
- 隣接する利用者への影響と互換性を確認し、既存の公開 API、Skills、Extensions、Agents、依存関係で足りる部分を再実装しない。
- 正式なチェックと実際の動作確認方法を確認する。新しい仕様判断や Plan 変更が必要なら開始せず、共通手順に戻って停止理由を判断する。

## Worker に実装を依頼する

- built-in `worker` を fresh context で使い、今回の Work Item、Plan の関係部分、完了条件、制約・対象外、検証方法、現在のコードから確認した事実だけを渡す。
- Approved Plan に従う最小の変更と関連テストを依頼する。TDD 指定がある場合だけ既存の `tdd` Skill を使う。Worker に `ponytail` を明示的に追加しない。
- 未承認の仕様変更、独自の範囲拡大、merge、release、deploy は禁止する。設計変更が必要なら Root に戻す。

## チェックと実際の動作確認

1. package scripts、task 定義、CI、開発ドキュメントで正式に定義された関連チェックとテストを実行する。設定ファイルからコマンドを推測せず、missing lint / formatter infrastructure を追加しない。
2. 別の工程として実際の入口から新しい動作を実行し、Work Item の期待結果と比較する。
3. 維持する既存動作も実行して回帰を確認する。対象範囲の境界条件やエラーが完了条件にある場合はそれも確認する。
4. Root が差分、コマンド結果、観測結果を確認する。Worker の報告や tests / lint の成功だけで実際の動作確認を代替しない。

## Review と終了

共通手順に戻り、fresh Correctness Review と独立した fresh Ponytail Review を行う。
Root が指摘の採否を判断し、必要な修正をまとめて依頼する。影響したチェックと直接検証を再実行し、大きさ・リスクに応じてのみ fresh 再レビューを行う。
設計を変える指摘は `REPLAN_REQUIRED` とする。最後に `taskflow_code_review` を呼び、無効なら skipped、有効なら明示的なユーザー Approve を確認する。
すべての完了条件と gate を満たした場合だけ `READY_FOR_MERGE` と報告し、実際の merge、release、deploy は行わない。
