# 出典と改変

この Skill は Matt Pocock の `to-tickets` の手順を基にした、日本語の pi-taskflow 用改変版。upstream の setup Skill の実行・導入は不要。

- upstream: https://github.com/mattpocock/skills
- 基準 commit: `f3fc5632f401156837ee3872f14fe33ccf1024ea`
- 元ファイル: [skills/engineering/to-tickets/SKILL.md](https://github.com/mattpocock/skills/blob/f3fc5632f401156837ee3872f14fe33ccf1024ea/skills/engineering/to-tickets/SKILL.md)
- 正式 LICENSE: [repository root LICENSE](https://github.com/mattpocock/skills/blob/f3fc5632f401156837ee3872f14fe33ccf1024ea/LICENSE)
- 著作権表示: Copyright (c) 2026 Matt Pocock
- 許諾文: Skill 配下の [LICENSE](../LICENSE) に upstream checkout の正式 LICENSE 全文を同梱。

転用した手順は context 取得、tracer-bullet の縦分割、prefactoring、本当の blocking edges、expand–contract、ユーザーへの粒度・依存確認、依存順の1チケット1ファイル / Issue 作成、元 Issue を変更しない境界。

改変は日本語化、名前を `taskflow-to-ticket` に変更、対象 tracker を GitHub / Local に限定、`docs/agents/issue-tracker.md` の直接 read と最小設定テンプレート、設定・分割・保存公開の個別承認、CLI / 認証 / 対象の確認と停止、既存 label 対応名、正式 Approved Plan 参照、readback・部分失敗・重複回避、Implementation を開始しない終了境界の追加。元の setup 前提と実装への継続指示は採用していない。

`disable-model-invocation: true` は維持する。第三者の導入先・symlink・global 設定を変更しない。
