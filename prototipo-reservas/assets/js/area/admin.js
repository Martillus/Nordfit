/* NORDFIT — panel privado /admin
   Resumen, agenda semanal, clientes, pagos, calendario (cierres y grupos) y
   estadísticas. En producción el acceso va con cuentas propias de Supabase
   (una por persona, con rol de administrador). */
(() => {
  const NF = window.NF;
  const { h, btn, chip, icon, modal, confirm, toast, status, ICON } = window.UI;
  const loginEl = document.querySelector('[data-login]');
  const appEl = document.querySelector('.adm');
  const main = document.querySelector('[data-main]');
  const cur = NF.thisMonth();
  const state = { view: 'resumen', week: monday(new Date()), trainer: 'all', payMonth: cur, calMonth: cur, q: '', plan: 'all' };

  /* ---------------- Acceso ---------------- */
  function boot() {
    if (NF.session.admin()) { loginEl.hidden = true; appEl.hidden = false; NF.ensureMonth(cur); go((location.hash || '#resumen').slice(1)); }
    else { appEl.hidden = true; loginEl.hidden = false; loginEl.querySelector('input').focus(); }
  }
  const form = loginEl.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const ok = NF.session.loginAdmin(form.user.value, form.pass.value);
    form.querySelector('.adm-form__err').hidden = !!ok;
    if (ok) boot();
  });
  loginEl.querySelector('[data-fill]').addEventListener('click', () => { form.user.value = 'admin@nordfit.es'; form.pass.value = 'nordfit'; form.requestSubmit(); });
  document.querySelector('[data-logout]').addEventListener('click', () => { NF.session.logoutAdmin(); boot(); });
  document.querySelector('[data-reset]').addEventListener('click', async () => {
    if (await confirm('Restablecer datos de prueba', 'Se borran todos los cambios hechos en el prototipo y se vuelve a los datos de ejemplo.', 'Restablecer')) { NF.reset(); NF.session.loginAdmin('admin@nordfit.es', 'nordfit'); NF.ensureMonth(cur); go(state.view); toast('Datos restablecidos.'); }
  });

  /* ---------------- Navegación ---------------- */
  const navBtns = [...document.querySelectorAll('[data-view]')];
  navBtns.forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  function go(view) {
    if (!views[view]) view = 'resumen';
    state.view = view;
    navBtns.forEach(b => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
    main.replaceChildren(views[view]());
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* file:// */ }
  }
  const refresh = () => main.replaceChildren(views[state.view]());

  /* ---------------- Utilidades ---------------- */
  function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  const first = n => n.split(' ')[0];
  const short = n => { const p = n.split(' '); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
  const head = (title, thin, ...extra) => h('header.adm-head', null, h('h1.display.h-sm', null, title, ' ', h('span.thin', null, thin)), h('div.adm-head__tools', null, extra));
  const tile = (label, value, sub, cls = '') => h('div.tile' + cls, null, h('span.tile__label', null, label), h('strong.tile__value', null, value), sub ? h('span.tile__sub', null, sub) : null);
  const clientNames = b => b.clients.map(id => NF.client(id)).filter(Boolean).map(c => c.name);
  const waLink = (c, text) => `https://wa.me/34${c.phone.replace(/\D/g, '').slice(-9)}?text=${encodeURIComponent(text)}`;
  const reminderText = (c, p) => `Hola ${first(c.name)}, te recordamos que el bono de ${NF.monthName(p.month)} (${NF.money(p.amount)}) está pendiente de pago. Puedes pagarlo desde tu área de cliente en la web o en el estudio. ¡Gracias! — Nordfit`;
  function weekDays(start) { const out = []; for (let i = 0; i < 6; i++) out.push(NF.ymd(NF.addDays(start, i))); return out; }
  function payStatus(p) {
    if (!p) return status('off', 'Sin cargo');
    if (p.status === 'paid') return status('paid', 'Pagado');
    return status('pending', p.promised ? `Pendiente · ${NF.METHODS[p.method].toLowerCase()}` : 'Pendiente');
  }

  /* ---------------- Acciones de pago ---------------- */
  function markPaidFlow(p) {
    let method = p.method === 'card' || p.method === 'sepa' ? 'cash' : p.method;
    const c = NF.client(p.client);
    const radios = h('div.choices.choices--dark', { role: 'radiogroup', 'aria-label': 'Forma de pago' }, ['cash', 'transfer', 'card', 'sepa'].map(v => [
      h('input', { type: 'radio', name: 'mp', id: 'mp-' + v, value: v, checked: v === method, onchange: () => { method = v; } }),
      h('label', { for: 'mp-' + v }, NF.METHODS[v])
    ]));
    const m = modal({
      title: 'Marcar como pagado',
      body: h('div.stack', null, h('p', null, `${c.name} · bono de ${NF.monthName(p.month)} · `, h('strong', null, NF.money(p.amount))), h('p.muted', null, '¿Cómo ha pagado?'), radios),
      actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Cancelar'), btn('Marcar pagado', { noIcon: true, onclick: () => { NF.markPaid(p.id, method); m.close(); toast(`${first(c.name)}: pago registrado.`, 'ok'); refresh(); } })]
    });
  }
  function remindBtn(p) {
    const c = NF.client(p.client);
    const last = NF.lastReminder(c.id, p.month);
    return h('a.mini-btn', {
      href: waLink(c, reminderText(c, p)), target: '_blank', rel: 'noopener',
      title: last ? 'Último recordatorio: ' + new Date(last).toLocaleDateString('es-ES') : 'Abrir WhatsApp con el mensaje escrito',
      onclick: () => { NF.remind(c.id, p.month); setTimeout(refresh, 300); }
    }, icon('wa'), last ? 'Recordar otra vez' : 'Recordar');
  }

  /* ---------------- Vistas ---------------- */
  const views = {};

  /* Resumen */
  views.resumen = () => {
    const pays = NF.db().payments.filter(p => p.month === cur);
    const paid = pays.filter(p => p.status === 'paid');
    const pending = pays.filter(p => p.status === 'pending');
    const active = NF.db().clients.filter(c => c.active);
    const today = NF.today();
    const week = weekDays(monday(new Date()));
    const weekSessions = sessionsIn(week);
    const occ = occupancy(week);
    // Si hoy está cerrado, se muestra el siguiente día con sesiones
    let day = today;
    for (let i = 0; i < 7 && !NF.isOpen(day); i++) day = NF.ymd(NF.addDays(NF.parse(day), 1));
    const grouped = groupSlots(NF.db().bookings.filter(b => b.date === day && NF.counts(b)));
    const dayTitle = day === today ? 'Hoy' : `Próximo día abierto · ${NF.dayLabel(day)}`;

    return h('div.view', null,
      head('Hola,', 'equipo', h('span.muted', null, NF.cap(NF.dayLabel(today)))),
      h('div.tiles', null,
        tile(`Cobrado en ${NF.monthName(cur)}`, NF.money(sum(paid)), `${paid.length} de ${pays.length} clientes`),
        tile('Pendiente de cobro', NF.money(sum(pending)), `${pending.length} cliente${pending.length === 1 ? '' : 's'}`, pending.length ? '.tile--warn' : ''),
        tile('Clientes activos', String(active.length), planMix(active)),
        tile('Sesiones esta semana', String(weekSessions), `${occ}% de las horas de entrenador ocupadas`)),
      h('div.adm-cols', null,
        h('section.card', null,
          h('h2.card__title', null, dayTitle),
          grouped.length ? h('ul.agenda-list', null, grouped.map(g => h('li', null,
            h('span.agenda-list__h', null, NF.hourLabel(g.h)),
            h('span', null, h('strong', null, g.label), h('small', null, `${NF.PLANS[g.kind].name} · ${NF.trainer(g.trainer).name}`)))))
            : h('p.muted', null, 'No hay sesiones reservadas ese día.')),
        h('section.card', null,
          h('h2.card__title', null, 'Pendientes de pago', h('span.count', null, String(pending.length))),
          pending.length ? h('ul.due-list', null, pending.map(p => {
            const c = NF.client(p.client);
            return h('li', null,
              h('span', null, h('strong', null, c.name), h('small', null, `${NF.money(p.amount)} · ${p.promised ? 'dice que paga en ' + NF.METHODS[p.method].toLowerCase() : 'sin pagar'}`)),
              h('span.due-list__act', null, remindBtn(p), h('button.mini-btn', { type: 'button', onclick: () => markPaidFlow(p) }, icon('check'), 'Pagado')));
          })) : h('p.muted', null, 'Todo cobrado este mes.')))
    );
  };
  const sum = list => list.reduce((s, p) => s + p.amount, 0);
  function planMix(list) {
    const n = k => list.filter(c => c.plan === k).length;
    return `${n('personal')} en 1:1 · ${n('pareja')} en pareja · ${n('grupo')} en grupo`;
  }
  // Agrupa reservas por hora y entrenador (un grupo = una línea)
  function groupSlots(list) {
    const map = new Map();
    list.forEach(b => {
      const k = b.date + b.h + b.trainer;
      if (!map.has(k)) map.set(k, { h: b.h, date: b.date, trainer: b.trainer, kind: b.kind, items: [] });
      map.get(k).items.push(b);
    });
    return [...map.values()].sort((a, b) => a.h - b.h).map(g => {
      const names = g.items.flatMap(clientNames);
      g.label = g.kind === 'grupo' ? `Grupo (${names.length}): ${names.map(short).join(', ')}` : names.join(' y ');
      return g;
    });
  }
  function sessionsIn(days) {
    const set = new Set(NF.db().bookings.filter(b => days.includes(b.date) && NF.counts(b)).map(b => b.date + b.h + b.trainer));
    return set.size;
  }
  // Horas de entrenador ocupadas / horas de turno disponibles
  function occupancy(days) {
    let avail = 0;
    days.forEach(d => {
      if (!NF.isOpen(d)) return;
      const dow = NF.parse(d).getDay();
      NF.TRAINERS.forEach(t => { const s = NF.SHIFTS[t.id][dow]; if (s) avail += s[1] - s[0] + 1; });
    });
    return avail ? Math.round(sessionsIn(days) / avail * 100) : 0;
  }

  /* Agenda semanal */
  views.agenda = () => {
    const days = weekDays(state.week);
    const end = NF.parse(days[5]);
    const label = `${state.week.getDate()} ${NF.MONTHS[state.week.getMonth()].slice(0, 3)} – ${end.getDate()} ${NF.MONTHS[end.getMonth()].slice(0, 3)}`;
    const nav = h('div.week-nav', null,
      h('button.icon-btn.icon-btn--dark', { type: 'button', 'aria-label': 'Semana anterior', svg: ICON.left, onclick: () => { state.week = NF.addDays(state.week, -7); refresh(); } }),
      h('strong', { 'aria-live': 'polite' }, label),
      h('button.icon-btn.icon-btn--dark', { type: 'button', 'aria-label': 'Semana siguiente', svg: ICON.right, onclick: () => { state.week = NF.addDays(state.week, 7); refresh(); } }),
      h('button.mini-btn', { type: 'button', onclick: () => { state.week = monday(new Date()); refresh(); } }, 'Hoy'));
    const filt = h('div.chips', { role: 'group', 'aria-label': 'Entrenador' },
      [['all', 'Todos'], ...NF.TRAINERS.map(t => [t.id, t.name])].map(([v, t]) => chip(t, { cls: 'chip--dark', pressed: state.trainer === v, onclick: () => { state.trainer = v; refresh(); } })));

    const table = h('table.week', null);
    table.append(h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span.sr-only', null, 'Hora')), days.map(d => {
      const c = NF.closure(d);
      return h('th', { scope: 'col', class: (d === NF.today() ? 'is-today' : '') + (c ? ' is-closed' : '') }, h('span', null, NF.DAYS[NF.parse(d).getDay()].slice(0, 3)), h('strong', null, NF.parse(d).getDate()), c ? h('small', null, c.reason) : null);
    }))));
    const tb = h('tbody');
    for (let hr = 7; hr <= 21; hr++) {
      const tr = h('tr', null, h('th', { scope: 'row' }, NF.hourLabel(hr)));
      days.forEach(d => {
        const dow = NF.parse(d).getDay();
        const open = NF.STUDIO[dow] && hr >= NF.STUDIO[dow][0] && hr <= NF.STUDIO[dow][1] && !NF.closure(d);
        const td = h('td', { class: open ? '' : 'is-off' });
        if (open) {
          const list = NF.db().bookings.filter(b => b.date === d && b.h === hr && NF.counts(b) && (state.trainer === 'all' || b.trainer === state.trainer));
          const groups = groupSlots(list);
          // Grupos fijos aún vacíos también se muestran
          NF.db().groups.filter(g => g.dow === dow && g.h === hr && (state.trainer === 'all' || g.trainer === state.trainer) && !groups.some(x => x.kind === 'grupo' && x.trainer === g.trainer))
            .forEach(g => groups.push({ h: hr, date: d, trainer: g.trainer, kind: 'grupo', items: [], label: 'Grupo (0)' }));
          groups.forEach(g => td.append(h('button.ev.ev--' + g.kind + '.ev--' + g.trainer, { type: 'button', onclick: () => eventModal(g) },
            h('span.ev__who', null, g.kind === 'grupo' ? `Grupo ${g.items.length}/${(NF.db().groups.find(x => x.dow === dow && x.h === hr && x.trainer === g.trainer) || { cap: '?' }).cap}` : g.items.flatMap(clientNames).map(short).join(' y ')),
            h('span.ev__tr', null, NF.trainer(g.trainer).name))));
          const freeTrainers = NF.TRAINERS.filter(t => (state.trainer === 'all' || t.id === state.trainer) && NF.SHIFTS[t.id][dow] && hr >= NF.SHIFTS[t.id][dow][0] && hr <= NF.SHIFTS[t.id][dow][1] && !NF.trainerBusy(t.id, d, hr));
          if (freeTrainers.length) td.append(h('button.ev-add', { type: 'button', 'aria-label': `Añadir sesión el ${NF.dayLabel(d)} a las ${NF.hourLabel(hr)}`, onclick: () => addModal(d, hr, freeTrainers), svg: ICON.plus }));
        }
        tr.append(td);
      });
      tb.append(tr);
    }
    table.append(tb);
    return h('div.view', null,
      head('Agenda', 'semanal', nav),
      h('div.toolbar', null, filt, h('p.muted.small', null, 'Toca una sesión para ver detalles o cancelarla. Usa + para reservar en nombre de un cliente.')),
      h('div.week-wrap', { 'data-lenis-prevent': true }, table));
  };
  function eventModal(g) {
    const names = g.items.flatMap(b => b.clients.map(id => NF.client(id)));
    const m = modal({
      title: `${NF.cap(NF.dayLabel(g.date))} · ${NF.hourLabel(g.h)}`,
      body: h('div.stack', null,
        h('p', null, h('strong', null, NF.PLANS[g.kind].name), ` con ${NF.trainer(g.trainer).name}`),
        names.length ? h('ul.plain', null, names.map(c => h('li', null, c.name, ' · ', h('a.u-line', { href: 'tel:+34' + c.phone }, c.phone)))) : h('p.muted', null, 'Nadie apuntado todavía.'),
        g.items.length ? h('div.stack', null, h('p.muted', null, 'Cancelar libera el hueco y devuelve la sesión al bono del cliente.'),
          h('div.btn-row', null, g.items.map(b => h('button.mini-btn.mini-btn--danger', { type: 'button', onclick: async () => {
            m.close();
            if (await confirm('Cancelar sesión', `Se cancela la sesión de ${clientNames(b).join(' y ')}. Recuerda avisarle.`, 'Cancelar sesión', { danger: true })) { NF.adminCancel(b.id); toast('Sesión cancelada.'); refresh(); }
          } }, 'Cancelar ' + clientNames(b).map(first).join(' y '))))) : null)
    });
  }
  function addModal(date, hr, trainers) {
    const clients = NF.db().clients.filter(c => c.active && c.plan !== 'grupo').sort((a, b) => a.name.localeCompare(b.name));
    const dow = NF.parse(date).getDay();
    const grp = NF.db().groups.find(g => g.dow === dow && g.h === hr);
    const opts = grp ? NF.db().clients.filter(c => c.active && c.plan === 'grupo') : clients;
    const sel = h('select', { id: 'add-c' }, opts.map(c => h('option', { value: c.id }, c.name)));
    const tsel = h('select', { id: 'add-t' }, trainers.map(t => h('option', { value: t.id }, t.name)));
    const m = modal({
      title: `Reservar · ${NF.dayLabel(date)} ${NF.hourLabel(hr)}`,
      body: h('div.adm-form', null, h('label', { for: 'add-c' }, grp ? 'Cliente (grupo)' : 'Cliente'), sel, grp ? null : [h('label', { for: 'add-t' }, 'Entrenador'), tsel],
        h('p.muted.small', null, 'La sesión se descuenta del bono del cliente. Para parejas se reserva para los dos.')),
      actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Cancelar'), btn('Reservar', { noIcon: true, onclick: () => {
        const c = NF.client(sel.value);
        const u = NF.usage(c.id, date.slice(0, 7));
        if (u.left <= 0 && !window.confirm(`${first(c.name)} ya ha usado sus ${u.total} sesiones del mes. ¿Reservar igualmente?`)) return;
        NF.adminBook(c.id, date, hr, grp ? grp.trainer : tsel.value);
        m.close(); toast('Sesión reservada.', 'ok'); refresh();
      } })]
    });
  }

  /* Clientes */
  views.clientes = () => {
    const q = state.q.toLowerCase();
    const list = NF.db().clients
      .filter(c => (state.plan === 'all' || c.plan === state.plan) && (!q || (c.name + c.email + c.phone).toLowerCase().includes(q)))
      .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    const search = h('input.search', { type: 'search', placeholder: 'Buscar por nombre, email o teléfono', 'aria-label': 'Buscar cliente', value: state.q });
    search.addEventListener('input', () => { state.q = search.value; const pos = search.selectionStart; refresh(); const s = main.querySelector('.search'); s.focus(); s.setSelectionRange(pos, pos); });
    const chips = h('div.chips', { role: 'group', 'aria-label': 'Plan' }, [['all', 'Todos'], ...Object.values(NF.PLANS).map(p => [p.id, p.name])].map(([v, t]) =>
      chip(t, { cls: 'chip--dark', pressed: state.plan === v, onclick: () => { state.plan = v; refresh(); } })));
    const rows = list.map(c => {
      const u = NF.usage(c.id, cur);
      return h('tr', { class: c.active ? '' : 'is-muted' },
        h('th', { scope: 'row' }, h('button.row-link', { type: 'button', onclick: () => clientModal(c) }, c.name), c.active ? null : h('small', null, ' · de baja')),
        h('td', null, NF.PLANS[c.plan].short),
        h('td', null, c.plan === 'grupo' ? '—' : NF.trainer(c.trainer).name),
        h('td', null, c.active ? payStatus(u.payment) : '—'),
        h('td.num', null, c.active ? `${u.used}/${u.total}` : '—'),
        h('td', null, NF.METHODS[c.method]),
        h('td', null, h('a.u-line', { href: 'tel:+34' + c.phone }, c.phone)));
    });
    return h('div.view', null,
      head('Clientes', `(${NF.db().clients.filter(c => c.active).length} activos)`, btn('Nuevo cliente', { icon: 'plus', onclick: () => clientModal(null) })),
      h('div.toolbar', null, search, chips),
      h('div.table-wrap', null, h('table.tbl.tbl--dark', null,
        h('thead', null, h('tr', null, ['Nombre', 'Plan', 'Entrenador', `Pago ${NF.monthName(cur)}`, 'Sesiones', 'Suele pagar', 'Teléfono'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: '7' }, 'Ningún cliente coincide con la búsqueda.'))))));
  };
  function clientModal(c) {
    const isNew = !c;
    c = c || { name: '', email: '', phone: '', plan: 'personal', trainer: 'sergio', method: 'transfer', active: true, notes: '' };
    const f = h('form.adm-form.adm-form--grid', { novalidate: true });
    const inp = (name, label, attrs = {}) => [h('label', { for: 'cf-' + name }, label), h('input', Object.assign({ id: 'cf-' + name, name, value: c[name] || '' }, attrs))];
    const sel = (name, label, options) => [h('label', { for: 'cf-' + name }, label), h('select', { id: 'cf-' + name, name }, options.map(([v, t]) => h('option', { value: v, selected: c[name] === v }, t)))];
    f.append(
      h('div', null, inp('name', 'Nombre y apellidos', { required: true })),
      h('div', null, inp('email', 'Email (para entrar)', { type: 'email', required: true })),
      h('div', null, inp('phone', 'Teléfono', { type: 'tel', required: true })),
      h('div', null, sel('plan', 'Plan', Object.values(NF.PLANS).map(p => [p.id, `${p.name} · ${NF.money(p.price)}`]))),
      h('div', null, sel('trainer', 'Entrenador', NF.TRAINERS.map(t => [t.id, t.name]))),
      h('div', null, sel('method', 'Suele pagar con', Object.entries(NF.METHODS))),
      h('div.span2', null, h('label', { for: 'cf-notes' }, 'Notas (lesiones, objetivos…)'), h('textarea', { id: 'cf-notes', name: 'notes', rows: '3' }, c.notes || '')),
      isNew ? null : h('label.check.span2', null, h('input', { type: 'checkbox', name: 'active', checked: c.active }), ' Cliente activo'));
    let history = null;
    if (!isNew) {
      const pays = NF.db().payments.filter(p => p.client === c.id).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
      const next = NF.bookingsOf(c.id).filter(b => b.status === 'ok' && b.date >= NF.today()).slice(0, 6);
      history = h('div.client-hist', null,
        h('div', null, h('h3', null, 'Pagos'), h('ul.plain', null, pays.map(p => h('li', null, NF.monthLabel(p.month), ' · ', payStatus(p))))),
        h('div', null, h('h3', null, 'Próximas sesiones'), next.length ? h('ul.plain', null, next.map(b => h('li', null, `${NF.dayLabel(b.date)} · ${NF.hourLabel(b.h)}`))) : h('p.muted', null, 'Ninguna.')));
    }
    const m = modal({
      title: isNew ? 'Nuevo cliente' : c.name, wide: true,
      body: h('div.stack', null, isNew ? h('p.muted', null, 'Después de la valoración inicial, da de alta al cliente con su plan. Recibirá un email para entrar en su área y pagar el primer bono.') : null, f, history),
      actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Cancelar'), btn(isNew ? 'Crear y enviar invitación' : 'Guardar', { noIcon: true, onclick: () => f.requestSubmit() })]
    });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const bad = [...f.querySelectorAll('[required]')].filter(i => !i.value.trim() || !i.checkValidity());
      f.querySelectorAll('input').forEach(i => i.classList.toggle('is-error', bad.includes(i)));
      if (bad.length) { bad[0].focus(); return; }
      const email = f.email.value.trim().toLowerCase();
      if (NF.db().clients.some(x => x.email.toLowerCase() === email && x.id !== c.id)) { f.email.classList.add('is-error'); toast('Ya hay un cliente con ese email.', 'warn'); return; }
      const data = { name: f.name.value.trim(), email, phone: f.phone.value.trim(), plan: f.plan.value, trainer: f.trainer.value, method: f.method.value, notes: f.notes.value.trim() };
      if (!isNew) { data.id = c.id; data.active = f.active.checked; }
      NF.saveClient(data);
      m.close();
      toast(isNew ? `Cliente creado. Invitación enviada a ${email} (simulado).` : 'Cambios guardados.', 'ok');
      refresh();
    });
  }

  /* Pagos */
  views.pagos = () => {
    const m = state.payMonth;
    const pays = NF.db().payments.filter(p => p.month === m).sort((a, b) => (a.status === b.status ? NF.client(a.client).name.localeCompare(NF.client(b.client).name) : a.status === 'pending' ? -1 : 1));
    const paid = pays.filter(p => p.status === 'paid');
    const pending = pays.filter(p => p.status === 'pending');
    const byMethod = Object.keys(NF.METHODS).map(k => [k, sum(paid.filter(p => p.method === k))]).filter(x => x[1]);
    const nav = h('div.week-nav', null,
      h('button.icon-btn.icon-btn--dark', { type: 'button', 'aria-label': 'Mes anterior', svg: ICON.left, onclick: () => { state.payMonth = NF.addMonths(m, -1); refresh(); } }),
      h('strong', { 'aria-live': 'polite' }, NF.monthLabel(m)),
      h('button.icon-btn.icon-btn--dark', { type: 'button', 'aria-label': 'Mes siguiente', svg: ICON.right, onclick: () => { state.payMonth = NF.addMonths(m, 1); refresh(); } }));
    const rows = pays.map(p => {
      const c = NF.client(p.client);
      return h('tr', null,
        h('th', { scope: 'row' }, c.name),
        h('td', null, NF.PLANS[c.plan].short),
        h('td.num', null, NF.money(p.amount)),
        h('td', null, payStatus(p)),
        h('td', null, p.status === 'paid' ? `${NF.METHODS[p.method]} · ${NF.parse(p.paidAt).toLocaleDateString('es-ES')}` : '—'),
        h('td.actions', null, p.status === 'paid'
          ? h('button.mini-btn', { type: 'button', onclick: async () => { if (await confirm('Deshacer pago', `El bono de ${first(c.name)} vuelve a quedar pendiente.`, 'Deshacer')) { NF.markPending(p.id); refresh(); } } }, 'Deshacer')
          : [remindBtn(p), h('button.mini-btn', { type: 'button', onclick: () => markPaidFlow(p) }, icon('check'), 'Pagado')]));
    });
    const csv = () => {
      const lines = [['Cliente', 'Plan', 'Mes', 'Importe', 'Estado', 'Forma de pago', 'Fecha de pago']].concat(pays.map(p => {
        const c = NF.client(p.client);
        return [c.name, NF.PLANS[c.plan].name, p.month, p.amount, p.status === 'paid' ? 'Pagado' : 'Pendiente', NF.METHODS[p.method], p.paidAt || ''];
      }));
      const blob = new Blob(['﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `nordfit-pagos-${m}.csv` });
      document.body.append(a); a.click(); a.remove();
    };
    const missing = NF.db().clients.filter(c => c.active && c.since.slice(0, 7) <= m && !NF.payment(c.id, m)).length;
    return h('div.view', null,
      head('Pagos', 'del mes', nav),
      h('div.tiles', null,
        tile('Cobrado', NF.money(sum(paid)), `${paid.length} pagos`),
        tile('Pendiente', NF.money(sum(pending)), `${pending.length} clientes`, pending.length ? '.tile--warn' : ''),
        tile('Por forma de pago', byMethod.length ? byMethod.map(([k, v]) => `${NF.METHODS[k]} ${NF.money(v)}`).join(' · ') : '—', 'Con Stripe, tarjeta y domiciliación se concilian solas', '.tile--text')),
      h('div.toolbar', null,
        missing ? h('button.mini-btn', { type: 'button', onclick: () => { const n = NF.ensureMonth(m); toast(`${n} cargos creados para ${NF.monthName(m)}.`, 'ok'); refresh(); } }, icon('plus'), `Crear cargos del mes (${missing})`) : null,
        h('button.mini-btn', { type: 'button', onclick: csv, disabled: !pays.length }, 'Exportar CSV para la gestoría'),
        h('p.muted.small', null, 'En la versión real, los pendientes reciben un email automático los días 1, 5 y 10. El botón de WhatsApp es para un aviso personal.')),
      pays.length ? h('div.table-wrap', null, h('table.tbl.tbl--dark', null,
        h('thead', null, h('tr', null, ['Cliente', 'Plan', 'Importe', 'Estado', 'Pagado con', ''].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows))) : h('p.muted', null, 'Este mes aún no tiene cargos.'));
  };

  /* Calendario: días cerrados y grupos fijos */
  views.calendario = () => {
    const m = state.calMonth;
    const firstD = NF.parse(m);
    const grid = h('div.cal-grid.cal-grid--admin');
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(d => grid.append(h('div.cal-dow', null, d)));
    for (let i = 0; i < (firstD.getDay() + 6) % 7; i++) grid.append(h('div.cal-pad'));
    for (let d = new Date(firstD); d.getMonth() === firstD.getMonth(); d = NF.addDays(d, 1)) {
      const date = NF.ymd(d);
      const c = NF.closure(date);
      const open = !!NF.STUDIO[d.getDay()];
      const n = sessionsIn([date]);
      grid.append(h('button.cal-day' + (c ? '.is-closed' : '') + (!open ? '.is-past' : '') + (date === NF.today() ? '.is-today' : ''), {
        type: 'button', disabled: !open, 'aria-label': `${NF.dayLabel(date)}${c ? '. Cerrado: ' + c.reason : '. ' + n + ' sesiones'}`,
        onclick: () => closureModal(date)
      }, h('span.cal-day__n', null, d.getDate()), h('span.cal-day__info', null, c ? c.reason : open ? (n ? `${n} ses.` : '') : 'Cerrado')));
    }
    const nav = h('div.week-nav', null,
      h('button.icon-btn.icon-btn--dark', { type: 'button', 'aria-label': 'Mes anterior', svg: ICON.left, onclick: () => { state.calMonth = NF.addMonths(m, -1); refresh(); } }),
      h('strong', { 'aria-live': 'polite' }, NF.monthLabel(m)),
      h('button.icon-btn.icon-btn--dark', { type: 'button', 'aria-label': 'Mes siguiente', svg: ICON.right, onclick: () => { state.calMonth = NF.addMonths(m, 1); refresh(); } }));
    const groups = NF.db().groups.slice().sort((a, b) => ((a.dow + 6) % 7 - (b.dow + 6) % 7) || a.h - b.h);
    const shifts = NF.TRAINERS.map(t => h('li', null, h('strong', null, t.name + ': '), [1, 2, 3, 4, 5, 6].filter(d => NF.SHIFTS[t.id][d]).map(d => `${NF.DAYS[d].slice(0, 3)} ${NF.SHIFTS[t.id][d][0]}–${NF.SHIFTS[t.id][d][1] + 1} h`).join(' · ')));
    return h('div.view', null,
      head('Calendario', 'y horarios', nav),
      h('div.adm-cols', null,
        h('section.card', null, h('h2.card__title', null, 'Días cerrados'), h('p.muted.small', null, 'Toca un día para cerrarlo (festivo, vacaciones, formación…) o volver a abrirlo. Los clientes ya no podrán reservar ese día.'), grid),
        h('div.stack', null,
          h('section.card', null,
            h('h2.card__title', null, 'Grupos reducidos fijos'),
            h('ul.group-list', null, groups.map(g => h('li', null,
              h('span', null, h('strong', null, `${NF.DAYS[g.dow]} ${NF.hourLabel(g.h)}`), h('small', null, `${NF.trainer(g.trainer).name} · ${g.cap} plazas`)),
              h('span.btn-row', null, h('button.mini-btn', { type: 'button', onclick: () => groupModal(g) }, 'Editar'), h('button.mini-btn.mini-btn--danger', { type: 'button', onclick: async () => { if (await confirm('Quitar grupo', `Se quita el grupo de los ${NF.DAYS[g.dow]} a las ${NF.hourLabel(g.h)}. Las reservas ya hechas se mantienen.`, 'Quitar', { danger: true })) { NF.removeGroup(g.id); refresh(); } } }, 'Quitar'))))),
            h('button.mini-btn', { type: 'button', onclick: () => groupModal(null) }, icon('plus'), 'Añadir grupo')),
          h('section.card', null, h('h2.card__title', null, 'Turnos de entrenadores'), h('ul.plain', null, shifts), h('p.muted.small', null, 'Horario orientativo del prototipo: hay que confirmarlo con el equipo.')))));
  };
  async function closureModal(date) {
    const c = NF.closure(date);
    if (c) {
      if (await confirm('Abrir día', `El ${NF.dayLabel(date)} vuelve a estar disponible para reservar.`, 'Abrir día')) { NF.toggleClosure(date); toast('Día abierto.', 'ok'); refresh(); }
      return;
    }
    const affected = NF.affectedBy(date);
    const reason = h('input', { id: 'cl-r', value: 'Festivo', maxlength: '40' });
    const m = modal({
      title: `Cerrar el ${NF.dayLabel(date)}`,
      body: h('div.adm-form', null, h('label', { for: 'cl-r' }, 'Motivo (lo verán los clientes)'), reason,
        affected.length ? h('div.notice.notice--dark', null, icon('alert'), h('p', null, h('strong', null, `Hay ${affected.length} sesiones reservadas ese día: `), [...new Set(affected.flatMap(clientNames))].join(', '), '. Se cancelan y vuelven a su bono. En la versión real reciben un email automático.')) : null),
      actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Cancelar'), btn('Cerrar día', { noIcon: true, onclick: () => {
        affected.forEach(b => NF.adminCancel(b.id));
        NF.toggleClosure(date, reason.value.trim() || 'Cerrado');
        m.close(); toast('Día cerrado.', 'ok'); refresh();
      } })]
    });
  }
  function groupModal(g) {
    const isNew = !g;
    g = g || { dow: 1, h: 19, trainer: 'jules', cap: 4 };
    const dow = h('select', { id: 'g-d' }, [1, 2, 3, 4, 5, 6].map(d => h('option', { value: d, selected: g.dow === d }, NF.DAYS[d])));
    const hr = h('select', { id: 'g-h' }, Array.from({ length: 15 }, (_, i) => i + 7).map(x => h('option', { value: x, selected: g.h === x }, NF.hourLabel(x))));
    const tr = h('select', { id: 'g-t' }, NF.TRAINERS.map(t => h('option', { value: t.id, selected: g.trainer === t.id }, t.name)));
    const cap = h('input', { id: 'g-c', type: 'number', min: '2', max: '8', value: g.cap });
    const m = modal({
      title: isNew ? 'Nuevo grupo fijo' : 'Editar grupo',
      body: h('div.adm-form.adm-form--grid', null, h('div', null, h('label', { for: 'g-d' }, 'Día'), dow), h('div', null, h('label', { for: 'g-h' }, 'Hora'), hr), h('div', null, h('label', { for: 'g-t' }, 'Entrenador'), tr), h('div', null, h('label', { for: 'g-c' }, 'Plazas'), cap)),
      actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Cancelar'), btn('Guardar', { noIcon: true, onclick: () => {
        NF.saveGroup({ id: g.id, dow: +dow.value, h: +hr.value, trainer: tr.value, cap: Math.max(2, Math.min(8, +cap.value || 4)) });
        m.close(); toast('Grupo guardado.', 'ok'); refresh();
      } })]
    });
  }

  /* Estadísticas */
  views.stats = () => {
    const months = Array.from({ length: 6 }, (_, i) => NF.addMonths(cur, i - 5));
    const rev = months.map(m => ({ m, v: sum(NF.db().payments.filter(p => p.month === m && p.status === 'paid')), due: sum(NF.db().payments.filter(p => p.month === m && p.status === 'pending')) }));
    const max = Math.max(...rev.map(r => r.v + r.due), 1);
    const avg = Math.round(rev.slice(0, 5).reduce((s, r) => s + r.v, 0) / 5);
    // Ocupación por día y hora en las últimas 4 semanas
    const start = NF.addDays(monday(new Date()), -28);
    const days = Array.from({ length: 28 }, (_, i) => NF.ymd(NF.addDays(start, i)));
    const heat = {};
    NF.db().bookings.filter(b => days.includes(b.date) && NF.counts(b)).forEach(b => {
      const k = NF.parse(b.date).getDay() + '-' + b.h;
      heat[k] = heat[k] || new Set(); heat[k].add(b.date + b.trainer);
    });
    const hmax = Math.max(1, ...Object.values(heat).map(s => s.size));
    const monthBookings = NF.db().bookings.filter(b => b.date.startsWith(cur));
    const late = monthBookings.filter(b => b.status === 'late').length;
    const canc = monthBookings.filter(b => b.status === 'cancelled').length;
    const perTrainer = NF.TRAINERS.map(t => ({ t, n: new Set(monthBookings.filter(b => b.trainer === t.id && NF.counts(b)).map(b => b.date + b.h)).size }));
    const tmax = Math.max(1, ...perTrainer.map(x => x.n));

    const tip = h('div.chart-tip', { role: 'status', hidden: true });
    const showTip = (e, title, value) => {
      tip.replaceChildren(h('strong', null, value), h('span', null, title));
      tip.hidden = false;
      const r = e.currentTarget.getBoundingClientRect();
      const host = tip.parentElement.getBoundingClientRect();
      tip.style.left = (r.left - host.left + r.width / 2) + 'px';
      tip.style.top = (r.top - host.top) + 'px';
    };
    const hideTip = () => { tip.hidden = true; };
    const hoverable = (el, title, value) => {
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${title}: ${value}`);
      ['pointerenter', 'focus'].forEach(ev => el.addEventListener(ev, e => showTip(e, title, value)));
      ['pointerleave', 'blur'].forEach(ev => el.addEventListener(ev, hideTip));
      return el;
    };

    const bars = h('div.bars', null, rev.map(r => h('div.bars__col', null,
      h('div.bars__track', null,
        r.due ? hoverable(h('div.bars__bar.bars__bar--due', { style: { height: (r.due / max * 100) + '%' } }), `Pendiente ${NF.monthLabel(r.m)}`, NF.money(r.due)) : null,
        hoverable(h('div.bars__bar', { style: { height: (r.v / max * 100) + '%' } }), `Cobrado ${NF.monthLabel(r.m)}`, NF.money(r.v))),
      h('span.bars__lbl', null, NF.MONTHS[NF.parse(r.m).getMonth()].slice(0, 3)),
      h('span.bars__val', null, NF.money(r.v)))));

    const hours = Array.from({ length: 15 }, (_, i) => i + 7);
    const hm = h('div.heat', { role: 'table', 'aria-label': 'Sesiones por día y hora, últimas 4 semanas' });
    hm.append(h('div.heat__row', { role: 'row' }, h('span', { role: 'columnheader' }), hours.map(x => h('span.heat__hh', { role: 'columnheader' }, x))));
    [1, 2, 3, 4, 5, 6].forEach(d => {
      hm.append(h('div.heat__row', { role: 'row' }, h('span.heat__dd', { role: 'rowheader' }, NF.DAYS[d].slice(0, 3)), hours.map(x => {
        const n = heat[d + '-' + x]?.size || 0;
        const open = NF.STUDIO[d] && x >= NF.STUDIO[d][0] && x <= NF.STUDIO[d][1];
        const cell = h('span.heat__c' + (open ? '' : '.is-off'), { role: 'cell', style: open ? { '--a': (n / hmax).toFixed(2) } : null });
        return open ? hoverable(cell, `${NF.DAYS[d]} ${NF.hourLabel(x)}`, `${n} sesiones`) : cell;
      })));
    });

    return h('div.view', null,
      head('Estadísticas', '', h('span.muted', null, 'Datos de ejemplo')),
      h('div.tiles', null,
        tile('Ingreso medio mensual', NF.money(avg), 'Últimos 5 meses cerrados'),
        tile('Ocupación esta semana', occupancy(weekDays(monday(new Date()))) + '%', 'Horas de entrenador reservadas'),
        tile(`Cancelaciones en ${NF.monthName(cur)}`, String(canc + late), `${late} con menos de 24 h (descontadas)`),
        tile('Clientes activos', String(NF.db().clients.filter(c => c.active).length), planMix(NF.db().clients.filter(c => c.active)))),
      h('div.adm-cols', null,
        h('section.card.chart', null,
          h('h2.card__title', null, 'Ingresos por mes'),
          h('ul.legend', null, h('li', null, h('span.legend__sw'), 'Cobrado'), h('li', null, h('span.legend__sw.legend__sw--due'), 'Pendiente')),
          bars),
        h('section.card.chart', null,
          h('h2.card__title', null, 'Sesiones por entrenador · ', NF.monthName(cur)),
          h('ul.hbars', null, perTrainer.map(x => h('li', null, h('span', null, x.t.name), h('span.hbars__track', null, hoverable(h('span.hbars__bar', { style: { width: (x.n / tmax * 100) + '%' } }), x.t.name, `${x.n} sesiones`)), h('strong', null, x.n)))),
          h('h2.card__title', { style: { marginTop: '28px' } }, 'Horas con más demanda'),
          h('p.muted.small', null, 'Sesiones por día y hora en las últimas 4 semanas. Más oscuro, más sesiones.'),
          hm)),
      tip);
  };

  boot();
})();
