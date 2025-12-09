# 臨床実習予約システム - Supabaseセットアップガイド

## 1. Supabaseプロジェクト作成

1. [Supabase](https://supabase.com)にアクセスし、アカウントを作成
2. 「New Project」をクリック
3. プロジェクト名（例: `clinical-training`）とパスワードを設定
4. リージョンは「Northeast Asia (Tokyo)」を選択

## 2. 環境変数の設定

プロジェクト作成後、Settings → API から以下を取得：

`.env`ファイルをプロジェクトルートに作成：
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxx...
```

## 3. データベーステーブル作成

Supabase Dashboard → SQL Editor で以下を実行：

```sql
-- 学生テーブル
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_number VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  grade INTEGER NOT NULL CHECK (grade IN (1, 2, 3, 4)),
  training_type VARCHAR(5) NOT NULL CHECK (training_type IN ('I', 'II', 'IV')),
  auth_user_id UUID REFERENCES auth.users(id),
  password_set BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 実習枠テーブル
CREATE TABLE slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  training_type VARCHAR(5) NOT NULL CHECK (training_type IN ('I', 'II', 'IV')),
  max_capacity INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 予約テーブル
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  slot_id UUID REFERENCES slots(id) NOT NULL,
  status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  actual_minutes INTEGER,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, slot_id)
);

-- システム設定テーブル
CREATE TABLE settings (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL
);

-- 管理者テーブル
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  auth_user_id UUID REFERENCES auth.users(id),
  role VARCHAR(20) DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期設定
INSERT INTO settings (key, value) VALUES 
  ('training_config', '{"requiredMinutes": 1260, "minDailyMinutes": 60, "maxDailyMinutes": 480, "cancellationDeadlineHours": 12, "maxStudentsPerSlot": 5}');
```

## 4. Row Level Security (RLS) 設定

```sql
-- RLSを有効化
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ポリシー: 学生は自分のデータのみ読み取り可能
CREATE POLICY "Students can view own data" ON students
  FOR SELECT USING (auth.uid() = auth_user_id);

-- ポリシー: 認証済みユーザーは有効な実習枠を閲覧可能
CREATE POLICY "Authenticated users can view active slots" ON slots
  FOR SELECT USING (auth.role() = 'authenticated');

-- ポリシー: 学生は自分の予約を管理可能
CREATE POLICY "Students can manage own reservations" ON reservations
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

-- ポリシー: 認証済みユーザーは設定を閲覧可能
CREATE POLICY "Authenticated users can view settings" ON settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- ポリシー: 管理者は全データにアクセス可能
CREATE POLICY "Admins have full access to students" ON students
  FOR ALL USING (
    auth.uid() IN (SELECT auth_user_id FROM admins)
  );

CREATE POLICY "Admins have full access to slots" ON slots
  FOR ALL USING (
    auth.uid() IN (SELECT auth_user_id FROM admins)
  );

CREATE POLICY "Admins have full access to reservations" ON reservations
  FOR ALL USING (
    auth.uid() IN (SELECT auth_user_id FROM admins)
  );

CREATE POLICY "Admins can manage settings" ON settings
  FOR ALL USING (
    auth.uid() IN (SELECT auth_user_id FROM admins)
  );
```

## 5. 初期管理者の作成

1. Authentication → Users → 「Add User」
2. メールアドレスとパスワードを設定
3. 作成されたユーザーのUUIDをコピー
4. SQL Editorで以下を実行（UUIDを置き換え）：

```sql
INSERT INTO admins (email, name, auth_user_id)
VALUES ('admin@example.com', '管理者', 'ここにユーザーUUID');
```

## 6. メール設定

Authentication → Settings → Email Templates でカスタマイズ可能：
- Confirm signup: パスワード設定リンク
- Redirect URL: `https://your-domain.com/student/set-password`

## 7. ローカル開発

```bash
cd clinical-training-system
npm install
npm run dev
```

## Edge Functions

### send-booking-email
This function sends an email notification to the student when a reservation is confirmed.

1. **Deploy the function:**
   ```bash
   supabase functions deploy send-booking-email
   ```

2. **Set Secrets:**
   You need a Resend API Key.
   ```bash
   supabase secrets set RESEND_API_KEY=re_123456789
   ```

## Deployment

1. **Build the frontend:**
   ```bash
   npm run build
   ```

2. **Deploy the `dist` folder** to your hosting provider (Vercel, Netlify, etc.).
