// 蝦皮賣家中心（seller.shopee.tw/portal/product/new）自動填表與自動塞圖腳本。
// 透過原生屬性 setter 與 DataTransfer 觸發蝦皮後台 Vue/React 表單狀態更新，無須申請 Shopee Open API 或綁定帳密。

const MAX_WAIT_MS = 12000;

/**
 * 將 base64 Data URL 轉為瀏覽器 File 物件。
 * @param {Window} win
 * @param {{filename:string, mimeType?:string, dataUrl:string}} img
 */
export function dataUrlToFile(win, img) {
  const comma = img.dataUrl.indexOf(',');
  const meta = comma >= 0 ? img.dataUrl.slice(0, comma) : '';
  const b64 = comma >= 0 ? img.dataUrl.slice(comma + 1) : img.dataUrl;
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = img.mimeType || mimeMatch?.[1] || 'image/jpeg';
  const binary = win.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new win.File([bytes], img.filename || 'product.jpg', { type: mime });
}

/**
 * 以原生 prototype setter 寫入欄位值並派發 input/change/blur，確保 Vue/React 受控元件同步更新。
 * @param {Window} win
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLElement} el
 * @param {string|number} val
 */
export function setControlledValue(win, el, val) {
  if (!el) return false;
  const str = String(val ?? '');
  if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
    el.focus?.();
    el.textContent = str;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    el.dispatchEvent(new win.Event('blur', { bubbles: true }));
    return true;
  }

  const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement?.prototype : win.HTMLInputElement?.prototype;
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
  el.focus?.();
  if (descriptor?.set) {
    descriptor.set.call(el, str);
  } else {
    el.value = str;
  }
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  el.dispatchEvent(new win.Event('blur', { bubbles: true }));
  return true;
}

/**
 * 依據顯式屬性、placeholder 或表單列標籤文字尋找輸入框。
 */
function findField(doc, { attrName, placeholders = [], labels = [], tag = 'input' }) {
  if (attrName) {
    const direct = doc.querySelector(`[data-shopee-field="${attrName}"]`);
    if (direct) return direct;
  }
  const candidates = Array.from(doc.querySelectorAll(tag));
  for (const re of placeholders) {
    const hit = candidates.find((el) => re.test(el.getAttribute('placeholder') || ''));
    if (hit) return hit;
  }
  // 透過鄰近表單列 label 文字尋找（相容蝦皮 eds-form-item / product-edit-form-item）
  const labelNodes = Array.from(
    doc.querySelectorAll('label, .eds-form-item__label, .product-edit-form-item-label, [class*="label"]'),
  );
  for (const labelRe of labels) {
    const lbl = labelNodes.find((n) => labelRe.test((n.textContent || '').trim()));
    if (!lbl) continue;
    const container =
      lbl.closest('.eds-form-item, .product-edit-form-item, [class*="form-item"], [class*="row"], section, div') ||
      lbl.parentElement;
    const input = container?.querySelector(tag);
    if (input) return input;
  }
  return null;
}

/**
 * 將圖片陣列轉為 File 並注入蝦皮 `<input type="file">` 上傳元件。
 */
function injectProductImages(doc, win, images = []) {
  if (!images.length) return 0;
  const fileInputs = Array.from(doc.querySelectorAll('input[type="file"]'));
  const imgInput =
    doc.querySelector('input[type="file"][data-shopee-field="images"]') ||
    fileInputs.find((el) => /image|\*/i.test(el.getAttribute('accept') || '') && el.multiple) ||
    fileInputs.find((el) => /image/i.test(el.getAttribute('accept') || '')) ||
    fileInputs[0];

  if (!imgInput || typeof win.DataTransfer !== 'function' || typeof win.File !== 'function') {
    return 0;
  }

  const dt = new win.DataTransfer();
  let added = 0;
  for (const img of images.slice(0, 9)) {
    try {
      dt.items.add(dataUrlToFile(win, img));
      added += 1;
    } catch {
      // 忽略單張解析失敗
    }
  }
  if (!added) return 0;

  imgInput.files = dt.files;
  imgInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  return added;
}

/**
 * 設定較長備貨開關與天數。
 */
function applyPreOrder(doc, win, daysToShip) {
  const isPreOrder = Number(daysToShip) > 2;
  const preRadio = doc.querySelector(`[data-shopee-preorder="${isPreOrder ? 'yes' : 'no'}"]`);
  if (preRadio) {
    preRadio.click?.();
  } else {
    // 在較長備貨區塊中尋找「是」或「較長備貨」radio label
    const labels = Array.from(doc.querySelectorAll('label, [class*="radio"]'));
    const target = labels.find((el) => {
      const txt = (el.textContent || '').trim();
      return isPreOrder ? /^(是|較長備貨|需要)/.test(txt) : /^(否|非較長備貨)/.test(txt);
    });
    target?.click?.();
  }

  if (isPreOrder) {
    const daysInput = findField(doc, {
      attrName: 'daysToShip',
      placeholders: [/天數|出貨天數|7\s*[-~]\s*20/],
      labels: [/出貨天數|備貨天數|需要.*天/],
      tag: 'input',
    });
    if (daysInput) setControlledValue(win, daysInput, daysToShip);
  }
}

function showFloatingNotice(doc, summary) {
  doc.getElementById('listio-autofill-banner')?.remove();
  const bar = doc.createElement('div');
  bar.id = 'listio-autofill-banner';
  bar.setAttribute(
    'style',
    [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:999999',
      'max-width:340px',
      'background:#18181b',
      'color:#ffffff',
      'padding:12px 15px',
      'border-radius:8px',
      'box-shadow:0 10px 28px rgba(0,0,0,0.18)',
      'font:13px/1.55 -apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif',
    ].join(';'),
  );
  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
      <strong style="font-size:13.5px;">已自動帶入商品圖文與售價</strong>
      <button id="listio-banner-close" style="background:none;border:0;color:#a1a1aa;cursor:pointer;font-size:16px;line-height:1;">×</button>
    </div>
    <div style="color:#d4d4d8;font-size:12px;">
      已填入 ${summary.uploadedImages} 張圖片、標題、描述與價格（NT$${summary.price || '—'}）。請確認「<strong>商品分類</strong>」後即可點選儲存上架。
    </div>
  `;
  doc.body.appendChild(bar);
  bar.querySelector('#listio-banner-close')?.addEventListener('click', () => bar.remove());
}

/**
 * 對已載入的蝦皮新增商品表單執行填寫（純 DOM 操作，可直接單元測試）。
 * @param {Document} doc
 * @param {Window} win
 * @param {Object} payload
 */
export function fillShopeeProductForm(doc, win, payload) {
  const filled = {
    title: false,
    description: false,
    price: false,
    stock: false,
    sku: false,
    uploadedImages: 0,
  };

  filled.uploadedImages = injectProductImages(doc, win, payload.images || []);

  const titleInput = findField(doc, {
    attrName: 'title',
    placeholders: [/商品名稱|請輸入商品名稱/],
    labels: [/^[\s*]*商品名稱/],
    tag: 'input',
  });
  if (titleInput && payload.title) {
    filled.title = setControlledValue(win, titleInput, payload.title);
  }

  const descField =
    findField(doc, {
      attrName: 'description',
      placeholders: [/商品描述|請輸入商品描述/],
      labels: [/^[\s*]*商品描述/],
      tag: 'textarea',
    }) ||
    findField(doc, {
      attrName: 'description',
      placeholders: [],
      labels: [/^[\s*]*商品描述/],
      tag: '[contenteditable="true"]',
    });
  if (descField && payload.description) {
    filled.description = setControlledValue(win, descField, payload.description);
  }

  const priceInput = findField(doc, {
    attrName: 'price',
    placeholders: [/請輸入價格|^價格$|NT\$/],
    labels: [/^[\s*]*價格$/],
    tag: 'input',
  });
  if (priceInput && payload.price != null) {
    filled.price = setControlledValue(win, priceInput, payload.price);
  }

  const stockInput = findField(doc, {
    attrName: 'stock',
    placeholders: [/商品數量|庫存|請輸入數量/],
    labels: [/商品數量|庫存/],
    tag: 'input',
  });
  if (stockInput && payload.stock != null) {
    filled.stock = setControlledValue(win, stockInput, payload.stock);
  }

  const skuInput = findField(doc, {
    attrName: 'parentSku',
    placeholders: [/主商品貨號|貨號/],
    labels: [/主商品貨號/],
    tag: 'input',
  });
  if (skuInput && payload.parentSku) {
    filled.sku = setControlledValue(win, skuInput, payload.parentSku);
  }

  if (payload.daysToShip != null) {
    applyPreOrder(doc, win, payload.daysToShip);
  }

  if (!payload.silentBanner && doc.body) {
    showFloatingNotice(doc, { uploadedImages: filled.uploadedImages, price: payload.price });
  }

  return filled;
}

/**
 * 等待蝦皮 SPA 表單渲染完成後執行自動填表（供 service worker 注入呼叫）。
 */
export async function runShopeeAutofill(payload, doc = document, win = window) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const ready =
      doc.querySelector('[data-shopee-field="title"]') ||
      doc.querySelector('input[placeholder*="商品名稱"]') ||
      doc.querySelector('textarea');
    if (ready) break;
    await new Promise((r) => setTimeout(r, 350));
  }
  // 多等一小拍讓圖片上傳元件綁定完事件
  await new Promise((r) => setTimeout(r, 300));
  return fillShopeeProductForm(doc, win, payload);
}
