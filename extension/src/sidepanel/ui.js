// 無框架的 UI 工具：HTML 樣板、icon、toast、menu、modal。
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function formatVal(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(formatVal).join('');
  if (v instanceof Raw) return v.value;
  return esc(v);
}

/** 樣板字串 tag：自動跳脫一般字串插值；巢狀 html`...` 或 raw() 不跳脫；陣列遞迴展開。回傳 Raw（具備 toString()）。 */
export function html(strings, ...values) {
  const joined = strings.reduce((out, str, i) => out + formatVal(values[i - 1]) + str);
  return new Raw(joined);
}
class Raw {
  constructor(value) {
    this.value = String(value ?? '');
  }
  toString() {
    return this.value;
  }
}
export const raw = (v) => (v instanceof Raw ? v : new Raw(v));

const ICONS = {
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3v18"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/><path d="M9 12h6"/><path d="M9 16h4"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.6 11.4a1 1 0 0 0 1 .6h8.8a1 1 0 0 0 1-.7L21 8H6"/>',
  tag: '<path d="M20 12l-8 8-9-9V4h7z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  wand: '<path d="M4 20l10-10"/><path d="M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M9.5 10h3.5a1.5 1.5 0 0 1 0 3H10a1.5 1.5 0 0 0 0 3h4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bolt: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  drag: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
};

export function icon(name, cls = '') {
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`,
  );
}

/**
 * Toast。可選 action：{ label, onClick } 會在右側顯示一個可點的文字按鈕（例如「還原」）。
 * 有 action 或錯誤類的 toast 可以點擊關閉。
 */
export function toast(message, kind = 'default', ms = 2600, action = null) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}${action || kind === 'danger' ? ' is-interactive' : ''}`;
  el.innerHTML = html`${kind === 'success' ? icon('check') : kind === 'danger' ? icon('warn') : ''}<span class="toast-msg">${message}</span>${
    action ? html`<button class="toast-action" type="button">${action.label}</button>` : ''
  }`;
  host.appendChild(el);
  let timer = setTimeout(() => el.remove(), ms);
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(timer);
      el.remove();
      action.onClick?.();
    });
  }
  if (action || kind === 'danger') {
    el.addEventListener('click', () => {
      clearTimeout(timer);
      el.remove();
    });
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => {
      timer = setTimeout(() => el.remove(), 1600);
    });
  }
  return () => {
    clearTimeout(timer);
    el.remove();
  };
}

/** 以 anchor 元素為基準開一個選單；點擊外面關閉。items: [{label, icon?, active?, onClick, danger?}, 'sep'] */
export function openMenu(anchor, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu fade-in';
  menu.id = 'activeMenu';
  menu.innerHTML = items
    .map((it, i) =>
      it === 'sep'
        ? '<div class="menu-sep"></div>'
        : html`<button class="menu-item ${it.active ? 'is-active' : ''}" data-i="${i}" style="${it.danger ? 'color:var(--c-danger)' : ''}">${it.icon ? icon(it.icon) : ''}<span>${it.label}</span></button>`,
    )
    .join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.top = `${Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeMenu();
    items[Number(b.dataset.i)].onClick?.();
  });
  setTimeout(() => document.addEventListener('pointerdown', onOutside, { once: true }), 0);
  function onOutside(e) {
    if (!menu.contains(e.target)) closeMenu();
    else document.addEventListener('pointerdown', onOutside, { once: true });
  }
}
export function closeMenu() {
  document.getElementById('activeMenu')?.remove();
}

/** 底部彈窗。content 為 HTML 字串；回傳 close()。 */
export function openModal(content, { onMount } = {}) {
  closeModal();
  const host = document.getElementById('overlay');
  host.innerHTML = html`<div class="modal-backdrop" id="modalBackdrop"><div class="modal" role="dialog" aria-modal="true">${raw(content)}</div></div>`;
  host.querySelector('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
  onMount?.(host.querySelector('.modal'));
  return closeModal;
}
export function closeModal() {
  document.getElementById('overlay').innerHTML = '';
}

export const debounce = (fn, ms = 400) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}

/** 字數：蝦皮以字元計（中英文都算 1）。 */
export const charCount = (s) => Array.from(s || '').length;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const okCopy = document.execCommand('copy');
    ta.remove();
    return okCopy;
  }
}

/** 保留輸入焦點與 <details> 展開狀態的重新渲染。 */
export function renderInto(root, htmlString) {
  const active = document.activeElement;
  const id = active?.id;
  let sel = null;
  if (active && 'selectionStart' in active) {
    try {
      sel = [active.selectionStart, active.selectionEnd];
    } catch {
      sel = null;
    }
  }
  const openDetailsIds = Array.from(root.querySelectorAll('details[open][id]')).map((d) => d.id);
  const scroll = root.scrollTop;
  root.innerHTML = htmlString;
  for (const did of openDetailsIds) {
    const d = document.getElementById(did);
    if (d && d.tagName === 'DETAILS') d.open = true;
  }
  root.scrollTop = scroll;
  if (id) {
    const next = document.getElementById(id);
    if (next && next !== document.activeElement) {
      next.focus({ preventScroll: true });
      if (sel && 'setSelectionRange' in next) {
        try {
          next.setSelectionRange(sel[0], sel[1]);
        } catch {
          /* number inputs 不支援 */
        }
      }
    }
  }
}
