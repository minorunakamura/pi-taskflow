# Code Review Feature Map

再利用する操作と期待結果だけを記す。今回の成否は [Skill](../SKILL.md) の `.pi/verification-evidence/<run>/run.md` に分離する。初期対象は実Pi TUIのCode Review。全workflow / Plan Review browser E2E、remote、Windows、他VCS、独自RPC clientは対象外。通常tests、Rootの正式check/全受入れを置き換えない。

## 1. 設定とprovider選択

入口はSkillの隔離fixture、新しい空agentdir/sessiondir、実source/helperをロードしたPiの `/verify-code-review`。各caseは所有Pi終了後に `.pi/settings.json` を変更して新セッションで実行する。無効時もproviderの型・値は検証する。

| fixture設定 (`taskflow` 内) | 期待・観測 |
| --- | --- |
| `codeReviewEnabled: false, codeReviewProvider: "tuicr"` | 正確に `{"status":"skipped","approved":false}`。新規tab/tempを作らずPlannotator要求もない |
| `codeReviewEnabled: false, codeReviewProvider: "plannotator"` | 同上。herdr/tuicrは不要 |
| `codeReviewEnabled: false, codeReviewProvider: "invalid"` | 明確な設定エラー。disabledで隠さず、両provider無起動 |
| namespace/boolean/provider不正 | 明確な設定エラー、無起動。依存不足/noUI/不正JSON等の破壊的再現はせず小process/UI testsを使う |
| `{}` (taskflow設定なし) または `codeReviewProvider: "plannotator"` | 実Plannotatorの差分表示。herdr/tuicr不要。下記§5の実人手Approve |
| `plannotatorCodeReview: false` のみ | 旧値は参照・検証せず無視、既定の有効Plannotator。無効を維持したいユーザーには新falseへの手動変更を案内 |
| `codeReviewProvider: "tuicr"` | 同じlocal spaceの専用新tab、下記§2–4。provider間fallbackなし |

実tool結果、開始前後の無起動/表示、Plannotator request actionの必要最小観測を保存する。SettingsManager snapshot/trust/override/毎回取得/非変更、旧getter非参照は `test/settings.test.ts` / `test/code-review.test.ts` で回帰確認する。print/JSONや模擬応答を人間参加成功の証拠にしない。

## 2. tuicrの表示・明示export・Approve

前提はSkillのstaged / unstaged / 小untracked fixture、local呼び出し元一意識別、可視操作許可。別space/tabのfocusを一時的に変える場合も許可範囲内だけ。呼び出し元Piのcommand実行からtab.newまでの間に別の許可済みtabをfocusすることで、active位置でなく元spaceを選ぶことを観測する（他tabを閉じない）。

1. `/verify-code-review`。`tool-start` を確認し、新tab名「Taskflow Code Review (tuicr)」が元Piと同じ **space ID** に現れることを `herdr-app ls` で確認する。active flag、cwd文字列のspace名で判断しない。返却された今回のtab/Terminal/paneだけ記録し、`hc get <今回Terminal> --json` のcwdとargvがfixture / `exec /bin/sh ... tuicr -w --stdout` / 今回private tempであることを確認する。記録は必要fieldに絞る。
2. 実tuicrで `review.txt` のstaged/unstagedの合成差分と `untracked.txt` の小差分を確認する。binary/ignore/巨大untracked等はtuicr自体の制限に従うため全内容の完全表示とは報告しない。レビュー中にRootはfixtureのコードを変更しない。
3. 実ユーザーが今回識別可能なコメント（例 `TASKFLOW-<run>-APPROVE`）を入力し、`y` または `:clip` Enterで明示exportする。`--stdout`ではexport自身が終了するため追加のqは不要。裸のqは終了しない。通常終了だけをexportとしない。保存session/JSON/clipboardは探索しない。操作時刻・exportの観測と期待文字列を最小記録する。
4. 終了しても自動承認されないこと。専用tabは正常exit時にappから自動で消えることがある。hc Terminalは `finished / exited / exit_code:0 / signal:null` が必要で、live/recovered shellやwait timeout/messageを完了扱いにしない。人間待ちに期限はない。
5. toolのcleanupで今回tab/Terminal/tempが消え、元Piの正確なspace/tab/paneに戻ってから公開Pi selectの **Approve / Reject / Cancel** が現れること。Approve前は `tool-end` がなく、export/exit/空出力から承認を推測していないことを確認する。
6. 実ユーザーがPiでApprove。`tool-end` が `status: "approved", approved: true` となり、`feedback` が今回stdout Markdownと一致することを確認する。整形・parser・上位指示として解釈していないこと。既存保存コメントをexportが含む可能性はあるため、今回追加分だけとは主張しない。

証拠: 元と新の所有ID/cwd/temp、差分表示、exportの操作、Pi判断前後、実feedback、cleanupの最小記録。`tool-events.jsonl` と `run.md` を対応付ける。raw一覧/スクロールバック全量を保存しない。

## 3. Rejectと再提出

§2と同じ経路を新しい呼び出しで実行し、別の識別可能なコメントを人間がexportして終了、Piで **Reject**。

- `status: "rejected", approved: false` と受領したMarkdownが返る。Rootが採否・必要な修正・再検証を判断する。自動修正や自動再提出はしない。
- 再提出は新しい `/verify-code-review`。今回専用tab/Terminal/tempと新しいexportを確認し、前回の出力・承認をTaskflowが読み直していないことを観測する（tuicr自体の保存コメントがexportに入ることとは区別する）。Approveが必要なら再度人間のPi判断を待つ。
- 各呼び出しの識別/結果/cleanupを分けて証拠に残す。

## 4. 空export・Cancel・dismiss・abort・shutdown

各caseは専用fixture/Pi、または前回cleanupを確認した新呼び出しで行う。待機中の他作業/既存tabを終了しない。noexport試行では未保存コメントを追加せず `:q` Enterで退出する。未保存コメントがあると `:q` は拒否されるため、既存sessionを削除して退出を強制せず、人間の判断またはPiでのcancelに戻す。裸のqは終了しない。

| 実操作 | 期待・観測 |
| --- | --- |
| tuicrで明示exportせず `:q` Enterで正常終了 | Piが「No exported comments received ... this does not mean no findings」と案内。feedbackは空、まだ未承認。Pi Cancelで `cancelled / false` |
| Pi dialogのCancel | `cancelled / false`。exportがあっても承認しない |
| Pi dialogでEsc dismiss | 同上。閉じることはApproveではない |
| tuicr待機中に元の専用Piへ戻り `/verify-code-review-cancel` | 今回signalがabort、`cancelled / false`。tab/Terminal/tempの限定cleanupと元Pi復帰。後の応答を承認しない |
| 検証用Piだけ `/quit` (tuicr待機中) | `shutdown` と非承認結果、所有資源cleanup。Piプロセス終了だけをcleanup成功としない。強制SIGKILLは保証対象に含めない |

各caseで元の既存tab/Terminalが保持されることと、今回所有IDがappの一覧・`hc get ID --json`から消え、記録したtemp directoryが存在しないことを確認する。専用tabに他Terminalを追加した特殊caseは他Terminalを閉じず所有Terminalのみ除去（追加操作も明示許可を必要とする）。cleanup失敗は非承認・所有ID付き診断になる。所有不明の名前推測cleanupはしない。依存不足、noUI、不正JSON、非0、killed/lost/recovered shell、起動中abort/late応答は `test/tuicr.test.ts` の限定境界testsで補完し、実機を破壊して再現しない。

## 5. 既定Plannotatorの回帰

Skillの起動へ導入済みPlannotator entryを追加し、設定は `{}` の新しい隔離Piで `/verify-code-review`。herdr/tuicrを必要とする分岐に入らず、実Plannotatorにfixtureの差分が表示されること。実ユーザーがbrowserでApproveする **前** はtool未完了・未承認、実Approve **後** の `tool-end` が `approved / true` であることを確認する。「Approveした」との申告や模擬イベントで代用しない。

browserを閉じる/放置するだけでは承認しない。Cancelや起動失敗は非承認。必要な代表caseだけを行い未実行分岐を記録する。Plan Reviewは `test/plannotator.test.ts` 等の既存回帰testsで確認し、新規browser全E2Eは課さない。

## 共通の証拠・cleanup完了条件

Skillのrun記録、source/versions、最小の操作/結果参照をfixture外のignored証拠へ残す。秘密・他tabの情報・raw log全量は収集しない。所有Pi終了・所有fixture/settings/sessionsのcleanup後にrun記録と全証拠参照を実際に読み戻し、残存/失敗/未確認範囲も報告する。Createの一機能成立とRootのPlan全受入れは別判断である。
