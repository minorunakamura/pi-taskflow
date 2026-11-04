# Taskflow の検証資産・BLOCKED 再開案内・文書の分担

## 目的と現在地

必要な実動作検証を、その都度一時コードから組み立て直す状態を減らす。Planning が作成不要と見込んだ場合も、Implementation が実際の不足に応じて、承認済みの検証を成立させる最小の資産を用意できるようにする。

あわせて、検証資産に限らず Implementation が `BLOCKED` で停止した場合に、ユーザーがそのまま Pi に送れる再開プロンプトを提示する。ユーザーが再開方法を質問したり、依頼文を組み立てたりする負担を減らす。文書の分担が未定義のプロジェクト向けに、README・開発文書・設計文書・検証 Skill の既定の役割と、Planning / Implementation の責務も定める。

本書は今回の Design Discussion で合意した方針を保存する。[検証資産連携・同時 Review・Work Item 粒度の設計](taskflow-verification-review-slicing.md) §1 のうち、検証資産の採否基準と Planning / Implementation の判断分担を具体化する。保証対象・対象外、TDD、正式チェック、Root の直接検証・最終受入れ、関連更新と Maintain の境界は維持する。

本書は Approved Plan や実装開始の許可ではない。既存の設計書・Approved Plan・Work Item は書き換えず、Skill の具体的な改訂文面、実装手順、検証方法は後続の Planning で定める。

## 確認した問題

同じ `docs/designs/reversi.md` を入力とする `pi-test7` / `pi-test8` の Taskflow 実行を比較した。入力設計の SHA-256 は一致した。

- 改修後の `pi-test8` の Plan は、既存資産がないことを確認した一方、「小規模な通常テストと README の起動・チェック手順で足りる」として、Create・Feature Map・共通 browser harness を作成しない制約を置いた。
- 各 Work Item がその制約を引き継ぎ、Implementation は Issue ごとに `/tmp` で CDP 接続、操作、局面投入、安全性確認などのコードを準備・調整した。
- 通常テストと直接確認で要求を検証できることと、その直接確認を別セッションで実行できる手段が整っていることは別である。前者を満たすだけでは、検証資産が不要とは判断できない。
- 比較だけでは、Create を使った場合の節約量や、すべての一時コードを再利用できたかは確定できない。検証ケース数・実行頻度・実行時間全般の最適化は今回の対象外とする。

出典は、実装前 `pi-test7` の `.pi/taskflow-reports/26807bb3-eeb8-45fa-be1b-eb328e0f39dd/report.json`、実装後 `pi-test8` の `.pi/taskflow-reports/961c9c81-e41e-4522-a1d6-6ffcd0860eb6/report.json`、両プロジェクトの `docs/plans/reversi.md` と原 Session 記録。実装後の Create 不採用は Planning Root `01a1a1bf-0367-70a2-8094-3f149977cda4` の Plan 提出 entry `bf72747b` と Work Item 本文提示 `794caf57` で確認した。レポートや原ログ自体は非公開の調査資料であり、本書へ転載しない。

## 1. 採否は実動作検証の手段の充足から判断する

まず次を問う。

> 今回必要な実動作検証を、別の Agent が会話履歴なしで、起動・操作・期待結果との照合・証拠取得・後始末まで実行できる既存の手段があるか。

適切な既存の検証 Skill、具体的な検証手順、必要な helper や harness を優先する。今回の検証を実行できる手順と操作手段が揃っていれば、新しい資産を重複作成しない。起動・通常テストのコマンドだけがあることを、Worker 接続・画面操作などの実動作検証の手段が充足した根拠にはしない。

不足する場合は、共通 `create-verification-skill` で、その不足を補う最小範囲のプロジェクト固有の検証資産を用意する。Planning では必要性と初期対象を計画し、生成と成立確認は Implementation で行う。

- 小規模なアプリであること、通常テストや開発文書があること、恒久 E2E 基盤を追加しないことだけを、Create 不採用の理由にしない。
- 複数 Issue / セッションでの反復利用は利点だが、採用の必須条件にしない。一度の作業でも、必要な実動作を検証可能にする手段が不足していれば対象になる。
- 毎回の Create、全プロジェクトへの導入、全機能の資産化を要求しない。既存手段で充足している場合は再利用し、通常テストや使い捨ての探索 Probe を一律に検証資産へ変えない。
- 検証手順を保存する判断と、恒久 E2E・CI・独自 runner を導入する判断は分ける。必要な helper は共通 Create の契約に従い、仕組みを大きくすること自体を目的にしない。

この判断は既存の検証設計の中で行い、専用の判定表・設定・承認段階は追加しない。

## 2. Planning は必要性を見積もり、実装時の不足補完を封じない

Planning Root は今回の保証対象・検証方法を定め、既存手段の参照と適否・不足、必要と分かる Create の初期対象、関係する更新範囲を Plan の既存の「動作確認方法」に残す。Planning 自身は資産を生成せず、生成手順の成立も確認しない。

Planning 時点の「Create の予定なし」は、現時点の手段で足りるという見込みであり、一律の作成禁止にしない。今後の Plan では、Implementation が現在の手段を確認し、承認済みの保証対象・対象外・期待結果を維持しながら、その検証手段を具体化・補完するために必要な最小の Create・関連更新を判断できる契約を含める。

この裁量も含めて Plan の通常の承認を受け、正式 Plan の参照と既存の Verification 欄を通じて Work Item に引き継ぐ。専用の包括許可や新しい承認手順は作らない。Work Item 分割時に、単なる「予定なし」を作成禁止へ強めない。

ユーザーの明示的な作成禁止やプロジェクト規約による制約は、見込みと区別して保持する。通常の不採用判断だけを理由に、Create・Feature Map・検証 helper をまとめて対象外へ固定しない。

## 3. Implementation は現物から必要性を判断する

Implementation Root は、正式 Plan / Work Item と現在のコード・検証資産を確認し、今回必要な実動作検証を実際に成立させられるか判断する。

- 既存手段で足りる場合は、その手段を再利用して今回の対象を検証する。
- Planning が Create 不要と見込んでいても、手段の不足が判明すれば、承認済みの保証・対象範囲を維持して最小の Create を選ぶ。この採否の変更だけでは、再計画や追加承認を要求しない。明示的な Create 指定がないことだけを理由に見送らない。
- 必要な操作手段を毎回の使い捨てコードで補おうとしている場合は、その方法をプロジェクト固有の資産として整える必要がないか判断する。試行錯誤の全ファイルを保存する要求にはしない。
- 関連資産がある場合は重複生成せず、今回関係する手順・helper・Feature Map だけを更新し、変更した方法を再実行する。

Create は共通 Skill の実ファイルを明示的に読み込んで利用する。Taskflow 側で機能を再実装せず、必要な Skill を取得できない場合は既存の `BLOCKED` 経路を使う。呼び出し・配置・発見・証拠・安全性は共通 Skill と対象プロジェクトの規約に従い、固定 checkout や独自 wrapper は要求しない。

採否と範囲の判断は Root が保持し、Worker に資産の作成・更新を担当させる場合は対象と検証・cleanup の分担を明示する。同じ cwd の同時 writer を作らない。生成した手順を少なくとも初期対象の一機能で実行して成立を確認するが、その成功を Work Item 全体の完了条件の確認と同一視しない。

### 再計画になる変更と、ならない変更

Planning の「不要」から Implementation の「必要」への採否変更自体は、再計画の理由にしない。承認済みの実動作検証を実行するために、操作手順を Skill にまとめ、必要な helper を用意し、既存資産を更新することは、通常の Implementation の判断として扱う。

`REPLAN_REQUIRED` は、例えば実ブラウザで確認する保証を unit test だけに置き換える、期待結果を緩める、検証資産ではなく製品の公開 API や設計を変えなければ成立しないなど、承認済みの前提・保証・仕様・設計を変える必要がある場合に使う。Create を使うこと自体や、未予定の Skill・helper ファイルが増えることだけを、その変更と同一視しない。

ユーザーの明示的な作成禁止や規約、既存 Approved Plan の明示的な制約に抵触する場合は、独断で読み替えず確認する。その制約を含む正式 Plan の変更が必要なら再計画する。一方、必要な共通 Skill や権限がないだけなら、不足と再開条件を `BLOCKED` として報告し、自動的に再計画へ送らない。

## 検証資産の具体例

| 状況 | 判断 |
| --- | --- |
| 既存の検証手順・操作手段で、対象の実操作・期待との照合・証拠・後始末を実行できる | 再利用する。新規 Skill を作ること自体を目標にしない |
| リバーシに unit test と起動手順はあるが、実 Worker・思考中再開始・旧応答破棄を確認する手段が未整備 | Planning はその限定対象の Create を計画する。アプリが起動可能になった Implementation で生成手順を実行して確かめる |
| Planning では既存手順で足りる見込みだったが、Implementation で必要な操作・観測方法が不足と分かった | 保証・対象範囲を維持して Root が最小の Create または既存資産更新を判断する。採否変更だけでは再計画しない |
| 今回の変更で入口や selector が変わった | 関係する手順・helper・Map を更新し、その方法を再実行する。全 Map 点検や新規生成へ広げない |
| 不明な事実を調べる小さい探索実験 | 使い捨て Probe のままでよい。必要な結論を残し、全実験コードを資産化しない |
| 明示的に検証資産作成が禁止されている | 独断で作成せず確認する。正式 Plan の制約変更が必要なら再計画する |
| 実ブラウザでの確認を unit test だけへ置き換えるなど、成立に保証・設計の変更が必要 | Create の採否変更とは区別し、`REPLAN_REQUIRED` とする |
| 必要な共通 Skill や権限がない | `BLOCKED` として不足と再開条件を報告する |

## 4. BLOCKED 全般で Pi への再開プロンプトを提示する

現行の [Implementation Skill §10](../../skills/taskflow-implementation/SKILL.md#10-最終状態を報告して終了する) は、`BLOCKED` に理由と再開条件を求めているが、コピー可能な再開依頼文は `REPLAN_REQUIRED` にだけ定めている。この再開案内を、検証資産・共通 Skill 不足に限定せず、入力・依存・ユーザー判断・承認・必要なコンポーネントなど、どの工程の `BLOCKED` にも適用する。

### 提示するのは Pi に送る指示

Root は `BLOCKED` の最終回答で、停止理由と未充足の再開条件に加え、「再開するときは、このセッションの Pi に次を送ってください」と明記し、コピー可能な再開プロンプトを提示する。ユーザー自身にコード確認や検証の実施を命じる手順ではなく、Pi に確認と続行を依頼する文章である。ユーザーが再開方法を尋ねるまで待たない。

再開プロンプトには、確認できている対象 cwd、Work Item の参照、停止理由・未充足条件と、現在の入力・Plan・作業ツリーを確認して再開可否を判断する指示を含める。実際の出力は確認済みの具体値を埋め、既知の値をユーザーが補完する雛形にはしない。

Work Item の識別前に止まった場合は、元の入力と未確定の対象を明記し、その確認から依頼する。未確認の URL・Plan 参照・ユーザー回答・解消結果を捏造しない。ユーザー判断が不足している場合は回答が必要な問いも明記し、再開プロンプトで回答や承認を済ませた扱いにしない。

文面の基本形は次のとおり。山括弧は設計上の雛形であり、実際の出力では確認済みの内容、または未確定である事実に置き換える。

```text
BLOCKED で停止した Implementation の再開可否を確認してください。
対象 cwd: <確認済みの対象プロジェクト>
対象 Work Item: <確認済みの参照。未確定なら元の入力と未確定点>
停止理由・再開条件: <今回の具体的な不足と確認が必要な点>
現在の Work Item・Approved Plan・作業ツリーと停止条件の解消を確認し、条件を満たしていれば停止箇所から続行してください。
既存の未コミット変更・部分実装は保持してください。未充足の条件があれば停止を維持して報告してください。
```

### 再開先と停止条件は変えない

- `BLOCKED` は通常、同じ Root セッションの Pi へ再開プロンプトを送る。新しいセッションや Planning を一律に要求しない。
- `REPLAN_REQUIRED` は、現行どおり別の Planning セッションへの kickoff を提示する。改訂 Plan と Work Item の承認・保存等が完了する前に、Implementation の続行を案内しない。
- プロンプトの提示や送信自体を、不足の解消、依存の完了、ユーザー回答・承認の証拠にしない。Pi は現在の情報で再開条件を確認し、未充足なら `BLOCKED` を維持する。再確認で Plan の変更が必要と分かれば既存の `REPLAN_REQUIRED` 経路を使う。
- 部分実装を独断で commit / stash / 破棄せず、影響した変更前のチェック・Review・承認を現在の差分の証拠に流用しない。自動再試行・常駐待機・自動再開・独自の復旧状態や追加 gate は作らない。

## 5. 文書の分担と Planning / Implementation の責務

検証資産の有無とは別に、文書の役割に応じて更新先を選ぶ。対象プロジェクトの既存の文書構成・規約を確認して優先し、分担が定まっていない場合は次を既定とする。

| 文書 | 既定の役割 |
| --- | --- |
| README | 概要・導入・基本操作と、詳細文書へのリンク |
| CONTRIBUTING などの開発文書 | 開発環境・詳細な開発手順・チェック方法 |
| 設計文書 | 設計・実装上の判断と理由 |
| 検証 Skill | Agent が実動作を検証する具体的な手順 |

Planning は既存の構成・規約を確認し、必要な文書更新と保存先を Plan に残す。分担が未定義なら上記の既定を使い、Work Item に必要な更新を引き継ぐ。

Implementation はその分担に従って必要な文書を更新する。実装の詳細・開発手順・検証手順を安易に README へ集約せず、README から必要な詳細へ辿れるようにする。

この分担は、4種類の文書を必ずすべて作る要求ではない。今回必要な内容に応じて文書を用意し、空の雛形、CONTRIBUTING の一律新設、既存文書の一括移動は要求しない。文書の名前や存在自体を、実動作検証の手段が充足した根拠にしない。

## 根拠と採用する範囲

今回確認した pstack の公開 `main` は、次の方針を示している。リンク先は更新され得るため、固定版の実行契約としては扱わない。

- [Create Verification Skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md)：UI / CLI / service の振る舞いを証明する scripted な手段がない場合を対象とし、生成した手順を実物で一度実行して確かめる。
- [Verify and ship Guide](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/06-verify-and-ship.md#create-a-project-verification-skill)：実アプリを操作する scripted な手段がなければ Create を案内し、使い捨て操作コードを繰り返す場合は小さい操作手段として整えることを勧める。
- [Build the Lever](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-build-the-lever/SKILL.md)：基準は反復回数ではなく作業の自明さであり、一度きりでも検証可能にする道具には価値があるとする。

ここから、実動作を検証できる手段の不足を重視する判断を採用する。pstack が全タスクで Create を自動起動するという保証や、独自 control CLI の一律導入、定期 Maintain、自律実行・commit・承認方針全体は採用しない。

共通 Skill は `pi-skills` の [Create](../../../pi-skills/skills/create-verification-skill/SKILL.md) / [Maintain](../../../pi-skills/skills/maintain-verification-skill/SKILL.md) を利用する。隣接 checkout へのリンクは調査資料の所在であり、配布 Skill の実行時固定配置にしない。

## 後続の Planning への引継ぎ

主要方針に未決定のユーザー判断はない。後続では次を具体化する。

- `skills/taskflow-planning/SKILL.md` の採否判断・Plan 作成・Work Item 引継ぎと、`skills/taskflow-implementation/SKILL.md` の現物確認・Worker 依頼・直接検証を接続する。Planning の見込みと Implementation の不足補完を両方扱う。
- `docs/pi-taskflow-basic-design.md` / `docs/pi-taskflow-implementation-spec.md` の関係箇所を整合させる。チケット Skill は通常の Plan / Verification 引継ぎで足りるか照合し、判断基準を重複配置しない。
- 既存資産で充足する場合、不足が Planning で分かる場合、Implementation で初めて分かる場合、明示禁止・共通 Skill 不足・保証変更で停止する場合を確認できる検証方法を定める。
- Implementation §10 の共通終了規定に、`BLOCKED` 全般の Pi 向け再開プロンプトを接続する。対象識別前・ユーザー判断待ち・承認待ち・コンポーネント不足などでも、具体値と未確定点を区別して案内し、未解消のまま続行しないことを確認する。`REPLAN_REQUIRED` と Planning 完了後の kickoff の既存契約は維持する。
- 文書の分担について、Planning が既存構成・規約または未定義時の既定に基づいて更新先を計画し、Implementation がその分担に従う接続を具体化する。README に詳細を集約せず、不要な文書も増やさないことを確認する。
- 文書契約の照合と、実 Taskflow での採否・Create・後続再利用の観測を区別する。loader や文言確認だけで Agent の実行遵守を実証したとしない。時間短縮や手戻り削減量も未検証とする。

変更対象は検証資産に関する判断・責務・引継ぎ、Implementation の `BLOCKED` 全般の再開案内、文書の分担とその Planning / Implementation への接続に限定する。検証ケース数・実行頻度、正式チェック、TDD、Review、Work Item 粒度、CI、共通 Create / Maintain 自体は変更しない。Taskflow 専用の Skill・runner・registry・保存基盤・承認段階を追加せず、既存 Approved Plan / Work Item と今回の一時検証ファイルも変更しない。
