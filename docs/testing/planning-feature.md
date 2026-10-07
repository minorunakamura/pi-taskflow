# Feature Planning smoke 確認

Skill / Playbook の振る舞いは実際の Root セッションで確認する。
`pnpm test` の `planning-skill.test.ts` は Pi の Skill 読み込みと Feature 参照を確認するだけであり、この E2E シナリオの成功を証明するものではない。
承認を模擬した tool 応答や手動作成した ticket を、実際の workflow の成功とみなさない。

## 前提

- Pi の model が利用可能。
- `pi-taskflow` と Plannotator Extension が読み込まれ、`taskflow_plan_review` が利用可能。今回使用した Plannotator は TUI または RPC の UI context を必要とし、print / JSON モードでは browser review を利用できない。
- 公開 `to-tickets` Skill が読み込まれ、tracker が設定済み。この smoke では local tracker を使い、GitHub にはテスト Issue を公開しない。
- ユーザーが Plannotator の Review と Work Item 分割の確認に参加する。

`to-tickets` または tracker が未設定の場合は、公開 Skill の setup 案内に従って準備する。`pi-taskflow` に代替 tracker を追加しない。
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

既存の global 設定から Plannotator と `to-tickets` が利用できることを確認する。明示的な追加が必要な場合は Pi の `-e` / `--skill` を使う。
fixture の tracker は `to-tickets` 側で local に設定し、global の tracker 設定を勝手に変更しない。

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
7. Root が保存した Approved Plan を `to-tickets` に渡す。分割案と依存関係をユーザーに提示し、確認前に ticket を保存・公開しない。
8. ユーザーが分割案を承認する。`to-tickets` が local tracker に Work Items を保存する。各項目に Approved Plan の参照がある。
9. 最終回答に Plan と Work Items の参照がある。Root はここで終了し、Worker や Implementation を開始しない。
10. `greet.mjs` が最初の1行のままであることと、`node greet.mjs --uppercase` がまだ `Hello, world!` を出力することを確認する。新動作が実装されていないことも、この Planning シナリオの合格条件である。

Plan の内容、保存された ticket、tool 呼び出し履歴、最終回答を直接確認する。Approval の記録と分割確認を区別する。
テスト fixture や途中結果を本リポジトリの正式な Plan / Work Item に混ぜない。

## 承認できない場合の追加確認

別の試行で Review を閉じる・キャンセルする場合、承認済みとして保存したり ticket 公開に進んだりしないことを確認する。
Plan Review が利用できない、または Plan / Work Item の保存が失敗する場合は、未完了と再開条件を報告し、Planning 成功とはしない。

## 確認結果の報告

実行した場合は、Pi / model、利用したコンポーネント、確認日時、Plan と Work Items の参照、各合格条件の結果を報告する。
未実行の場合は E2E 未確認と明記する。自動読み込みテストの成功だけで Issue #2 の E2E 条件を満たしたと報告しない。

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
