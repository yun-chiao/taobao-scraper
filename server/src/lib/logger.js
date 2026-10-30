// 極簡結構化 JSON logger：一行一個 JSON 物件，Cloud Run / Cloud Logging 會自動解析 `severity`。
// 不依賴任何套件；可注入 write 以便測試。

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const SEVERITY = Object.freeze({ debug: 'DEBUG', info: 'INFO', warn: 'WARNING', error: 'ERROR' });

/**
 * @typedef {Object} Logger
 * @property {(msg: string, fields?: Record<string, unknown>) => void} debug
 * @property {(msg: string, fields?: Record<string, unknown>) => void} info
 * @property {(msg: string, fields?: Record<string, unknown>) => void} warn
 * @property {(msg: string, fields?: Record<string, unknown>) => void} error
 * @property {(fields: Record<string, unknown>) => Logger} child 帶固定欄位的子 logger
 * @property {string} level
 */

/** Error 物件無法直接 JSON.stringify，攤平成可讀欄位。 */
function serializeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: /** @type {any} */ (value).code,
      stack: value.stack,
      cause: value.cause instanceof Error ? serializeValue(value.cause) : value.cause,
    };
  }
  return value;
}

function serializeFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(fields)) out[key] = serializeValue(value);
  return out;
}

/**
 * @param {{ level?: string, base?: Record<string, unknown>, write?: (line: string) => void, now?: () => Date }} [opts]
 * @returns {Logger}
 */
export function createLogger(opts = {}) {
  const level = LEVELS[opts.level] ? opts.level : 'info';
  const threshold = LEVELS[level];
  const base = opts.base ?? {};
  const write = opts.write ?? ((line) => process.stdout.write(line + '\n'));
  const now = opts.now ?? (() => new Date());

  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < threshold) return;
    const record = { time: now().toISOString(), severity: SEVERITY[lvl], level: lvl, msg, ...base, ...serializeFields(fields) };
    write(JSON.stringify(record));
  };

  return {
    level,
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (fields) => createLogger({ ...opts, level, base: { ...base, ...fields } }),
  };
}

/** 測試或未注入 logger 時使用：什麼都不輸出。 */
export const silentLogger = createLogger({ write: () => {} });

/** 伺服器預設 logger（層級由 LOG_LEVEL 環境變數決定；這裡不 import config.js 以避免循環依賴）。 */
export const logger = createLogger({ level: process.env.LOG_LEVEL || 'info', base: { service: 'listio-api' } });
