# Feature Planning smoke 確認

Skill / Playbook の振る舞いは実際の Root セッションで確認する。
`pnpm test` の `planning-skill.test.ts` は Pi の Skill 読み込みと Playbook / 同梱 ticket Skill への相対参照解決だけを確認し、この E2E シナリオの成功を証明するものではない。
承認を模擬した tool 応答や手動作成した ticket を、実際の workflow の成功とみなさない。

## 前提

- Pi の model が利用可能。
- `pi-taskflow` と Plannotator Extension が読み込まれ、`taskflow_plan_review` が利用可能。今回使用した Plannotator は TUI または RPC の UI context を必要とし、print / JSON モードでは browser review を利用できない。
- 同梱 `taskflow-to-ticket` Skill が利用可能。旧 `to-tickets` / setup Skill は不要。この smoke では未設定の fixture から Local Markdown を選び、GitHub にはテスト Issue を公開しない。
- ユーザーが Plannotator の Review と、tracker 設定・Work Item 分割・最終本文の保存の各確認に参加する。

tracker 準備は `taskflow-to-ticket` だけが担当する。詳細な設定・再実行の観測は [To Ticket 単体 smoke](to-ticket.md) を参照する。代替 tracker や設定を Planning で作らない。
この明確な小規模シナリオでは Scout、外部調査、Grilling、Probe、Oracle を省略できる。外部調査の実 integration 確認は Issue #5 の範囲である。

## 隔離した fixture を用意する

リポジトリの外に一時ディレクトリを作る。以下は変更しない production 相当の入力であり、Probe や Implementation ではない。

```sh
TASKFLOW_REPO=/absolute/path/to/pi-taskflow
SMOKE_DIR=$(mktemp -d)
cd "$SMOKE_DIR"
git init -q
printf '%s\n' 'console.log("Hello, world!");' > greet.mjs
printf '%s\n' '{"type":"module","scripts":{"test":"node greet.mjs"}}' > package.json
node greet.mjs
pi -e "$TASKFLOW_REPO" --skill "$TASKFLOW_REPO/skills/taskflow-planning"
```

Pi の command / startup diagnostics で同梱3 Skill が衝突なく読み込まれ、Plannotator が利用可能なことを確認する。Plannotator の明示的な追加が必要なら公開 `-e` を使い、global 設定を変更しない。
fixture にはまだ `docs/agents/issue-tracker.md` を作らない。ticket Skill の設定提示・実ユーザー承認後にだけ Local 設定を保存する。

## 依頼

```text
/skill:taskflow-planning greet.mjs に --uppercase オプションを追加する計画を作ってください。
引数なしでは従来どおり Hello, world!、--uppercase ありでは HELLO, WORLD! を出力します。
他の動作・オプションは追加しません。TDD は使わず、両方の CLI 実行結果で確認します。
Approved Plan と確認済み Work Items の保存まで行い、実装は開始しないでください。
```

## 観測と合格条件

1. Root が `SKILL.md` と `references/playbooks/feature.md` を読み、fixture のコードと `package.json` を直接確認する。コードから分かる内容をユーザーに質問しない。
2. Root が実装を行わず、目的、要件・決定事項、制約・対象外、実装方針、完了条件、動作確認方法を含む最終 Plan を作る。
3. Root が `taskflow_plan_review` に Plan 全文を渡す。Plan Mode に入らない。
4. ユーザーが初回 Review を Reject し、「引数なしの出力が維持されることを完了条件にも明記してください」と feedback を返す。
5. Root が修正して再度 `taskflow_plan_review` を呼ぶ。Reject された Plan から Work Items を公開しない。
6. ユーザーが Plannotator で明示的に Approve する。Root が承認された全文を `docs/plans/<slug>.md` に保存する。
7. Root が Planning と Feature Playbook の各リンク元から同梱 `taskflow-to-ticket/SKILL.md` を解決して読む。正式に保存した Approved Plan のパス・全文・追加制約を渡す。ticket Skill が fixture root の設定を直接読み、不存在を確認して Local 設定の内容・保存先を提示し、実ユーザー承認後だけ保存・readback する。旧 setup は呼ばず、AGENTS.md / CLAUDE.md / Domain / triage 設定を作らない。
8. ticket Skill が分割案と依存関係を提示し、ユーザーの分割承認を待つ。承認後も ticket はまだなく、最終本文・保存先を示して別の保存承認を待つ。実ユーザーの保存承認後に Local Work Items を保存し、各項目の Plan リンクを ticket の場所から解決して正式な全文を確認する。Plan・設定・分割の承認を保存許可に流用しない。
9. 最終回答に Plan と Work Items の参照がある。Root はここで終了し、Worker や Implementation を開始しない。
10. `greet.mjs` が最初の1行のままであることと、`node greet.mjs --uppercase` がまだ `Hello, world!` を出力することを確認する。新動作が実装されていないことも、この Planning シナリオの合格条件である。

Plan の内容、保存された設定と ticket、tool 呼び出し履歴、最終回答を直接確認する。Plan・設定・分割・保存の各承認記録と、その承認前に対象ファイルが未作成であることを区別して観測する。
成功後は [Feature Implementation smoke](implementation-feature.md) の手順で設定・正式 Plan・ticket・初期コードだけを別 fixture / fresh Root に引き継ぐ。
テスト fixture や途中結果を本リポジトリの正式な Plan / Work Item に混ぜない。

## 承認できない場合の追加確認

別の試行で Review を閉じる・キャンセルする場合、承認済みとして保存したり ticket 公開に進んだりしないことを確認する。
Plan Review が利用できない、または Plan / Work Item の保存が失敗する場合は、未完了と再開条件を報告し、Planning 成功とはしない。

## REPLAN_REQUIRED からの再開案内の追加確認

- Implementation が `REPLAN_REQUIRED` で停止した際の Planning 用依頼文を、同じ対象 cwd の新しい Root セッションで使う。既存 Work Item・正式 Plan・停止理由を確認し、未コミット変更・部分実装を変更・commit / stash / 破棄しないことを差分と tool 履歴で確認する。
- 改訂 Plan の明示的な Approve・正式保存と、それに整合する Work Item の確認・保存・公開がすべて完了した後だけ、最終回答に別の新しい Implementation セッション用のコピー可能な kickoff があることを確認する。Plan 承認を Work Item の保存・公開承認に流用しない。
- 再計画で Work Item / Plan 参照が変わる試行も用意し、kickoff の対象 cwd と再開対象 Work Item が保存・公開後の確定した参照であり、Work Item から改訂 Approved Plan を解決できることを確認する。古い参照や未確定の参照を使わない。
- kickoff に既存変更の保持・現在の差分の再確認と、過去のチェック・Review・Code Review Approve を流用しない指示があり、Planning は Worker / Implementation を自動起動せず停止することを確認する。
- 通常の Planning ではこの再開用 kickoff を追加しない。再計画でも、承認待ち・保存失敗・一部だけ公開の場合は提示しない。実 Root の最終回答と履歴で確認し、文言一致や loader test を手順遵守の証拠にしない。

## 確認結果の報告

実行した場合は、Pi / model、利用したコンポーネント、確認日時、Plan と Work Items の参照、各合格条件の結果を報告する。
未実行の場合は E2E 未確認と明記する。自動読み込みテストの成功だけで Issue #2 の E2E 条件を満たしたと報告しない。

以下は旧 `to-tickets` を使った当時の事実であり、新版の成功記録ではない。

### 2026-10-07 の実行結果

- Pi `1.0.4`、model `openai/gpt-6.1-sol`、Plannotator Extension `0.27.16` を使用。
- 公開 `to-tickets` は `mattpocock/skills` の commit `f3fc5632f401156837ee3872f14fe33ccf1024ea` から取得し、一時領域で読み込んだ。依存関係や global 設定は変更していない。
- fixture: `/tmp/pi-taskflow-feature-smoke.wuz1dC`。CLI の JSON モードでは Review が `unavailable` となり、Root は正式な Plan / ticket を保存せず停止した。
- 公開 RPC モードで同じ Planning を再開。実際のユーザーによる Reject → feedback を反映した再提出 → Approve を確認した。承認は模擬していない。
- Approved Plan: fixture 内の `docs/plans/greet-uppercase.md`。保存内容が承認された `planContent` と完全に一致し、必須6項目を含むことを確認した。
- Work Item: fixture 内の `.scratch/greet-uppercase/issues/01-uppercase.md`。ユーザーが1件の分割案と依存関係を別途承認した後に保存され、Plan の相対リンクが実在する正式な Plan に解決されることを確認した。
- tool 履歴と終了イベントを確認し、ticket 保存後に Planning が停止した。`greet.mjs` と `package.json` は変更されず、引数なし・`--uppercase` ありの両方が従来の `Hello, world!` を出力することを実行確認した。Implementation は開始していない。
- 上記の合格条件1〜10を確認済み。イベントログは fixture 内の `run-1.jsonl` / `run-2.jsonl`、入力は `rpc-commands.jsonl`。一時領域のため恒久保存は保証しない。
- RPC は入力を閉じて終了済み。テスト用 Plan / ticket は本リポジトリに持ち込んでいない。

### 2026-10-11 JST の実行結果（Issue #17・同梱 taskflow-to-ticket）

- Pi `1.1.0`、model `openai/gpt-6.1-sol`、公開 RPC と実 Plannotator を使用。fixture / ログの基点は `/tmp/pi-taskflow-17-smoke.jsRS7z`、入力は `planning/`、証跡は `planning-logs/events.jsonl` / `commands.jsonl`。一時領域のため恒久保存は保証しない。
- 新しい Root（session `01a129a6-1452-7675-aa7d-3e9a9ac8257b`、initial `messageCount: 0`）で実行。公開 `get_commands` で同梱3 Taskflow Skill が衝突なく利用可能で、旧 `to-tickets` がないことを確認した。
- `greet.mjs` の `--uppercase` 追加を依存なしの1 ticket に計画。実ユーザーの Plannotator Approve による `status: "approved", approved: true` を確認し、正式保存した `docs/plans/greet-uppercase.md` が承認された `planContent` と完全一致した。
- 同梱 ticket Skill と Local / ticket template を直接 read。実行者 Root の `ask_user_question` で得た実人間の回答を RPC `prompt` にそのまま中継し、設定保存・分割・最終本文保存をそれぞれ別に承認した。実行者は設定承認前に設定がなく、分割・最終本文保存の各承認前に ticket がないことを観測した。Plan 承認をこれらの承認に流用していない。
- 設定は `docs/agents/issue-tracker.md`、ticket は `.scratch/greet-uppercase/issues/01-greet-uppercase.md` に保存。ticket は `flag: "wx"` で排他的に作成され、全文が承認された最終本文と一致し、相対リンクが正式な Plan に解決された。
- production 相当の `greet.mjs` / `package.json` は無変更（`git diff --exit-code` 成功）。通常 / `--uppercase` の CLI はともに従来の `Hello, world!`。AGENTS.md / CLAUDE.md / Domain / triage 設定を追加せず、Planning は保存確認後に終了し、Implementation を開始していない。RPC shutdown は exit code 0。
- この新版試行では Reject → 再提出、取消、GitHub 書き込み・native 関係、複数 ticket の公開 E2E は未実行。2026-10-07 の旧 smoke や Issue #16 の単体成功を今回の成功に含めず、上記の合格条件1〜10をすべて実行済みとはしない。
