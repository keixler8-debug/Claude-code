/* Pequeños ayudantes de DOM. Sin framework: solo lo justo. */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, val] of Object.entries(value)) {
        // Object.assign no vale: las variables CSS (--algo) solo entran por setProperty.
        if (prop.startsWith('--')) node.style.setProperty(prop, val);
        else node.style[prop] = val;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function icon(path, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
  svg.innerHTML = path;
  return svg;
}

export const ICONS = {
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  pencil: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  today: '<circle cx="12" cy="12" r="4"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5L16.5 11"/><path d="M4 19h16"/>',
  repeat: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
};

export const COLORS = ['blue', 'violet', 'green', 'orange', 'pink', 'teal', 'gray'];

export function colorVar(name) {
  return `var(--c-${COLORS.includes(name) ? name : 'blue'})`;
}

/* ---- Toasts ---- */

export function toast(message, kind = '') {
  const root = document.getElementById('toast-root');
  const node = el('div', { class: 'toast ' + kind, text: message });
  root.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 260);
  }, 2600);
}

/* ---- Hoja modal ---- */

let closeCurrentSheet = null;

export function openSheet(build) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  const backdrop = el('div', { class: 'sheet-backdrop' }, [sheet]);

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });

  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);

  closeCurrentSheet = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    document.body.style.overflow = '';
    closeCurrentSheet = null;
  };

  build(sheet, closeSheet);
  root.append(backdrop);
  document.body.style.overflow = 'hidden';
  const firstInput = sheet.querySelector('input[type="text"]');
  if (firstInput && window.matchMedia('(min-width: 620px)').matches) firstInput.focus();
  return closeSheet;
}

export function closeSheet() {
  if (closeCurrentSheet) closeCurrentSheet();
}

export function sheetHeader(title, { onCancel, onSave, saveLabel = 'Guardar' } = {}) {
  return el('div', { class: 'sheet-head' }, [
    el('button', { class: 'link-btn', type: 'button', text: 'Cancelar', onClick: onCancel || closeSheet }),
    el('h2', { text: title }),
    onSave
      ? el('button', { class: 'link-btn', type: 'button', text: saveLabel, onClick: onSave })
      : el('span', { style: { width: '62px' } }),
  ]);
}

export function field(label, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    control,
    hint ? el('p', { class: 'hint-text', text: hint }) : null,
  ]);
}

export function segmented(options, value, onChange) {
  const wrap = el('div', { class: 'segmented' });
  for (const opt of options) {
    const btn = el('button', {
      type: 'button',
      text: opt.label,
      'aria-pressed': String(opt.value === value),
      onClick: () => {
        for (const child of wrap.children) child.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-pressed', 'true');
        onChange(opt.value);
      },
    });
    wrap.append(btn);
  }
  return wrap;
}

export function toggle(label, hint, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) });
  return el('div', { class: 'toggle-row' }, [
    el('div', {}, [
      el('div', { class: 'label', text: label }),
      hint ? el('div', { class: 'hint', text: hint }) : null,
    ]),
    el('label', { class: 'switch' }, [input, el('span', {})]),
  ]);
}

export function confirmDialog(message, onConfirm, { confirmLabel = 'Eliminar', danger = true } = {}) {
  openSheet((sheet, close) => {
    sheet.append(
      sheetHeader('¿Seguro?'),
      el('p', { style: { margin: '0 2px 18px', color: 'var(--muted)' }, text: message }),
      el('button', {
        class: 'btn ' + (danger ? 'danger' : ''),
        type: 'button',
        text: confirmLabel,
        onClick: () => { close(); onConfirm(); },
      }),
      el('button', { class: 'btn secondary', type: 'button', text: 'Cancelar', onClick: close })
    );
  });
}

/** Descarga un archivo generado en el propio dispositivo. */
export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
