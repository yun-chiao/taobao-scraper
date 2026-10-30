// POST /v1/telemetry：白名單事件收集（移除任何網址與敏感屬性）
import { Hono } from 'hono';
import { query } from '../lib/db.js';
import { config } from '../config.js';

const ALLOWLIST = new Set([
  'capture_ok',
  'selector_miss',
  'generate_ok',
  'generate_fail',
  'export_xlsx',
  'export_clipboard',
  'cover_download',
  'sheet_sync',
  'onboarding_done',
  'upgrade_click',
]);

export const telemetryRoutes = new Hono();

telemetryRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '');
  if (!ALLOWLIST.has(name)) return c.body(null, 204);

  const cleanProps = {};
  if (body?.props && typeof body.props === 'object') {
    for (const [k, v] of Object.entries(body.props)) {
      if (/url|token|key/i.test(k)) continue;
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) continue;
      cleanProps[k] = v;
    }
  }

  if (config.databaseUrl) {
    await query(`INSERT INTO telemetry_events (user_id, name, props) VALUES ($1, $2, $3::jsonb)`, [
      user?.id || null,
      name,
      JSON.stringify(cleanProps),
    ]).catch(() => {});
  }

  return c.body(null, 204);
});
