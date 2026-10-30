// 從擷取結果與品牌設定建立初始草稿。純函式。
import { SHOPEE_TITLE_MAX, SHOPEE_MAX_IMAGES, newPriceDraft } from './contract.js';
import { computePrice } from './pricing.js';

/**
 * @param {import('./contract.js').Product} product
 * @param {import('./contract.js').Brand} brand
 * @returns {import('./contract.js').Draft}
 */
export function initialDraft(product, brand) {
  const count = Math.min(SHOPEE_MAX_IMAGES, product.images.length);
  return {
    title: `${brand.name}｜${product.title}`.slice(0, SHOPEE_TITLE_MAX),
    description: '',
    tags: [],
    selectedImages: Array.from({ length: count }, (_, i) => i),
    coverImageIndex: 0,
    coverTemplateId: brand.coverTemplateId,
    coverDataUrl: null,
    price: computePrice(newPriceDraft(brand.pricing, product.price?.amount ?? null)),
    daysToShip: brand.defaults.daysToShip,
    categoryId: brand.defaults.categoryId,
    stock: brand.defaults.stock,
    weightKg: brand.defaults.weightKg,
  };
}
