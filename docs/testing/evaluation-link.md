# optional Evaluation 通知の利用・実 Pi 確認（Issue #22）

3 Skills の通知接点だけを対象にする。`taskflow_evaluation_link` と `/taskflow-evaluate` は別 package の `pi-taskflow-evaluation` が提供する。導入・Tool schema・保存確認・command の詳細は、その checkout の `README.md` と `src/index.ts` を一次情報として確認する。Taskflow ID の手入力や独自 manifest は不要。

`pnpm check`（typecheck / lint / format:check / test）と `git diff --check` を実行する。既存 `test/*-skill.test.ts` は Pi loader / 参照の確認であり、文章一致や読み込み成功を手順遵守の証拠にしない。以下は実行手順であって、実行済み結果ではない。

## 隔離と通常利用

- リポジトリ外の一時 cwd と Session directory を使う。global 設定、第三者 Skill、Extension / Playbook、隣接 repository は変更しない。必要な Extension は `-e`、3 Skills は `--skill <pi-taskflow>/skills` で明示して読み込む。Evaluation は `-e <pi-taskflow-evaluation>/src/index.ts` で今回だけ読み込める。
- [Planning smoke](planning-feature.md) / [ticket smoke](to-ticket.md) の小さな Local fixture と、実ユーザーが承認する Plan を使う。Planning と別 fresh Root の Implementation / 再計画は、関連付け探索のため**同じ cwd と同じ Session directory**を使う。別 cwd にコピーする Implementation smoke とはこの点が異なる。前の会話を resume / fork しない。
- TUI またはユーザーが応答できる実 RPC を使い、Plan、tracker 設定、分割、保存公開をそれぞれ別に承認する。承認を自作しない。実 ticket / label / native relation の GitHub 書き込みには別許可が必要。本手順では許可された一時 Local ticket だけに書き込む。
- レポートの保存も一時 cwd に限定する。Git fixture なら検証者が `.pi/taskflow-reports/` を ignore し、tracked file がないことを確認する。Extension に ignore / index を直させない。通常の user message を保存した実 Session を使うが、通知のためだけの保存待ち・flush・修復を Skill に追加しない。

通常利用では各 Skill を明示して実行し、Root の Tool call / result と原 Session JSONL を検証者が確認する（通知を検証者が代行しただけでは Skill 接続の成功としない）。

| 接点 | 入力と必須観測 |
| --- | --- |
| Planning の目的・新規対象確認後 | `{ operation: "begin_planning", displayName: <160文字以内> }`。Tool の `status: saved` と原ファイルの `pi-taskflow-evaluation.link` を確認する。 |
| 確認済み既存対象の再計画 | 上記に `sourceIssues: [<取得確認済み refs>]` を必ず渡す。全件一意・同じ所属なら、別 fresh Root でも Tool が既存 ID を再利用する。 |
| ticket の保存・公開承認後 | 同じ Planning Root で readback 済み refs のみ `{ operation: "add_issues", issues: [<refs>] }`。未承認・下書き・未確認番号を含まない。 |
| 別 fresh Root の Implementation | tracker 直接 read → Work Item 取得・識別確認 → `{ operation: "implementation", issue: <ref> }` → Plan / blocker gate の順。通知が Worker 起動前にあることを履歴で確認する。 |

refs は https の完全な GitHub Issue URL または `{ kind: "github", host, owner, repo, number }`、local は cwd 内の project-relative ticket path または `{ kind: "local", path }`。番号だけ・タイトル・推測で対応を作らない。1通知最大100 refs。

## 分岐の直接確認

各 case は独立した試行にし、実際の Tool 応答、原 JSONL の追加有無、通常の承認 / 停止位置、ticket の件数と内容を観測する。Tool 応答を模擬した文章で置き換えない。

| case / 準備 | 期待する観測 |
| --- | --- |
| Evaluation 未導入 | Evaluation の `-e` なしで開始する。Tool を呼ばず、通常の入力・進行・個別承認を維持する。 |
| Tool 非アクティブ | Extension は読むが公開 CLI の `--exclude-tools taskflow_evaluation_link` で提示対象から外す。代替 Tool / 記録を作らず本体を継続する。 |
| 通知失敗 | 別試行を `--no-session` で開始し、実 Tool の `session_not_persistent` 拒否を観測する。保存待ち・修復・新 UUID 回避を追加せず、本体の条件を維持する。 |
| 保存未確認 / 未保存 leaf | 公開 Pi SDK の実 Session で、現在 leaf の通常 message / CustomEntry が原ファイルにまだない条件を検証者が用意し、Tool の `save_unconfirmed` / `session_pending_entries` と追加なしを確認する。Skill が queue / flush / 補修 / 保存待ちや Taskflow 停止に変えないことを観測する。条件を作れなければ未確認と記録する。 |
| 再計画の未関連・一件不足・異所属・複数所属・探索未完了 | 確認済み local refs とその明示対応の有無で各条件を用意する。`sourceIssues` 付き begin が非保存で、独自 unresolved / pending / 再解決手順も新 UUID も追加されず、本体を継続する。sourceIssues 省略で新規 Planning にすり替えない。 |
| begin 未保存で後続 ticket 化 | 上記の関連付け不能な Planning Root で、通常の各承認後に Local ticket を保存する。確認済み refs の `add_issues` 拒否を補修せず、ticket の通常の readback・終了を行う。 |
| 既存同一 ticket 再利用 | 正式 Plan・成果等が同一の作成済み ticket を readback させる。保存公開の明示承認後、その実参照を通知し、重複作成・上書きしない。 |
| 部分作成 | [ticket smoke の部分失敗手順](to-ticket.md#3-新しい-root-で再実行上書き防止を確認する)で、1件目 readback 後に2件目を衝突させる。確認済み1件目だけ通知し、未完了分を報告して通常の停止を維持する。 |
| 保存公開の未承認 / 拒否 | Plan / 設定 / 分割だけの承認では `add_issues` なし。ticket / 下書きを作らず、通常の承認待ち / 停止を維持する。 |
| Implementation の Plan 不在 / 未完了 blocker | Work Item の識別確認後の通知を原ログで確認する。その後の gate で `BLOCKED`、Worker 起動なし。Plan 変更が必要な case も通常どおり `REPLAN_REQUIRED` とし、通知成功を開始許可にしない。 |
| 呼び忘れ | 通知前に止まった / 通知が欠けた実行は欠損として記録する。後付けの代替記録や終了認定を作らず、本体の承認や停止理由を書き換えない。 |

## 別 fresh Root と実 command / JSON / HTML

1. 同じ一時 cwd / Session directory で、新規 Planning → 承認済み ticket 保存・通知 → 別 fresh Root の Implementation 通知を実施する。さらに確認済み ticket の再計画を別 fresh Root で行う。各 Root の Session ID が異なることを原ログで確認する。
2. 実 Pi の `/taskflow-evaluate --list` で、Planning・再計画と Implementation が同じ Taskflow の候補に属することを確認する。事前の集計は不要。通知の `saved` だけで関連付け完了としない。
3. `/taskflow-evaluate <確認済み project-relative ticket path>` を実行する。receipt の `taskflowId`、`files.json` / `files.html`、`contentDigest`、`jsonCommitted` / `htmlUpdated`、warnings を確認する。非 UI なら `TASKFLOW_EVALUATION_RESULT ` 一行の完全な JSON と末尾 LF を確認し、CLI exit だけで成功としない。
4. 実 `report.json` とローカルで開いた `report.html` で、同じ ID / digest、Planning・再計画・Issue と別 Root の Implementation を辿る。Implementation を gate で止めた試行も、通知と停止理由の出典を確認する。Evaluation は終了・品質・承認を認定しない。子の詳細取得は Issue #22 の blocker にしない。

結果は case ごとに期待 / 観測 / 未実施を分け、Pi / model / Evaluation 版、cwd / Session directory、Session IDs、Tool call / result、原 entry、承認・停止順序、command receipt と JSON / HTML の参照を報告する。一時ログ / runner / 保存機構を repository に追加せず、秘密を含むログや report を公開しない。未実施・途中停止を成功報告しない。
