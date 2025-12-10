/**
 * 臨床実習予約システム - メール送信スクリプト (GAS)
 * 
 * 使用方法:
 * 1. Google Apps Script (script.google.com) で新しいプロジェクトを作成
 * 2. このコードを貼り付け
 * 3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
 * 4. アクセス権限: 「全員」に設定
 * 5. デプロイURLをReactアプリに設定
 */

// POSTリクエストを処理
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    const to = data.to;
    const subject = data.subject;
    const body = data.body;
    
    if (!to || !subject || !body) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: '必須パラメータが不足しています'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // メール送信
    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: body
    });
    
    // ログ記録
    console.log(`Email sent to: ${to}, Subject: ${subject}`);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'メールを送信しました'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Error:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// GETリクエスト（テスト用）
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: '臨床実習予約システム メールサービス',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// テスト関数
function testSendEmail() {
  const testData = {
    to: 'nssu.kenkyu@gmail.com', // テスト用の自分のメールアドレス
    subject: '【テスト】臨床実習予約システム',
    body: '<p>これはテストメールです。</p><p>システムが正常に動作しています。</p>'
  };
  
  MailApp.sendEmail({
    to: testData.to,
    subject: testData.subject,
    htmlBody: testData.body
  });
  
  console.log('Test email sent successfully');
}
