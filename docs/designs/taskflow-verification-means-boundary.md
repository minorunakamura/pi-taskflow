# Taskflow の検証手段の不足補完と停止境界

## 目的と位置づけ

専用の操作 tool がないだけで Taskflow が停止し、Agent が調べられることをユーザーへ差し戻す状態を防ぐ。承認済みの検証方法の具体化と、その方法を再利用できる最小の資産として残すことをつなげる。

本書は Design Discussion で合意した Taskflow 側の判断・引継ぎを保存し、[検証資産判断の設計](taskflow-verification-assets-decision.md)の不足補完と停止の境界を具体化する。共通 Create / Maintain 自体の実行方針の変更は含めない。別の論点として合意した生成物の通知・License は、`pi-skills` の[別設計](../../../pi-skills/docs/designs/verification-generated-assets-notices.md)で扱う。既存の設計書・Approved Plan・Work Item は書き換えない。本書は実装計画や実装開始の許可ではない。

## 確認した事実と原因の見立て

同じ `docs/designs/reversi.md` を入力とした `pi-test8` / `pi-test9` のレポート、原 Session、Plan、生成資産を比較した。入力設計の SHA-256 は一致した。

- 実装前の `pi-test8` は、専用の検証資産がない状態から既存 Chrome を隔離 profile で起動し、Node 標準機能による小さい CDP 接続コードを一時領域に用意して検証した。
- 実装後の `pi-test9` は、Planning で Create を採用し、Plan / Work Item に「共通 Skill・操作 harness・権限が不足するだけなら BLOCKED」「独自代替や無断 install で回避しない」を引き継いだ。
- Issue #1 の Implementation Root は専用 tool・CLI・package を探索し、Chrome 本体は確認したが、標準機能での操作を試す前に停止した。ユーザーが追加 tool なしで試すよう依頼した後、既存 Chrome と Node 標準機能で操作・証拠取得・cleanup が成立した。
- その後、生成された検証 Skill は実ファイルの read によって利用され、Issue #2 でも helper と手順を再利用・補完して実行された。`/skill:verify-project` による名前解決・展開の成立を確認した記録とは区別する。

不足補完の許可と「独自代替」の禁止が重なり、小さい操作コードまで禁止と解釈された可能性が高い。専用 tool が見つからないことと、既存環境でも安全に操作できないことが区別されなかった。これはログと文言からの有力な説明であり、単発比較による因果の断定ではない。BLOCKED の再開プロンプトは提示されたが、停止判断そのものの改善にはならなかった。

出典は `pi-test8/.pi/taskflow-reports/961c9c81-e41e-4522-a1d6-6ffcd0860eb6/report.json` と `pi-test9/.pi/taskflow-reports/1de09b81-09ea-4461-921a-e0981148faa6/report.json`、両プロジェクトの `docs/plans/reversi.md` と原 Session。代表箇所は、実装前 Root の Chrome 起動 `f686fe01`・接続コード作成 `81422e6f`、実装後 Root の停止 `de5bf82a`・成立確認報告 `a02369b9`・後続 Issue の不足補完判断 `c64a0552`。レポート・原ログは非公開の調査資料とし、本書へ転載しない。

## 1. 検証方法の具体化は Agent が担う

承認済みの検証範囲内で、追加 install や利用者環境の変更をせず、隔離した環境で既存の標準機能を安全に試せるなら、Agent が成立確認を進める。専用 tool、導入済み harness、完成済み helper が見つからないことだけでは停止せず、ユーザーへ操作手段の調査を差し戻さない。

適切な既存手段を優先するが、その存在を開始の必須条件にはしない。Chrome / CDP は今回の具体例であり、全プロジェクトへの固定方式や新しいブラウザ操作基盤を要求しない。安全に実行できない条件が既に分かっている場合まで、試行を義務にしない。

### 最小 helper の作成と保存

検証に必要な接続・入力・観測などの小さいコードを作り、成立した方法を必要な helper として保存することは、既に認めている検証資産の最小補完に含める。試すときは許すが、保存すると「独自 harness」として禁止する扱いにはしない。

「独自代替の禁止」は、必須の権限・安全条件・保証を迂回することや、未承認の別基盤への置換を防ぐためのものであり、既存の標準機能をつなぐ小さい helper の禁止には使わない。新たな包括許可や承認段階は追加しない。

すべての探索コードを保存する要求ではない。再実行に必要な方法だけを既存の Create / 関連更新の範囲で整え、変更した方法の実行・期待結果との照合・証拠・cleanup を維持する。Skill の生成や初期一機能の成功を、Root の直接確認・最終受入れの代わりにしない。

### 確認・停止が必要な境界

不足の名称ではなく、その解消に何が必要かで判断する。

- 権限・認証・必要な共通 Skill などが実際に不足し、許された範囲で検証を成立させられない場合は、不足と再開条件を報告して停止する。必要な共通 Skill を独自実装で置き換えない。
- 追加 install や利用者・共有環境の変更に必要な許可が未取得なら、無断で実行せず確認する。
- ユーザーの明示禁止、規約、既存 Approved Plan の制約は維持する。
- 正式 Plan の制約、保証対象・対象外・期待結果、製品の公開契約・仕様・設計の変更が必要なら、既存の確認・`REPLAN_REQUIRED` 経路を使う。

実際に試した方法と、未確認の方法・不足を区別する。成立未確認の手順を成功扱いせず、失敗・未確認を隠すために期待値を緩めない。BLOCKED の同セッション再開案内と未解消時の停止維持は変更しない。

## 2. Planning から Implementation まで境界を保つ

Planning は、既存手段の適否・不足と、承認済みの検証を成立させる最小補完の裁量・限界を Plan / Work Item に残す。専用 tool が見つからないことを、それだけで BLOCKED にする制約へ強めない。Planning 自身は資産生成や実アプリでの成立確認を行わない。

Implementation Root は現物から手段を具体化し、必要なら最小の作成・関連更新を判断する。担当を Worker に渡しても、採否・範囲・最終受入れは Root が保持する。既存の同時 writer 禁止と検証・証拠・cleanup の分担を維持する。

共通 Create / Maintain は Taskflow に依存しない独立した Skill である。Taskflow は利用側として、既存の共通 Skill が認める最小補完を独自の制約で封じず、共通 Skill の安全条件も迂回しない。共通 Skill 内部の実行方針を Taskflow で再定義しない。Maintain は引き続きユーザーの明示実行に限定し、今回の修正のために Taskflow から起動するものではない。

## 維持する範囲と後続への引継ぎ

主要方針に未決定のユーザー判断はない。後続の Taskflow Planning では、Planning / Implementation と関係する設計・仕様の整合範囲を具体化する。共通 Create / Maintain 自体の不足補完・安全性・実行方針の変更を前提にしない。既存の共通契約との照合で変更を要する具体的な矛盾が見つかった場合は、その根拠を示して別途議論し、変更範囲を自動的に広げない。

生成物の通知・License の変更は `pi-skills` 側の別設計の範囲であり、この Taskflow Planning に含めない。Taskflow が生成規則を上書きしたり、独自の代替 Create や wrapper を追加したりしない。隣接 checkout 間のリンクは調査資料の参照であり、実行時の固定配置にはしない。

確認するのは、次の振る舞いがつながることである。具体的な作業・テスト手順は Planning で定める。

- 専用 tool がなくても、既存環境で安全に成立確認と最小補完を進められる。
- その方法を helper に保存して後続 Agent が再利用でき、保存したことだけで禁止扱いにしない。
- 権限不足、未取得の許可、明示禁止、保証変更では、従来の確認・停止の境界を守る。
- Plan / Work Item への引継ぎで、補完裁量を作成禁止や専用 tool 必須へ強めない。

文書の照合だけで Agent の実行遵守を実証したとはしない。改訂後に不要な停止が減ること、安全な不足補完と必要な停止が両立することは未検証であり、後続の実行で確認する。一般的な時間・cost 削減率は保証しない。

正式チェック、TDD、Review、Root の直接確認、BLOCKED 再開案内、文書分担、Maintain の用途は変更しない。新依存、CI、恒久 E2E、独自 runner・registry・復旧状態・承認段階、既存生成物の一括移行を追加しない。

関連する一次文書は [Planning Skill](../../skills/taskflow-planning/SKILL.md)、[Implementation Skill](../../skills/taskflow-implementation/SKILL.md)、共通 [Create](../../../pi-skills/skills/create-verification-skill/SKILL.md) / [Maintain](../../../pi-skills/skills/maintain-verification-skill/SKILL.md)。
