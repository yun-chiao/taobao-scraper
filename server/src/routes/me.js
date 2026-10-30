// GET /v1/me 與 GET /v1/usage
import { Hono } from 'hono';
import { getPool } from '../lib/db.js';
import { getUsage } from '../lib/metering.js';

export const meRoutes = new Hono();

meRoutes.get('/me', async (c) => {
  const user = c.get('user');
  const usage = await getUsage(getPool(), user.id);
  return c.json({
    user: { id: user.id, email: user.email },
    plan: usage.plan,
    usage,
  });
});

meRoutes.get('/usage', async (c) => {
  const user = c.get('user');
  const usage = await getUsage(getPool(), user.id);
  return c.json(usage);
});
