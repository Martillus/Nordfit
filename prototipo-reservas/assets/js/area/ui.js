/* NORDFIT — piezas de interfaz compartidas por Mi cuenta y /admin */
window.UI = (() => {
  // Crea nodos sin innerHTML: los textos (nombres, notas) siempre van como texto
  function h(tag, attrs, ...kids) {
    const [t, ...cls] = tag.split('.');
    const el = document.createElement(t || 'div');
    if (cls.length) el.className = cls.join(' ');
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
        else if (k === 'svg') el.innerHTML = v; // solo iconos fijos de este archivo
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; }
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    kids.flat(Infinity).forEach(c => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  const ICON = {
    arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 13L13 3M5 3h8v8"/></svg>',
    left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
    right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    alert: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2l6.5 11.5h-13z"/><path d="M8 6.5v3M8 11.5v.5"/></svg>',
    wa: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.3a6.6 6.6 0 0 0-5.7 10l-.9 3.4 3.5-.9A6.6 6.6 0 1 0 8 1.3zm0 12a5.4 5.4 0 0 1-2.8-.8l-.2-.1-2 .5.5-2-.1-.2A5.4 5.4 0 1 1 8 13.3zm3-4c-.2-.1-1-.5-1.1-.5-.2-.1-.3-.1-.4.1l-.5.6c-.1.1-.2.1-.4 0a4.4 4.4 0 0 1-2.2-1.9c-.2-.3.2-.3.5-1 .1-.1 0-.2 0-.3l-.5-1.2c-.1-.3-.3-.3-.4-.3h-.3a.6.6 0 0 0-.4.2 1.8 1.8 0 0 0-.6 1.3 3.1 3.1 0 0 0 .7 1.7 7 7 0 0 0 2.7 2.4c1 .4 1.4.5 1.9.4.3 0 1-.4 1.1-.8.1-.4.1-.7.1-.8z"/></svg>',
    user: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="7" r="3.6"/><path d="M3.2 17.5c.9-3.3 3.6-5.2 6.8-5.2s5.9 1.9 6.8 5.2"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>'
  };
  const icon = (name, cls = 'i') => h('span.' + cls, { svg: ICON[name], 'aria-hidden': 'true' });

  // Botón con el mismo estilo que los enlaces .btn de la web
  function btn(text, opts = {}) {
    const b = h('button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), Object.assign({ type: opts.type || 'button', onclick: opts.onclick }, opts.attrs || {}),
      h('span.roll', null, h('span', null, text), h('span', { 'aria-hidden': 'true' }, text)),
      opts.noIcon ? null : h('span.ico', { svg: ICON[opts.icon || 'arrow'] }));
    return b;
  }
  const chip = (text, opts = {}) => h('button.chip' + (opts.cls ? '.' + opts.cls : ''), Object.assign({ type: 'button', onclick: opts.onclick, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) }, opts.attrs || {}), text);

  /* Diálogo modal (usa <dialog> nativo: foco, Escape y fondo incluidos) */
  function modal({ title, body, actions = [], wide = false, onClose }) {
    const dlg = h('dialog.modal' + (wide ? '.modal--wide' : ''), { 'aria-label': title, 'data-lenis-prevent': true });
    const close = () => { dlg.close(); };
    dlg.append(
      h('div.modal__head', null,
        h('h2.modal__title', null, title),
        h('button.modal__x', { type: 'button', 'aria-label': 'Cerrar', onclick: close, svg: ICON.close })),
      h('div.modal__body', null, body),
      actions.length ? h('div.modal__foot', null, actions) : null
    );
    dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    document.body.append(dlg);
    dlg.showModal();
    return { el: dlg, close };
  }
  function confirm(title, text, okText = 'Confirmar', opts = {}) {
    return new Promise(res => {
      let val = false;
      const m = modal({
        title, body: h('p', null, text),
        actions: [
          h('button.link-btn', { type: 'button', onclick: () => m.close() }, opts.cancelText || 'Volver'),
          btn(okText, { cls: opts.danger ? 'btn--danger' : '', noIcon: true, onclick: () => { val = true; m.close(); } })
        ],
        onClose: () => res(val)
      });
    });
  }

  let toastEl = null; let toastT = null;
  function toast(msg, kind = '') {
    if (!toastEl) { toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(toastEl); }
    toastEl.className = 'toast is-on' + (kind ? ' toast--' + kind : '');
    toastEl.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.className = 'toast'; }, 3400);
  }

  // Estado de pago: siempre icono + texto, nunca solo color
  function status(kind, text) {
    const ic = { paid: 'check', pending: 'clock', late: 'alert', off: 'close' }[kind] || 'clock';
    return h('span.status.status--' + kind, null, icon(ic), text);
  }

  return { h, ICON, icon, btn, chip, modal, confirm, toast, status };
})();
