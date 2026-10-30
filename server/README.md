# Listio Cloud SaaS 後端 (`server/`)

這是一個專為 Listio Chrome 擴充功能設計的輕量級 SaaS 後端（Node 20 + Hono + PostgreSQL + Stripe / 綠界 ECPay），可直接部署至 Google Cloud Run、Fly.io 或 Railway。

## 為什麼收費版需要這個後端？
1. **保護商業機密（Prompt IP）與 API Key**：將多模態電商 Prompt 與 Gemini 金鑰保存在伺服器端，前端無法透過 DevTools 偷看或盜刷。
2. **精準計量與防刷（Metering & Rate Limiting）**：以 PostgreSQL 交易（Transaction）管理額度——免費方案為**終身 10 件**（跨月累計，不重置），Pro／Studio 為每月額度——並於 AI 成功回應後才扣點（失敗不扣額度）。免費方案不需註冊：`POST /v1/auth/anonymous` 以裝置識別碼核發匿名 JWT（見 `src/lib/anon.js`）。
3. **隱私優先設計**：`generations` 資料表只記錄 Token 用量與延遲毫秒數，**不儲存賣家的商品標題、圖片與文案內容**。

## 快速啟動

```bash
cd server
cp .env.example .env
# 1. 初始化 PostgreSQL (可使用 Supabase 免費專案)
psql "$DATABASE_URL" -f schema.sql

# 2. 同步前後端共用契約並啟動
npm run sync-contract
npm run dev
```

## 部署至 Cloud Run

```bash
cd server
npm run sync-contract
gcloud run deploy listio-api \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,GEMINI_MODEL=gemini-3-flash-preview"
```
