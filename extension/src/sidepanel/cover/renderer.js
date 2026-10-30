// Canvas 2D 商品首圖渲染器。純函式，可在 Node 下載入測試，不碰 chrome.*。
import { getTemplate } from './templates.js';

const FONT_STACKS = {
  sans: '"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif',
  serif: '"Noto Serif TC","Noto Serif CJK TC","Songti TC","PMingLiU",Georgia,serif',
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function paletteFor(brand) {
  const p = brand?.palette || {};
  return {
    bg: HEX_COLOR_RE.test(p.bg) ? p.bg : '#FFF9F3',
    fg: HEX_COLOR_RE.test(p.fg) ? p.fg : '#3A3A3A',
    accent: HEX_COLOR_RE.test(p.accent) ? p.accent : '#C9814B',
  };
}

function expandHex(hex) {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return clean;
}

export function contrastText(hex) {
  if (!HEX_COLOR_RE.test(hex || '')) return '#111111';
  const full = expandHex(hex);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.56 ? '#111111' : '#ffffff';
}

function hexToRgba(hex, alpha = 1) {
  const full = expandHex(HEX_COLOR_RE.test(hex || '') ? hex : '#000000');
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 中英混排自動換行與截斷：
 * - CJK 字元可單字切行
 * - 連續英數字／符號視為一個 token 盡量不拆開（除非單一 token 超寬）
 */
export function fitText(ctx, text, maxWidth, maxLines = 2, { ellipsis = '…' } = {}) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || maxLines <= 0) return [];

  // 切分成 token：連續 ASCII 英數字元 或 單一字元
  const tokens = normalized.match(/[A-Za-z0-9._-]+|\s|./gu) || [];
  const lines = [];
  let current = '';

  const widthOf = (s) => ctx.measureText(s).width;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk === ' ' && !current) continue;
    const candidate = current + tk;
    if (widthOf(candidate) <= maxWidth || !current) {
      // 若單一長英文 token 超寬，逐字元切開
      if (!current && widthOf(tk) > maxWidth && tk.length > 1) {
        for (const ch of tk) {
          if (widthOf(current + ch) <= maxWidth || !current) {
            current += ch;
          } else {
            lines.push(current.trim());
            current = ch;
          }
        }
      } else {
        current = candidate;
      }
    } else {
      lines.push(current.trim());
      current = tk === ' ' ? '' : tk;
    }
  }
  if (current.trim()) lines.push(current.trim());

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] + (lines[maxLines] || '');
  while (last.length > 0 && widthOf(last + ellipsis) > maxWidth) {
    last = Array.from(last).slice(0, -1).join('').trim();
  }
  kept[maxLines - 1] = last + ellipsis;
  return kept;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawImageFit(ctx, image, box, mode = 'cover', fallbackBrand = null, palette = null) {
  const { x, y, w, h } = box;
  const iw = image?.naturalWidth || image?.width || 0;
  const ih = image?.naturalHeight || image?.height || 0;

  if (!image || !iw || !ih) {
    ctx.fillStyle = palette ? hexToRgba(palette.accent, 0.14) : '#ece6dd';
    ctx.fillRect(x, y, w, h);
    const initial = Array.from(fallbackBrand?.name || 'L')[0] || 'L';
    ctx.save();
    ctx.fillStyle = palette ? palette.accent : '#888';
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.25)}px ${FONT_STACKS.sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x + w / 2, y + h / 2);
    ctx.restore();
    return;
  }

  const scale = mode === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;

  if (mode === 'contain') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
  }
  ctx.drawImage(image, dx, dy, dw, dh);
}

function stripBrandPrefix(title, brandName) {
  if (!title) return '';
  let s = title.trim();
  if (brandName && s.startsWith(brandName)) {
    s = s.slice(brandName.length).replace(/^\s*[｜|・-]\s*/, '');
  }
  return s.trim() || title.trim();
}

/**
 * 在指定 Canvas 2D Context 上繪製正方形商品首圖。
 */
export async function drawCover(
  ctx,
  { size = 800, template: tplOrId, brand = {}, image = null, title = '', watermark = false } = {},
) {
  const template = typeof tplOrId === 'object' && tplOrId?.id ? tplOrId : getTemplate(tplOrId);
  const palette = paletteFor(brand);
  const cleanTitle = stripBrandPrefix(title, brand?.name) || brand?.name || '精選單品';

  if (globalThis.document?.fonts?.load) {
    try {
      await Promise.race([
        globalThis.document.fonts.load(`700 36px ${FONT_STACKS[template.fontFamily || 'sans']}`),
        new Promise((r) => setTimeout(r, 250)),
      ]);
    } catch {
      // ignore font loading failures
    }
  }

  ctx.save();
  ctx.clearRect(0, 0, size, size);

  if (template.id === 'editorial') {
    drawEditorial(ctx, size, template, brand, palette, image, cleanTitle);
  } else if (template.id === 'polaroid') {
    drawPolaroid(ctx, size, template, brand, palette, image, cleanTitle);
  } else if (template.id === 'bold') {
    drawBold(ctx, size, template, brand, palette, image, cleanTitle);
  } else {
    drawBadgeClassic(ctx, size, template, brand, palette, image, cleanTitle);
  }

  if (watermark) {
    drawWatermark(ctx, size);
  }

  ctx.restore();
}

function drawBadgeClassic(ctx, S, tpl, brand, palette, image, title) {
  const L = tpl.layout;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, S, S);

  // 柔和放射高光
  const grad = ctx.createRadialGradient(
    S * L.highlight.cx,
    S * L.highlight.cy,
    S * 0.04,
    S * L.highlight.cx,
    S * L.highlight.cy,
    S * L.highlight.r,
  );
  grad.addColorStop(0, `rgba(255,255,255,${L.highlight.alpha})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // 商品圖框
  const fx = S * L.frame.x;
  const fy = S * L.frame.y;
  const fw = S * L.frame.w;
  const fh = S * L.frame.h;
  const fr = S * L.frame.radius;

  ctx.save();
  ctx.shadowColor = hexToRgba(palette.fg, 0.12);
  ctx.shadowBlur = S * L.frame.shadowBlur;
  ctx.shadowOffsetY = S * L.frame.shadowOffsetY;
  roundRectPath(ctx, fx, fy, fw, fh, fr);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, fx, fy, fw, fh, fr);
  ctx.clip();
  drawImageFit(ctx, image, { x: fx, y: fy, w: fw, h: fh }, 'cover', brand, palette);
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, fx, fy, fw, fh, fr);
  ctx.strokeStyle = hexToRgba(palette.accent, 0.35);
  ctx.lineWidth = S * L.frame.borderWidth;
  ctx.stroke();
  ctx.restore();

  // 左上圓形品牌徽章
  const bcx = S * L.badge.cx;
  const bcy = S * L.badge.cy;
  const br = S * L.badge.r;
  ctx.save();
  ctx.shadowColor = hexToRgba(palette.fg, 0.14);
  ctx.shadowBlur = S * 0.025;
  ctx.beginPath();
  ctx.arc(bcx, bcy, br, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(bcx, bcy, br - S * L.badge.ringInset, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(palette.accent, 0.65);
  ctx.lineWidth = S * L.badge.ringWidth;
  ctx.stroke();

  const badgeLines = String(brand?.badgeText || brand?.name || 'Brand')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);
  const bfs = Math.round(S * L.badge.fontSize);
  ctx.font = `${L.badge.weight} ${bfs}px ${FONT_STACKS.sans}`;
  ctx.fillStyle = palette.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const blh = bfs * L.badge.lineHeight;
  const startY = bcy - ((badgeLines.length - 1) * blh) / 2;
  badgeLines.forEach((ln, i) => ctx.fillText(ln, bcx, startY + i * blh));

  // 右上 tagline
  if (brand?.tagline) {
    const tfs = Math.round(S * L.tagline.fontSize);
    ctx.font = `${L.tagline.weight} ${tfs}px ${FONT_STACKS.sans}`;
    ctx.fillStyle = hexToRgba(palette.fg, L.tagline.alpha);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(brand.tagline, S * (1 - L.tagline.right), S * L.tagline.y);
  }

  // 底部霧面標題列
  const tx = S * L.titleBar.x;
  const ty = S * L.titleBar.y;
  const tw = S * L.titleBar.w;
  const th = S * L.titleBar.h;
  const tr = S * L.titleBar.radius;
  roundRectPath(ctx, tx, ty, tw, th, tr);
  ctx.fillStyle = `rgba(255,255,255,${L.titleBar.alpha})`;
  ctx.fill();
  ctx.strokeStyle = hexToRgba(palette.accent, 0.25);
  ctx.lineWidth = Math.max(1, S * 0.002);
  ctx.stroke();

  const fs = Math.round(S * L.titleBar.fontSize);
  ctx.font = `${L.titleBar.weight} ${fs}px ${FONT_STACKS.sans}`;
  ctx.fillStyle = '#2C2A28';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = fitText(ctx, title, tw - S * L.titleBar.paddingX * 2, L.titleBar.maxLines);
  const lh = fs * L.titleBar.lineHeight;
  const baseY = ty + th / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, tx + tw / 2, baseY + i * lh));
}

function drawEditorial(ctx, S, tpl, brand, palette, image, title) {
  const L = tpl.layout;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, S, S);

  const imgH = S * L.image.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, S, imgH);
  ctx.clip();
  drawImageFit(ctx, image, { x: 0, y: 0, w: S, h: imgH }, 'cover', brand, palette);
  ctx.restore();

  const pad = S * L.padding;
  const bFs = Math.round(S * L.brandName.fontSize);
  ctx.font = `${L.brandName.weight} ${bFs}px ${FONT_STACKS.sans}`;
  ctx.fillStyle = palette.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(brand?.name || 'BRAND').toUpperCase(), pad, S * L.brandName.y);

  // 短裝飾線
  ctx.fillStyle = palette.accent;
  ctx.fillRect(pad, S * L.rule.y, S * L.rule.w, Math.max(2, S * L.rule.h));

  // 襯線標題
  const tFs = Math.round(S * L.title.fontSize);
  ctx.font = `${L.title.weight} ${tFs}px ${FONT_STACKS.serif}`;
  ctx.fillStyle = palette.fg;
  const lines = fitText(ctx, title, S - pad * 2, L.title.maxLines);
  const lh = tFs * L.title.lineHeight;
  lines.forEach((ln, i) => ctx.fillText(ln, pad, S * L.title.y + i * lh));

  if (brand?.tagline) {
    const gFs = Math.round(S * L.tagline.fontSize);
    ctx.font = `${L.tagline.weight} ${gFs}px ${FONT_STACKS.sans}`;
    ctx.fillStyle = hexToRgba(palette.fg, L.tagline.alpha);
    ctx.textBaseline = 'bottom';
    ctx.fillText(brand.tagline, pad, S * (1 - L.tagline.bottom));
  }
}

function drawPolaroid(ctx, S, tpl, brand, palette, image, title) {
  const L = tpl.layout;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, S, S);

  const cw = S * L.card.w;
  const ch = S * L.card.h;
  const cx = S * L.card.x + cw / 2;
  const cy = S * L.card.y + ch / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((L.card.rotationDeg * Math.PI) / 180);

  // 拍立得白卡與陰影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.16)';
  ctx.shadowBlur = S * L.card.shadowBlur;
  ctx.shadowOffsetY = S * L.card.shadowOffsetY;
  roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, S * L.card.radius);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  const pad = S * L.card.padding;
  const imgSize = cw - pad * 2;
  const ix = -cw / 2 + pad;
  const iy = -ch / 2 + pad;

  ctx.save();
  roundRectPath(ctx, ix, iy, imgSize, imgSize, S * 0.008);
  ctx.clip();
  drawImageFit(ctx, image, { x: ix, y: iy, w: imgSize, h: imgSize }, 'cover', brand, palette);
  ctx.restore();

  // 右上品牌小膠囊
  const pillText = brand?.name || '精選';
  const pFs = Math.round(S * L.pill.fontSize);
  ctx.font = `${L.pill.weight} ${pFs}px ${FONT_STACKS.sans}`;
  const pw = ctx.measureText(pillText).width + S * L.pill.paddingX * 2;
  const ph = S * L.pill.height;
  const px = ix + imgSize - pw - S * L.pill.inset;
  const py = iy + S * L.pill.inset;
  roundRectPath(ctx, px, py, pw, ph, ph / 2);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.fillStyle = contrastText(palette.accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, px + pw / 2, py + ph / 2);

  // 相紙下方標題
  const tFs = Math.round(S * L.title.fontSize);
  ctx.font = `${L.title.italic ? 'italic ' : ''}${L.title.weight} ${tFs}px ${FONT_STACKS.sans}`;
  ctx.fillStyle = '#2B2927';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lines = fitText(ctx, title, imgSize, L.title.maxLines);
  const lh = tFs * L.title.lineHeight;
  const ty = iy + imgSize + S * L.title.offsetY;
  lines.forEach((ln, i) => ctx.fillText(ln, 0, ty + i * lh));

  ctx.restore();
}

function drawBold(ctx, S, tpl, brand, palette, image, title) {
  const L = tpl.layout;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, S, S);
  const onAccent = contrastText(palette.accent);

  // 右下圓角大圖
  const ix = S * L.image.x;
  const iy = S * L.image.y;
  const iw = S * L.image.w;
  const ir = S * L.image.radius;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = S * L.image.shadowBlur;
  ctx.shadowOffsetY = S * L.image.shadowOffsetY;
  roundRectPath(ctx, ix, iy, iw, iw, ir);
  ctx.fillStyle = palette.bg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, ix, iy, iw, iw, ir);
  ctx.clip();
  drawImageFit(ctx, image, { x: ix, y: iy, w: iw, h: iw }, 'cover', brand, palette);
  ctx.restore();

  roundRectPath(ctx, ix, iy, iw, iw, ir);
  ctx.strokeStyle = palette.bg;
  ctx.lineWidth = S * L.image.borderWidth;
  ctx.stroke();

  // 左上品牌 chip
  const chipText = brand?.name || 'BRAND';
  const cFs = Math.round(S * L.chip.fontSize);
  ctx.font = `${L.chip.weight} ${cFs}px ${FONT_STACKS.sans}`;
  const cw = ctx.measureText(chipText).width + S * L.chip.paddingX * 2;
  const ch = S * L.chip.height;
  const cx = S * L.chip.x;
  const cy = S * L.chip.y;
  roundRectPath(ctx, cx, cy, cw, ch, ch / 2);
  ctx.fillStyle = palette.bg;
  ctx.fill();
  ctx.fillStyle = palette.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(chipText, cx + cw / 2, cy + ch / 2);

  // 粗體大標 + 半透明底條
  const tFs = Math.round(S * L.title.fontSize);
  ctx.font = `${L.title.weight} ${tFs}px ${FONT_STACKS.sans}`;
  const lines = fitText(ctx, title, S * L.title.maxWidth - S * L.title.pillPaddingX * 2, L.title.maxLines);
  const lh = tFs * L.title.lineHeight;
  const tx = S * L.title.x;
  const ty = S * L.title.y;

  lines.forEach((ln, i) => {
    const w = ctx.measureText(ln).width + S * L.title.pillPaddingX * 2;
    const h = tFs * 1.28;
    const y = ty + i * lh;
    roundRectPath(ctx, tx, y, w, h, S * L.title.pillRadius);
    ctx.fillStyle = `rgba(0,0,0,${L.title.pillAlpha})`;
    ctx.fill();
    ctx.fillStyle = onAccent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ln, tx + S * L.title.pillPaddingX, y + h / 2);
  });

  // 左下 tagline
  if (brand?.tagline) {
    const gFs = Math.round(S * L.tagline.fontSize);
    ctx.font = `${L.tagline.weight} ${gFs}px ${FONT_STACKS.sans}`;
    ctx.fillStyle = onAccent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const gLines = fitText(ctx, brand.tagline, S * L.tagline.maxWidth, L.tagline.maxLines);
    const gLh = gFs * L.tagline.lineHeight;
    gLines.forEach((ln, idx) => {
      ctx.fillText(
        ln,
        S * L.tagline.x,
        S * (1 - L.tagline.bottom) - (gLines.length - 1 - idx) * gLh,
      );
    });
  }
}

function drawWatermark(ctx, S) {
  const fs = Math.max(11, Math.round(S * 0.018));
  ctx.save();
  ctx.font = `600 ${fs}px ${FONT_STACKS.sans}`;
  const label = 'Listio';
  const w = ctx.measureText(label).width + S * 0.024;
  const h = fs * 1.6;
  const x = S - w - S * 0.02;
  const y = S - h - S * 0.02;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}
