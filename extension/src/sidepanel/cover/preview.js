import { TEMPLATES } from './templates.js';
import { drawCover } from './renderer.js';

function makeSampleJewelImage() {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 600;
  const ctx = c.getContext('2d');

  // 柔和米白工作室光影底圖
  const bg = ctx.createRadialGradient(220, 180, 40, 300, 300, 420);
  bg.addColorStop(0, '#FDFBF8');
  bg.addColorStop(0.6, '#F2EAE0');
  bg.addColorStop(1, '#E3D5C5');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 600, 600);

  // 柔和布紋陰影
  ctx.fillStyle = 'rgba(180,150,120,0.12)';
  ctx.beginPath();
  ctx.ellipse(320, 460, 190, 48, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // 金屬拉絲幾何耳環（雙環立體效果）
  ctx.save();
  ctx.translate(300, 290);
  ctx.shadowColor = 'rgba(90,65,40,0.28)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 18;

  const gold = ctx.createLinearGradient(-120, -140, 130, 140);
  gold.addColorStop(0, '#DFC196');
  gold.addColorStop(0.35, '#FFF3DF');
  gold.addColorStop(0.7, '#B88B52');
  gold.addColorStop(1, '#8F6836');

  ctx.strokeStyle = gold;
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 20, 118, Math.PI * 0.18, Math.PI * 1.82);
  ctx.stroke();

  // 上方圓珠耳針
  const pearl = ctx.createRadialGradient(-10, -108, 4, 0, -100, 36);
  pearl.addColorStop(0, '#FFFFFF');
  pearl.addColorStop(0.7, '#F5ECE2');
  pearl.addColorStop(1, '#C9B5A0');
  ctx.fillStyle = pearl;
  ctx.beginPath();
  ctx.arc(0, -100, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return c;
}

const BRANDS = {
  mimi: {
    name: 'Mimi 飾物所',
    badgeText: 'Mimi\n飾物所',
    tagline: '溫柔日常的手作飾品',
    palette: { bg: '#FFF9F3', fg: '#4A4A4A', accent: '#C9814B' },
  },
  bold: {
    name: 'NOIR ATELIER',
    badgeText: 'NOIR\nSTUDIO',
    tagline: '極簡結構金屬選物',
    palette: { bg: '#F4F1EA', fg: '#151E2E', accent: '#1E3A5F' },
  },
};

async function renderAll() {
  const params = new URLSearchParams(location.search);
  const brandKey = params.get('brand') === 'bold' ? 'bold' : 'mimi';
  const brand = BRANDS[brandKey];
  document.getElementById('brandLabel').textContent = `品牌：${brand.name}（色票 ${brand.palette.bg} / ${brand.palette.accent}）`;

  const img = makeSampleJewelImage();
  const title = 'Mimi 飾物所｜【輕奢】流動幾何・極簡拉絲耳釘 冷淡風小眾設計';
  const grid = document.getElementById('grid');

  for (const tpl of TEMPLATES) {
    const wrap = document.createElement('div');
    wrap.className = 'item';
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const cap = document.createElement('div');
    cap.className = 'caption';
    cap.innerHTML = `<strong>${tpl.name}</strong><span class="muted">${tpl.description}</span>`;
    wrap.append(canvas, cap);
    grid.appendChild(wrap);
    await drawCover(canvas.getContext('2d'), { size: 800, template: tpl, brand, image: img, title });
  }
  window.__coversReady = true;
}

renderAll();
