# 承認・質問の前提本文を tool で必ず表示する（taskflow_ask）

## 目的

taskflow の承認・質問で、承認対象の本文や質問の前提が利用者に表示されないまま `ask_user_question` が呼ばれる不具合を解消する。assistant が本文を可視 text に書いたか（thinking にだけ書いたか）に関係なく、TUI では回答前に必ず本文が見えるようにする。

## 不具合の再現と原因（確認済み）

- 再現: session `01a20c74-6085-761c-8933-8934ea3d8bac`（cwd: pi-skills、model: Claude Opus 5.5）の entry #86。taskflow-to-ticket §4 の分割承認で、assistant メッセージは thinking 2件と `ask_user_question`（「上記の分割案（1件）で進めてよいですか？」）だけで、可視 text は0件だった。利用者は内容を見ないまま「1件で承認」を選んだ。直後の #88 では text（2350字）を出してから質問し、正常に表示された。
- 同じ症状の先行事例: pi-skills の commit 系 Skill（session `01a20c60-bd5e-77d7-bfc1-e82f4abcac3c`、`01a20bfe-6715-77d7-bfc1-e82330b3c8b0`）。GPT 系は可視 text で提示し、正常に表示された。pi-skills 側の対応は `/Users/minoru/Documents/mywork/pi-dev/pi-skills/docs/plans/commit-plan-renderer-display.md`（PR https://github.com/minorunakamura/pi-skills/pull/65、merged）。
- この Planning 中にも、前提説明を書かないまま「直前の比較を踏まえて」と質問した例が2回あった。Grilling の質問でも同じ形の不具合が起こる。
- 原因: 本文の表示を assistant の可視 text に頼っている。Skill の文言（41a2952 で保存・公開承認に追加した「`ask_user_question` を呼ぶ前に通常の会話メッセージで提示する」）はモデルが守らないことがある。分割承認・tracker 設定承認・ラベル作成承認・Grilling には、この明示規則もない。

## 要件・決定事項

ユーザー確認済みの決定:

- 方式は「表示と質問が一体の tool」（検討時の案1b）。本文を渡さないと質問を表示できない構造にする。文言の強化だけの案、表示専用 tool の後に `ask_user_question` を呼ぶ案、Plannotator 流用は採らない。
- 本文は Markdown で整形して表示する（pi-skills PR #65 と同じ方式）。
- 選択 UI は `pi-ask-user-question` の Extension 間 API（`pi.events` の request / reply）を使う。複数の質問、複数選択、その他（自由入力）を今の `ask_user_question` と同じ question model で使えるようにする。
- この tool 経由にする対象は次の5つ（すべて Root が行う）。
  1. taskflow-to-ticket §1 の tracker 設定の保存承認（設定の内容または差分）
  2. taskflow-to-ticket §2 のラベル作成承認（ラベル名と作成内容）
  3. taskflow-to-ticket §4 の分割承認（番号付き分割案）
  4. taskflow-to-ticket §4 の保存・公開承認（最終本文、既存 Issue へのコメント、依存順、保存先・公開先）
  5. taskflow-planning §3 の Grilling の質問（質問の前提となる事実・選択肢の比較）
- **合意した設計変更**: 既存契約「本文を `question`、選択肢の `label`・`description`・`preview` に入れず、通常の会話メッセージで提示する」を次のように変える。本文は `taskflow_ask` の `content` に入れ、tool が表示したものを正式な提示とする。`question` と選択肢には引き続き本文を入れず、短い質問だけにする。assistant が会話で再掲する必要はない（再掲しても二重表示になるだけで、承認内容はずれない）。
- また、`docs/pi-taskflow-basic-design.md` と `docs/pi-taskflow-implementation-spec.md` の「Grilling の各質問は `ask_user_question` で表示する」は、「`taskflow_ask` で表示する（内部で `pi-ask-user-question` の UI を使う）」に更新する。Root で行い、subagent にしない点は変えない。

Root が決めた実装詳細:

- tool 名は `taskflow_ask`（承認だけでなく Grilling にも使うため confirm にしない）。
- パラメータ: `content`（必須、空文字不可、Markdown）、`title`（任意）、`questions`（必須、1件以上。`pi-ask-user-question` と同じ question model をそのまま渡す）。
- 戻り値: `pi-ask-user-question` の結果（`status`、`answers`、`selections`、`cancelled` など）をそのまま返す。回答を承認として扱うかは、従来どおり Skill の規則に従う Root が判断する。`user-cancelled`・`caller-aborted`・`shutdown` と、失敗（`invalid-request`、`tui-unavailable`、`internal-error` など）は承認ではない。
- `pi-ask-user-question` が未導入、または reply が返らない構成で、無期限に待たないようにする。検出方法は Implementation で決めてよい（例: `pi.getAllTools()` で `ask_user_question` の登録を確認する）。未導入・非 TUI のときは `unavailable` を返し、承認・回答として扱わない。代わりに `ask_user_question` を使ったり、会話での回答を承認扱いにしたりしない。
- tool の中断（signal）では、同じ `requestId` で cancel event を発行する。
- `requestId` は呼び出しごとに新しく作る（例: `randomUUID()`）。
- イベント名と型は taskflow 内の定数として持ち、`pi-ask-user-question` への package 依存は追加しない（README が許容している使い方）。

## 制約・対象外

- `pi-ask-user-question` 自体は変更しない。
- Plan Review（`taskflow_plan_review`）と Code Review（`taskflow_code_review`）は対象外（既に専用画面で全文を表示している）。
- taskflow-implementation の BLOCKED / REPLAN_REQUIRED の確認やその他のユーザー確認は、今回は対象外とする。
- 表示した本文と、後で保存・公開する本文の一致は、tool では保証しない。従来どおり readback で照合する。assistant が `content` に要約や「上記参照」だけを入れる可能性は残るが、その場合も画面に表示されるので利用者が気付ける。モデルが `content` に全文を入れることの保証は対象外（モデル依存）。
- 承認の種類・回数・順序（設定、ラベル、分割、保存・公開の個別承認）と、拒否・取消・無応答で止まる規則は変えない。
- thinking の内容の表示、provider 側の挙動の調査は対象外。
- RPC / print など非 TUI での表示経路は作らない（`unavailable` で停止する）。

## 実装方針

- `extensions/taskflow.ts`: `taskflow_ask` を登録する。既存の2 tool と同じ構成にし、必要なら処理本体を `src/ask.ts` に置く。
  - `renderCall`: `title` と `content` を、折りたたみ時（既定）でも全文表示する。`Markdown` と `getMarkdownTheme()` を使い、テーマが取得できないときは `Text` で表示する（PR #65 と同じ）。表示前に、改行とタブ以外の terminal 制御文字（Cc / Cf / Zl / Zp）を無害化する。
  - `execute`: `pi-ask-user-question:request:v1` を emit し、`pi-ask-user-question:reply:<requestId>` を待つ。待機の解除・購読解除・中断時の cancel event を確実に行う。
  - `renderResult`: 回答の要約（各質問への回答、または取消・失敗）を短く表示する。
- Skill の変更（既存の記述位置を更新する。新しい文書は作らない）
  - `skills/taskflow-to-ticket/SKILL.md`: §1 の設定承認、§2 の5番のラベル作成承認、§4 の分割承認と保存・公開承認で、提示と質問を `taskflow_ask` の1回の呼び出しで行うよう書き換える。§4 の既存の規則（会話メッセージで提示し、`ask_user_question` には本文を入れない）を上記の合意した設計変更に合わせて置き換える。`taskflow_ask` が `unavailable` のときは承認を得られないので停止し、理由と再開条件を報告する。
  - `skills/taskflow-to-ticket/references/templates/ticket.md` 冒頭、`github.md`・`local.md` の承認の記述を同じ方針に合わせる。
  - `skills/taskflow-planning/SKILL.md`: §2 の表と §3 の Grilling の質問を `taskflow_ask` に変え、質問の前提（調査結果、比較、推奨）を `content` に入れて表示するよう書く。各 Playbook（`references/playbooks/*.md`）の「`grilling` と `ask_user_question`」も同様に更新する。
  - `skills/taskflow-implementation/SKILL.md` は変えない。
- 文書の更新
  - `docs/pi-taskflow-basic-design.md`（§5.5 付近と Grilling の記述）と `docs/pi-taskflow-implementation-spec.md`（§3.5、Grilling の記述）: `taskflow_ask` を使う方針と理由を記載する。
  - `docs/testing/planning-feature.md` の手順8と REPLAN の確認、`docs/testing/to-ticket.md` の承認の観測手順: 本文が `taskflow_ask` の `content` に入り表示されること、`question`・選択肢に本文がないことを観測するよう更新する。
  - README は存在しないので作らない。

## 完了条件

- `taskflow_ask` が登録され、`content` が空または未指定の呼び出しは失敗し、質問は表示されない。
- TUI で、`taskflow_ask` の呼び出し行に `content` が Markdown で全文表示され、その状態で `pi-ask-user-question` の選択 UI が出る。assistant が可視 text を出さずに呼び出しても、回答前に本文が見える。
- 複数の質問、複数選択、その他（自由入力）が `ask_user_question` と同じように使え、回答が返る。
- 取消・中断・終了・非 TUI・`pi-ask-user-question` 未導入で、承認や回答として扱える結果を返さない。未導入時に無期限に待たない。中断時は cancel event を発行する。
- 制御文字を含む `content` でも terminal 制御が描画されない。
- 対象5経路の Skill 記述が `taskflow_ask` を使う形になり、旧規則（会話メッセージでの提示）と矛盾する記述が残らない。個別承認の規則は維持されている。
- 設計文書・テスト手順が新しい方針と矛盾しない。
- `pnpm check`（typecheck、lint、format:check、test）が成功する。

## 動作確認方法

- 保証対象: `taskflow_ask` の request / reply の受け渡しと失敗時の扱い、折りたたみ時の全文 Markdown 表示、制御文字の無害化、Skill・文書の整合、実 TUI で本文と選択 UI が回答前に見えること。
- 対象外: モデルが `content` に全文を入れること、全 OS、非 TUI での表示、`pi-ask-user-question` 内部の動作。
- 自動テスト（`test/` に追加。既存の `test/helpers.ts` の `registerTaskflow` と `EventBus` を使う）
  - **TDD を採用する**（`taskflow_ask` の execute と renderCall が対象。公開インターフェースは登録された tool の `execute`・`renderCall`・`renderResult`）。
  - ケース: 正しい request が emit され reply の回答が返る、複数の質問・複数選択・その他の回答が返る、`user-cancelled` などの終端と失敗 reply が承認扱いにならない、未導入時に待たずに `unavailable`、中断で cancel event、`renderCall` が折りたたみ時に全文を描画、制御文字の無害化、tool の登録一覧（既存の `test/plannotator.test.ts` の登録確認を更新）。
  - Skill の読み込みテスト（`test/to-ticket-skill.test.ts`、`test/planning-skill.test.ts`）は、既存の検証範囲で通ることを確認し、必要な場合だけ更新する。文章一致のテストを増やさない。
  - 実 TUI、大きな fake、新しい検証基盤は自動テストに追加しない。
- 直接確認（実 TUI）
  - Planning 中の Probe（一時ディレクトリの Extension で、command から Markdown の custom message と `ctx.ui.select` を表示）で、Markdown の整形表示と、本文の直後に選択 UI が出ること、12件分の長い本文でも選択 UI を開いたまま PageUp で読み返せることを確認済み。tool の `renderCall` での表示と、`pi-ask-user-question` の UI との組み合わせは、モデルの利用枠超過（429）で未確認。
  - Implementation では、隔離した一時ディレクトリで、所有する tmux session に fresh Pi（`--no-session`、実装した taskflow Extension と導入済みの `pi-ask-user-question` を読み込む）を起動する。モデルに「text を書かずに `taskflow_ask` を呼ぶ」よう依頼し、選択 UI が出た時点の画面で本文が見えることを snapshot で確認する。長い本文を読み返したあとに回答でき、結果が返ることも確認する。可能なら Claude Opus 5.5 を使う。モデルが使えない場合は、`taskflow_ask` を直接呼ぶ小さな command などの代替経路で表示を確認し、モデル経由が未確認であることを明記する。確認後、所有した session と一時ディレクトリだけを削除する。
  - 加えて、taskflow-to-ticket を隔離 fixture で Local tracker として実行し、分割承認と保存・公開承認が `taskflow_ask` で本文表示つきで行われることを確認する（`docs/testing/to-ticket.md` の既存手順を再利用し、実人間が回答する）。
  - 既存の検証 Skill（`skills/taskflow-verification`）は Code Review 専用で、この確認には使えない。手順は上記と `docs/testing/` で足りる見込みのため、現時点で `create-verification-skill` による Create の予定はない。ただし禁止ではない。手段が足りなければ、Implementation Root が承認済みの保証対象・期待結果を変えない範囲で、最小の Create / 関連更新（tmux 操作の小さな helper の保存を含む）を判断してよい。追加 install や利用者・共有環境の変更が必要な場合は、無断で行わず確認する。許可された範囲で成り立たなければ BLOCKED とする。
  - Worker が実行と証拠の取得・cleanup を担当し、Root が正式なチェックと完了条件の受入れを担当する。証拠は既存規約どおり `.pi/verification-evidence/<run>/` に最小限残す。
- 正式なチェック: `pnpm check`。
