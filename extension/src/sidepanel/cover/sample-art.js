// 設定頁與初次引導共用的示範商品圖（純 Canvas 繪製，不需網路圖片）。
export function makePreviewOrnament(size = 400) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const k = size / 400;

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#F6F2EB');
  g.addColorStop(1, '#E5DDD0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#B89054';
  ctx.lineWidth = 22 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(175 * k, 200 * k, 68 * k, Math.PI * 0.2, Math.PI * 1.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(235 * k, 212 * k, 62 * k, Math.PI * 0.25, Math.PI * 1.8);
  ctx.stroke();
  return c;
}
