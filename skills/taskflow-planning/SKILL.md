---
name: taskflow-planning
description: Plan development work in Pi, including features, bug fixes, refactoring, and performance improvements. Investigate facts, resolve user decisions, obtain explicit Plannotator approval, and publish reviewed Work Items through taskflow-to-ticket. Stop before Implementation.
disable-model-invocation: true
---

# Taskflow Planning

Root Agent が全体の進行、Playbook の選択、ユーザーとの対話、最終判断を担当する。
子 Agent は範囲を限定した調査や助言に使い、Planning 全体や承認判断を委譲しない。
成果物は Approved Plan とユーザー確認済みの Work Items。Implementation は別の新しいセッションで行う。

## 1. 依頼と Playbook を確認する

依頼の目的、要件、制約、対象外を確認し、参照された設計・仕様とプロジェクトの規約を読む。
依頼の名前ではなく実際の作業内容から Root Agent が Playbook を選ぶ。分類だけのために追加の LLM 呼び出しを行わない。

- 新しい動作、動作変更は [Feature Playbook](references/playbooks/feature.md) を読み、共通手順の調査・設計・検証方法を補う。
- 期待と異なる動作の修正は [Bug Fix Playbook](references/playbooks/bug-fix.md) を読む。
- 動作を変えない構造変更は [Refactoring Playbook](references/playbooks/refactoring.md) を読む。
- 計測できる性能問題は [Performance Playbook](references/playbooks/performance.md) を読む。
- `hotfix` は原則 Bug Fix として扱い、緊急であっても原因確認や検証を省略しない。`chore` は名前ではなく実際の作業内容で分類する。
- どの専門 Playbook にも当てはまらない依頼は、この共通手順をそのまま使う。`generic` Playbook は作らない。

Markdown リンクの相対パスは、各参照元ファイルのディレクトリを基準に解決する。
以下で利用する Skill は実行前に読み、Agent や tool は公開 API に従って使う。
必要なコンポーネントが利用できない場合は、代替実装や独自の配線を追加せず、不足と再開条件を報告する。

### optional Evaluation 通知

目的と新規 / 再計画対象が確認できた時点で、Root に `taskflow_evaluation_link` が提示され利用可能な場合だけ Root が通知する。
新規は `{ operation: "begin_planning", displayName: <160文字以内の目的名> }`、再計画はこれに `sourceIssues: [<通常の取得で確認済みの既存 Issue refs>]` を必ず含める。
GitHub refs は https の完全な Issue URL または `{ kind: "github", host, owner, repo, number }` の明示構造、local refs は現在 cwd 内の project-relative ticket path を使う。番号だけやタイトルから推測せず、Taskflow ID を手入力しない。
明示対応が全件一意かつ同じ Taskflow の場合の既存 ID 再利用は Tool に委ねる。関連付け不能でも `sourceIssues` を省略して新 UUID で回避しない。
Tool 未導入・非アクティブ・通知失敗・保存未確認・未保存 leaf による追加停止・呼び忘れ・再計画の関連付け不能でも、本体の入力・進行・承認条件は変えない。独自 unresolved / 保存待ち / 再解決・補修手順、代替 Tool / manifest / collector、終了認定は追加しない。
これは optional 通知だけの扱いであり、以下の通常手順で必要な停止や Plan / tracker 設定 / 分割 / 保存公開の個別承認は維持する。

## 2. 事実を調べる

情報の種類によって解決方法を分ける。調べれば分かることをユーザーへの質問にしない。

| 情報 | 解決方法 |
| --- | --- |
| リポジトリ内の事実 | Root Agent のコード確認、または built-in `scout` |
| 外部の事実 | `pi-subagents` から `pi-ketch.researcher` に委譲 |
| 小さな実験で分かる事実 | Probe |
| ユーザーしか決められない仕様・範囲・優先度・方針 | Root で `grilling` + `ask_user_question` |

### コード調査

関連コード、処理の入口と流れ、テスト、正式なチェック、変更の影響、制約、不明点を確認する。
小さく明らかな依頼では Root Agent が直接確認し、Scout を省略してよい。
範囲のある調査は `pi-subagents` の built-in `scout` を fresh context で使う。
調査対象、確認したい事実、コードを変更しないこと、必要な報告を指定する。
大量のコード本文ではなく、根拠となるファイルと重要な結論を受け取り、Root Agent が判断する。

Scout の報告だけで重要な事実を確定しない。
設計方針・責務・変更範囲・完了条件を左右する事実は、Root が根拠となるコード・テスト・設定など、該当する一次情報を直接確認する。
コードの確認だけでは判断できない挙動は、既存テストの実行や、必要に応じた最小の Probe で検証する。
確認できなかった事項は、確定事実として Plan に反映しない。

Scout の調査全体をやり直す必要はなく、判断に影響する事実に絞って確認する。

### 外部調査

ライブラリ、API、バージョン差、標準仕様などの外部情報が必要な場合だけ、`pi-ketch.researcher` を起動する。
調査する問い、対象バージョン、必要な根拠を渡す。公開 `subagent` tool から最小の呼び出しで起動できる。

```js
subagent({
  agent: "pi-ketch.researcher",
  task: "調査する問い、対象バージョン、必要な根拠"
})
```

通常は package の `defaultContext: fresh` に任せ、Planning の会話全文を渡さない。
結果を受け取ってから Root Agent が根拠と不確実性を評価し、必要な結論と出典だけを Plan に反映する。
調査途中の tool 出力・会話全文を正式な成果物として保存したり、Implementation に引き継いだりしない。
`pi-subagents` の built-in `researcher` で代用しない。
researcher package が提供する fresh context、tools、child Extension を使う。
独自 Researcher、Ketch tool 一覧、Extension path、`subagentOnlyExtensions` をこの workflow に定義しない。

## 3. ユーザー判断を確定する

仕様、範囲、優先度、方針などの未決定事項がある場合だけ、Root Agent が `grilling` Skill を使う。
各質問は Root セッションの `ask_user_question` で表示し、回答を待つ。Grilling を subagent として起動しない。
確認が必要な事実が途中で見つかったら、コード確認、Scout、外部調査、Probe に戻る。
ユーザー判断の前提が揃ってから質問し、決まっていない回答を推測で埋めない。
未決定事項がなければ Grilling は省略する。
入力設計が未決としている事項も、情報の種類に応じて既存の調査・Probe・Grilling で解決する。通常の実装詳細をすべてユーザーに質問しない。
ある方針への回答を、関連する別の設計変更への同意に広げない。例えば「所属が一意なら既存 Taskflow を再利用する」への同意は、「未解決通知を永続登録する」「後で自動再解決する」への同意ではない。これは回答の適用範囲を示す例であり、特定の Domain の契約を定めるものではない。

調査で入力設計の前提が成立しないと分かったら、誤った前提のまま具体化せず、事実を示して必要な方針変更をユーザーと確認する。
目的・仕様・責務・範囲の変更が必要な場合は、入力設計との差分、必要な理由、最小案を示し、この節の手順に従って Root のユーザー判断に戻る（`grill-with-docs` の適用条件も含む）。未承認の変更を確定しない。
入力設計の変更に合意したら、変更箇所・理由・合意した方針を明示し、入力設計と最終 Plan の整合を維持する。
入力設計の更新が必要なら更新範囲とタイミングを確認し、編集権限や更新の合意なしに変更しない。更新を後続作業にする場合の引継ぎは、最終 Plan に明記する。
目的・主要な責務境界・公開契約など基本設計の主要方針に影響する場合は、必要に応じて既存の設計検討工程である Design Discussion に戻る。通常の実装詳細や小さな変更では無条件にやり直さず、新しい必須 Skill・承認段階・独自 workflow を追加しない。

重要な用語や Domain の境界、理由を残すべき設計判断がある場合だけ、Root で `grill-with-docs` を使う。
これは `grilling` と `domain-modeling` を組み合わせるため、別に Grilling を先行させない。
GLOSSARY や ADR を普通の実装内容のために増やさない。

## 4. 必要なら Probe を行う

実験で答えられる不明な事実には、次を決めてから最小の Probe を行う。

- 確認したい問い
- 答えになる観測結果
- 最小の実験
- 終了条件

Probe は本番実装ではない。production code を実装する工程や Work Item の完了として扱わない。
一時ディレクトリなどで実験し、途中ファイルは原則として残さない。観測と結論を区別し、設計に影響する結論だけを Plan に反映する。

## 5. 設計と検証方法を固める

必要な調査とユーザー判断が揃ってから、既存の公開 API、Skills、Extensions、Agents、依存関係を優先して最小の実装方針を決める。
入力に基本設計・仕様がある場合は、その目的・要件・責務・対象外を維持して具体化する。
次の追加は単なる実装詳細と決めつけず、責務や仕様の変更に当たるか確認する。

- 新しい管理対象
- 新しい永続状態や、その状態を扱うライフサイクル
- 新しい復旧・補正・再解決手順
- 新しいユーザー操作
- 新しい入力条件・進行条件・完了条件

追加を採用する前に、Root Agent が必要性と実装方法を分けて確認する。

- 入力設計・既存契約・プロジェクトの規約に根拠があるか。
- または、必要な安全性・データ整合性の確保に必要か。その場合は、どの入力・状況で何が壊れるのを防ぐのか、具体的な危険や不整合を示す。実際の事故や攻撃の再現は必須ではない。
- 既存機能、追加しない方法、より小さい実装方法で同じ目的を達成できないか。

不要な追加はしないが、必要な安全策は省略しない。安全上の必要性を、新しい管理対象・永続状態・復旧工程などを追加する実装方法への包括的な承認として扱わない。
既存要件に必要な実装方法・検証・安全対策の選択は Root が行う。目的・仕様・責務・範囲の変更が必要なら、手順3のユーザー判断に戻る。

テストと実際の動作確認方法を決める。TDD を使うか、使う場合はどの公開インターフェースをテストするかを Plan に記載する。
TDD の実行には既存の `tdd` Skill を使う。適切なテストが作れない場合は、弱いテストではなく実行可能な確認方法を記載する。

複数案、広い変更範囲、戻しにくい判断、重要な前提やリスクなどに別の視点が必要なら、built-in `oracle` に助言を依頼する。
目的、重要な調査結果、ユーザー判断、設計案、制約、検証方法だけを渡し、会話全文を渡さない。
Oracle はコードを変更せず、承認者にもならない。賛同をユーザー判断の代わりにしない。意見の採否は Root Agent が決める。単純で明らかな依頼では省略してよい。
Oracle を利用する場合は、必要に応じて次も助言の観点に含める。これを新しい必須工程にはしない。

- 入力設計から不要な責務・管理対象・状態が増えていないか。
- 必要な安全策に対して、過大な実装方法を選んでいないか。
- 合意した設計変更が、入力設計と最終 Plan の関係から理解できるか。

新たな不明点や未決定事項が出たら、必要な調査・判断に戻って解決する。

## 6. 最終 Plan を作成する

必要な調査、Probe、ユーザー判断、助言の評価が完了した後にだけ、Root Agent が最終 Plan を Markdown で作成する。
作成前に Root が入力設計・既存契約・プロジェクトの規約・確認済み回答との整合を確認する。
未確認の仮説や未承認の設計変更を確定事項として混ぜない。Plan 全体の Review に紛れ込ませて、未確認の仕様変更を済ませない。
実装・検証に必要な要求・決定事項・重要な前提は、Plan 本文または解決可能な参照先から、会話履歴なしで理解できるようにする。
既存資料が要求の解釈や重要な設計判断の根拠となり、その確認が実装・検証に必要な場合は、必要な参照先・参照箇所を Plan に残す。
合意した設計変更がある場合だけ、その変更箇所・理由・合意した方針を Plan 内で識別できるようにする。
入力設計の更新を後続作業にする場合も、変更点と変更前の記述より優先される方針、確認済みの更新範囲・タイミングを明記し、Implementation が変更前の方針を採用しないようにする。専用の差分管理文書や状態管理は追加しない。

最低限、次の項目を含める。

```markdown
# タイトル

## 目的

## 要件・決定事項

## 制約・対象外

## 実装方針

## 完了条件

## 動作確認方法
```

設計の詳細、テスト方針、リスクは必要な場合だけ追加する。

## 7. 必ず Plan Review を受ける

すべての最終 Plan に対して `taskflow_plan_review` を呼ぶ。小さい依頼や Oracle の賛同でも省略しない。
完成した Markdown 全文を `planContent` に渡す。保存先を渡す場合は `planFilePath` を使う。
この tool は Plannotator の `plan-review` に直接提出する。Pi Plan Mode に切り替えない。

- `status: "approved"` かつ `approved: true` の結果、つまりユーザーの明示的な Plannotator Approve だけを承認とする。
- Reject は返された `feedback` を使って Root Agent が修正する。必要なら調査・ユーザー判断に戻り、修正後の全文を再提出する。
- Cancel、ブラウザを閉じる・放置すること、Plannotator のエラー、利用不可、不正な応答は承認ではない。承認待ち、または停止として報告し、Approved Plan の確定や Work Item の公開に進まない。

承認後に Plan の内容を変更する必要が出た場合は再 Review を受ける。未承認の変更を承認済み内容に混ぜない。

## 8. Approved Plan を保存する

明示的な承認を得た内容を正式な Approved Plan として保存する。
プロジェクトに既存の保存ルールがあればそれを優先し、なければ `docs/plans/<slug>.md` を使う。
Plannotator の内部保存だけでプロジェクトの正式な保存を済ませたことにしない。
保存した内容が承認された内容と一致し、参照可能であることを確認する。保存できなければここで止める。
独自の Draft 管理、workflow state、途中経過の永続化は追加しない。

## 9. taskflow-to-ticket に渡す

同梱の [taskflow-to-ticket Skill](../taskflow-to-ticket/SKILL.md) を明示的に読み、正式に保存した Approved Plan のパスと全文、および以下の追加制約を渡す。
分割、依存関係、ユーザーへの確認、tracker への保存・公開は `taskflow-to-ticket` に任せる。
`docs/agents/issue-tracker.md` の読み取り・再利用と必要最小限の設定準備は ticket Skill だけが担当する。Planning で設定を作成・更新したり、旧 setup Skill や独自 tracker を使ったりしない。

追加の制約は次のとおり。

- 各 Work Item から元の Approved Plan を参照できるよう、正式なパスまたはアクセス可能なリンクを含める。
- 1回の新しい Implementation セッションで実装し、結果を確認できる大きさを基本とする。
- Work Item の種別はそれぞれの内容で決まり、Feature Plan からすべて Feature が生成されるとは限らない。
- Plan 承認、tracker 設定承認、分割承認、最終本文・保存先の保存・公開承認をそれぞれ別に得る。分割承認だけでは保存・公開せず、ticket Skill の個別承認手順を維持する。
- 分割中に承認済みの要件・設計を変更する必要が出たら、勝手に拡張せず Plan Review に戻る。
- optional Evaluation 通知は同じ Planning Root で続ける。保存・公開の明示承認後、作成・取得確認済み refs だけを `add_issues` に渡す（既存同一 ticket 再利用・部分作成を含む）。begin が未保存でも本体を継続し、`add_issues` の拒否を補修しない。

保存・公開後は各 Work Item の参照、Approved Plan への参照、ユーザー確認が成立したことを確認する。
一部だけ保存できた場合は未完了分を報告し、Planning 完了とはしない。

## 10. Planning を終了する

次のすべてが成立した時点で終了する。

1. Approved Plan が正式な場所に保存済み。
2. Work Item の分割と最終本文・保存先の保存・公開をユーザーがそれぞれ確認・承認済み。
3. Work Items が保存・公開済みで、各項目から Approved Plan を参照できる。

最終回答では Approved Plan の場所と Work Items の参照を示す。
ここで必ず停止する。`taskflow-to-ticket` の保存・公開後も Implementation を自動開始しない。
Worker 起動、production code の実装、merge、release、deploy は行わない。
