/* NORDFIT — Mi cuenta: mi horario, mis sesiones, pagos y datos */
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
    changing: null // id de la sesión que se quiere cambiar, o 'recover'
  };
  const $ = s => document.querySelector(s);

  /* ---------------- Cabecera ---------------- */
  function renderHead() {
    const c = me();
    $('[data-first-name]').textContent = c.name.split(' ')[0];
    const u = NF.usage(c.id, cur);
    const done = NF.bookingsOf(c.id).filter(b => b.date.startsWith(cur) && NF.counts(b) && NF.at(b.date, b.h).getTime() < Date.now()).length;
    const pay = u.paid ? status('paid', 'Pagado') : u.promised ? status('pending', 'Pendiente de confirmar') : status('pending', 'Pendiente');
    const partner = c.partner ? NF.client(c.partner) : null;
    const dl = $('[data-stats]');
    dl.replaceChildren(
      h('div', null, h('dt', null, 'Plan'), h('dd', null, plan().name, partner ? h('small', null, ' con ' + partner.name.split(' ')[0]) : null)),
      h('div', null, h('dt', null, c.plan === 'grupo' ? 'Grupos' : 'Entrenador'), h('dd', null, c.plan === 'grupo' ? 'Todo el equipo' : NF.trainer(c.trainer).name)),
      h('div', null, h('dt', null, `Bono de ${NF.monthName(cur)}`),
        h('dd', null, h('span.num', null, `${done}/${u.total}`), h('small', null, ' hechas'),
          meter(done, u.total))),
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

  /* ---------------- Mi horario ----------------
     Cada cliente tiene un horario fijo y sus sesiones del mes salen de él.
     Desde aquí pide cambiar una sesión concreta (o recuperar una perdida):
     la solicitud le llega a su entrenador, que la acepta o la rechaza. */
  const DOWS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const when = (date, h) => `${NF.dayLabel(date)} a las ${NF.hourLabel(h)}`;
  const shortWhen = (date, h) => { const d = NF.parse(date); return `${NF.DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${NF.MONTHS[d.getMonth()].slice(0, 3)} · ${NF.hourLabel(h)}`; };
  const bookingById = id => NF.db().bookings.find(b => b.id === id);
  const future = b => NF.at(b.date, b.h).getTime() - Date.now() > 2 * 3600e3;
  function myBookingsOn(date) {
    return NF.bookingsOf(me().id).filter(b => b.date === date && NF.counts(b));
  }
  function renderMobileBar() { document.querySelector('.mbar')?.remove(); }

  function startChange(bookingId) {
    const b = bookingId ? bookingById(bookingId) : null;
    state.changing = bookingId || 'recover';
    state.month = b ? b.date.slice(0, 7) : state.month;
    state.trainer = b ? b.trainer : me().trainer;
    state.day = null;
    openTab('reservar');
    document.querySelector('[data-panel="reservar"]').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function stopChange() { state.changing = null; state.day = null; renderReservar(); }

  function requestStatus(r) {
    if (r.status === 'pending') return status('pending', `Pendiente de ${NF.trainer(r.approver).name}`);
    if (r.status === 'accepted') return status('paid', 'Aceptado');
    return status('off', 'Rechazado');
  }
  function requestText(r) {
    return r.from ? `${shortWhen(r.from.date, r.from.h)} → ${shortWhen(r.to.date, r.to.h)}` : `Recuperar: ${shortWhen(r.to.date, r.to.h)}`;
  }

  function renderReservar() {
    const panel = $('[data-panel="reservar"]');
    const c = me();
    const changing = state.changing;
    const moving = changing && changing !== 'recover' ? bookingById(changing) : null;
    if (changing && changing !== 'recover' && !moving) { state.changing = null; return renderReservar(); }
    const u = NF.usage(c.id, state.month);

    // Parte de arriba: horario fijo y solicitudes, o aviso del cambio en curso
    let top;
    if (changing) {
      top = h('div.notice.notice--warn', null, icon('clock'),
        h('div', null,
          h('p', null, h('strong', null, moving ? `Cambiar tu sesión del ${when(moving.date, moving.h)}. ` : `Recuperar una sesión de ${NF.monthName(state.month)}. `),
            `Elige el nuevo día y hora. Se lo enviaremos a ${NF.trainer(moving ? moving.trainer : c.trainer).name} para que lo confirme.`),
          h('button.link-btn', { type: 'button', onclick: stopChange }, 'Cancelar')));
    } else {
      const reqs = NF.db().requests.filter(r => r.client === c.id && r.status !== 'withdrawn').sort((a, b) => b.created.localeCompare(a.created)).slice(0, 4);
      const fixed = (c.schedule || []).slice().sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || a.h - b.h);
      top = h('div.fixed-row', null,
        h('section.fixed', null,
          h('h3', null, 'Tu horario fijo'),
          fixed.length ? h('ul.fixed__list', null, fixed.map(x => h('li', null, h('strong', null, `${NF.cap(DOWS[x.dow])} · ${NF.hourLabel(x.h)}`), h('span', null, x.group ? `Grupo con ${NF.trainer(x.trainer).name}` : `Con ${NF.trainer(x.trainer).name}`))))
            : h('p.muted', null, 'Tu entrenador aún no ha fijado tu horario.'),
          h('p.fixed__note', null, '¿No puedes ir algún día? Toca esa sesión en el calendario y pide el cambio. Para cambiar tu horario fijo, habla con tu entrenador.')),
        h('section.fixed', null,
          h('h3', null, 'Tus solicitudes'),
          reqs.length ? h('ul.req-list', null, reqs.map(r => h('li', null,
            h('span', null, h('strong', null, requestText(r)), r.status === 'rejected' && r.note ? h('small', null, r.note) : null),
            h('span.req-list__st', null, requestStatus(r),
              r.status === 'pending' ? h('button.link-btn', { type: 'button', onclick: () => { NF.cancelRequest(r.id); toast('Solicitud anulada.'); renderAll(); } }, 'Anular') : null))))
            : h('p.muted', null, 'No has pedido ningún cambio.'),
          u.left > 0 && state.month >= cur ? h('div.notice', null, icon('alert'), h('div', null,
            h('p', null, `Te ${u.left > 1 ? 'quedan' : 'queda'} ${u.left} ${u.left > 1 ? 'sesiones' : 'sesión'} por recuperar en ${NF.monthName(state.month)}.`),
            h('button.link-btn', { type: 'button', onclick: () => startChange(null) }, 'Pedir recuperación'))) : null));
    }

    // Calendario
    const monthNav = h('div.cal-nav', null,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Mes anterior', disabled: state.month === cur, svg: window.UI.ICON.left, onclick: () => { state.month = cur; state.day = null; renderReservar(); } }),
      h('h2.cal-nav__title', { 'aria-live': 'polite' }, NF.monthLabel(state.month)),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Mes siguiente', disabled: state.month === next, svg: window.UI.ICON.right, onclick: () => { state.month = next; state.day = null; renderReservar(); } }));
    const hint = h('p.cal-filter__note', null, changing
      ? (c.plan === 'grupo' ? 'Grupos con plazas libres' : `Huecos libres de ${NF.trainer(state.trainer).name}`)
      : 'Tus sesiones del mes');
    const first = NF.parse(state.month);
    const grid = h('div.cal-grid', { role: 'grid', 'aria-label': `Calendario de ${NF.monthLabel(state.month)}` });
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach((d, i) => grid.append(h('div.cal-dow', { role: 'columnheader', 'aria-label': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i] }, d)));
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) grid.append(h('div.cal-pad', { 'aria-hidden': 'true' }));
    const todayS = NF.today();
    let firstPick = null;
    for (let d = new Date(first); d.getMonth() === first.getMonth(); d = NF.addDays(d, 1)) {
      const date = NF.ymd(d);
      const past = date < todayS;
      const closed = NF.closure(date);
      const openDay = !!NF.STUDIO[d.getDay()];
      const mine = myBookingsOn(date);
      let info = ''; let selectable = false; let full = false;
      if (closed) info = closed.reason;
      else if (!openDay) info = 'Cerrado';
      else if (!past && changing) {
        const sl = NF.slots(c.id, date, state.trainer);
        const free = sl.filter(x => x.ok).length;
        selectable = free > 0;
        full = !free;
        info = free ? `${free} libre${free > 1 ? 's' : ''}` : sl.length && sl.every(x => x.away) ? 'No disponible' : 'Completo';
      } else if (mine.length) {
        info = mine.map(b => NF.hourLabel(b.h)).join(' · ');
        selectable = true;
      }
      if (selectable && !past && !firstPick) firstPick = date;
      const cls = ['cal-day'];
      if (past) cls.push('is-past');
      if (closed || !openDay) cls.push('is-closed');
      if (full) cls.push('is-full');
      if (date === todayS) cls.push('is-today');
      grid.append(h('button.' + cls.join('.'), {
        type: 'button', role: 'gridcell', 'data-date': date,
        'aria-label': `${NF.dayLabel(date)}. ${info}${mine.length ? '. Tienes sesión' : ''}`,
        disabled: !!closed || !openDay || (changing && (past || !selectable)),
        onclick: () => { state.day = date; renderReservar(); document.querySelector('.slots')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      },
      h('span.cal-day__n', null, d.getDate()),
      h('span.cal-day__info', null, info),
      h('span.cal-day__marks', { 'aria-hidden': 'true' }, mine.length ? h('span.mark-mine') : null,
        moving && moving.date === date ? h('span.mark-pick', null, '↺') : null)));
    }
    if (!state.day || !state.day.startsWith(state.month)) state.day = firstPick;
    const sel = state.day && grid.querySelector(`[data-date="${state.day}"]`);
    if (sel) { sel.classList.add('is-selected'); sel.setAttribute('aria-pressed', 'true'); }
    const legend = h('ul.cal-legend', null,
      h('li', null, h('span.mark-mine'), 'Tus sesiones'),
      changing && moving ? h('li', null, h('span.mark-pick', null, '↺'), 'Sesión que cambias') : null,
      h('li', null, h('span.lg-closed'), 'Cerrado'));
    const cal = h('div.cal-card', null, h('div.cal-top', null, monthNav, hint), grid, legend);

    panel.replaceChildren(
      h('div.panel__head', null, h('h2.display.h-sm', null, changing ? 'Elige el ' : 'Mi ', h('span.thin', null, changing ? 'nuevo hueco' : 'horario')), top),
      h('div.book', null, cal, h('div.book__side', null, changing ? renderSlots() : renderDay())));
  }

  // Detalle del día elegido: sus sesiones y el botón para pedir cambio
  function renderDay() {
    const box = h('div.slots');
    if (!state.day) { box.append(h('p.muted', null, 'No tienes sesiones este mes.')); return box; }
    box.append(h('h3.slots__title', null, NF.cap(NF.dayLabel(state.day))));
    const list = myBookingsOn(state.day);
    if (!list.length) { box.append(h('p.muted', null, 'No tienes sesión este día.')); return box; }
    box.append(h('ul.day-sess', null, list.map(b => {
      const r = NF.requestFor(b.id);
      return h('li', null,
        h('div', null, h('strong', null, `${NF.hourLabel(b.h)} – ${NF.hourLabel(b.h + 1)}`), h('span.muted', null, `${NF.PLANS[b.kind].name} con ${NF.trainer(b.trainer).name}`),
          r ? h('small.day-sess__req', null, icon('clock'), `Cambio pedido al ${shortWhen(r.to.date, r.to.h)} · pendiente`) : null),
        r ? h('button.link-btn', { type: 'button', onclick: () => { NF.cancelRequest(r.id); toast('Solicitud anulada.'); renderAll(); } }, 'Anular solicitud')
          : future(b) ? btn('Pedir cambio', { cls: 'btn--dark btn--sm', noIcon: true, onclick: () => startChange(b.id) }) : h('span.muted.small', null, NF.at(b.date, b.h).getTime() < Date.now() ? 'Hecha' : 'Es en menos de 2 h'));
    })));
    return box;
  }

  // Huecos libres del día elegido mientras se pide un cambio
  function renderSlots() {
    const box = h('div.slots');
    if (!state.day) { box.append(h('p.muted', null, 'No quedan huecos libres este mes.')); return box; }
    const c = me();
    const list = NF.slots(c.id, state.day, state.trainer);
    box.append(h('h3.slots__title', null, NF.cap(NF.dayLabel(state.day))));
    if (!list.length) { box.append(h('p.muted', null, c.plan === 'grupo' ? 'Este día no hay grupos.' : `${NF.trainer(state.trainer).name} no trabaja este día.`)); return box; }
    box.append(h('ul.slot-list', null, list.map(s => {
      let sub;
      if (s.mine) sub = 'Tu sesión';
      else if (s.kind === 'grupo') sub = s.free > 0 ? `${NF.trainer(s.trainer).name} · ${s.free} de ${s.cap} plazas` : 'Grupo completo';
      else sub = s.ok ? NF.trainer(s.trainer).name : s.away ? 'No disponible' : 'Ocupado';
      return h('li', null, h('button.slot' + (s.mine ? '.is-mine' : '') + (!s.ok && !s.mine ? '.is-off' : ''), {
        type: 'button', disabled: !s.ok, 'aria-label': `${NF.hourLabel(s.h)}, ${sub}`, onclick: () => requestModal(s)
      }, h('span.slot__h', null, NF.hourLabel(s.h)), h('span.slot__sub', null, sub)));
    })));
    return box;
  }

  function requestModal(s) {
    const c = me();
    const moving = state.changing !== 'recover' ? bookingById(state.changing) : null;
    if (!moving && NF.usage(c.id, s.date.slice(0, 7)).left <= 0) { toast(`No te quedan sesiones por recuperar en ${NF.monthName(s.date.slice(0, 7))}.`, 'warn'); return; }
    const who = NF.trainer(moving ? moving.trainer : s.trainer).name;
    const note = h('textarea', { id: 'rq-note', rows: '2', maxlength: '140', placeholder: 'Opcional: el motivo, por si ayuda' });
    const m = modal({
      title: moving ? 'Pedir cambio de sesión' : 'Pedir recuperación',
      body: h('div.stack', null,
        h('dl.change', null,
          moving ? h('div', null, h('dt', null, 'Sesión actual'), h('dd', null, NF.cap(when(moving.date, moving.h)))) : null,
          h('div', null, h('dt', null, moving ? 'Nueva' : 'Sesión'), h('dd', null, NF.cap(when(s.date, s.h)), ` · ${NF.trainer(s.trainer).name}`))),
        h('div.adm-form', null, h('label', { for: 'rq-note' }, `Mensaje para ${who}`), note),
        h('p.muted.small', null, `${who} recibirá la solicitud en su panel. Hasta que la acepte, tu sesión sigue como estaba.`)),
      actions: [h('button.link-btn', { type: 'button', onclick: () => m.close() }, 'Volver'), btn('Enviar solicitud', { cls: 'btn--dark', noIcon: true, onclick: () => {
        const res = NF.requestChange(c.id, moving ? moving.id : null, { date: s.date, h: s.h, trainer: s.trainer }, note.value.trim());
        m.close();
        if (res.error) { toast(res.error, 'warn'); renderReservar(); return; }
        toast(`Solicitud enviada a ${who}.`, 'ok');
        state.changing = null; state.day = s.date;
        renderAll();
      } })]
    });
  }

  /* Pago del bono. Dos caminos:
     - Tarjeta de crédito o débito → en producción abre Stripe Checkout y el
       pago queda confirmado al momento.
     - Transferencia o Bizum → se muestran los datos y el concepto; el cliente
       reserva ya y el pago queda pendiente hasta que el dueño lo confirma. */
  function copyBtn(text) {
    const b = h('button.chip-copy', { type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = 'Copiado'; } catch (e) { b.textContent = 'Selecciona y copia'; }
      setTimeout(() => { b.textContent = 'Copiar'; }, 1600);
    } }, 'Copiar');
    return b;
  }
  function payModal(month) {
    return new Promise(resolve => {
      const c = me();
      const u = NF.usage(c.id, month);
      let result = null;
      const concept = `NORDFIT ${c.name.split(' ')[0]} ${NF.monthName(month)}`.toUpperCase();
      const summary = h('div.pay__sum', null,
        h('div', null, h('span', null, `Bono ${plan().name}`), h('small', null, `${NF.cap(NF.monthLabel(month))} · ${u.total} sesiones`)),
        h('strong', null, NF.money(u.price)));
      const body = h('div.pay');
      const m = modal({ title: 'Pago del bono', body, onClose: () => resolve(result) });
      const done = (method, msg) => { NF.pay(c.id, month, method); result = method; toast(msg, 'ok'); m.close(); };

      // Paso 1: elegir cómo pagar
      const choose = () => body.replaceChildren(summary,
        h('div.pay-choices', null,
          h('button.pay-choice', { type: 'button', onclick: card },
            h('span.pay-choice__t', null, 'Tarjeta de crédito o débito'),
            h('span.pay-choice__d', null, 'Visa, Mastercard, Apple Pay o Google Pay. Queda pagado al momento.'),
            icon('right', 'pay-choice__ic')),
          h('button.pay-choice', { type: 'button', onclick: transfer },
            h('span.pay-choice__t', null, 'Transferencia bancaria o Bizum'),
            h('span.pay-choice__d', null, 'Te damos los datos. Reservas ya y lo confirmamos al recibirlo.'),
            icon('right', 'pay-choice__ic'))),
        h('p.pay__proto', null, h('span.tag-proto', null, 'Prototipo'), ' No se cobra nada.'));

      // Tarjeta: en producción, redirección a Stripe Checkout
      function card() {
        body.replaceChildren(summary,
          h('div.pay-wait', null, h('span.pay-spin', { 'aria-hidden': 'true' }), h('p', null, 'Abriendo la pasarela segura de Stripe…')),
          h('p.pay__proto', null, h('span.tag-proto', null, 'Prototipo'), ' En la versión real se abre la página de pago de Stripe. Los datos de la tarjeta nunca pasan por la web de Nordfit.'));
        setTimeout(() => done('card', `Pago de ${NF.money(u.price)} completado.`), 1400);
      }

      // Transferencia o Bizum: datos para pagar y aviso de que ya está hecho
      function transfer() {
        let how = 'bizum';
        const row = (label, value, copy) => h('div.bank-row', null, h('dt', null, label), h('dd', null, h('span', null, value), copy ? copyBtn(copy) : null));
        const tabs = h('div.choices.choices--dark', { role: 'radiogroup', 'aria-label': 'Cómo vas a pagar' },
          [['bizum', 'Bizum'], ['transfer', 'Transferencia']].map(([v, t]) => [
            h('input', { type: 'radio', name: 'how', id: 'how-' + v, value: v, checked: v === how, onchange: () => { how = v; paint(); } }),
            h('label', { for: 'how-' + v }, t)]));
        const data = h('dl.bank');
        const paint = () => data.replaceChildren(...(how === 'bizum'
          ? [row('Envía un Bizum a', NF.BANK.bizum, NF.BANK.bizum.replace(/\s/g, '')), row('Importe', NF.money(u.price)), row('Concepto', concept, concept)]
          : [row('Titular', NF.BANK.holder), row('IBAN', NF.BANK.iban, NF.BANK.iban.replace(/\s/g, '')), row('Importe', NF.money(u.price)), row('Concepto', concept, concept)]));
        paint();
        body.replaceChildren(summary, tabs, data,
          h('p.pay__note', null, 'Pon el concepto tal cual para que identifiquemos tu pago. Tus reservas quedan hechas y el pago aparece como pendiente hasta que lo comprobemos.'),
          h('p.pay__proto', null, h('span.tag-proto', null, 'Prototipo'), ' El IBAN es de ejemplo: el dueño pondrá el suyo.'),
          h('div.pay-actions', null,
            h('button.link-btn', { type: 'button', onclick: choose }, 'Volver'),
            btn('Ya he hecho el pago', { cls: 'btn--dark', noIcon: true, onclick: () => done(how, 'Gracias. Lo confirmaremos en cuanto lo recibamos.') })));
      }
      choose();
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
        (() => {
          const r = NF.requestFor(b.id);
          return h('div.sess__act', null,
            r ? h('small.day-sess__req', null, icon('clock'), `Cambio pedido al ${shortWhen(r.to.date, r.to.h)}`) : null,
            r ? h('button.link-btn', { type: 'button', onclick: () => { NF.cancelRequest(r.id); toast('Solicitud anulada.'); renderAll(); } }, 'Anular solicitud')
              : future(b) ? h('button.link-btn', { type: 'button', onclick: () => startChange(b.id) }, 'Pedir cambio') : null,
            r ? null : h('button.link-btn.link-btn--quiet', { type: 'button', onclick: () => cancelFlow(b) }, 'No podré ir'));
        })());
    };
    const pastRow = b => {
      const done = NF.at(b.date, b.h).getTime() <= now;
      const st = b.status === 'cancelled' ? status('off', 'Cancelada') : b.status === 'late' ? status('late', 'Cancelada tarde · descontada') : done ? status('paid', 'Hecha') : status('pending', 'Próxima');
      return h('tr', null, h('td', null, NF.cap(NF.dayLabel(b.date))), h('td', null, NF.hourLabel(b.h)), h('td', null, NF.trainer(b.trainer).name), h('td', null, st));
    };
    panel.replaceChildren(
      h('div.panel__head', null, h('h2.display.h-sm', null, 'Próximas ', h('span.thin', null, 'sesiones'))),
      upcoming.length ? h('ul.sess-list', null, upcoming.map(card)) : h('div.empty', null, h('p', null, 'No tienes sesiones próximas.'), btn('Ver mi horario', { cls: 'btn--dark', onclick: () => openTab('reservar') })),
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
        : `Vas a cancelar la sesión del ${when}. La sesión vuelve a tu bono y puedes pedir recuperarla otro día.`,
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
      const st = u.paid ? status('paid', `Pagado · ${NF.METHODS[u.payment.method]}`) : u.promised ? status('pending', 'Pendiente de confirmar') : status('pending', 'Pendiente');
      return h('article.bill' + (u.paid ? '' : '.bill--due'), null,
        h('div.bill__top', null, h('span.kicker', null, m === cur ? 'Este mes' : 'Próximo mes'), st),
        h('h3.display', null, NF.monthName(m)),
        h('p.bill__amt', null, h('b', null, u.price), h('span', null, ' € · ' + plan().name)),
        u.paid ? null : btn(u.promised ? 'Pagar con tarjeta' : 'Pagar bono', { cls: 'btn--dark', onclick: async () => { if (await payModal(m)) renderAll(); } }));
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

  window.addEventListener('nf:data', () => { if (!document.querySelector('dialog[open]')) renderAll(); });

  renderHead();
  const start = (location.hash || '').slice(1);
  openTab(render[start] ? start : 'reservar');
})();
