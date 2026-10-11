# Taskflow To Ticket 単体 smoke 確認

`taskflow-to-ticket` の承認・保存・停止は、隔離した fixture の**実 Pi Root セッションと人間の応答**で確認する。
`test/to-ticket-skill.test.ts` は Pi loader、明示呼び出し flag、同梱参照、package の `skills/` からの3 Skill 読み込みだけを検証する。文章一致、承認を模擬した tool 応答、手動作成した ticket を E2E 成功としない。

この手順は単体チケット化だけを対象とする。Planning の接続、別セッションでの Implementation 開始チェック、既存設計の更新は Issue #17 の範囲であり、ここでは実行しない。

## 前提と禁止事項

- Pi と利用可能な model がある。ユーザーが Root の設定・分割・保存確認に直接応答する。Worker は承認を代行しない。
- 旧 `to-tickets` / setup Skill、tracker Extension、新依存は不要。global 設定や第三者の導入先・symlink は変更しない。
- fixture はリポジトリ外に作り、実セッションのログも fixture 外に保管する。テスト用 Plan / ticket を本リポジトリに持ち込まない。
- GitHub Issue / label / native relation の書き込み許可はない。Local の検証中は GitHub への書き込みを行わない。
- `--print` に承認回答をまとめたり、Agent が人間の承認を自作したりしない。対話型 TUI またはユーザーが応答できる実 RPC セッションを使う。

## 1. 隔離 fixture を2通り用意する

以下を別々の一時ディレクトリで実行する。1回は `WITH_CONTEXT=0`（AGENTS.md / CLAUDE.md なし）、もう1回は `WITH_CONTEXT=1`（既存ファイルあり）にする。

```sh
TASKFLOW_REPO=/absolute/path/to/pi-taskflow
WITH_CONTEXT=0
SMOKE_DIR=$(mktemp -d)
SMOKE_LOG_DIR=$(mktemp -d)
cd "$SMOKE_DIR"
git init -q
mkdir -p docs/plans
printf '%s\n' 'console.log("Hello, world!");' > greet.mjs
printf '%s\n' '{"type":"module","scripts":{"test":"node greet.mjs"}}' > package.json
if [ "$WITH_CONTEXT" = 1 ]; then
  printf '%s\n' '# Fixture rules' '既存の独自記述。このファイルは変更しない。' > AGENTS.md
  printf '%s\n' '# Fixture notes' 'tracker 設定へのリンクは意図的に置かない。変更しない。' > CLAUDE.md
fi
node greet.mjs
```

まだ `docs/agents/issue-tracker.md`、triage / Domain 設定、ticket は作らない。外部 tracker の remote も不要。

### 正式 Plan を人間が承認して保存する

下記は**未承認の案**。実 Root セッションで全文を提示させ、人間が内容を確認して明示承認する。承認前に Approved Plan と呼ばない。Plannotator を使う場合も実ユーザーの Approve を待ち、模擬しない。単体 Skill のため Plannotator は必須ではない。
承認後にだけ、この全文を正式な `docs/plans/saved-greeting.md` に保存して読み返す。保存・承認の実ログを残す。これが ticket の Approved Plan 参照用入力であり、Plan 承認はチケットの保存許可ではない。

```markdown
# 保存した名前で挨拶する

## 目的

CLI で名前を保存し、次の実行で保存した名前に挨拶する。

## 要件・決定事項

- 引数なしは既存の Hello, world! を維持する。
- node greet.mjs --save-name Ada は .scratch/profile.json に version: 1 と name: Ada を保存する。
- 保存契約と validation を担う name-store.mjs を導入し、空の名前は保存せずエラーにする。
- node greet.mjs --greet-saved は保存契約を使って Hello, Ada! を出力する。
- 未保存・壊れた profile は明確なエラーにし、既存データを変更しない。

## 制約・対象外

外部依存、別オプション、GitHub 公開、TDD は不要。今回は計画のチケット化のみ、実装は別セッション。

## 実装方針

まず保存契約・validation と --save-name の end-to-end 動作を追加する。
次にその契約に依存する --greet-saved と読み取り時のエラーを追加する。
後者は前者の保存 schema・公開 interface が必要なため blocked とする。単なる優先順位ではない。

## 完了条件

保存成功・空入力の拒否、保存済み挨拶・未保存・壊れたデータのエラー、既存出力維持を確認できる。

## 動作確認方法

CLI を隔離した一時 cwd で実行し、出力・exit code と profile 内容を確認する。元データの不変も確認する。
```

Root を起動する例（利用可能な model を必要に応じて明示する）:

```sh
cd "$SMOKE_DIR"
pi --no-extensions --no-mcp --no-skills --no-prompt-templates --no-themes \
  --skill "$TASKFLOW_REPO/skills" --tools read,bash,edit,write \
  --session-dir "$SMOKE_LOG_DIR" --verbose
```

明示した package の `skills/` のみを使い、startup diagnostics と `/skill:taskflow-to-ticket` が利用可能なことを確認する。外部 setup は呼ばない。AGENTS.md / CLAUDE.md のある試行では context discovery を無効化しない。ログに既存ファイルの参照があっても、tracker は直接読む必要がある。
正式 Plan 保存後、Pi を終了せず別 terminal で baseline を記録する（git identity と commit signing の override はこのコマンドだけに限定し、global 設定は変更しない）:

```sh
cd "$SMOKE_DIR"
git add greet.mjs package.json docs/plans/saved-greeting.md
if [ "$WITH_CONTEXT" = 1 ]; then git add AGENTS.md CLAUDE.md; fi
git -c user.name=Smoke -c user.email=smoke@example.invalid -c commit.gpgsign=false commit -qm baseline
```

## 2. Local 初回設定・分割・保存を観測する

実 Root に入力する:

```text
/skill:taskflow-to-ticket docs/plans/saved-greeting.md を Local Markdown のチケットにしてください。
正式 Plan は先ほど人間が承認して保存した内容です。feature-slug は saved-greeting。
設定内容の提示、分割案の提示、保存対象と本文の提示の各段階で止まり、私の明示承認をそれぞれ待ってください。
AGENTS.md / CLAUDE.md、Domain 設定、triage 設定、コードは変更せず、保存後は終了してください。
```

次の各段階でユーザーが tool 履歴・ファイルを直接確認する:

1. Root が Skill と対象プロジェクトの `docs/agents/issue-tracker.md` を直接 read し、不存在を確認する。Local 提案の保存先・設定全文を提示して待つ。承認前は設定も ticket もない。
2. 人間が**設定のみ**を明示承認する。設定の保存・readback があり、不要な AGENTS / CLAUDE / Domain / triage 設定が作られない。`git status --short` で予定外ファイルがないことを確認する。
3. 分割案を確認する。保存動作と保存済み挨拶はそれぞれ検証可能な成果を持ち、後者の blocker が保存契約である。粒度、完了条件、検証方法と正式 Plan 参照を確認する。不適切なら変更を要求し再承認前に保存されないことも見る。
4. **分割承認前**に `find .scratch -type f`（ディレクトリ不存在も正常）で ticket がないことを確認する。人間が分割だけを承認した後にも ticket がなく、最終本文・保存パスの提示と別の保存承認待ちになることを確認する。
5. 人間が**保存**を明示承認する。`.scratch/saved-greeting/issues/<NN>-<slug>.md` に依存順の1チケット1ファイルが作成される。Plan 承認や設定承認の流用ではないことを実ログで確認する。
6. 各 ticket を read し、正式 Plan のリンクを ticket のディレクトリから解決して実在する承認済み全文と照合する。blocker も実ファイルを指し、自己依存・循環・不明な参照がない。仮番号だけのままでは不合格。
7. readback と最終回答に実参照と確認結果がある。Root は終了し、Implementation・子 Agent・コード変更を開始しない。

別 terminal で結果を確認する:

```sh
cd "$SMOKE_DIR"
git diff --exit-code
node greet.mjs
find .scratch/saved-greeting/issues -type f -print
find docs -type f -print
git status --short
shasum -a 256 docs/agents/issue-tracker.md .scratch/saved-greeting/issues/*.md > "$SMOKE_LOG_DIR/first-save.sha256"
```

`git diff --exit-code` は baseline のコード・正式 Plan・既存 AGENTS / CLAUDE の不変を確認する。新規ファイルは別に一覧確認し、設定と ticket 以外（Domain / triage / AGENTS / CLAUDE / workflow state 等）がないことを確認する。AGENTS / CLAUDE なしの試行では引き続き存在しない。`node greet.mjs` は Hello, world! のまま。

## 3. 新しい Root で再実行・上書き防止を確認する

同じ fixture に新しい Pi Root セッションを起動する（前の会話を resume しない）。同じコマンドで同じ Plan のチケット化を依頼し、作成済み ticket を読み照合させる。

- 設定を直接 read して再利用する。十分な設定への再質問・更新がなく、独自記述も維持する。
- 既存 ticket の実参照を再利用し、上書き・追加番号による重複・追加 state を作らない。
- `shasum -a 256 docs/agents/issue-tracker.md .scratch/saved-greeting/issues/*.md` を `first-save.sha256` と比較し、設定と ticket が不変であることを確認する。ファイル件数と `git status --short` も再確認する。
- 独自記述維持は別の隔離コピーで、ユーザーが設定末尾にメモを追加してから再実行し、再実行前後の hash が不変であることを確認する。既存設定の不足補完はさらに別のコピーで提示差分・明示承認前に更新されないことを観測する。
- overwrite 防止は別の隔離コピーで、ユーザーが既存 ticket の成果を意図的に異なる内容へ変えてから再実行する。Root は衝突を報告して停止し、ファイルを上書きしたり別番号で回避したりしない。元 fixture は壊さない。

部分失敗の追加試行は、ticket 未作成の隔離コピーで行う。人間が分割・保存を実承認した上で、検証のため最初の ticket の保存・readback 後だけ Root に一時停止を依頼する。その間に検証者が2つ目の予定パスに異なる内容のファイルを作り、Root を続行させて衝突を観測する。成功扱いせず、作成済みの実参照、未完了分、再開条件を報告することを確認する。ユーザーが衝突ファイルを取り除いた後の実再開では、保存済み分を再利用して未完了分だけ保存する。Root が最初の保存前に衝突を検出しただけなら overwrite 防止の証拠であり、部分保存失敗の証拠ではない。**この追加試行を実施していなければ partial-failure / resume は未確認**と記録する。

## 4. 停止境界の追加試行

それぞれ別の隔離コピーで行い、実施したものだけ成功 / 失敗を記録する。

| 入力・状況 | 期待する観測 |
| --- | --- |
| 設定承認を拒否・取消、または未回答 | 設定・ticket を保存しない |
| 分割または保存承認を拒否・取消、または未回答 | ticket を保存しない。承認済み設定は保持しても公開には進まない |
| 対応外 tracker の既存設定 | 設定を置き換えず、不足と選択肢を示して停止 |
| remote / repo の曖昧さ、入力と設定の対象不一致 | 推測・自動 fallback せず確認待ち |
| 未承認 spec / 会話だけ、Plan なし | Approved Plan を偽らず Implementation 未成立と本文・最終回答に明記 |
| 正式 Plan の参照が取得不能、Plan を変える必要あり | 別 Plan を代用・改変せず停止して確認 / 再 Review を求める |
| 保存先衝突、対象外 symlink、読み取り不能 | 上書き・対象外書き込み・blind retry せず理由を報告 |
| 分割中の循環 / 不明 blocker | 保存前に解消し、案変更を再承認する |

## 5. GitHub は読み取り前提だけ確認する

installed `gh` の公開 help を読み、許可された対象の read だけを行う:

```sh
command -v gh
gh --version
gh issue create --help
gh issue view --help
gh label --help
gh auth status
gh repo view minorunakamura/pi-taskflow --json nameWithOwner,url
gh issue view 16 --repo minorunakamura/pi-taskflow --json body,comments
```

credential をログ・ticket に出さない。CLI 不在、認証不足、repo read の失敗なら停止し、install / auth login / Local fallback をしない。失敗を再現する場合も global 認証や設定を変更せず隔離環境で行う。
この read 成功は GitHub write smoke 成功ではない。label 作成、Issue 作成、native 関係、非対応時の本文 fallback、通信 / 権限失敗、GitHub 部分失敗・resume dedup は**明示的な検証先と操作の書き込み許可が得られるまで未確認**。認証・通信・権限失敗を native 非対応と扱ってはならない。元 Issue の本文・状態は変更しない。

## 確認結果の記録

実施者は日時、Pi / model、Skill の revision、fixture / ログ参照、人間による Plan・設定・分割・保存の承認記録、生成物・hash、各観測の成功 / 失敗 / 未実行を残す。Local のあり / なし fixture と各追加分岐、GitHub の read / write を別々に記録する。
loader / `pnpm check` 成功は loader と repository checks の証拠だけ。承認模擬・手動 ticket・文章一致を実 smoke に置き換えない。

本手順の追加時点では、実 Pi Root の人間承認 smoke と GitHub write smoke は未実行。Root とユーザーによる直接検証後にだけ実結果を追記する。

### 実装時の非対話チェック

- `pnpm check`: typecheck、lint、format:check、Vitest 成功。6 files / 101 tests（うち新規 loader tests は2件）。実 smoke の成功ではない。
- `gh` 2.42.1 の上記公開 help、`gh auth status`、`gh repo view minorunakamura/pi-taskflow --json nameWithOwner,url`、Issue #16 の本文・コメント読み取りは成功。
- GitHub 書き込みは行っていない。Local 人間承認、再実行・衝突・部分失敗と追加停止分岐、GitHub write / native / fallback / resume は未確認。

### 2026-10-11 JST: 実 Root・人間承認による Local 単体 smoke

上記の追加時点・実装時の記録はその時点の事実として残す。今回は Root と実ユーザーが、AGENTS.md / CLAUDE.md のない fixture と両方ある fixture で、初回保存と別の新しい Root による再実行を完了した。**上記の `saved-greeting` 2 slice シナリオそのものを実行した結果ではない。**

#### 実行環境・証拠参照

- Pi 1.1.0、`openai/gpt-6.1-sol`、RPC の fresh Root。対象 Skill は本リポジトリの `skills/` の作業ツリー版で、実際に展開・参照された内容は session ログに記録されている。
- `--no-extensions --no-mcp --no-skills --no-prompt-templates --no-themes --skill <repo>/skills --tools read,bash,edit,write --session-dir <logs>/sessions` で隔離した。子 Agent は起動していない。
- fixture base: `/var/folders/04/cs5vwntd34d_fdbtdczbxg000000gn/T/pi-taskflow-16-smoke-gtardwty`。以下の fixture / logs はこの base からの相対パス。各 logs の `events.jsonl` と `sessions/*.jsonl`、初回 logs の `first-save.sha256.json` を証拠とする。**一時領域のためログ・fixture の恒久的な残存は保証しない。**

| fixture | 初回 logs / session ID | 新 Root 再実行 logs / session ID |
| --- | --- | --- |
| `without-context`（AGENTS / CLAUDE なし） | `without-context-logs` / `01a12951-1c0a-7567-b1e1-543467af4006` | `without-context-rerun-logs` / `01a1295b-3f4a-7406-ac3a-036ddf584413` |
| `with-context`（AGENTS / CLAUDE 両方あり） | `with-context-logs` / `01a12951-1c2e-7671-a6bc-b5e91ed7154e` | `with-context-rerun-logs` / `01a1295b-3f39-7510-b43c-bf9b394ff487` |

公開 CLI の `get_commands` で、3つの Taskflow explicit commands が source package `pi-taskflow` から存在し、collision がないことを確認した。

baseline commit は当初 global の commit signing の影響で exit 128（`either user.signingkey or gpg.ssh.defaultKeyCommand needs to be configured`）となった。global は変更せず、上記の `-c commit.gpgsign=false` を加えたコマンドで再開・成功した。

#### 入力 Plan と実承認

正式 Plan は各 fixture の `docs/plans/greet-uppercase.md`。引数なしは `Hello, world!`、`--uppercase` ありは `HELLO, WORLD!`、出力処理と実行テストを1 Work Item にまとめ、他機能なし、今回は ticket 化のみで Implementation を開始しない、という小さい1 slice を人間が承認した。

実人間の回答を親 Root の `ask_user_question` で取得し、その回答をそのまま各 RPC の prompt へ中継した。承認模擬はしていない。

| 承認対象 | 実人間の回答 |
| --- | --- |
| Plan 全文 | 「検証用 Plan を承認」 |
| 設定保存 | 「両 fixture の設定保存を承認」 |
| 分割案 | 「両 fixture の分割案を承認」 |
| 最終本文・保存先 | 「両 fixture の最終本文を保存承認」 |

#### 観測結果（両 fixture）

- **初回保存: 成功。** tracker の直接 read が `ENOENT` → Local 設定の全文・保存先を提示して待機（設定・ticket 未作成）→ 人間の設定承認 → 設定保存・readback（ticket なし）→ 1チケットの分割案を提示して待機 → 分割承認 → 最終本文・パスを提示して保存承認待ち（ticket なし）→ 保存承認 → 排他的作成・readback。各承認段階で、実 Root が待っている応答と未作成の状態を親 Root が確認した。
- 各 fixture の `.scratch/greet-uppercase/issues/01-greet-uppercase.md` が1件だけ作成された。承認本文との一致、Plan リンク `../../../docs/plans/greet-uppercase.md` の解決を確認した。`Blocked by` は `None (can start immediately)`。**実 dependent ticket の参照・依存順保存や native relation の検証ではない。**
- **新 Root 再実行: 成功。** 初回とは distinct session ID で、開始時の `get_state` は `messageCount=0`。tracker を直接 read し、既存 Plan / ticket の成果・完了条件・参照を照合して再利用した。再質問・新規作成・更新はなく、設定と ticket の SHA256 は初回保存後と同じ、両 fixture とも1件のままだった。
- **変更・終了境界: 観測範囲で成功。** 親 Root の独自検証で `git diff --exit-code HEAD` は成功し、`greet.mjs` / `package.json` / 正式 Plan / 既存 AGENTS / CLAUDE は不変。`.git` を除くファイル一覧はコード・package・正式 Plan・tracker 設定・1 ticket のみ（with-context には既存 AGENTS / CLAUDE もあり）。Domain / triage / workflow state はなく、without-context には AGENTS / CLAUDE も作られなかった。
- `node greet.mjs` と `node greet.mjs --uppercase` は**どちらも従来の `Hello, world!`**。チケットの要件を実装した結果ではなく、Implementation を開始していない確認である。tool 履歴は `read` / `bash` のみ、または初回設定保存の `write` を含むだけで、子 Agent 起動なし。
- 4 RPC の動作観測は `agent_settled` を確認した。完了後、残っていた検証用 RPC を対象 PID と `--mode rpc` / 対象 logs の一致を確認の上、SIGTERM で終了した（PID `31263` / `31269` / `31967` / `31968`）。stdin bridge を閉じたことだけで EOF 終了済みとは扱わない。

初回保存後と新 Root 再実行後に一致した SHA256:

| 対象 | SHA256 |
| --- | --- |
| 両 fixture の `docs/agents/issue-tracker.md` | `b89dc4703feae1e7e9a07316fafac06dd8a9ea1d72354abd70d8b0578b796887` |
| without-context の `01-greet-uppercase.md` | `9d2ab5f1e0f873c6b5be4389742ac7bbf32f488e54233b59d5e9b318e1d72cca` |
| with-context の `01-greet-uppercase.md` | `033252cce7ee6442599cb5c9a3c11abb690a22ed95b9ddeb21a6a336f1dec8cc` |

#### 今回未実行・未確認の範囲

- 上記手順の `saved-greeting` 2-ticket blocker 依存順保存、実 dependent ticket / native relation。
- collision、partial-failure / resume、対応外 tracker、既存設定の不足修復・独自記述追加後の維持、Plan なし、各承認拒否・取消などの追加停止分岐。
- GitHub write / label / native / fallback / 通信・権限失敗 / resume。GitHub の read 前提は上記「実装時の非対話チェック」で別途確認済みであり、今回の Local 成功を GitHub write 成功とはしない。
- Planning / 別セッションの Implementation 接続（Issue #17）。今回は実装開始チェックや blocker による Implementation 停止を確認していない。
