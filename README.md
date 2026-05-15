# 日本語学習ノート · Nihongo Notebook

> 個人日本語学習用ノート — built with WorkBuddy 🌟

東京で働くゲームローカライザーのための、SRS 間隔重復対応の日本語学習ノートです。

🌐 **オンライン**: <https://libraosang.github.io/nihongo-notebook>

## 特徴

- 📝 **対話式入力**: WorkBuddy で「この言葉を追加して」と言うだけ、AI が自動で漢字・読み・品詞・例文を補完
- 🔄 **SRS 間隔重復**: SM-2 アルゴリズム（Anki 経典）で長期記憶を最適化
- 📱 **PWA 対応**: PC でもスマホでも、ブラウザでアクセス可能・オフラインでも閲覧可能
- 🤖 **毎日の小テスト**: WorkBuddy automation が毎朝自動で出題（中訳日 / 日訳中 / 知識点考查）
- 🔒 **プライバシー二層構造**: public 仓库 + 本地 private で機密情報を分離

## ディレクトリ構造

```
nihongo-notebook/
├── data/
│   ├── notes.json     ← ノートのメインデータベース
│   └── log.json       ← 答題履歴
├── web/               ← 静的 PWA フロントエンド
└── .github/workflows/ ← GitHub Pages 自動デプロイ
```

## データ schema

各ノートエントリ:

```json
{
  "id": "20260515-001",
  "type": "word",
  "front": "ブラッシュアップ",
  "back": "完善、打磨（已有方案）",
  "kana": "ぶらっしゅあっぷ",
  "romaji": "burasshuappu",
  "pos": "名詞・サ変",
  "examples": [{ "ja": "提案をブラッシュアップする", "zh": "完善提案" }],
  "tags": ["ビジネス", "外来語"],
  "source": "...",
  "context_note": "...",
  "created_at": "2026-05-15T15:00:00+09:00",
  "srs": {
    "interval": 1,
    "ease": 2.5,
    "reps": 0,
    "lapses": 0,
    "next_review": "2026-05-16",
    "last_review": null
  }
}
```

`type`: `word` | `phrase` | `grammar` | `expression` | `culture`

## ライセンス

[CC BY-NC-SA 4.0](./LICENSE) — 個人学習目的、非商用、継承共有。

## 免責事項

本ノートは個人の学習記録であり、雇用主の立場や見解を代表するものではありません。
