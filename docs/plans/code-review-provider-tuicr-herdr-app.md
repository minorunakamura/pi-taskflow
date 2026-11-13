# Code Review provider 選択と tuicr の herdr-app タブ連携

## 目的

`taskflow_code_review` で Plannotator または tuicr をユーザー設定から選択できるようにする。既定は Plannotator。tuicr は herdr-app の新しいタブで人間が差分を確認し、export したコメントを Taskflow に返す。Implementation の完了条件である明示的なユーザー承認は維持する。

本 Plan は Feature。Planning では実装せず、承認・正式保存・Work Item 作成後に終了する。

## 要件・決定事項

### 1. 設定

Pi の有効な SettingsManager snapshot を、既存どおり tool 呼び出しごとに読む。

```json
{
  "taskflow": {
    "codeReviewEnabled": true,
    "codeReviewProvider": "plannotator"
  }
}
```

- `codeReviewEnabled`: boolean、未設定時は `true`。
- `codeReviewProvider`: `"plannotator" | "tuicr"`、未設定時は `"plannotator"`。
- `false` ならどちらの provider も起動せず、既存形式の `{ status: "skipped", approved: false }` を返す。
- namespace と新設定の値を検証する。不正な provider・型は明確な設定エラーとし、無効設定の場合も不正な新設定を隠さない。provider 間の自動 fallback はしない。
- Project / Global の優先順位と project trust は Pi に委ねる。独自のファイル読み込み・設定 tool・自動設定変更は追加しない。
- **旧 `plannotatorCodeReview` は参照・検証せず無視する。互換 fallback、自動移行、旧設定検出エラーは作らない。** ユーザーが明示的に選択した方針である。
- したがって旧 `plannotatorCodeReview: false` しかない場合も、新設定の既定値により Code Review は有効・Plannotator になる。この破壊的変更と新名称への手動変更を設定説明に明記する。

### 2. provider と承認

- Plannotator の Code Review 経路と `taskflow_plan_review` の動作は維持する。Plan Review の provider 設定は追加しない。
- tuicr の初期対応は **herdr-app の新規タブ**。旧 `herdr`、pane 分割、tmux 等、手動起動済み session への接続は対象外。
- 呼び出し元 Pi と同じ space に、用途が分かる名前の専用タブを作る。別の space / tab がフォーカスされていても、そこを暗黙に使わない。
- レビュー対象は tool の cwd の Git working tree。`tuicr -w --stdout` を使い、未コミット変更を確認する。PR 送信や任意 revision range の選択機能は追加しない。
- コメントは tuicr の **`y` または `:clip` による明示 export → 終了**で受け取る。起動時に操作方法を案内する。
- 今回の起動専用 stdout の Markdown を解析せず `feedback` として扱う。保存済み JSON session の探索、最新 session の推測、clipboard fallback は追加しない。export に過去の保存コメントが含まれても、今回追加されたコメントだけだとは表現しない。
- 正常終了後に export を取得し、専用タブを閉じて元の Pi に戻し、Pi の公開 `ctx.ui.select` で **Approve / Reject / Cancel** を提示する。空 stdout は「export されたコメントを受け取っていない」と明示し、指摘なしとは断定しない。この場合もユーザーは Pi で明示的に判断できる。
- export、終了コード 0、全ファイル確認済み、空出力、タブやウィンドウの閉鎖は承認ではない。Pi で明示的に選ばれた Approve だけを `approved: true` とする。
- Reject は既存の Root 判断・必要な修正・再検証・再提出に戻る。Cancel、UI dismiss、abort、shutdown、異常終了、不正応答、依存不足は承認にしない。

### 3. 対応環境と安全境界

- 初期の直接受入対象は、Pi・Git checkout・tuicr が同じローカルマシン上にあり、起動済み herdr-app / hc と呼び出し元 Terminal を識別できる環境。遠隔 machine 越しのファイル回収、Windows 用起動経路、他 VCS は今回の保証対象外。
- 必要な CLI、UI、呼び出し元 Terminal / space が利用できない場合は、副作用を起こす前に理由を返す。Plannotator を使う場合は herdr-app / hc / tuicr を要求しない。
- 導入・更新・app/core の起動や再起動、ユーザーの設定・既存 tuicr session の消去は自動実行しない。
- 今回作成したタブ・Terminal・一時ファイルだけを後片付けする。既存タブ、space、他 session、ユーザーの作業ツリーに変更を加えない。

## 調査根拠と未検証事項

### リポジトリ

調査時 HEAD: `d8ba4b824d010f3e57626f53b172a7399bf1f7a8`。作業ツリーは clean。`pnpm check` は typecheck / lint / format check / 6 test files・121 tests が成功した。これは変更前の baseline であり、変更後の検証結果ではない。

- `extensions/taskflow.ts`: Code Review tool 登録、effective settings、cwd、呼び出し単位と shutdown の AbortSignal、結果と isError の変換。
- `src/settings.ts`: 現在は旧 boolean のみ。有効な Pi settings を読む既存境界を再利用する。
- `src/plannotator.ts`: `ReviewResult` と Plannotator の Plan / Code Review protocol。人間の判断に timeout を設けず、キャンセルを承認にしない。
- `test/helpers.ts`, `test/settings.test.ts`, `test/code-review.test.ts`, `test/plannotator.test.ts`: SettingsManager / ExtensionRunner / EventBus の既存検証経路。
- `skills/taskflow-implementation/SKILL.md` §9–10: 明示承認と Reject / Cancel の既存契約。
- `docs/pi-taskflow-basic-design.md` §22–23、`docs/pi-taskflow-implementation-spec.md` §26–27: 現行 provider 固有仕様。今回の合意を反映して Implementation で更新する。

### 公開 CLI / API

調査時のローカル CLI は tuicr `0.28.0`、herdr-app `0.1.15`、herdr-core `0.1.21`。これらは調査・受入の基準版であり、未検証の全将来版の互換保証ではない。

- [tuicr v0.28.0 CLI](https://github.com/agavra/tuicr/blob/v0.28.0/docs/CLI.md)、[main.rs](https://github.com/agavra/tuicr/blob/v0.28.0/src/main.rs)、[handler.rs](https://github.com/agavra/tuicr/blob/v0.28.0/src/handler.rs): `--stdout` の実出力は pending export がある場合のみ。通常終了や強制終了が成功・空 stdout になることがあり、終了コードだけでは export / cancel を区別できない。Root が source を直接確認済み。
- [tuicr v0.28.0 Git diff](https://github.com/agavra/tuicr/blob/v0.28.0/src/vcs/git/diff.rs): working tree は staged / unstaged の合成差分と untracked を含む。binary、ignore、非常に大きな untracked file 等は tuicr 自体の表示制限に従う。全ファイル内容の完全表示を保証しない。
- [herdr-app v0.1.15 commands](https://github.com/herdrdev/herdr-app/blob/v0.1.15/docs/commands.md)、[agent guide](https://github.com/herdrdev/herdr-app/blob/v0.1.15/src/SKILL.md): `tab.new` の `space` / `folder` / `argv` と、ID を指定した `tab.close` を利用できる。この版では master の `focus` option を前提にしない。
- [herdr-core v0.1.21 commands](https://github.com/herdrdev/herdr-core/blob/v0.1.21/docs/commands.md) とローカル `hc schema`: Terminal の `address` / `state` / `reason` / `exit_code`、wait の `terminal` / `ended` / `reason` / `exit_code` を確認済み。`timeout` / `message` は終了ではなく、`exit` にも program loss が含まれる。
- Pi 公開 `ctx.ui.select(..., { signal })` と `ctx.hasUI` を使う。TUI が直接受入の対象。RPC については公開 dialog protocol を妨げないが、専用 client の新設・全面 E2E は対象外。UI のない print / JSON 実行では tuicr を起動しない。

現時点では実タブ作成、tuicr 操作、export 回収、終了時のタブ残存、cleanup は未実行。`tab.new` 応答の完全な構造と退出後の UI 挙動は、Implementation の限定した直接確認で確かめる。返却 Terminal / pane ID と `herdr-app ls` の構造から所有タブを特定し、未確認の `tab` field を決め打ちしない。

## 制約・対象外

- tool 名・空の入力 schema・既存 `ReviewResult` と `skipped` の形式を維持する。
- provider registry、plugin framework、独立 package、常駐 service、独自 workflow state / 永続 session 管理、復旧・再開機構を作らない。
- provider 選択以外の起動方式・タブ位置・キー・テーマ・実行ファイル path の設定を追加しない。
- tuicr / herdr-app / hc 自体の改造、独立した配布用 shell wrapper、追加依存 package は不要。必要な redirect は Taskflow 内から標準機能で行う。
- 保存済み tuicr session の変更・削除、JSON fallback、コメント種別の自動採否、Approve の推論はしない。
- ローカル working tree レビューに限定し、PR / forge への投稿、merge / release / deploy、commit / push は行わない。
- 既存の正式 Plan・過去の検証結果を新仕様に合わせて書き換えない。現行の手順・仕様だけを更新し、過去の記録は当時の結果として区別する。

## 実装方針

### 1. 設定と tool の最小変更

`src/settings.ts` を新2項目の解決・検証に変更する。`extensions/taskflow.ts` は disabled / Plannotator / tuicr の小さな分岐にする。Plannotator の処理と Plan Review は再実装しない。

tool description を新設定と provider に合わせる。既存の tool output と isError 規則を再利用する。tool 内の状態共有や UI 競合を避ける必要があれば Pi の公開 sequential execution 機能を用い、独自の queue / registry を作らない。

### 2. tuicr 連携

小さな `src/tuicr.ts` を追加し、次の処理を実装する。

1. signal、対話 UI、CLI、Git cwd、ローカル実行条件を確認する。`HC_TERMINAL_ID` と `herdr-app ls` から呼び出し元 Terminal・space・復帰先を一意に特定する。不明なら任意の active tab に fallback しない。
2. 呼び出しごとに private な一時ディレクトリを作り、stdout / 必要最小限の診断を分離する。共有の固定出力 path は使わない。
3. `tab.new` に明示的な space ID、絶対 folder、argv、用途の分かるタブ名を渡す。CLI は引数配列 / JSON で呼ぶ。redirect に shell が必要でも cwd・path・識別子を command text に未エスケープで埋め込まず、引数として渡す。
4. 返却応答を検証し、今回の Terminal / タブ ID を保持する。起動成功の応答だけで tuicr 起動成功やレビュー完了にしない。
5. `hc wait` / 必要な `get` で正確な Terminal の終了を待つ。check-in timeout や message は待機継続とし、スクロールバックや summary text を終了証拠にしない。非ゼロ終了、killed / lost / recovered shell 等を正常レビューとして扱わない。人間のレビュー時間・Pi の判断時間に期限を設けない。
6. 正常終了なら専用 stdout を読み、明示 export の有無を区別する。出力のサイズや形式上の異常を黙って無視・欠落させず、回収失敗なら承認へ進めない。
7. 所有するレビュー用タブを閉じ、元の Pi に戻す。既に当該タブが閉じられている場合は安全に扱い、他の tab を代替で閉じない。ユーザーが専用タブに別 Terminal を追加するなど所有範囲が変わった場合も、他の作業を巻き添えにしない。
8. export の有無を明示して Approve / Reject / Cancel を選択させ、選択後も abort を確認して既存形式の結果を返す。feedback は受領した export そのものであり、Agent への上位指示や承認証拠として解釈しない。

### 3. キャンセル・失敗・cleanup

- tool signal と既存の `session_shutdown` signal を合わせ、起動・待機・Pi dialog の各段階で使用する。開始前 abort は起動しない。遅延応答でキャンセル後に承認しない。
- 起動中の abort でも取得できた所有 ID は回収し、限定した cleanup を試みる。応答欠落などで所有が証明できない資源を、名前や process 名だけで一括終了しない。残存可能性と再開条件を報告する。
- cleanup は成功・失敗・キャンセルで共通に、所有 ID と一時ディレクトリに限定して冪等に行う。制御コマンド自体のハングを bounded にすることと、人間の待機を timeout しないことを区別する。
- cleanup / 復帰失敗を隠して成功を返さない。既存の error / cancelled の非承認結果と診断に残し、残存資源を特定できる情報を伝える。app/core 全体は停止しない。
- レビュー中に Root が作業ツリーを変更する運用はしない。修正・再提出は新しい tool 呼び出しとして行い、以前の export や承認を再利用しない。作業ツリー全体の snapshot / lock / 復旧機構は追加しない。

### 4. 文書・検証資産

変更対象:

- `src/settings.ts`, `extensions/taskflow.ts`、新規 `src/tuicr.ts`。
- `test/settings.test.ts`, `test/code-review.test.ts`, `test/helpers.ts`、新規の小さい tuicr 連携テスト。既存 Plan tests は回帰確認する。
- `skills/taskflow-implementation/SKILL.md` の Code Review gate と設定説明。
- `docs/pi-taskflow-basic-design.md`、`docs/pi-taskflow-implementation-spec.md` の Code Review / 設定 / 関連説明。今回の provider 選択・旧設定廃止・明示 export / Pi 承認という合意を、現行の Plannotator 固定記述に優先して反映する。更新は Implementation で行う。
- `docs/testing/implementation-feature.md` と関連する現行 smoke 前提を更新し、「設定なしなら無効」という古い前提は明示的な `codeReviewEnabled: false` に直す。歴史的な成功記録は新仕様の証拠にしない。

既存 docs/testing は一般的な smoke と過去記録であり、tuicr の起動・操作・export・所有確認・cleanup を再実行する手段は不足している。Implementation では共通 `create-verification-skill` を使い、既存の root `skills/` 配置に合わせて `skills/taskflow-verification/SKILL.md` と最小の `references/feature-map.md` を作る。初期対象は今回の Code Review 経路のみ。必要な場合だけ同梱 helper を追加する。Planning では資産を生成しない。

共通 Skill は調査時 `/Users/minoru/Documents/mywork/pi-dev/pi-skills/skills/create-verification-skill/SKILL.md` で確認できた。Implementation 時は利用可能な同名 Skill を読み、生成物にこの隣接 checkout の絶対パスを要求しない。`.pi/verification-evidence/<run>/` は既存 `.gitignore` の `.pi/` により対象外なので ignore 設定を増やさない。通常手順には検証 Skill へのリンクを置き、重複した詳細手順を増やさない。

## 完了条件

1. 未設定で有効・Plannotator、明示 tuicr 選択、有効 / 無効、型・provider 不正、旧設定無視が仕様どおり動く。無効時はどちらの provider も起動しない。
2. Pi の effective settings / project trust を保ち、既存 Plan Review と Plannotator Code Review の承認・キャンセル契約が維持される。
3. tuicr 選択時、呼び出し元 Pi と同じ space の新しいタブで正しい cwd の working tree を確認できる。別のフォーカスタブを誤って使わない。
4. ユーザーが tuicr に入力して明示 export したコメントが、当該呼び出しの feedback として返る。空 stdout をコメント未受領として案内する。
5. 明示的な Pi Approve だけが承認になる。Reject / Cancel / dismiss / abort / shutdown / 異常終了 / 依存不足 / 不正応答から成功へ進まない。
6. 終了・キャンセル時に所有するレビュー用タブと一時状態が片付き、元の Pi に復帰する。他のタブ・Terminal・保存 session は保持され、cleanup 失敗は報告される。
7. `pnpm check` が成功し、下記の直接確認と再利用できる検証手順が成立する。模擬 UI 応答だけで実操作成功としない。
8. 現行仕様・設定案内・Implementation Skill・関係する検証手順が整合し、旧設定を無視する影響が記載される。

## 動作確認方法

### 自動テスト

既存 Vitest / SettingsManager / ExtensionRunner の経路を再利用する。

- defaults、新2項目、旧設定のみ / 新旧混在、Project override / trust、snapshot 非変更、不正値、無効時の無起動を限定ケースで確認する。
- Plannotator の明示判断・起動失敗・abort・shutdown、および Plan Review の回帰を既存 tests で確認する。
- tuicr では小さい process / UI 境界の mock を用い、明示 space / cwd / argv、所有 ID と出力の対応、timeout check-in、空 export、異常終了、不正 JSON、abort / late response、cleanup 対象の限定、明示判断の変換を確認する。
- 大きな fake Herdr、独自 runner、全組合せ試験、恒久 PTY / browser E2E は作らない。mock は実タブ・実 tuicr・人間の操作を証明しない。
- 正式チェックは `pnpm check`。TDD は今回必須にしない。設定検証は小さい既存テストの拡張、外部連携は実際の境界を確認してから最小の回帰テストを置く。非 TDD をテスト不要・最後まで未検証で進める指定にしない。

### 直接確認

実装後の source を、所有する一時 Git fixture と隔離した Pi settings / session で動かす。ユーザーの既存 Git worktree や Global settings は変更しない。herdr-app を使う可視試行では、実行時に対象を示して必要なユーザー許可を確認し、許可された検証用タブだけを操作する。共有 app/core の再起動・一括 cleanup・無断 install はしない。

最低限の確認:

1. trusted fixture の tuicr 設定で tool を実行する。別タブがフォーカスされても呼び出し元 space に新規タブが開き、fixture の staged / unstaged / 小さい untracked の代表差分が表示されることを確認する。
2. 実ユーザーが識別可能なコメントを入力して `y` / `:clip` で export。元の Pi に戻り、Approve 前は tool が承認を返さず、明示 Approve 後の feedback が一致することを確認する。
3. 別試行で Reject を選び、Root に feedback が返ることを確認する。再提出は新しい起動となり、前回の出力・承認を読み間違えない。
4. export しない正常終了で「コメント未受領」が表示され、自動承認されないことを確認する。Pi Cancel / dialog dismiss と、tuicr 待機中の tool cancel の代表経路を確認し、専用タブ・一時状態の cleanup と既存タブの不変を観測する。shutdown の直接試行は検証用 Pi だけを終了する。
5. default Plannotator の代表 Code Review を実ユーザーで確認する。Plan Review は既存自動 tests で回帰を確認し、今回変更していない browser 全経路の E2E を新規に課さない。
6. 依存不足・no UI・応答不正などは限定した自動テストで保証し、実機の実行ファイル削除や利用者環境の破壊で再現しない。

開始・終了・export・Pi 判断・cleanup の最小証拠を対応付けて記録する。version、source / dirty 状態、fixture、実行した操作、期待と観測、未実行範囲、残存物を残す。秘密値・不要な他タブ情報・raw log 全量は保存しない。証拠は fixture cleanup と独立した ignored 領域に残し、cleanup 後も参照できることを確認する。

Worker は担当変更の tests と検証手順の成立を確認し、Root は変更後の実差分・正式 checks・今回の直接確認・全完了条件を独立に確認する。人間の承認を自動入力で捏造しない。共通 Create は初期対象の少なくとも一機能を実操作して成立させ、Root の全受入れの代わりにしない。

### 検証手段の具体化と停止条件

Implementation Root は現在の既存手段を再確認し、この Plan の保証対象・対象外・期待結果を維持して、起動・操作・観測・証拠・cleanup の方法と必要な最小 helper / Skill 更新を具体化できる。追加 install や利用者・共有環境変更なしで安全に隔離できる標準機能の試行は、完成済み harness の不在だけで止めない。通常 tests や使い捨て Probe を一律に資産化しない。

必要な許可・依存・共通 Skill が不足し、許可範囲で安全に成立しない場合は不足と再開条件を報告して BLOCKED とする。未成立の手順や mock の成功を実機成功に読み替えない。公開契約・保証・期待結果・対象範囲を変える必要があれば通常の確認 / REPLAN_REQUIRED に戻り、期待値を緩めたり独自代替・無断 install で回避したりしない。
