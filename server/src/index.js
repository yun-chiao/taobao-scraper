// Listio SaaS 後端主入口（Hono + @hono/node-server）
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { toApiError, notFound } from './lib/errors.js';
import { requireAuth } from './lib/auth.js';
import { authRoutes } from './routes/auth.js';
import { generateRoutes } from './routes/generate.js';
import { meRoutes } from './routes/me.js';
import { billingRoutes } from './routes/billing.js';
import { webhookRoutes } from './routes/webhooks.js';
import { telemetryRoutes } from './routes/telemetry.js';

export function createApp() {
  const app = new Hono();

  // CORS：允許 Chrome 擴充功能與官網
  app.use(
    '/v1/*',
    cors({
      origin: (origin) => {
        if (!origin) return config.appBaseUrl;
        if (origin === config.appBaseUrl) return origin;
        if (config.allowedOrigins.length === 0 && origin.startsWith('chrome-extension://')) return origin;
        if (config.allowedOrigins.includes(origin)) return origin;
        return null;
      },
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  // 健康檢查
  app.get('/v1/health', (c) => c.json({ ok: true, version: '2.0.0' }));

  // 金流 Webhooks（不需 Bearer JWT，使用各自簽章驗證）
  app.route('/v1/webhooks', webhookRoutes);

  // 匿名裝置帳號（免費方案不需註冊；不需 Bearer）
  app.route('/v1/auth', authRoutes);

  // 需要登入驗證的路由
  const authed = new Hono();
  authed.use('*', requireAuth());
  authed.route('/generate', generateRoutes);
  authed.route('/', meRoutes);
  authed.route('/billing', billingRoutes);
  authed.route('/telemetry', telemetryRoutes);
  app.route('/v1', authed);

  app.notFound(() => {
    throw notFound();
  });

  app.onError((err, c) => {
    const apiErr = toApiError(err);
    if (apiErr.status >= 500) {
      logger.error('unhandled_error', { code: apiErr.code, message: err?.message });
    }
    return c.json(apiErr.toBody(), apiErr.status, apiErr.headers);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info('server_started', { port: info.port });
  });
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
