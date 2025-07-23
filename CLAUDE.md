# Feed Generator プロジェクト概要
このファイルは、このリポジトリ内のコードを扱う際にClaude Code（claude.ai/code）に対して提供されるガイドラインです。

## 会話のルール
- 常に日本語で会話する

## パッケージマネージャー
- **重要**: 本プロジェクトでは`yarn`のみを使用します。パッケージ管理作業はすべて`yarn`で行ってください。

## プロジェクト説明
このプロジェクトは、ATProtocol用のカスタムフィード生成器で、Blueskyソーシャルネットワーク向けの専用アルゴリズムを実装しています。現在は**崩壊：スターレイル**（Honkai: Star Rail）というゲームに関連する投稿を自動的に検出・フィルタリングするフィードアルゴリズムが実装されています。

## 技術スタック
- **言語**: TypeScript
- **ランタイム**: Node.js 20.18.x
- **フレームワーク**: Express.js
- **データベース**: SQLite3 (better-sqlite3)
- **ORM**: Kysely
- **プロトコル**: AT Protocol (@atproto)
- **サーバー**: Heroku(Heroku CLIが使用可能)

## プロジェクト構造

### 主要ファイル
```
src/
├── index.ts           # アプリケーションエントリーポイント
├── server.ts          # Expressサーバーとルーティング設定
├── config.ts          # 設定とタイプ定義
├── subscription.ts    # リアルタイムデータストリーム処理
├── algos/            # フィードアルゴリズム実装
│   ├── index.ts
│   ├── whats-alf.ts   # メインフィードアルゴリズム
│   └── starrail.ts
├── db/               # データベース関連
│   ├── index.ts
│   ├── schema.ts
│   └── migrations.ts
├── methods/          # API エンドポイント実装
└── lexicon/          # ATプロトコル型定義
```

## 主な機能

### 1. リアルタイムストリーム処理 (`subscription.ts`)
- Blueskyのfirehose（リアルタイムデータストリーム）に接続
- 投稿を監視し、崩壊：スターレイル関連コンテンツを自動検出
- 大量のキーワードパターンマッチング（日本語・英語対応）
- バッチ処理によるデータベース操作の最適化

### 2. 高度なフィルタリングシステム
**検出対象キーワード**:
- ゲーム用語: 崩壊スターレイル、崩スタ、Star Rail
- 地名・組織: ピノコニー、仙舟、天才クラブ
- キャラクター名: 丹恒、レイシオ、ブローニャ等
- ゲーム要素: 光円錐、模擬宇宙、遺物名

**除外対象**:
- AI生成コンテンツ
- 他ゲーム関連投稿
- ネガティブなコンテンツ
- 外部サイトリンク

### 3. データベースクエリ最適化
- ページネーション対応のカーソルベースクエリ
- インデックス付き時系列ソート
- バッチ挿入・削除によるパフォーマンス向上

## 設定可能な環境変数
- `FEEDGEN_HOSTNAME`: フィードサービスのホスト名
- `FEEDGEN_SERVICE_DID`: サービスのDID
- `PORT`/`FEEDGEN_PORT`: サーバーポート（デフォルト: 3000）
- `FEEDGEN_SQLITE_LOCATION`: SQLiteデータベースファイルパス
- `FEEDGEN_SUBSCRIPTION_ENDPOINT`: 購読エンドポイント

## 実行方法
```bash
# 依存関係インストール
yarn install

# 開発サーバー起動
yarn start

# ビルド
yarn build

# フィード公開
yarn publishFeed
```

## API エンドポイント
- `GET /xrpc/app.bsky.feed.getFeedSkeleton`: フィードデータ取得
- `GET /xrpc/app.bsky.feed.describeFeedGenerator`: フィード情報取得
- `GET /.well-known/did.json`: DID情報

## 特徴的な実装
1. **多言語対応**: 日本語メインで英語キーワードもサポート
2. **リアルタイム処理**: WebSocket経由でのライブデータ処理
3. **高精度フィルタリング**: 包含・除外パターンの組み合わせ
4. **スケーラブル設計**: バッチ処理とデータベース最適化
5. **ATProtocol準拠**: 標準的なBlueskyフィード仕様に完全対応

## ライセンス
MIT License

---
このプロジェクトは崩壊：スターレイルコミュニティ向けの専用フィードサービスとして設計されており、ゲーム関連の最新情報を効率的に収集・配信することを目的としています。