# システム設定・デプロイ手順書

新機能（カレンダー同期、メール通知、パスワード認証）を有効にするために、以下の手順で設定を行ってください。

## 1. Google Apps Script (GAS) の作成

Googleカレンダーとメール送信を行うための「サーバー側スクリプト」を作成します。

1.  [Google Apps Script](https://script.google.com/) にアクセスし、「新しいプロジェクト」を作成します。
2.  エディタに以下のコードをコピペして、既存のコードを上書きします。

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // アクションによる分岐
    if (data.action === 'create') {
      return createCalendarEvent(data);
    } else if (data.to && data.subject && data.body) {
      return sendEmail(data);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid request' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// カレンダー予約作成
function createCalendarEvent(data) {
  const calendarId = 'nssu.scc@gmail.com'; // 対象のカレンダーID
  const calendar = CalendarApp.getCalendarById(calendarId);
  
  if (!calendar) {
    throw new Error('Calendar not found');
  }

  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);

  calendar.createEvent(data.title, startTime, endTime, {
    description: data.description,
    location: data.location
  });

  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Event created' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// メール送信
function sendEmail(data) {
  MailApp.sendEmail({
    to: data.to,
    subject: data.subject,
    htmlBody: data.body
  });

  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Email sent' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3.  **デプロイ**ボタン（画面右上）をクリックし、「新しいデプロイ」を選択します。
4.  **種類の選択**: 「ウェブアプリ」を選択します。
5.  **設定**:
    *   **説明**: `Clinical Training API` など（任意）
    *   **次のユーザーとして実行**: `自分 (nssu.scc@gmail.com)`
    *   **アクセスできるユーザー**: `全員` (**重要**: これを選択しないとアプリからアクセスできません)
6.  「デプロイ」をクリックし、アクセス権限を承認します。
7.  発行された **ウェブアプリ URL** （`https://script.google.com/macros/s/.../exec`）をコピーして控えておきます。

## 2. Cloudflare Pages の環境変数設定

Cloudflare Pages に、先ほどのGASのURLを設定します。

1.  Cloudflareのダッシュボードにログインし、対象のPagesプロジェクト (`nssu-clerkship-2026`) を開きます。
2.  **Settings** (設定) > **Environment variables** (環境変数) に移動します。
3.  **Production** (本番環境) と **Preview** (プレビュー環境) の両方に、以下の変数を追加・編集します。

| 変数名 | 値 |
| :--- | :--- |
| `VITE_GAS_CALENDAR_WEBHOOK_URL` | 先ほどコピーしたGASのウェブアプリURL |
| `VITE_GAS_EMAIL_WEBHOOK_URL` | 先ほどコピーしたGASのウェブアプリURL (同じURLでOK) |
| `VITE_FIREBASE_API_KEY` | (既存の設定を確認) |
| `VITE_FIREBASE_AUTH_DOMAIN` | (既存の設定を確認) |
| `VITE_FIREBASE_PROJECT_ID` | (既存の設定を確認) |
| `VITE_FIREBASE_STORAGE_BUCKET` | (既存の設定を確認) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | (既存の設定を確認) |
| `VITE_FIREBASE_APP_ID` | (既存の設定を確認) |

4.  保存したら、**Deployments** (デプロイ) タブから「Retry deployment」を行うか、GitHubに新しいコミットがプッシュされるのを待ちます（今回は既にプッシュ済みなので、自動でビルドが始まっているはずです）。

## 3. 動作確認

デプロイが完了したら、実際のサイトで以下を確認してください。

1.  **学生ログイン**:
    *   URL: `/student`
    *   初回: 学籍番号と氏名を入力 -> パスワード設定画面が出る -> 設定してログインできるか。
    *   2回目: パスワード入力画面が出る -> ログインできるか。
2.  **予約とカレンダー同期**:
    *   学生画面で予約を入れる。
    *   `nssu.scc@gmail.com` のGoogleカレンダーに予定が入るか確認。
    *   学生宛にメールが届くか確認。
3.  **CSV出力**:
    *   管理者画面 (`/admin/login`) にログイン。
    *   「学生管理」または「実績承認」タブで「CSV出力」ボタンを押し、ファイルがダウンロードできるか確認。

以上で作業は完了です。
