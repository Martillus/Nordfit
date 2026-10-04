/* NORDFIT — Mi cuenta: reservar, mis sesiones, pagos y datos */
(() => {
  const NF = window.NF;
  const { h, btn, chip, icon, modal, confirm, toast, status } = window.UI;
  const ses = NF.session.get();
  if (!ses || ses.role !== 'client' || !NF.client(ses.id)) { NF.session.logout(); window.location.replace('acceso.html'); return; }

  const me = () => NF.client(ses.id);
  const plan = () => NF.PLANS[me().plan];
  const cur = NF.thisMonth();
  const next = NF.addMonths(cur, 1);
  const state = {
    month: cur,
    trainer: me().trainer,
    day: null,
    cart: []
  };
  const $ = s => document.querySelector(s);

  /* ---------------- Cabecera ---------------- */
  function renderHead() {
    const c = me();
    $('[data-first-name]').textContent = c.name.split(' ')[0];
    const u = NF.usage(c.id, cur);
    const pay = u.paid ? status('paid', 'Pagado') : u.promised ? status('pending', 'Pagarás en el estudio') : status('pending', 'Pendiente');
    const partner = c.partner ? NF.client(c.partner) : null;
    const dl = $('[data-stats]');
    dl.replaceChildren(
      h('div', null, h('dt', null, 'Plan'), h('dd', null, plan().name, partner ? h('small', null, ' con ' + partner.name.split(' ')[0]) : null)),
      h('div', null, h('dt', null, c.plan === 'grupo' ? 'Grupos' : 'Entrenador'), h('dd', null, c.plan === 'grupo' ? 'Sergio y Jules' : NF.trainer(c.trainer).name)),
      h('div', null, h('dt', null, `Bono de ${NF.monthName(cur)}`),
        h('dd', null, h('span.num', null, `${u.used}/${u.total}`), h('small', null, ' sesiones'),
          meter(u.used, u.total))),
      h('div', null, h('dt', null, 'Pago del mes'), h('dd', null, pay))
    );
  }
  function meter(v, max) {
    const m = h('span.meter', { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(v), 'aria-label': `${v} de ${max} sesiones usadas` });
    for (let i = 0; i < max; i++) m.append(h('span' + (i < v ? '.is-on' : '')));
    return m;
  }

  /* ---------------- Pestañas ---------------- */
  const tabs = [...document.querySelectorAll('[data-tab]')];
  function openTab(name, focus) {
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    render[name]();
    renderMobileBar();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// */ }
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => openTab(t.dataset.tab));
    t.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); openTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true); }
    });
  });
  $('[data-logout]').addEventListener('click', () => { NF.session.logout(); window.location.href = 'index.html'; });

  /* ---------------- Reservar ---------------- */
  function monthLimit(m) {
    const u = NF.usage(me().id, m);
    return { u, max: u.left };
  }
  function cartIn(m) { return state.cart.filter(x => x.date.startsWith(m)).length; }
  function myBookingsOn(date) {
    return NF.bookingsOf(me().id).filter(b => b.date === date && NF.counts(b));
  }

  function renderReservar() {
    const panel = $('[data-panel="reservar"]');
    const c = me();
    const { u } = monthLimit(state.month);
    const inCart = cartIn(state.month);

    // Aviso del bono del mes que se está viendo
    let notice;
    if (u.paid || u.promised) {
      notice = h('div.notice', null,
        icon(u.paid ? 'check' : 'clock'),
        h('p', null, h('strong', null, `Bono de ${NF.monthName(state.month)}: `),
          u.left ? `te quedan ${u.left} de ${u.total} sesiones.` : 'ya has reservado todas tus sesiones.',
          u.promised ? ' Pago pendiente en el estudio.' : ''));
    } else {
      notice = h('div.notice.notice--warn', null, icon('alert'),
        h('p', null, h('strong', null, `Bono de ${NF.monthName(state.month)} pendiente de pago. `),
          `Elige tus ${u.total} sesiones y págalo al confirmar (${NF.money(u.price)}).`));
    }

    // Barra de herramientas: mes y entrenador
    const monthNav = h('div.cal-nav', null,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Mes anterior', disabled: state.month === cur, svg: window.UI.ICON.left, onclick: () => { state.month = cur; state.day = null; renderReservar(); } }),
      h('h2.cal-nav__title', { 'aria-live': 'polite' }, NF.monthLabel(state.month)),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Mes siguiente', disabled: state.month === next, svg: window.UI.ICON.right, onclick: () => { state.month = next; state.day = null; renderReservar(); } })
    );
    const filters = c.plan === 'grupo'
      ? h('p.cal-filter__note', null, 'Grupos reducidos con plazas limitadas')
      : h('div.cal-filter', { role: 'group', 'aria-label': 'Entrenador' },
        h('span.cal-filter__label', null, 'Entrenador'),
        NF.TRAINERS.map(t => chip(t.name + (t.id === c.trainer ? ' · el tuyo' : ''), { pressed: state.trainer === t.id, onclick: () => { state.trainer = t.id; renderReservar(); } })));

    // Calendario mensual
    const first = NF.parse(state.month);
    const offset = (first.getDay() + 6) % 7;
    const grid = h('div.cal-grid', { role: 'grid', 'aria-label': `Calendario de ${NF.monthLabel(state.month)}` });
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach((d, i) => grid.append(h('div.cal-dow', { role: 'columnheader', 'aria-label': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i] }, d)));
    for (let i = 0; i < offset; i++) grid.append(h('div.cal-pad', { 'aria-hidden': 'true' }));
    const todayS = NF.today();
    let firstFree = null;
    for (let d = new Date(first); d.getMonth() === first.getMonth(); d = NF.addDays(d, 1)) {
      const date = NF.ymd(d);
      const past = date < todayS;
      const closed = NF.closure(date);
      const openDay = !!NF.STUDIO[d.getDay()];
      const sl = past || closed || !openDay ? [] : NF.slots(c.id, date, state.trainer);
      const free = sl.filter(s => s.ok).length;
      const mine = myBookingsOn(date).length;
      const picked = state.cart.filter(x => x.date === date).length;
      if (!firstFree && free) firstFree = date;
      let info = '';
      if (closed) info = closed.reason;
      else if (!openDay) info = 'Cerrado';
      else if (past) info = '';
      else info = free ? `${free} libre${free > 1 ? 's' : ''}` : mine ? 'Tu sesión' : 'Completo';
      const cls = ['cal-day'];
      if (past) cls.push('is-past');
      if (closed || !openDay) cls.push('is-closed');
      if (!past && openDay && !closed && !free && !mine) cls.push('is-full');
      if (date === todayS) cls.push('is-today');
      if (state.day === date) cls.push('is-selected');
      const label = `${NF.dayLabel(date)}. ${info}${mine ? `. Tienes ${mine} sesión reservada` : ''}${picked ? `. ${picked} seleccionada` : ''}`;
      grid.append(h('button.' + cls.join('.'), {
        type: 'button', role: 'gridcell', 'aria-label': label, 'data-date': date, 'aria-pressed': String(state.day === date),
        disabled: past || !!closed || !openDay,
        onclick: () => { state.day = date; renderReservar(); document.querySelector('.slots')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      },
      h('span.cal-day__n', null, d.getDate()),
      h('span.cal-day__info', null, info),
      h('span.cal-day__marks', { 'aria-hidden': 'true' },
        mine ? h('span.mark-mine', { title: 'Reservada' }) : null,
        picked ? h('span.mark-pick', null, picked) : null)));
    }
    if (!state.day && firstFree) state.day = firstFree;
    if (state.day && !state.day.startsWith(state.month)) state.day = firstFree;
    const sel = state.day && grid.querySelector(`[data-date="${state.day}"]`);
    if (sel) { sel.classList.add('is-selected'); sel.setAttribute('aria-pressed', 'true'); }

    const legend = h('ul.cal-legend', null,
      h('li', null, h('span.mark-mine'), 'Tus sesiones'),
      h('li', null, h('span.mark-pick', null, '1'), 'Seleccionadas'),
      h('li', null, h('span.lg-closed'), 'Cerrado'));

    const cal = h('div.cal-card', null, h('div.cal-top', null, monthNav, filters), grid, legend);

    panel.replaceChildren(
      h('div.panel__head', null, h('h2.display.h-sm', null, 'Elige tus ', h('span.thin', null, 'sesiones')), notice),
      h('div.book', null, cal, h('div.book__side', null, renderSlots(), renderCart()))
    );
    renderMobileBar();
  }

  function renderSlots() {
    const box = h('div.slots');
    if (!state.day) { box.append(h('p.muted', null, 'No quedan huecos libres este mes con este filtro.')); return box; }
    const c = me();
    const list = NF.slots(c.id, state.day, state.trainer);
    const mineOther = myBookingsOn(state.day).filter(b => !list.some(s => s.h === b.h && s.mine));
    box.append(h('h3.slots__title', null, NF.cap(NF.dayLabel(state.day))));
    if (!list.length && !mineOther.length) {
      box.append(h('p.muted', null, c.plan === 'grupo' ? 'Este día no hay grupos.' : `${NF.trainer(state.trainer).name} no trabaja este día. Prueba con otro entrenador o día.`));
      return box;
    }
    const ul = h('ul.slot-list');
    list.forEach(s => {
      const picked = state.cart.some(x => x.date === s.date && x.h === s.h);
      let sub;
      if (s.mine) sub = 'Reservada';
      else if (s.kind === 'grupo') sub = s.free > 0 ? `${NF.trainer(s.trainer).name} · ${s.free} de ${s.cap} plazas` : 'Grupo completo';
      else sub = s.ok ? NF.trainer(s.trainer).name : 'Ocupado';
      const cls = 'slot' + (s.mine ? '.is-mine' : '') + (picked ? '.is-picked' : '') + (!s.ok && !s.mine ? '.is-off' : '');
      ul.append(h('li', null, h('button.' + cls, {
        type: 'button', disabled: !s.ok && !picked, 'aria-pressed': String(picked),
        'aria-label': `${NF.hourLabel(s.h)}, ${sub}${picked ? ', seleccionada' : ''}`,
        onclick: () => togglePick(s)
      }, h('span.slot__h', null, NF.hourLabel(s.h)), h('span.slot__sub', null, sub), picked ? icon('check', 'slot__ic') : null)));
    });
    mineOther.forEach(b => ul.append(h('li', null, h('div.slot.is-mine', null, h('span.slot__h', null, NF.hourLabel(b.h)), h('span.slot__sub', null, 'Reservada con ' + NF.trainer(b.trainer).name)))));
    box.append(ul);
    return box;
  }

  function togglePick(s) {
    const i = state.cart.findIndex(x => x.date === s.date && x.h === s.h);
    if (i > -1) { state.cart.splice(i, 1); renderReservar(); return; }
    const m = s.date.slice(0, 7);
    const { u, max } = monthLimit(m);
    if (cartIn(m) >= max) {
      toast(max === 0 ? `Ya has reservado tus ${u.total} sesiones de ${NF.monthName(m)}.` : `Tu bono de ${NF.monthName(m)} tiene ${max} sesiones disponibles.`, 'warn');
      return;
    }
    state.cart.push({ date: s.date, h: s.h, trainer: s.trainer });
    state.cart.sort((a, b) => (a.date + a.h).localeCompare(b.date + b.h));
    renderReservar();
  }

  function needsPayment() {
    return [...new Set(state.cart.map(x => x.date.slice(0, 7)))].filter(m => !NF.usage(me().id, m).canBook);
  }

  function renderCart() {
    const box = h('div.cart', { 'aria-live': 'polite' });
    box.append(h('h3.cart__title', null, 'Tu selección', h('span.cart__n', null, String(state.cart.length))));
    if (!state.cart.length) {
      box.append(h('p.muted', null, 'Toca un día y elige la hora. Puedes seleccionar varias sesiones del mes y confirmarlas juntas.'));
      return box;
    }
    box.append(h('ul.cart__list', null, state.cart.map(x => h('li', null,
      h('span', null, h('strong', null, NF.cap(NF.dayLabel(x.date))), h('small', null, `${NF.hourLabel(x.h)} · ${NF.trainer(x.trainer).name}`)),
      h('button.icon-btn.icon-btn--sm', { type: 'button', 'aria-label': `Quitar ${NF.dayLabel(x.date)} a las ${NF.hourLabel(x.h)}`, svg: window.UI.ICON.close, onclick: () => { state.cart = state.cart.filter(y => y !== x); renderReservar(); } })))));
    const unpaid = needsPayment();
    const total = unpaid.reduce((s, m) => s + NF.usage(me().id, m).price, 0);
    if (unpaid.length) box.append(h('p.cart__pay', null, `Incluye el pago del bono de ${unpaid.map(NF.monthName).join(' y ')}: `, h('strong', null, NF.money(total))));
    box.append(btn(unpaid.length ? `Pagar y reservar` : `Confirmar ${state.cart.length} ${state.cart.length > 1 ? 'reservas' : 'reserva'}`, { cls: 'btn--dark', onclick: checkout }));
    box.append(h('p.cart__rule', null, icon('clock'), `Puedes cancelar gratis hasta ${NF.CANCEL_HOURS} h antes.`));
    return box;
  }

  // Barra fija en móvil con el resumen de la selección
  function renderMobileBar() {
    let bar = document.querySelector('.mbar');
    if (!state.cart.length || document.querySelector('[data-panel="reservar"]').hidden) { bar?.remove(); return; }
    if (!bar) { bar = h('div.mbar'); document.body.append(bar); }
    const unpaid = needsPayment();
    bar.replaceChildren(
      h('span', null, h('strong', null, `${state.cart.length} ${state.cart.length > 1 ? 'sesiones' : 'sesión'}`), h('small', null, unpaid.length ? 'con pago del bono' : 'listas para confirmar')),
      btn(unpaid.length ? 'Pagar y reservar' : 'Confirmar', { cls: 'btn--sm', onclick: checkout }));
  }

  async function checkout() {
    const unpaid = needsPayment();
    for (const m of unpaid) {
      const method = await payModal(m);
      if (!method) return;
    }
    const res = NF.book(me().id, state.cart);
    if (res.error) { toast(res.error, 'warn'); state.cart = []; renderAll(); return; }
    const n = res.made.length;
    state.cart = [];
    renderAll();
    const m = modal({
      title: n > 1 ? `${n} sesiones reservadas` : 'Sesión reservada',
      body: h('div.done', null,
        h('p', null, 'Te hemos enviado la confirmación por email. Te recordaremos cada sesión el día antes.'),
        h('ul.done__list', null, res.made.map(b => h('li', null, icon('check'), `${NF.cap(NF.dayLabel(b.date))} · ${NF.hourLabel(b.h)} · ${NF.trainer(b.trainer).name}`)))),
      actions: [btn('Ver mis sesiones', { cls: 'btn--dark', onclick: () => { m.close(); openTab('sesiones'); } })]
    });
  }

  /* Pasarela de pago simulada. En producción: Stripe Checkout (tarjeta,
     Apple Pay, Google Pay y domiciliación SEPA) y el webhook confirma el pago. */
  function payModal(month) {
    return new Promise(resolve => {
      const c = me();
      const u = NF.usage(c.id, month);
      let method = c.method === 'sepa' ? 'sepa' : 'card';
      let result = null;
      const opts = [
        ['card', 'Tarjeta', 'Visa, Mastercard, Apple Pay o Google Pay. Se cobra ahora.'],
        ['sepa', 'Domiciliación bancaria', 'Con tu IBAN. Se cobra ahora y cada mes de forma automática.'],
        ['cash', 'Pagar en el estudio', 'Efectivo o transferencia. Reservas ya y lo confirmamos al recibirlo.']
      ];
      const radios = h('div.pay-opts', { role: 'radiogroup', 'aria-label': 'Forma de pago' }, opts.map(([v, t, d]) => {
        const id = 'pm-' + v;
        return h('div.pay-opt', null,
          h('input', { type: 'radio', name: 'pm', id, value: v, checked: v === method, onchange: () => { method = v; updateBtn(); } }),
          h('label', { for: id }, h('strong', null, t), h('small', null, d)));
      }));
      const payBtn = btn('', { cls: 'btn--dark', onclick: go });
      const updateBtn = () => {
        const t = method === 'cash' ? 'Reservar y pagar en el estudio' : `Pagar ${NF.money(u.price)}`;
        payBtn.querySelectorAll('.roll span').forEach(s => { s.textContent = t; });
      };
      updateBtn();
      const body = h('div.pay', null,
        h('div.pay__sum', null,
          h('div', null, h('span', null, `Bono ${plan().name}`), h('small', null, `${NF.monthLabel(month)} · ${u.total} sesiones`)),
          h('strong', null, NF.money(u.price))),
        radios,
        h('p.pay__proto', null, h('span.tag-proto', null, 'Prototipo'), ' No se cobra nada. En la versión real aquí se abre la pasarela segura de Stripe y los datos de pago nunca pasan por la web de Nordfit.'));
      const m = modal({ title: 'Pago del bono', body, actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Cancelar'), payBtn], onClose: () => resolve(result) });
      function go() {
        payBtn.disabled = true;
        payBtn.classList.add('is-loading');
        setTimeout(() => {
          NF.pay(c.id, month, method);
          result = method;
          toast(method === 'cash' ? 'Anotado: pagarás en el estudio.' : `Pago de ${NF.money(u.price)} completado.`, 'ok');
          m.close();
        }, 900);
      }
    });
  }

  /* ---------------- Mis sesiones ---------------- */
  function renderSesiones() {
    const panel = $('[data-panel="sesiones"]');
    const all = NF.bookingsOf(me().id);
    const now = Date.now();
    const upcoming = all.filter(b => b.status === 'ok' && NF.at(b.date, b.h).getTime() > now);
    const past = all.filter(b => !(b.status === 'ok' && NF.at(b.date, b.h).getTime() > now)).reverse().slice(0, 12);

    const card = b => {
      const info = NF.cancelInfo(b);
      const partner = me().partner && b.clients.length > 1 ? ' · en pareja' : '';
      return h('li.sess', null,
        h('div.sess__date', null, h('span', null, NF.DAYS[NF.parse(b.date).getDay()].slice(0, 3)), h('strong', null, NF.parse(b.date).getDate()), h('span', null, NF.MONTHS[NF.parse(b.date).getMonth()].slice(0, 3))),
        h('div.sess__main', null,
          h('strong', null, `${NF.hourLabel(b.h)} – ${NF.hourLabel(b.h + 1)}`),
          h('span.muted', null, `${NF.PLANS[b.kind].name} con ${NF.trainer(b.trainer).name}${partner}`),
          info.late ? h('small.sess__warn', null, icon('alert'), 'Faltan menos de 24 h: si cancelas, la sesión se descuenta') : null),
        h('button.link-btn', { type: 'button', onclick: () => cancelFlow(b) }, 'Cancelar'));
    };
    const pastRow = b => {
      const done = NF.at(b.date, b.h).getTime() <= now;
      const st = b.status === 'cancelled' ? status('off', 'Cancelada') : b.status === 'late' ? status('late', 'Cancelada tarde · descontada') : done ? status('paid', 'Hecha') : status('pending', 'Próxima');
      return h('tr', null, h('td', null, NF.cap(NF.dayLabel(b.date))), h('td', null, NF.hourLabel(b.h)), h('td', null, NF.trainer(b.trainer).name), h('td', null, st));
    };
    panel.replaceChildren(
      h('div.panel__head', null, h('h2.display.h-sm', null, 'Próximas ', h('span.thin', null, 'sesiones'))),
      upcoming.length ? h('ul.sess-list', null, upcoming.map(card)) : h('div.empty', null, h('p', null, 'No tienes sesiones próximas.'), btn('Reservar', { cls: 'btn--dark', onclick: () => openTab('reservar') })),
      h('h3.sub', null, 'Historial'),
      past.length ? h('div.table-wrap', null, h('table.tbl', null,
        h('thead', null, h('tr', null, ['Día', 'Hora', 'Entrenador', 'Estado'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, past.map(pastRow)))) : h('p.muted', null, 'Aún no hay historial.')
    );
  }
  async function cancelFlow(b) {
    const info = NF.cancelInfo(b);
    const when = `${NF.dayLabel(b.date)} a las ${NF.hourLabel(b.h)}`;
    const ok = await confirm(
      info.late ? 'Cancelar con menos de 24 h' : 'Cancelar sesión',
      info.late
        ? `La sesión del ${when} empieza en menos de 24 horas. Si la cancelas, se descuenta de tu bono igualmente.`
        : `Vas a cancelar la sesión del ${when}. La sesión vuelve a tu bono y puedes reservar otro hueco.`,
      info.late ? 'Cancelar y perder la sesión' : 'Cancelar sesión', { danger: info.late, cancelText: 'Mantener' });
    if (!ok) return;
    NF.cancel(b.id);
    toast(info.late ? 'Sesión cancelada. Se ha descontado del bono.' : 'Sesión cancelada. La tienes de nuevo en tu bono.', 'ok');
    renderAll();
  }

  /* ---------------- Pagos ---------------- */
  function renderPagos() {
    const panel = $('[data-panel="pagos"]');
    const c = me();
    const pays = NF.db().payments.filter(p => p.client === c.id).sort((a, b) => b.month.localeCompare(a.month));
    const cards = [cur, next].map(m => {
      const u = NF.usage(c.id, m);
      const st = u.paid ? status('paid', `Pagado · ${NF.METHODS[u.payment.method]}`) : u.promised ? status('pending', 'Pagarás en el estudio') : status('pending', 'Pendiente');
      return h('article.bill' + (u.paid ? '' : '.bill--due'), null,
        h('div.bill__top', null, h('span.kicker', null, m === cur ? 'Este mes' : 'Próximo mes'), st),
        h('h3.display', null, NF.monthName(m)),
        h('p.bill__amt', null, h('b', null, u.price), h('span', null, ' € · ' + plan().name)),
        u.paid ? null : btn(u.promised ? 'Pagar ahora online' : 'Pagar bono', { cls: 'btn--dark', onclick: async () => { if (await payModal(m)) renderAll(); } }));
    });
    const row = p => h('tr', null,
      h('td', null, NF.cap(NF.monthLabel(p.month))),
      h('td', null, NF.money(p.amount)),
      h('td', null, NF.METHODS[p.method] || '—'),
      h('td', null, p.status === 'paid' ? status('paid', 'Pagado') : status('pending', 'Pendiente')),
      h('td', null, p.status === 'paid' ? h('button.link-btn', { type: 'button', onclick: () => toast('En la versión real, el recibo se descarga en PDF desde Stripe.') }, 'Recibo') : '—'));
    panel.replaceChildren(
      h('div.panel__head', null, h('h2.display.h-sm', null, 'Tus ', h('span.thin', null, 'pagos'))),
      h('div.bills', null, cards),
      c.method === 'sepa' ? h('div.notice', null, icon('check'), h('p', null, h('strong', null, 'Domiciliación activa. '), 'Tu bono se cobra automáticamente el día 1 de cada mes.')) : '',
      h('h3.sub', null, 'Historial'),
      h('div.table-wrap', null, h('table.tbl', null,
        h('thead', null, h('tr', null, ['Mes', 'Importe', 'Forma de pago', 'Estado', ''].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, pays.map(row))))
    );
  }

  /* ---------------- Mis datos ---------------- */
  function renderDatos() {
    const panel = $('[data-panel="datos"]');
    const c = me();
    const field = (id, label, attrs) => h('div.field.field--half', null, h('label', { for: id }, label), h('input', Object.assign({ id }, attrs)), h('span.field__err', null, 'Revisa este campo.'));
    const form = h('form.form', { novalidate: true },
      field('d-name', 'Nombre', { name: 'name', value: c.name, required: true, autocomplete: 'name' }),
      field('d-phone', 'Teléfono', { name: 'phone', value: c.phone, required: true, type: 'tel', pattern: '[0-9 +]{9,}', autocomplete: 'tel' }),
      field('d-email', 'Email (para entrar)', { name: 'email', value: c.email, type: 'email', readonly: true }),
      btn('Guardar cambios', { cls: 'btn--dark', type: 'submit' }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      let ok = true;
      form.querySelectorAll('[required]').forEach(i => { const v = i.value.trim() !== '' && i.checkValidity(); i.closest('.field').classList.toggle('is-error', !v); if (!v) ok = false; });
      if (!ok) return;
      NF.updateProfile(c.id, { name: form.name.value.trim(), phone: form.phone.value.trim() });
      toast('Datos guardados.', 'ok');
      renderHead();
    });
    panel.replaceChildren(
      h('div.panel__head', null, h('h2.display.h-sm', null, 'Mis ', h('span.thin', null, 'datos'))),
      h('div.datos', null,
        form,
        h('aside.datos__plan', null,
          h('h3', null, 'Tu plan'),
          h('p', null, h('strong', null, plan().name), ` · ${plan().sessions} sesiones al mes · ${NF.money(plan().price)}`),
          h('p.muted', null, '¿Quieres cambiar de plan, de entrenador o pausar un mes? Escríbenos y lo ajustamos.'),
          h('a.link-btn', { href: 'https://wa.me/34687386917', target: '_blank', rel: 'noopener' }, icon('wa'), 'Escribir por WhatsApp'),
          h('div.proto-box', null, h('span.tag-proto', null, 'Prototipo'),
            h('p', null, 'Los datos de prueba se guardan solo en este navegador.'),
            h('button.link-btn', { type: 'button', onclick: async () => { if (await confirm('Restablecer datos', 'Se borran tus reservas y pagos de prueba y se vuelve al estado inicial.', 'Restablecer')) { NF.reset(); window.location.href = 'acceso.html'; } } }, 'Restablecer datos de prueba'))))
    );
  }

  const render = { reservar: renderReservar, sesiones: renderSesiones, pagos: renderPagos, datos: renderDatos };
  function renderAll() {
    renderHead();
    const open = tabs.find(t => t.getAttribute('aria-selected') === 'true')?.dataset.tab || 'reservar';
    render[open]();
    renderMobileBar();
  }

  renderHead();
  const start = (location.hash || '').slice(1);
  openTab(render[start] ? start : 'reservar');
})();
