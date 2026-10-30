-- Listio SaaS PostgreSQL Schema (Supabase / Cloud SQL)

-- monthly_limit 對 free 方案的語意是「終身累計上限」（由 shared/contract.js 的 PLAN_PERIOD 決定），
-- pro / studio 才是每月重置。欄位名稱保留以免破壞既有資料。
CREATE TABLE IF NOT EXISTS plans (
  plan TEXT PRIMARY KEY,
  monthly_limit INT NOT NULL,
  price_twd INT NOT NULL
);

INSERT INTO plans (plan, monthly_limit, price_twd) VALUES
  ('free', 10, 0),
  ('pro', 150, 390),
  ('studio', 600, 990)
ON CONFLICT (plan) DO UPDATE
  SET monthly_limit = EXCLUDED.monthly_limit,
      price_twd = EXCLUDED.price_twd;

-- 匿名裝置帳號：免費方案不需註冊，id 由擴充功能的 deviceId 以 UUID v5 推導（見 lib/anon.js）。
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' REFERENCES plans(plan),
  stripe_customer_id TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'ecpay')),
  provider_sub_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL REFERENCES plans(plan),
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period_start)
);

-- 不儲存商品標題與文案內容，兼顧用戶隱私與商業機密
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_name TEXT,
  site TEXT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  latency_ms INT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generations_user_created ON generations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
