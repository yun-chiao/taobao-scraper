// POST /v1/billing/checkout 與 POST /v1/billing/portal
import { Hono } from 'hono';
import Stripe from 'stripe';
import { config } from '../config.js';
import { invalidRequest, notConfigured } from '../lib/errors.js';
import { query } from '../lib/db.js';

export const billingRoutes = new Hono();

function getStripe() {
  if (!config.stripeSecretKey) {
    throw notConfigured('伺服器尚未設定 STRIPE_SECRET_KEY');
  }
  return new Stripe(config.stripeSecretKey);
}

billingRoutes.post('/checkout', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const plan = body?.plan;
  const provider = body?.provider || 'stripe';

  if (plan !== 'pro' && plan !== 'studio') {
    throw invalidRequest('plan 必須為 pro 或 studio');
  }

  if (provider === 'ecpay') {
    // 台灣綠界定期定額（PeriodType=M, Frequency=1）需搭配正式特店代號與前端自動送出表單頁
    throw notConfigured(
      '綠界 ECPay 信用卡定期定額需設定正式 ECPAY_MERCHANT_ID 與 ReturnURL（驗簽邏輯已實作於 lib/ecpay.js）',
    );
  }

  const stripe = getStripe();
  const priceId = plan === 'pro' ? config.stripePricePro : config.stripePriceStudio;
  if (!priceId) throw notConfigured(`尚未設定 ${plan.toUpperCase()} 的 Stripe Price ID`);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email || undefined,
    client_reference_id: user.id,
    metadata: { userId: user.id, plan },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${config.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appBaseUrl}/billing/cancel`,
  });

  return c.json({ url: session.url });
});

billingRoutes.post('/portal', async (c) => {
  const user = c.get('user');
  const stripe = getStripe();

  const res = await query(`SELECT stripe_customer_id FROM users WHERE id = $1`, [user.id]);
  const customerId = res.rows[0]?.stripe_customer_id;
  if (!customerId) throw invalidRequest('找不到此帳號的 Stripe 訂閱紀錄');

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.appBaseUrl}/account`,
  });

  return c.json({ url: portal.url });
});
