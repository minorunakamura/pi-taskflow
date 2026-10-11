# taskflow-to-ticket の追加と tracker 設定の自己完結化

## 目的

Matt Pocock の `to-tickets` と `setup-matt-pocock-skills` に依存せず、チケット化に必要な設定だけをその場で準備できる自前の `taskflow-to-ticket` を提供する。作成したチケットは、Planning の会話履歴を持たない新しい `taskflow-implementation` セッションから取得・実装できるようにする。

## 要件・決定事項

- 対象リポジトリは `/Users/minoru/Documents/mywork/pi-dev/pi-taskflow`。新しい Skill は `skills/taskflow-to-ticket/SKILL.md` に配置する。`pi-skills` には追加しない。
- 公開名は `taskflow-to-ticket`。Planning、チケット化、Implementation を同じ Pi package にまとめる。
- 標準の保存先は GitHub Issues と Local Markdown の2つ。
- プロジェクトの tracker 設定は `docs/agents/issue-tracker.md` に保存する。新しいチケット化 Skill と既存 Implementation Skill がこのファイルを直接参照する。
- AGENTS.md / CLAUDE.md は作成・変更しない。Domain docs の配置設定や、チケット化で使わない triage label の準備は行わない。
- 設定済みなら読み取り・再利用を基本とし、毎回更新・再作成しない。初回作成、設定不足の補完、保存先の変更は内容を提示して明示的なユーザー確認後に行う。既存の独自記述は維持する。
- 初回設定の確認と、チケット分割・公開の確認は別に扱う。Plan の承認をチケット公開の承認として扱わない。

## 制約・対象外

- prompt-driven Skill として実装し、独自 tracker API、Extension、状態管理、汎用 tracker abstraction、新しい依存関係は追加しない。
- GitLab / Linear / Jira などは今回の新 Skill の対応外。既存設定が対応外の場合は、勝手に GitHub / Local に置き換えず不足と選択肢を報告する。
- 既存の `to-tickets` / setup Skill のインストール、symlink、global Pi 設定は変更しない。旧名の alias も追加しない。
- チケット化後に Implementation、merge、release、deploy を自動開始しない。
- 今回はテストファーストの新規実行ロジックではなく Skill 手順の変更。文章一致テストで Agent の振る舞いを証明したことにせず、Pi の読み込みテストと実セッションの smoke を分ける。

## 実装方針

### 1. taskflow-to-ticket

Matt Pocock のローカル導入済み `to-tickets`（upstream commit `f3fc5632f401156837ee3872f14fe33ccf1024ea`）の有用な手順を基に、日本語の自前 Skill として作成する。`disable-model-invocation: true` を維持し、明示コマンドまたは Planning からの明示参照で使う。出典と改変を記録し、転用部分の MIT 著作権表示・許諾文を Skill 配下に同梱する。

- 入力は Plan / spec のパス・リンク、既存 Issue の参照、または会話の内容。参照された本文とコメント、既存の Domain docs / ADR は必要な範囲で読む。Domain docs は生成しない。
- 最初に対象プロジェクトの `docs/agents/issue-tracker.md` を読む。未設定なら remote と既存の管理ルールを調べ、GitHub または Local を提案して選択を確認する。remote や複数リポジトリが曖昧な場合は推測で確定しない。
- 設定ファイルの小さな GitHub / Local 用テンプレートを Skill に同梱する。チケット作成・取得・依存関係の扱いだけに絞り、triage 全般や PR / wayfinder の設定は含めない。
- GitHub では対象 `owner/repo`、利用可能な `gh`、認証・アクセスを公開 CLI の確認手段で確かめる。不足する場合は案内して停止し、自動インストール・認証変更・Local への切り替えはしない。
- `docs/agents/triage-labels.md` があれば既存の `ready-for-agent` 対応名を使い、なければ `ready-for-agent` を使う。GitHub でラベルが不足している場合は必要な1つだけを確認後に作成する。その他のラベルや triage-labels.md は生成しない。
- 独立して確認できる縦のスライスを、1回の新しい Implementation セッションで扱える大きさに分ける。必要な prefactoring、実際の blocker、広域 refactoring の expand–contract を考慮し、依存に循環や不明な参照がないことを確認する。
- タイトル、成果、完了条件、依存関係を提示し、分割と公開が承認されるまでチケットを保存・公開しない。変更された分割は再確認する。
- Local は `.scratch/<feature-slug>/issues/<NN>-<slug>.md` に1チケット1ファイルで保存し、依存順に番号を付ける。既存ファイルを上書きしない。
- GitHub は依存順に公開し、実 Issue の参照で関係を表す。利用可能なら native blocking relationship / sub-issue を使い、機能が使えない場合は本文のリンクで関係を明示する。認証・権限・通信の失敗を、単なる機能未対応として隠さない。元 Issue の本文や状態を勝手に変更・close しない。
- Approved Plan を入力にした場合は各チケットに正式なパスまたはアクセス可能なリンクを含める。Local の相対リンクは ticket の場所から解決できるようにする。会話だけから作ったチケットを Approved Plan 付きと偽らず、Plan がなければ Implementation の前提が未成立と明記する。
- 保存・公開結果と依存関係、Plan 参照を確認して終了する。一部失敗時は作成済み参照と未完了分を報告し、再開時に重複作成しない。追加の永続 workflow state は作らない。

### 2. taskflow-planning の呼び出し先変更

`skills/taskflow-planning/SKILL.md` と Feature Planning Playbook の実行参照を `taskflow-to-ticket` に変更する。同梱 Skill への相対参照を使い、Approved Plan の正式なパスと全文、Planning の追加制約を渡す。tracker 設定は新 Skill の必要最小限の準備に任せる。分割承認、Plan 参照、公開後の停止という既存境界は維持する。

### 3. taskflow-implementation の直接参照

`skills/taskflow-implementation/SKILL.md` の Work Item 取得前に以下を追加する。

- `docs/agents/issue-tracker.md` が存在する場合は読んで、対象 tracker と取得方法を確認する。
- 設定と明示された Work Item の参照に矛盾があれば、勝手に取得先や設定を変更せず `BLOCKED` として確認を求める。
- 設定がなくても、明示された URL / local path と既存の公開 API で取得先が確定する場合は進めてよい。番号だけで対象が曖昧な場合は停止する。
- Implementation では tracker のセットアップ・変更を行わない。既存の Approved Plan、blocker、完了条件の開始チェックは維持する。

### 4. 関連ドキュメントと読み込みテスト

- 既存の基本設計・実装仕様の現行 workflow にある外部 `to-tickets` 依存の説明を更新する。tracker の責務は新 Skill に置き、Extension での再実装を禁止するという境界は維持する。
- Planning smoke の前提と呼び出し先を更新する。Implementation smoke には tracker 設定を別セッションに引き継ぐ手順を追加する。過去の確認結果にある旧 Skill 名・実行記録は事実として残し、新版の成功記録に書き換えない。
- 既存の Vitest / Pi `loadSkillsFromDir` のパターンで `test/to-ticket-skill.test.ts` を追加し、Skill 名、明示呼び出し設定、同梱参照・テンプレートの実在、package の skills ディレクトリから3つの Taskflow Skill が衝突なく読み込まれることを確認する。必要に応じて既存 Planning の参照解決テストを補う。文章一致のテストだけで設定・公開処理の成功とはしない。
- `docs/testing/to-ticket.md` に下記 smoke の再現手順と観測条件をまとめる。

## 完了条件

1. pi-taskflow だけの読み込みで `taskflow-to-ticket` が使え、旧 setup Skill を呼ばずに初回設定とチケット化ができる。
2. 未設定の Local fixture で、設定確認・分割承認を経て設定とチケットだけが作成され、AGENTS.md / CLAUDE.md / Domain 設定 / 不要な label 設定は作成・変更されない。
3. 2回目の実行では既存 tracker 設定を再利用し、不要な設定更新・再質問・チケット上書きをしない。
4. 別の新しい Implementation セッションが tracker 設定を読み、チケットと Approved Plan、blocker を取得できる。会話履歴や AGENTS.md に依存しない。
5. 設定なしの明示 URL / local path という既存入力を維持し、設定との矛盾や未完了 blocker はコード変更・Worker 起動前に停止する。
6. Planning の現行実行手順は新 Skill を参照し、保存・公開後に Implementation を開始しない。
7. Skill 読み込みテストと正式な `pnpm check` が成功する。人間確認が必要な smoke は実結果と未実行項目を区別して報告する。

## 動作確認方法

- pi-taskflow で `pnpm check` を実行する（typecheck、lint、format:check、Vitest）。
- リポジトリ外の隔離した fixture と実際の Pi Root セッションで、Local 初回設定の承認、分割承認前にチケットを作らないこと、承認後の1ファイル1チケット、Plan 参照、blocker、終了境界を観測する。承認を模擬しない。
- 同じ fixture の再実行で issue-tracker.md の内容が不変であることを確認する。既存 AGENTS.md / CLAUDE.md がある fixture とない fixture の両方で作成・変更されないことを確認する。
- 設定・正式 Plan・ticket・初期コードだけを別 fixture に引き継ぎ、新しい Implementation セッションで設定を直接読むことと取得を確認する。未完了 blocker のケースでは実装が始まらず `BLOCKED` となることを確認する。設定なしの local path、設定と URL の矛盾も別ケースで確認する。
- GitHub は installed `gh` の公開 help と読み取り操作で CLI・対象・認証の前提を確認する。実 Issue / label の作成はユーザーが明示的に許可した検証先がある場合だけ行い、許可がなければ GitHub 書き込み smoke は未確認として報告する。
- diff で第三者の導入先、global 設定、AGENTS.md / CLAUDE.md を変更していないことを確認する。

## リスク

Skill は Agent の手順であり、読み込みテストは実行遵守や tracker 書き込みを保証しない。実セッションの観測が必要。GitHub の native 関係には利用環境・権限による差があるため、失敗理由の区別と本文参照による限定的な代替を明記する。チケットに Approved Plan がなければ Implementation は開始できない。