// 儲存層。純函式：接收一個 backend（chrome.storage.local 或記憶體物件），方便測試與 mock。
import { newUsage } from './contract.js';
import { defaultSettings, seedBrand } from './brands.js';

/** @typedef {import('./contract.js').Job} Job */
/** @typedef {import('./contract.js').Brand} Brand */
/** @typedef {import('./contract.js').Settings} Settings */
/** @typedef {import('./contract.js').Usage} Usage */

export const KEYS = {
  SCHEMA: 'schemaVersion',
  SETTINGS: 'settings',
  BRANDS: 'brands',
  JOBS: 'jobs',
  USAGE: 'usage', // Cloud 模式以後端回傳為準（本機為離線快取）；BYOK 模式僅作統計，不設上限
};

export const SCHEMA_VERSION = 3;
const MAX_JOBS = 50;

/**
 * @typedef {Object} StorageBackend
 * @property {(keys: string|string[]|null) => Promise<Record<string, any>>} get
 * @property {(items: Record<string, any>) => Promise<void>} set
 * @property {(keys: string|string[]) => Promise<void>} remove
 */

/** 記憶體 backend：給測試與 side panel 的 mock runtime 用。 */
export function memoryBackend(initial = {}) {
  const data = { ...initial };
  return {
    async get(keys) {
      if (keys == null) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
  };
}

/** chrome.storage.local → backend 介面（只在 background/options 裡呼叫）。 */
export function chromeBackend(area) {
  return {
    get: (keys) => area.get(keys),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

/** @param {StorageBackend} backend */
export function createStore(backend) {
  const store = {
    async init() {
      const { [KEYS.SCHEMA]: version } = await backend.get(KEYS.SCHEMA);
      if (version === SCHEMA_VERSION) return;
      await migrate(backend, version || 0);
    },

    /** @returns {Promise<Settings>} */
    async getSettings() {
      const { [KEYS.SETTINGS]: s } = await backend.get(KEYS.SETTINGS);
      return { ...defaultSettings(), ...(s || {}) };
    },

    /** @param {Partial<Settings>} patch */
    async setSettings(patch) {
      const next = { ...(await store.getSettings()), ...patch };
      await backend.set({ [KEYS.SETTINGS]: next });
      return next;
    },

    /** @returns {Promise<Brand[]>} */
    async listBrands() {
      const { [KEYS.BRANDS]: brands } = await backend.get(KEYS.BRANDS);
      return Array.isArray(brands) && brands.length ? brands : [seedBrand()];
    },

    /** @returns {Promise<Brand|null>} */
    async getBrand(id) {
      const brands = await store.listBrands();
      return brands.find((b) => b.id === id) || brands[0] || null;
    },

    /** @param {Brand} brand */
    async saveBrand(brand) {
      const brands = await store.listBrands();
      const idx = brands.findIndex((b) => b.id === brand.id);
      if (idx >= 0) brands[idx] = brand;
      else brands.push(brand);
      await backend.set({ [KEYS.BRANDS]: brands });
      return brand;
    },

    async deleteBrand(id) {
      const brands = (await store.listBrands()).filter((b) => b.id !== id);
      await backend.set({ [KEYS.BRANDS]: brands.length ? brands : [seedBrand()] });
      const settings = await store.getSettings();
      if (settings.activeBrandId === id) await store.setSettings({ activeBrandId: (brands[0] || seedBrand()).id });
    },

    /** @returns {Promise<Job[]>} 新到舊 */
    async listJobs(limit = MAX_JOBS) {
      const { [KEYS.JOBS]: jobs } = await backend.get(KEYS.JOBS);
      return (Array.isArray(jobs) ? jobs : []).slice(0, limit);
    },

    /** @returns {Promise<Job|null>} */
    async getJob(id) {
      return (await store.listJobs()).find((j) => j.id === id) || null;
    },

    /**
     * @param {Job} job
     * @param {{keepPosition?: boolean}} [opts] keepPosition：原地更新（例如存縮圖），不要把紀錄搬到列表最前面
     */
    async saveJob(job, opts = {}) {
      const existing = await store.listJobs();
      const pos = existing.findIndex((j) => j.id === job.id);
      let jobs;
      if (opts.keepPosition && pos >= 0) {
        jobs = existing.slice();
        jobs[pos] = job;
      } else {
        jobs = existing.filter((j) => j.id !== job.id);
        jobs.unshift(job);
      }
      // 首圖 dataUrl 很大，只保留最近 5 筆的，避免撐爆 storage.local（預設上限 10MB）；120px 的 coverThumb 很小，全部保留。
      const trimmed = jobs.slice(0, MAX_JOBS).map((j, i) =>
        i < 5 || !j.draft?.coverDataUrl ? j : { ...j, draft: { ...j.draft, coverDataUrl: null } },
      );
      await backend.set({ [KEYS.JOBS]: trimmed });
      return job;
    },

    async deleteJob(id) {
      const jobs = (await store.listJobs()).filter((j) => j.id !== id);
      await backend.set({ [KEYS.JOBS]: jobs });
    },

    /**
     * 用量快取。免費方案為終身累計（不隨月份重置）；付費方案的月重置由後端判定並透過 setUsage 覆寫。
     * @returns {Promise<Usage>}
     */
    async getUsage() {
      const { [KEYS.USAGE]: u } = await backend.get(KEYS.USAGE);
      if (!u || !u.period) {
        const fresh = newUsage({ plan: u?.plan, used: u?.used, limit: u?.limit, periodEnd: u?.periodEnd });
        await backend.set({ [KEYS.USAGE]: fresh });
        return fresh;
      }
      return u;
    },

    /** @returns {Promise<Usage>} */
    async bumpUsage() {
      const u = await store.getUsage();
      const next = { ...u, used: u.used + 1 };
      await backend.set({ [KEYS.USAGE]: next });
      return next;
    },

    /** @param {Usage} usage 由後端回傳時覆寫 */
    async setUsage(usage) {
      const normalized = newUsage(usage);
      await backend.set({ [KEYS.USAGE]: normalized });
      return normalized;
    },
  };
  return store;
}

/**
 * 版本遷移。
 * - v0/v1 = 舊版「淘寶抓圖小工具」沒有結構化資料，直接以預設值初始化。
 * - v2 → v3：預設連線方式改為雲端免費方案；從未填入金鑰的 BYOK 使用者自動切到雲端，用量改為終身累計。
 * @param {StorageBackend} backend
 */
async function migrate(backend, from) {
  if (from < 2) {
    const current = await backend.get(null);
    await backend.set({
      [KEYS.SETTINGS]: { ...defaultSettings(), ...(current[KEYS.SETTINGS] || {}) },
      [KEYS.BRANDS]: current[KEYS.BRANDS]?.length ? current[KEYS.BRANDS] : [seedBrand()],
      [KEYS.JOBS]: current[KEYS.JOBS] || [],
      [KEYS.SCHEMA]: SCHEMA_VERSION,
    });
    return;
  }
  if (from < 3) {
    const { [KEYS.SETTINGS]: s, [KEYS.USAGE]: u } = await backend.get([KEYS.SETTINGS, KEYS.USAGE]);
    const settings = { ...defaultSettings(), ...(s || {}) };
    if (s?.mode === 'byok' && !s.geminiApiKey) settings.mode = 'cloud';
    await backend.set({
      [KEYS.SETTINGS]: settings,
      [KEYS.USAGE]: newUsage({ plan: u?.plan, used: u?.used, limit: u?.limit, periodEnd: u?.periodEnd }),
      [KEYS.SCHEMA]: SCHEMA_VERSION,
    });
  }
}
