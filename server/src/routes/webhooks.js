// POST /v1/webhooks/stripe 與 POST /v1/webhooks/ecpay
import { Hono } from 'hono';
import Stripe from 'stripe';
import { config } from '../config.js';
import { query } from '../lib/db.js';
import { invalidRequest, notConfigured } from '../lib/errors.js';
import { verifyMacValue } from '../lib/ecpay.js';

export const webhookRoutes = new Hono();

webhookRoutes.post('/stripe', async (c) => {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    throw notConfigured('尚未設定 Stripe Webhook 金鑰');
  }
  const sig = c.req.header('stripe-signature');
  if (!sig) throw invalidRequest('缺少 Stripe-Signature 標頭');

  const rawBody = await c.req.text();
  const stripe = new Stripe(config.stripeSecretKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, config.stripeWebhookSecret);
  } catch (err) {
    throw invalidRequest(`Stripe 簽章驗證失敗：${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const userId = s.metadata?.userId || s.client_reference_id;
    const plan = s.metadata?.plan || 'pro';
    const subId = String(s.subscription || s.id);
    if (userId) {
      await query(`UPDATE users SET plan = $2, stripe_customer_id = $3 WHERE id = $1`, [
        userId,
        plan,
        String(s.customer || ''),
      ]);
      await query(
        `INSERT INTO subscriptions (user_id, provider, provider_sub_id, plan, status)
         VALUES ($1, 'stripe', $2, $3, 'active')
         ON CONFLICT (provider_sub_id) DO UPDATE
         SET plan = EXCLUDED.plan, status = 'active', updated_at = NOW()`,
        [userId, subId, plan],
      );
    }
  } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    const active = sub.status === 'active' || sub.status === 'trialing';
    const subRes = await query(
      `UPDATE subscriptions SET status = $2, updated_at = NOW() WHERE provider_sub_id = $1 RETURNING user_id, plan`,
      [sub.id, sub.status],
    );
    const row = subRes.rows[0];
    if (row) {
      await query(`UPDATE users SET plan = $2 WHERE id = $1`, [row.user_id, active ? row.plan : 'free']);
    }
  }

  return c.json({ received: true });
});

webhookRoutes.post('/ecpay', async (c) => {
  const form = await c.req.parseBody().catch(() => ({}));
  const params = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)]));

  if (!config.ecpayHashKey || !config.ecpayHashIv) {
    return c.text('0|MissingHashConfig', 501);
  }
  if (!verifyMacValue(params, config.ecpayHashKey, config.ecpayHashIv)) {
    return c.text('0|CheckMacValueError', 400);
  }

  const rtnCode = Number(params.RtnCode);
  const userId = params.CustomField1;
  const plan = params.CustomField2 || 'pro';
  const tradeNo = params.MerchantTradeNo;

  if (rtnCode === 1 && userId && tradeNo) {
    await query(`UPDATE users SET plan = $2 WHERE id = $1`, [userId, plan]).catch(() => {});
    await query(
      `INSERT INTO subscriptions (user_id, provider, provider_sub_id, plan, status)
       VALUES ($1, 'ecpay', $2, $3, 'active')
       ON CONFLICT (provider_sub_id) DO UPDATE SET status = 'active', updated_at = NOW()`,
      [userId, tradeNo, plan],
    ).catch(() => {});
  }

  return c.text('1|OK');
});
