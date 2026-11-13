---
name: taskflow-verification
description: Verify pi-taskflow Code Review through the real Pi TUI and Plannotator or a dedicated local herdr-app tuicr tab. Use for provider/settings changes, explicit human decisions, cancellation and owned-resource cleanup; preserve minimal run evidence.
---

# Taskflow Code Review の直接検証

今回の変更に関係する機能だけを [Feature Map](references/feature-map.md) から選ぶ。初期対象は `taskflow_code_review` の設定と Plannotator / tuicr の TUI 経路。全 Implementation workflow、Plan Review browser E2E、remote machine、他 VCS、Windows、独自 RPC client は対象外。Map 全実行や製品修正を自動的に許可しない。通常 tests・正式 `pnpm check`・Root の受入判断の代替にしない。

## 発見・再利用

repository を cwd として Pi を起動し project trust を確認する。既存の root `skills/` は Taskflow package の resource 探索で読み込む配置であり、一般の project 自動探索 `.pi/skills/` と混同しない。Taskflow package をロードしていない場合は `pi --skill ./skills/taskflow-verification` を明示する。追加・更新後は新セッションまたは `/reload`、`/skill:taskflow-verification Code Review の対象case`、またはこの `SKILL.md` の実ファイルを明示 read する。自動選択自体は保証しない。同梱参照はこの Skill の配置基準、下記コマンドは Taskflow repository の cwd 基準。

通常は関連する Map の手順/helper だけ更新し、変えた手順を再実行する。共通 Maintain はユーザーの明示実行専用であり、自動実行しない。

## 前提と権限

- 導入済みの `pi`、Git、Node.js、Taskflow の dependencies を利用する。無断 install・app/core 再起動・Global settings 変更はしない。Plannotator case には導入済み Extension entry が必要。
- tuicr は同じローカルマシンの起動済み herdr-app / hc と tuicr を使い、Pi の `HC_TERMINAL_ID` が一覧の local space/tab/pane に一意に存在すること。基準版は tuicr 0.28.0 / herdr-app 0.1.15 / hc 0.1.21。実行時の版も記録する。cwd 名や active tab から元spaceを推測しない。
- 可視試行の前に対象 fixture、呼び出し元 Terminal、同space専用tab作成・focus・限定cleanupを示しユーザー許可を得る。許可された検証tabのみ操作する。コメント入力、export、Approve / Reject は人間が行う。自動入力・承認イベント注入で人間判断を代用しない。
- 専用Piは下記helperを公開Extensionとしてロードする。model/auth不要で実toolと本物のPi UIを接続するだけで、providerや判断のfakeではない。helperとTaskflow本体を二重ロードしない。

## 空の隔離状態からの起動

まず証拠の機密性と保存範囲を確認する。所有 fixture に秘密・個人情報を入れない。Taskflow checkout で以下を実行する。

```sh
TASKFLOW_REPO=$(pwd -P)
RUN=$(date +%Y%m%d-%H%M%S)-$$
EVIDENCE="$TASKFLOW_REPO/.pi/verification-evidence/$RUN"
mkdir -p "$EVIDENCE"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/taskflow-verification.XXXXXX")
FIXTURE="$WORK/fixture"
AGENT_DIR="$WORK/agent"
SESSION_DIR="$WORK/sessions"
mkdir -p "$FIXTURE/.pi" "$AGENT_DIR" "$SESSION_DIR"
printf '%s\n' '{}' > "$AGENT_DIR/settings.json"
printf '%s\n' '{"taskflow":{"codeReviewProvider":"tuicr"}}' > "$FIXTURE/.pi/settings.json"
printf 'baseline\nsecond line\n' > "$FIXTURE/review.txt"
(
  cd "$FIXTURE"
  git init -q
  git add review.txt
  # 今回所有する隔離fixture内だけのbaseline。製品/既存repoでは実行しない。
  git -c commit.gpgsign=false -c user.name=TaskflowSmoke -c user.email=smoke@example.invalid commit -qm baseline
  printf 'staged change\nsecond line\n' > review.txt
  git add review.txt
  printf 'staged change\nunstaged change\n' > review.txt
  printf 'small untracked change\n' > untracked.txt
)
{
  date -u
  git rev-parse HEAD
  git status --short
  pi --version
  herdr-app --version
  hc --version
  tuicr --version
  printf 'source=%s\nfixture=%s\nagent=%s\nsessions=%s\n' "$TASKFLOW_REPO" "$FIXTURE" "$AGENT_DIR" "$SESSION_DIR"
} > "$EVIDENCE/source-and-versions.txt"
```

`EVIDENCE` は既存 `.pi/` ignore 内で fixture 外。衝突しない run ごとに用意するだけで管理registryは作らない。Plannotatorだけのcaseは herdr CLI版取得を省略できる。不足する依存・権限・接続は理由と再開条件を報告して停止し、危険な代替で回避しない。

呼び出し元は既存作業中のPiではなく、許可された検証用herdr-app Terminalで起動する。shell の `$HC_TERMINAL_ID` と `herdr-app ls` を照合し、元space/tab/paneの **IDだけ** をrun記録に残す（一覧全量は保存しない）。上記変数を同shellに設定する。tuicrケースの起動:

```sh
cd "$FIXTURE"
TASKFLOW_EVIDENCE_DIR="$EVIDENCE" PI_CODING_AGENT_DIR="$AGENT_DIR" \
  pi --approve --no-extensions --no-skills \
  -e "$TASKFLOW_REPO/skills/taskflow-verification/scripts/code-review.ts" \
  --session-dir "$SESSION_DIR"
```

Plannotator case は導入済み entry の絶対パスを `PLANNOTATOR_EXTENSION` に設定し、同コマンドへ `-e "$PLANNOTATOR_EXTENSION"` を追加する。隣接checkoutの固定パスは不要。`--approve` は所有fixtureのproject trustであってレビュー承認ではない。`--continue` / `--resume` / `--fork` は使わない。caseや設定を変える時は所有Piを終了し、別の空agentdir/sessiondirで新しいPiを起動する。

起動後 `/verify-code-review` と `/verify-code-review-cancel` が補完されること、helperのロードエラーがないこと、cwdがfixtureであることを確認する。processの存在だけでusableにしない。`/verify-code-review` を入力して実toolを1回呼ぶ。開始は `tool-events.jsonl` の `tool-start`、結果は `tool-end` の実tool応答とPi通知で確認する。helperは待機中もcancel commandを受けられるようcommand制御を返す。待機中は重複起動しない。

## 操作・観測・証拠

caseごとの操作は [Map](references/feature-map.md) に従う。tuicr `--stdout`では `y` または `:clip` Enterで明示exportするとそのまま終了し、追加のqは不要。exportなしの退出は `:q` Enterで、裸のqは終了しない。未保存コメントがあると `:q` は拒否されるため、既存sessionを削除せず人間の判断またはPiでのcancelに戻す。識別可能な今回専用コメントを人間に入力してもらう。開始・専用tabの実IDとcwd・export・Pi判断前後・cleanupを対応付ける。`hc get <今回のTerminal> --json` の argv から専用temp directoryを確認できるが、証拠には必要なID/path/state/reason/exit_code/signalだけ転記する。screen/一覧/raw log全量や無関係な他tab情報は保存しない。作業ツリーをレビュー途中で変更しない。

`$EVIDENCE/run.md` に以下を短く記録する。

- 対象case/入口、source版/dirty状態と実際にロードしたsource、今回の設定、使用版と前提、所有fixture/Pi/レビューtab/Terminal/tempの識別。
- 実行操作、期待と観測、表示差分、今回exportと実feedbackの一致、Approve前は未完了であること、Piの人間判断と結果（`tool-events.jsonl` の該当時刻への参照）。保存済みコメントがexportに含まれる可能性もあるため「今回追加したコメントだけ」とは記録しない。
- 成否・未実行入口・対象外・失敗・cleanup/残存と再開条件。Mapを今回の成功記録として書き換えない。古い成功やmockの成功を実操作の成功と読み替えない。

証拠は必要最小限。秘密・不要なraw log・無関係な他tab情報を保存/外部送信/commitしない。ignoreは秘密保護の境界ではない。自動削除や保持期限管理は加えない。

## 停止・後始末

- 待機中の中止は専用Piで `/verify-code-review-cancel`。dialog dismissはEsc。shutdown caseは **専用Piだけ** `/quit`。toolの最終非承認結果とcleanupを観測し、終了要求自体をcleanup成功としない。
- 正常終了・失敗・cancelのいずれも、toolが今回所有tab/Terminal/tempを除去し元PiをfocusすることをMapどおり確認する。別Terminalが専用tabに追加された場合、そのtab全体を閉じず追加Terminalを保つ。無関係な既存tab/sessionは変更しない。
- cleanup失敗やlaunch応答欠落では成功扱いにしない。残存する正確な所有IDを確認できる時だけ `hc get ID --json` / `herdr-app ls` で再確認し、所有Terminalだけ `hc kill ID --json` 後に `hc wait ID --timeout 5 --json` のended:true/reason:exitと `hc get ID --json` のstate:finishedを確認してから `hc rm ID --json`（waitのtimeout/messageではrmせず残存を報告）、そのtab内に他Terminalがないことを確認して `herdr-app do tab.close '{"id":"実所有tab ID","confirmed":true}'` を使う。既に消えた資源を別IDへ置換せず、名前推測・process名一括kill・共有app/core停止をしない。所有が不明なら手動確認を依頼し、残存可能性を報告する。
- 所有Piを終了してから、作成時の正確な `$WORK` だけ `rm -rf -- "$WORK"`。既存tuicr保存sessionは探索・変更・削除しない。証拠はfixture cleanupから独立して残し、`cat "$EVIDENCE/run.md"` と参照証拠の読み戻しを実行し、参照可能なことを記録する。未確認や残存を隠して完了にしない。
