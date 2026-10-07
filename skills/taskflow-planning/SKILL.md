---
name: taskflow-planning
description: Plan development work in Pi, including features, bug fixes, refactoring, and performance improvements. Investigate facts, resolve user decisions, obtain explicit Plannotator approval, and publish reviewed Work Items through to-tickets. Stop before Implementation.
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

参照ファイルの相対パスは、この Skill のディレクトリを基準に解決する。
以下で利用する Skill は実行前に読み、Agent や tool は公開 API に従って使う。
必要なコンポーネントが利用できない場合は、代替実装や独自の配線を追加せず、不足と再開条件を報告する。

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

### 外部調査

ライブラリ、API、バージョン差、標準仕様などの外部情報が必要な場合だけ、`pi-ketch.researcher` を起動する。
調査する問い、対象バージョン、必要な根拠を渡し、Planning に必要な結論を利用する。
`pi-subagents` の built-in `researcher` で代用しない。
researcher package が提供する fresh context、tools、child Extension を使う。
独自 Researcher、Ketch tool 一覧、Extension path、`subagentOnlyExtensions` をこの workflow に定義しない。

## 3. ユーザー判断を確定する

仕様、範囲、優先度、方針などの未決定事項がある場合だけ、Root Agent が `grilling` Skill を使う。
各質問は Root セッションの `ask_user_question` で表示し、回答を待つ。Grilling を subagent として起動しない。
確認が必要な事実が途中で見つかったら、コード確認、Scout、外部調査、Probe に戻る。
ユーザー判断の前提が揃ってから質問し、決まっていない回答を推測で埋めない。
未決定事項がなければ Grilling は省略する。

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
テストと実際の動作確認方法を決める。TDD を使うか、使う場合はどの公開インターフェースをテストするかを Plan に記載する。
TDD の実行には既存の `tdd` Skill を使う。適切なテストが作れない場合は、弱いテストではなく実行可能な確認方法を記載する。

複数案、広い変更範囲、戻しにくい判断、重要な前提やリスクなどに別の視点が必要なら、built-in `oracle` に助言を依頼する。
目的、重要な調査結果、ユーザー判断、設計案、制約、検証方法だけを渡し、会話全文を渡さない。
Oracle はコードを変更せず、承認者にもならない。意見の採否は Root Agent が決める。単純で明らかな依頼では省略してよい。
新たな不明点や未決定事項が出たら、必要な調査・判断に戻って解決する。

## 6. 最終 Plan を作成する

必要な調査、Probe、ユーザー判断、助言の評価が完了した後にだけ、Root Agent が最終 Plan を Markdown で作成する。
未確認の仮説を確定事項として書かない。Implementation が会話履歴なしで理解できる内容にする。

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

## 9. to-tickets に渡す

既存の `to-tickets` Skill を読み、保存した Approved Plan のパスと全文を入力にする。
分割、依存関係、ユーザーへの分割確認、configured tracker への保存・公開は `to-tickets` に任せる。
tracker の設定が不足していれば `to-tickets` の案内に従って準備を依頼し、独自 tracker や保存先設定を作らない。

追加の制約は次のとおり。

- 各 Work Item から元の Approved Plan を参照できるよう、正式なパスまたはアクセス可能なリンクを含める。
- 1回の新しい Implementation セッションで実装し、結果を確認できる大きさを基本とする。
- Work Item の種別はそれぞれの内容で決まり、Feature Plan からすべて Feature が生成されるとは限らない。
- 分割案をユーザーが確認・承認するまでは保存・公開しない。Plan の承認と分割の承認は別である。
- 分割中に承認済みの要件・設計を変更する必要が出たら、勝手に拡張せず Plan Review に戻る。

保存・公開後は各 Work Item の参照、Approved Plan への参照、ユーザー確認が成立したことを確認する。
一部だけ保存できた場合は未完了分を報告し、Planning 完了とはしない。

## 10. Planning を終了する

次のすべてが成立した時点で終了する。

1. Approved Plan が正式な場所に保存済み。
2. Work Item の分割をユーザーが確認・承認済み。
3. Work Items が保存・公開済みで、各項目から Approved Plan を参照できる。

最終回答では Approved Plan の場所と Work Items の参照を示す。
ここで必ず停止する。`to-tickets` に続行を促す記述があっても、Implementation を自動開始しない。
Worker 起動、production code の実装、merge、release、deploy は行わない。
