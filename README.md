# 臨床実習予約システム

予約制・累積時間型の臨床実習管理システム。スポーツキュアセンター向け。

## 機能

### 学生向け
- 実習枠の予約・キャンセル
- 累積時間の確認
- 予約履歴の確認

### 管理者向け
- 実習枠の作成・管理
- 学生の一括登録・招待
- システム設定（累積時間、キャンセル締切等）

## 技術スタック

- **Frontend**: React + Vite
- **Backend**: Firebase (Auth, Firestore)
- **Hosting**: Cloudflare Pages

## セットアップ

1. Firebaseプロジェクト作成
2. データベースセットアップ（[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)参照）
3. 環境変数設定

```bash
cp .env.example .env
# .envを編集してFirebaseの設定を追加
```

4. 依存関係インストール

```bash
npm install
```

5. 開発サーバー起動

```bash
npm run dev
```

## 環境変数

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
...
```

## デプロイ

```bash
npm run build
npx wrangler pages deploy dist --project-name=nssu-clerkship-2026
```

## 実習区分

| 区分 | 対象 |
|-----|------|
| 臨床実習Ⅰ | 2年生 |
| 臨床実習Ⅱ | 3年生 |
| 臨床実習Ⅳ | 4年生 |
