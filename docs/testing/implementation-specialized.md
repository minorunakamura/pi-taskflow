# 専門 Implementation Playbook smoke 確認

Issue #7 の Bug Fix + TDD / Refactoring / Performance を、別々の新しい実際の Root セッションで確認する。
`implementation-skill.test.ts` は Pi の Skill 読み込みと4つの Playbook 参照だけを確認する。読み込み成功や模擬 Agent の応答をシナリオ成功の証拠にしない。

## 共通の準備

- Pi、公開 `pi-subagents` の built-in `worker` / `reviewer`、Matt Pocock の `tdd`、`ponytail-review`、`pi-taskflow` Extension を利用可能にする。
- [専門 Planning smoke](planning-specialized.md) の fixture コードと実際にユーザーが承認した Plan を使う。承認結果と提出全文の一致を確認し、別の一時ディレクトリに正式な Plan として保存する。会話・Scout 出力・Planning sessions はコピーしない。
- Bug Fix + TDD は、既存 Plan が TDD 不採用なので、そのまま TDD を追加しない。CLI を対象とする TDD を明示したテスト用 Plan を実際の Plannotator に提出し、人間の明示的な Approve 後に承認された全文を保存する。
- 各 fixture の local ticket から `docs/plans/approved.md` を参照する。実装・テスト・直接検証を1件とし、依存なし、未決定判断なし、Plan の Planning 成果物作成は対象外とする。ticket は Implementation のテスト入力であり、`to-tickets` の分割・公開 workflow の再テストではない。
- fixture のみで Git baseline を記録する。署名設定がない場合は、その baseline commit だけ `commit.gpgsign=false` を指定する。global 設定や本リポジトリを変更しない。
- Code Review は設定なしのデフォルト無効。実際の `taskflow_code_review` の `skipped` を確認する。有効な gate の人間参加確認は [Feature Implementation smoke](implementation-feature.md) を参照する。

```sh
TASKFLOW_REPO=/absolute/path/to/pi-taskflow
cd "$SMOKE_DIR"
pi --mode json --approve -e "$TASKFLOW_REPO" \
  --skill "$TASKFLOW_REPO/skills/taskflow-implementation" \
  --session-dir "$SMOKE_DIR/sessions" \
  '/skill:taskflow-implementation tickets/01.md' \
  > events.jsonl 2> stderr.log
```

`--continue` / `--resume` / `--fork` は使わない。新しい Root が現時点のコードを確認する。
Plan Review が必要な準備は人間が参加できる TUI / RPC で行う。模擬 approval や CLI の project trust を Plan 承認と混同しない。

## 種別固有の観測

### Bug Fix + TDD

- 初期コードは `console.log(Number(process.argv[2]) || 1);`。修正前に Root が `node quantity.mjs 0` → `1\n` を再現し、数値0の falsy と OR fallback という承認済みの原因を確認する。
- Plan が TDD を明示した場合だけ fresh Worker に `skill: "tdd"` を指定する。公開 CLI の回帰テストで RED → 最小修正 → GREEN を確認する。内部実装の文字列一致テストや独自の TDD 実装を追加しない。
- Root が正式な `npm test` と別に元の再現手順を実行し、`0` → `0\n`、引数なし → `1\n`、`7` / `-2` / `2.5` → 同じ数値と改行、stderr 空、exit code 0 を直接確認する。
- 診断や修正方針の実質的な変更が必要なら `REPLAN_REQUIRED`。再現・原因確認が不足したまま推測で修正しない。

### Refactoring

- 初期コードは Planning smoke の `messages.mjs` / `check.mjs`。Worker 開始前に Root が不変条件と Plan の変更前後の比較方法を確認する。
- 公開 `greet` / `farewell` の export、出力、空白・空文字・Unicode、TypeError、trim の参照・呼び出し回数・receiver、投げられた例外 identity を維持する。
- Plan の characterization checks を構造変更前に成功させ、private helper 抽出後も同じ checks で結果を比較する。Root も公開境界の動作を直接比較し、typecheck の成功だけで等価としない。
- 動作・仕様変更が必要なら `REPLAN_REQUIRED`。Refactoring のまま Feature / Bug Fix の実装を続けない。

### Performance

- 初期コードは Planning smoke の `unique.mjs` / `bench.mjs`。Root が Plan の baseline、環境、方法、目標を Worker 開始前に確認する。
- 承認済み baseline は **131.74087499999996 ms**、目標は **65.87043749999998 ms 以下**。Node.js v24.21.0 / Darwin arm64 / Apple M1 Pro、文字列12,000件、warm-up 1回、7反復の中央値を使う。
- `bench.mjs` の SHA-256 は `85a26f3c4f7efd13f5dd6dc5c9aac235de09b76068b888feb7676b521310b143`。workload や測定区間を変更して合格を得ない。重い並行処理を避ける。
- 文字列の最初の出現順・入力非変更を維持して `Set` を利用し、回帰テストを現行実装と変更後で確認する。
- Root が正式な `npm test` と別に `node bench.mjs` を実行し、実測値を承認済み baseline と目標に比較する。機能テストが成功しても性能条件が未達なら成功扱いにしない。

## 共通フローの観測と終了

各ケースで実際の tool 履歴、child の launch / resolved context、差分、コマンド結果を確認する。

1. 正式な Work Item / Approved Plan、開始条件、現在の内容に合う Playbook、現在のコードを確認。分類専用 LLM 呼び出しなし。
2. built-in Worker は fresh context。入力に Work Item、関係 Plan sections、完了条件、制約・対象外、正式チェック・直接検証方法、現在のコードの事実がある。`ponytail` は明示追加しない。
3. Root が実際の差分、正式チェック、種別固有の直接検証を確認。Worker の自己申告だけを使わない。
4. 共通 Skill を通じて fresh Correctness Review と別の fresh Reviewer + `ponytail-review` が完了。双方に実差分と検証結果を渡し、コード変更や Worker への直接指示をさせない。
5. Root が指摘を判断。必要な修正はまとめて依頼し、影響したチェック・直接検証を再実行。再レビューは修正のリスク次第。
6. 実際の `taskflow_code_review` が `skipped`、全完了条件確認後の最終状態が `READY_FOR_MERGE`。merge / release / deploy は行わない。
7. smoke 実行者も最終差分と種別固有の直接検証を独立して確認。Plan / ticket / 計測条件が無変更であることを確認する。

専門種別に当てはまらない Work Item は引き続き共通 Skill の手順を使う。`generic` Playbook や workflow state machine は追加しない。
実行結果は日時、Pi / model、承認の根拠、fixture / ログ、チェック、直接検証、両 Review、最終状態、未確認の分岐を区別して記録する。runtime artifacts は一時領域に限定する。

## 2026-10-08 の実行結果

- Pi `1.0.4`、Root model `openai/gpt-5.6-luna`、子 Agent は既存設定の `openai/gpt-5.6-luna:high`、Node.js `v24.21.0`。model / thinking の workflow 独自設定は追加していない。
- fixture は `/tmp/pi-taskflow-implementation-specialized.bVCX3z/{bug-fix,refactoring,performance}`。正式な Plan と fixture コードだけを別 cwd にコピーし、各ケースを別の新しい Root セッションで実行した。Planning sessions / 会話 / Scout 出力は引き継いでいない。
- Refactoring / Performance の Plan は専門 Planning smoke の実際の approved 応答を確認し、提出された `planContent` とコピーした全文が完全一致することを確認した。Bug Fix は TDD を指定した未承認のテスト Plan を公開 RPC セッションの実 `taskflow_plan_review` に提出し、ユーザーの browser Approve による `status: "approved", approved: true` 後に保存。保存全文と提出全文の一致も確認した。
- 各 Root は現在の Work Item、Approved Plan、該当 Playbook、コードを read し、開始条件と種別固有の前提を確認した。分類専用の子 Agent は起動していない。built-in Worker は fresh、`ponytail` の明示追加なし。`tdd` の追加は Bug Fix のみで、Refactoring / Performance には追加していない。
- 各ケースで共通 Skill の正式チェックと種別固有の直接検証を Root が実行し、fresh Correctness Review と別の fresh Reviewer + `ponytail-review` が完了した。全 child の exit code は0。foreground の結果と async launch は fresh、Performance の Review workflow receipt でも両 Reviewer の requested / resolved context が fresh と確認した。
- 3件とも実際の `taskflow_code_review` が `status: "skipped", approved: false`、最終状態は `READY_FOR_MERGE`、Pi exit code は0。Root は project code を自分で編集せず、Reviewer も project code を変更していない。commit / push / 公開 / merge / release / deploy は行っていない（test host の fixture baseline commit を除く）。

| ケース | 実際の結果 |
| --- | --- |
| Bug Fix + TDD | Root が `0` → `1\n` と原因を確認。Worker が `tdd` を読み、公開 CLI の0ケースで RED（exit 1）→最小修正→GREEN。Root と smoke 実行者が別途 CLI 5ケースの stdout 完全一致、stderr 空、exit 0 を確認。`npm test` は5 tests passed。両 Review は指摘なし |
| Refactoring | 不変条件確認後、Worker が characterization checks を追加して抽出前に成功、private helper 抽出後も成功。Root と smoke 実行者が最終 checks を baseline の実装と現在の実装の両方で実行し、出力・エラー・副作用の assertions と `behavior verified\n` が一致。Ponytail の手動 try/catch 簡略化指摘を Root が採用し、1回の correction Worker で `assert.throws` predicate に置換。Root が再検証と fresh Correctness 再レビューを行い、指摘なし |
| Performance | Worker が回帰テストを現行実装で成功させ、Set へ置換。Root が正式チェックと独立再計測を行い中央値 **0.740625 ms**（baseline の約 **0.5622%**）。smoke 実行者の独立再計測は **0.789792 ms**（約 **0.5995%**）、目標以下。bench の hash は一致、API の順序・入力非変更・結果配列の独立性も直接確認。両 Review は指摘なし |

smoke 実行者が終了後に各 `npm test`、`git diff --check`、Plan / ticket / benchmark の無変更、実際の最終差分を独立して再確認した。すべて成功。
根拠は各 fixture の `events.jsonl`、`final-response.md`、`sessions/subagent-artifacts/*_transcript.jsonl` / `*_meta.json` / `*_output.md` と、親ディレクトリの `independent-verification.json`。Performance Review workflow は `9784d1ae-f22f-46bd-a52f-6ff6933765c6`。runtime artifacts の恒久保存は保証しない。

### 停止・未達分岐

別の隔離 fixture で、新しい実際の Root セッションを追加実行した。停止入力は test host が用意し、承認済み Plan は変更していない。すべて Pi exit code 0、Root の edit / write、Worker 起動、Code Review はなし。期待する状態名や模擬 tool 結果を入力していない。

| ケース | 入力・実測 | 最終状態 |
| --- | --- | --- |
| `bug-replan` | 現行コードを数値への `+1` に変更。0の症状は同じだが、7→8なども観測し、承認済みの OR fallback 診断と修正方針が不適合と確認 | `REPLAN_REQUIRED` |
| `refactoring-replan` | Work Item が world→guest の仕様変更を必須とし、Plan の不変条件と矛盾。現在の world 出力とチェック成功を確認して停止 | `REPLAN_REQUIRED` |
| `performance-unmet` | 機能は同じで100msの待機を注入した実装相当コードに対する verification-only 試行。`npm test` は成功したが、独立 benchmark の中央値 **100.583417 ms** は目標超過（baseline の約76.3494%）。最初の検証後に止める read-only 試行なので修正・後続 Review は未実行 | `FAILED` |

根拠は同じ親ディレクトリの各ケースの `events.jsonl` / `assistant-responses.md` と `negative-verification.json`。試験用の矛盾・遅延・runner は本リポジトリへ追加していない。

### Issue #7 の受け入れ条件との個別照合

| 条件 | 状態・根拠 |
| --- | --- |
| Bug Fix: bug-fix.md が存在 | 済：Pi の読み込みテストと実 Root の read |
| Bug Fix: 実装前に Plan の再現条件・診断を確認 | 済：修正前 CLI と OR fallback の原因確認 |
| Bug Fix: Plan 明示時だけ Matt Pocock tdd を Worker に追加 | 済：Playbook の条件、承認済み TDD Plan と実 Worker launch。ほか2ケースは追加なし |
| Bug Fix: 元の再現手順を再実行 | 済：修正後の CLI 0 ケース |
| Bug Fix: unit tests だけでなく直接修正を確認 | 済：Root と実行者の別の直接 CLI 検証 |
| Bug Fix: 共通チェックと両 Review | 済：npm test、独立2 Review、実 gate |
| Bug Fix: 原因・修正方針の実質変更は REPLAN_REQUIRED | 済：停止手順と bug-replan の実行 |
| Bug Fix: TDD Implementation シナリオ | 済：RED → GREEN →直接検証→両 Review→READY_FOR_MERGE |
| Refactoring: refactoring.md が存在 | 済：Pi の読み込みテストと実 Root の read |
| Refactoring: Worker 前に不変動作を特定 | 済：Plan の不変条件と現状確認を Worker brief に含む |
| Refactoring: 外部動作を意図的に変えず構造変更 | 済：private helper と呼び出し置換のみの production 差分 |
| Refactoring: Plan の方法で前後比較 | 済：同じ characterization checks を baseline と変更後で実行 |
| Refactoring: 共通チェックと両 Review | 済：npm test、独立2 Review、Worker 修正・再確認・限定 fresh 再レビュー |
| Refactoring: 必要な動作・仕様変更は REPLAN_REQUIRED | 済：停止手順と refactoring-replan の実行 |
| Refactoring: Implementation シナリオ | 済：開始から READY_FOR_MERGE まで実行 |
| Performance: performance.md が存在 | 済：Pi の読み込みテストと実 Root の read |
| Performance: Worker 前に baseline・方法を確認 | 済：Plan の値・環境・方法・hash を確認し Worker brief に含む |
| Performance: 実装後に再計測 | 済：Root と実行者の独立 benchmark |
| Performance: 合意目標と比較 | 済：固定閾値65.87043749999998msと baseline 比を確認 |
| Performance: 共通チェックと両 Review | 済：npm test、独立2 Review、実 gate |
| Performance: 機能成功でも性能未達なら成功にしない | 済：performance-unmet は npm test 成功でも FAILED |
| Performance: Implementation シナリオ | 済：開始から READY_FOR_MERGE まで実行 |
| Shared: 専門種別外も共通フローで扱う | 済：Skill の fallback を維持。generic 専用 Playbook や分類 tool を追加していない |
| Shared: 共通 Worker・検証・review・修正・最終状態を再利用 | 済：専門手順は差分のみ、各ケースが同じ Skill へ戻る。Refactoring の修正経路も実行 |

### 残る制約

Skill / Playbook は Agent が読む手順であり、TypeScript の強制的な状態機械ではない。全ての model / 環境での遵守や全 workflow 分岐を保証するものではない。
専門種別外の新しい runtime シナリオ、Worker 内での Plan 変更発見、再現不能・計測環境不足は今回は実行していない。fallback / 停止手順を確認したものと実行したものを区別する。
Code Review 有効時の追加 E2E はこの issue の変更対象外で、共通の Feature smoke と既存 tool tests の結果を利用する。性能数値は指定環境・workload に限る。
