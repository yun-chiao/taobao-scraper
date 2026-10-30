// 環境變數載入與檢核
import { DEFAULT_MODEL, FALLBACK_MODELS } from './shared/contract.js';

export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const cfg = {
    port: Number(env.PORT) || 8080,
    databaseUrl: env.DATABASE_URL || '',
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET || 'dev-secret-change-in-prod-minimum-32-chars',
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || DEFAULT_MODEL,
    geminiFallbackModels: env.GEMINI_FALLBACK_MODELS
      ? env.GEMINI_FALLBACK_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
      : [...FALLBACK_MODELS],
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    stripePricePro: env.STRIPE_PRICE_PRO || '',
    stripePriceStudio: env.STRIPE_PRICE_STUDIO || '',
    ecpayMerchantId: env.ECPAY_MERCHANT_ID || '',
    ecpayHashKey: env.ECPAY_HASH_KEY || '',
    ecpayHashIv: env.ECPAY_HASH_IV || '',
    allowedOrigins: (env.ALLOWED_EXTENSION_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    appBaseUrl: (env.APP_BASE_URL || 'https://listio.app').replace(/\/$/, ''),
    logLevel: env.LOG_LEVEL || 'info',
  };

  if (isProd) {
    for (const k of ['databaseUrl', 'supabaseJwtSecret', 'geminiApiKey']) {
      if (!cfg[k]) throw new Error(`Missing required production config: ${k}`);
    }
  }
  return cfg;
}

export const config = loadConfig();
