---
name: taskflow-to-ticket
description: Plan / spec / 会話を、実際の blocker と正式な Plan 参照を持つ縦のスライスに分割する。明示呼び出しで GitHub Issues / Local Markdown の設定を確認し、設定・分割・保存公開の個別承認後にチケット化して終了する。Implementation は開始しない。
disable-model-invocation: true
---

# Taskflow To Ticket

Root Agent が手順を実行し、ユーザーとの対話と承認確認を担当する。prompt-driven Skill であり、追加の Extension、tracker API、依存関係、永続 workflow state は作らない。
明示コマンド `/skill:taskflow-to-ticket` または明示的に渡されたこの Skill の参照で使う。旧 `to-tickets` / setup Skill は呼ばない。

同梱参照はこの Skill のディレクトリ基準、プロジェクトのパスは対象プロジェクトのルート基準で解決する。

- [GitHub 設定テンプレート](references/templates/github.md)
- [Local 設定テンプレート](references/templates/local.md)
- [チケットテンプレート](references/templates/ticket.md)
- [出典と改変](references/origin.md)、[転用部分の MIT License 全文](LICENSE)

## 1. tracker 設定を直接読む

最初に対象プロジェクトの `docs/agents/issue-tracker.md` を直接 read する。AGENTS.md / CLAUDE.md の有無やそこからのリンクに依存しない。ファイル不存在と、読み取り権限等の失敗を区別し、読めない既存設定を未設定扱いで置き換えない。

- 設定済みなら tracker、対象、作成・取得・依存関係の既存ルールを読み取り、再利用する。十分な設定を毎回更新・再作成・再質問しない。
- 未設定なら `git remote -v` と既存の管理ルールを読み、GitHub Issues または Local Markdown を提案する。remote だけで公開先を決めず、複数 repo、対象ルート、`owner/repo` が曖昧ならユーザーに確認する。
- 初回作成、設定不足の補完、保存先変更は、該当テンプレートを読み、保存先と内容（既存なら差分）を提示して**明示承認を待つ**。承認後だけ `docs/agents/issue-tracker.md` に保存し、readback で確認する。既存の独自記述は維持し、ファイル全体をテンプレートで置き換えない。拒否・取消・無応答は保存許可ではない。
- GitLab / Linear / Jira 等の対応外設定、入力と設定の対象不一致、解釈不能な独自ルールは、不足と選択肢を報告して停止する。勝手に GitHub / Local に置き換えない。

この設定承認はチケット分割や公開の承認ではない。AGENTS.md / CLAUDE.md、Domain docs・配置設定、`docs/agents/triage-labels.md`、PR / wayfinder 設定は作成・変更しない。第三者の Skill 導入先、symlink、global Pi 設定も変更しない。

## 2. 入力と実行前提を確認する

Plan / spec のパス・リンク、既存 Issue の URL / 番号、または会話を入力にする。参照の本文とコメントを全文読み、関連コード・既存 Domain docs / GLOSSARY / ADR を必要な範囲だけ調べる。番号だけで repo が確定しない場合は推測せず停止する。入力の Issue 本文・状態を変更・close しない。

### GitHub

書き込み前に公開 CLI の help と読み取り操作で確認する。値は確認済みの設定から取り、shell 引数として安全に扱う。

1. `command -v gh`、`gh --version`、`gh issue create --help`、`gh issue view --help`、`gh label --help` で利用可能な操作を確認する。
2. `gh auth status`（対象 host が別ならその host を指定）で認証を確認する。credential / token をチケットや回答に出さない。
3. `gh repo view <owner/repo> --json nameWithOwner,url` と必要な Issue の読み取りで、設定した正しい対象への read access を確認する。作成操作も必ず `--repo <owner/repo>` 等で対象を明示する。read 成功を write 権限の保証とはしない。
4. `docs/agents/triage-labels.md` があれば直接読み、既存の `ready-for-agent` 対応名を尊重する。なければ `ready-for-agent` を使う。対応名が不明なら確認し、triage 設定自体は生成しない。
5. `gh label list --repo <owner/repo>` の公開オプションで必要なラベルの実在を確認する（一覧の上限・pagination による見落としを避ける）。不足なら必要な**1つだけ**の名前・作成内容を示して別途明示承認を得てから作成し、再読する。他のラベルは作らない。

CLI、認証、対象、read access が不足したら理由と再開条件を示して停止する。自動 install、`gh auth login` / 認証変更、Local fallback は行わない。認証・通信・権限エラーを「機能非対応」として隠さない。

### Approved Plan

正式な保存先と承認の根拠を確認し、参照先を実際に読む。ファイル名が Plan であることや会話中の案だけでは承認済みとしない。各チケットに正式なパスまたはアクセス可能なリンクを含める。
Local の相対リンクは**チケットのディレクトリから**解決し、GitHub では閲覧可能な正式 URL または repo を特定した正式なプロジェクト内パスを使う。未公開ファイルを存在しない blob URL として書かない。参照の取得・解決ができない場合は確認して停止する。
Plan なし・未承認の spec / 会話からも分割はできるが、`Approved Plan: なし（または未承認）。Implementation の前提は未成立` と明記する。チケット承認で Plan を承認済みに格上げしない。
承認済み Plan の要件・設計を変える必要が出たら停止して再 Review を求め、Plan を変更しない。

## 3. 縦のスライスと実際の blocker を作る

各チケットを1回の新しい Implementation セッションで実装・検証できる大きさにする。schema / API / UI / tests を層別に分けるのではなく、必要な層を貫く狭く完全な tracer-bullet とし、それぞれが独立して demo / 検証可能な成果を持つようにする。小さな変更を無理に複数チケットにしない。

- 必要な prefactoring は先行させるが、それ自体の成果と検証を示す。
- `Blocked by` は完了しないと開始できない**本当の blocker** のみ。関連するだけの項目や優先順位を依存としない。既存 blocker の本文・状態・完了根拠を読み、close だけで完了とみなさない。
- 広域 refactoring で単独の縦スライスを green にできない場合は expand–contract にする。旧形を保った expand → 影響範囲ごとの migrate batches → 全 migrate に blocked な contract。各 batch を green に保てない場合は共通 integration branch と最後の integrate-and-verify の前提を明示し、途中を独立完了と偽らない。
- 仮番号と既存の実参照を区別し、全 blocker の参照先が存在すること、自己依存・循環がないことを確認する。依存順に並べ、不明な参照や循環は公開前に解消する。

[チケットテンプレート](references/templates/ticket.md) を読み、タイトル、成果、完了条件・検証方法、正式 Plan の参照、元 Issue（ある場合）、依存関係を起草する。不要な実装コードや変わりやすい詳細は書かないが、正式 Plan / blocker の解決可能なパスは省略しない。

## 4. 分割と保存・公開を別々に承認する

まず番号付きの分割案（各タイトル、成果、完了条件、blocker）を示し、粒度、実際の依存、merge / split の必要性をユーザーに確認する。明示的な**分割承認**を得るまで修正し、変更した案は再承認を得る。
次に最終本文と依存順、GitHub の `owner/repo`・使用 label / native 関係、または Local の各保存パスを示し、**保存・公開の明示承認**を別途待つ。Plan 承認、設定承認、ラベル作成承認、分割承認を保存・公開承認として流用しない。公開対象・本文を変更したら再確認する。
保存・公開する最終本文（既存 Issue へ追記するコメントを含む）と保存先・公開先は、`ask_user_question` を呼ぶ前に通常の会話メッセージで提示する。件数、新規作成・既存再利用、通常計画・再計画によって提示方法を変えない。`ask_user_question` には提示済みの内容を保存・公開するかを問う短い質問と選択肢だけを渡し、本文を `question`、選択肢の `label`・`description`・`preview` に入れない。
承認前にはチケットファイル、下書きファイル、Issue、native 関係を作らない。拒否・取消・無応答では止まり、設定を承認済みで保存した場合もそれだけで終了する。

## 5. 承認されたチケットを依存順に保存・公開する

再実行・再開を含め、最初に既存の対象ファイル / Issue（closed も含む）を読み、正式 Plan / 元 Issue の参照、タイトル、成果、完了条件を比較する。タイトルだけで同一と判定しない。同一の作成済みチケットは実参照を再利用し、差異や対応の曖昧さは確認して止める。設定や既存チケットは再生成しない。追加の state / manifest は作らない。

### Local Markdown

`.scratch/<feature-slug>/issues/<NN>-<slug>.md` に**1チケット1ファイル**、`01` から依存順で保存する。slug は対象ルート内の単純な名前とし、`..` / 絶対パス / symlink による対象外への書き込みを許さない。既存の保存先・リンク先を確認し、上書きしない排他的作成手段（例: Node の `writeFileSync(path, content, { flag: "wx" })`）を使う。既存ファイルを truncate する `write` / `>` は使わない。
blocker には番号・タイトルと実ファイルへの相対リンクを含め、Plan への相対リンクも ticket 位置から解決する。既存ファイルが同一なら再利用、異なる内容なら変更・新しい番号への付け替えで回避せず停止する。

### GitHub Issues

公開 help で確認した `gh issue create` の title / body / label / repo オプションを使い、blocker を先に作成する。返された URL / 番号を取得し、後続の本文に実リンクを入れる。元 Issue があれば `Parent` の本文リンクを残す。
利用環境の公開 CLI / API で native blocking relationship / sub-issue が使えるか、help と読み取りで確認し、利用可能なら承認された関係だけを設定する。元 Issue の本文・状態は変更しない。native 操作に必要な識別子も実参照から取得し、独自 API / Extension を作らない。
機能自体が非対応と確認できた場合だけ、本文の `Blocked by` / `Parent` 実リンクで代替し、その制限を報告する。認証・権限・通信失敗、原因不明の失敗ならそこで停止し、本文リンクがあることを native 成功扱いにしない。

## 6. readback・部分失敗・終了

Local は各ファイルを再読し、GitHub は `gh issue view <参照> --repo <owner/repo> --json number,url,title,body,labels,state` と利用した native 関係の読み取りで確認する。件数、本文、使用 label、blocker の実参照・依存順、正式 Plan の解決、元 Issue の不変を照合する。

### optional Evaluation 通知

保存・公開の明示承認後、作成または既存同一 ticket の再利用を readback で確認できた refs だけを、同じ Planning Root から `{ operation: "add_issues", issues: [<確認済み refs>] }` で通知する。Root に `taskflow_evaluation_link` が提示され利用可能な場合だけ呼ぶ。
GitHub refs は https の完全な Issue URL または `{ kind: "github", host, owner, repo, number }` の明示構造、local refs は現在 cwd 内の project-relative ticket path を使う（1通知最大100件）。Taskflow ID を手入力しない。
部分作成でも確認済みの分だけ通知する。未承認・下書き・未確認の番号は通知しない。begin が未保存のときの `add_issues` 拒否を、begin の補修や新 UUID、代替記録で回避しない。
Tool 未導入・非アクティブ・通知失敗・保存未確認・未保存 leaf による追加停止・呼び忘れでも、本体の入力・進行・個別承認条件は変えない。通知のための保存待ち・再解決手順、独自 Tool / manifest / collector、終了認定は追加しない。以下の通常の部分失敗による停止は維持する。

### 通常の部分失敗処理と終了

一部失敗や create の応答が不明な場合は成功扱いせず停止する。作成済みの実参照と確認できた範囲、未完了分、エラー原因、再開条件を報告する。blind retry せず読み取りで実在と内容を確認し、既に作成済みの ticket を再利用して重複を避ける。読めない状態では再作成しない。既存 ticket の修復が必要なら変更内容を示して別途承認を得る（Local は上書きせず停止する）。

最終回答は設定の保存 / 再利用結果、チケットの実参照、正式 Plan または Implementation 未成立、依存関係の確認結果、未完了分を示す。ここで必ず終了する。Implementation、Worker / 子 Agent の起動、production code の実装、merge、release、deploy は行わない。
