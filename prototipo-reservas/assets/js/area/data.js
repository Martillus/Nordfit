/* NORDFIT — datos del área de clientes (PROTOTIPO)
   Simula el backend en localStorage con la misma forma que tendrán las tablas
   reales (clientes, reservas, pagos, cierres, grupos). Al pasar a producción,
   solo cambia este archivo: las funciones públicas se conectan a Supabase y
   el pago a Stripe Checkout. */
window.NF = (() => {
  const KEY = 'nf-demo-v1';
  const SKEY = 'nf-session';

  /* ---------------- Catálogo fijo ---------------- */
  const TRAINERS = [
    { id: 'sergio', name: 'Sergio' },
    { id: 'jules', name: 'Jules' }
  ];
  const PLANS = {
    personal: { id: 'personal', name: 'Personal 1:1', short: '1:1', price: 360, single: 50, sessions: 8 },
    pareja: { id: 'pareja', name: 'En pareja', short: 'Pareja', price: 240, single: 35, sessions: 8 },
    grupo: { id: 'grupo', name: 'Grupo reducido', short: 'Grupo', price: 120, single: 25, sessions: 8 }
  };
  const METHODS = {
    card: 'Tarjeta',
    sepa: 'Domiciliación',
    cash: 'Efectivo',
    transfer: 'Transferencia'
  };
  // Horario del estudio: hora de inicio de cada sesión de 60 min
  const STUDIO = { 1: [7, 21], 2: [7, 21], 3: [7, 21], 4: [7, 21], 5: [7, 21], 6: [9, 13] };
  // Turnos de cada entrenador (orientativo, editable cuando lo confirme el dueño)
  const SHIFTS = {
    sergio: { 1: [7, 14], 2: [7, 14], 3: [7, 14], 4: [7, 14], 5: [7, 14], 6: [9, 13] },
    jules: { 1: [14, 21], 2: [14, 21], 3: [14, 21], 4: [14, 21], 5: [14, 21] }
  };
  const CANCEL_HOURS = 24;
  const MIN_LEAD_HOURS = 2;

  /* ---------------- Fechas ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ym = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (s, n) => { const d = parse(s); d.setMonth(d.getMonth() + n); return ym(d); };
  const at = (date, h) => { const d = parse(date); d.setHours(h, 0, 0, 0); return d; };
  const today = () => ymd(new Date());
  const thisMonth = () => ym(new Date());
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const monthName = m => MONTHS[parse(m).getMonth()];
  const monthLabel = m => `${monthName(m)} ${parse(m).getFullYear()}`;
  const dayLabel = s => { const d = parse(s); return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const hourLabel = h => `${pad(h)}:00`;
  const money = n => `${n.toLocaleString('es-ES')} €`;

  /* ---------------- Almacenamiento ---------------- */
  let mem = null;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* modo privado */ } }
  };
  function db() {
    if (mem) return mem;
    const raw = ls.get(KEY);
    if (raw) { try { mem = JSON.parse(raw); if (mem.v === 1) return mem; } catch (e) { /* datos corruptos */ } }
    mem = seed();
    save();
    return mem;
  }
  function save() { ls.set(KEY, JSON.stringify(mem)); }
  function reset() { ls.del(KEY); ls.del(SKEY); mem = null; db(); }
  const uid = p => p + Math.random().toString(36).slice(2, 9);

  /* ---------------- Datos de ejemplo ---------------- */
  function seed() {
    let s = 20261004;
    const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];

    const people = [
      ['Lucía Fernández', 'personal', 'sergio'], ['Elías Romero', 'personal', 'jules'], ['Isaac Arroyo', 'personal', 'sergio'],
      ['Beatriz Díaz', 'personal', 'jules'], ['Marta Gil', 'personal', 'sergio'], ['Pablo Herrera', 'personal', 'jules'],
      ['Carmen Ortiz', 'personal', 'sergio'], ['Javier Molina', 'personal', 'jules'], ['Nuria Castro', 'personal', 'sergio'],
      ['Daniel Rubio', 'personal', 'jules'], ['Alba Navarro', 'personal', 'sergio'], ['Hugo Serrano', 'personal', 'jules'],
      ['Sara Prieto', 'pareja', 'jules'], ['Óscar Prieto', 'pareja', 'jules'],
      ['Irene Vidal', 'pareja', 'sergio'], ['Andrés Vidal', 'pareja', 'sergio'],
      ['Claudia Ramos', 'pareja', 'jules'], ['Teresa Ramos', 'pareja', 'jules'],
      ['Raúl Medina', 'grupo', 'jules'], ['Paula Iglesias', 'grupo', 'jules'], ['Sofía Cano', 'grupo', 'sergio'],
      ['Diego Lozano', 'grupo', 'sergio'], ['Laura Pascual', 'grupo', 'jules'], ['Miguel Santos', 'grupo', 'sergio'],
      ['Elena Vega', 'grupo', 'jules'], ['Adrián León', 'grupo', 'sergio'], ['Inés Calvo', 'grupo', 'jules'],
      ['Rocío Marín', 'grupo', 'sergio']
    ];
    const now = new Date();
    const cur = ym(now);
    const clients = people.map(([name, plan, trainer], i) => {
      const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').split(' ');
      const since = addMonths(cur, -(2 + Math.floor(rnd() * 18)));
      return {
        id: 'c' + (i + 1), name, plan, trainer,
        email: i === 0 ? 'lucia@ejemplo.com' : `${slug[0]}.${slug[1]}@ejemplo.com`,
        phone: '6' + String(10000000 + Math.floor(rnd() * 89999999)),
        method: i === 0 ? 'card' : pick(['cash', 'transfer', 'transfer', 'cash', 'sepa', 'card']),
        since: since + '-01', active: true, partner: null,
        notes: ''
      };
    });
    // Parejas
    [[12, 13], [14, 15], [16, 17]].forEach(([a, b]) => { clients[a].partner = clients[b].id; clients[b].partner = clients[a].id; });
    clients[27].active = false;

    // Grupos fijos semanales (día, hora, entrenador, plazas)
    const groups = [
      { id: 'g1', dow: 1, h: 19, trainer: 'jules', cap: 4 },
      { id: 'g2', dow: 2, h: 8, trainer: 'sergio', cap: 4 },
      { id: 'g3', dow: 3, h: 19, trainer: 'jules', cap: 4 },
      { id: 'g4', dow: 4, h: 8, trainer: 'sergio', cap: 4 },
      { id: 'g5', dow: 5, h: 18, trainer: 'jules', cap: 4 },
      { id: 'g6', dow: 6, h: 10, trainer: 'sergio', cap: 5 }
    ];

    // Días cerrados de ejemplo (festivos de Madrid próximos)
    const closures = [];
    const y = now.getFullYear();
    [[`${y}-10-12`, 'Fiesta Nacional'], [`${y}-11-01`, 'Todos los Santos'], [`${y}-11-09`, 'Almudena'], [`${y}-12-08`, 'Inmaculada'], [`${y}-12-25`, 'Navidad']]
      .forEach(([date, reason]) => closures.push({ id: uid('x'), date, reason }));

    const data = { v: 1, clients, groups, closures, bookings: [], payments: [], reminders: [] };

    // Pagos: últimos 6 meses
    for (let k = -5; k <= 0; k++) {
      const m = addMonths(cur, k);
      clients.forEach((c, i) => {
        if (c.since.slice(0, 7) > m || (!c.active && k >= -1)) return;
        const pending = k === 0 ? [2, 5, 9, 19, 22, 24].includes(i) : (k === -1 && i === 24);
        data.payments.push({
          id: uid('p'), client: c.id, month: m, amount: PLANS[c.plan].price,
          status: pending ? 'pending' : 'paid', method: c.method,
          paidAt: pending ? null : `${m}-0${1 + Math.floor(rnd() * 6)}`
        });
      });
    }

    // Reservas: mes anterior y mes actual
    const busy = new Set(data.closures.map(x => x.date));
    const usedTrainer = new Set();
    const groupCount = {};
    const add = (b) => data.bookings.push(Object.assign({ id: uid('b'), status: 'ok', created: b.date }, b));
    for (let k = -1; k <= 0; k++) {
      const m = addMonths(cur, k);
      const start = parse(m);
      const days = [];
      for (let d = new Date(start); d.getMonth() === start.getMonth(); d = addDays(d, 1)) if (STUDIO[d.getDay()] && !busy.has(ymd(d))) days.push(ymd(d));
      const done = new Set();
      clients.forEach((c, i) => {
        if (!c.active || done.has(c.id)) return;
        const paid = data.payments.some(p => p.client === c.id && p.month === m && p.status === 'paid');
        if (!paid) return;
        const ids = c.partner ? [c.id, c.partner] : [c.id];
        ids.forEach(x => done.add(x));
        // El mes actual no está completo: unas 5 sesiones reservadas
        const want = k === 0 ? (i === 0 ? 5 : 3 + Math.floor(rnd() * 4)) : 8;
        let got = 0; let tries = 0;
        while (got < want && tries < 400) {
          tries++;
          const date = pick(days);
          const dow = parse(date).getDay();
          if (c.plan === 'grupo') {
            const g = data.groups.find(gr => gr.dow === dow);
            if (!g) continue;
            const key = date + g.h;
            if ((groupCount[key] || 0) >= g.cap) continue;
            if (data.bookings.some(b => b.date === date && b.h === g.h && b.clients.includes(c.id))) continue;
            groupCount[key] = (groupCount[key] || 0) + 1;
            add({ date, h: g.h, trainer: g.trainer, kind: 'grupo', clients: ids });
          } else {
            const sh = SHIFTS[c.trainer][dow];
            if (!sh) continue;
            const h = sh[0] + Math.floor(rnd() * (sh[1] - sh[0] + 1));
            const key = c.trainer + date + h;
            if (usedTrainer.has(key) || data.groups.some(g => g.dow === dow && g.h === h && g.trainer === c.trainer)) continue;
            usedTrainer.add(key);
            add({ date, h, trainer: c.trainer, kind: c.plan, clients: ids });
          }
          got++;
        }
      });
    }
    // Algunas cancelaciones de ejemplo
    data.bookings.filter((_, i) => i % 23 === 0).forEach(b => { b.status = 'cancelled'; });
    data.bookings.filter((_, i) => i % 41 === 7).forEach(b => { b.status = 'late'; });
    return data;
  }

  /* ---------------- Sesión ---------------- */
  const initials = n => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const session = {
    get() { try { return JSON.parse(ls.get(SKEY) || 'null'); } catch (e) { return null; } },
    loginClient(email) {
      const c = db().clients.find(x => x.email.toLowerCase() === email.trim().toLowerCase() && x.active);
      if (!c) return null;
      const s = { role: 'client', id: c.id, name: c.name, initials: initials(c.name) };
      ls.set(SKEY, JSON.stringify(s));
      return s;
    },
    loginAdmin(user, pass) {
      // Prototipo: en producción cada administrador tiene su propia cuenta en Supabase
      if (!(user.trim().toLowerCase() === 'admin@nordfit.es' && pass === 'nordfit')) return null;
      const s = { role: 'admin', name: 'Administración', initials: 'NF' };
      ls.set('nf-admin', JSON.stringify(s));
      return s;
    },
    admin() { try { return JSON.parse(ls.get('nf-admin') || 'null'); } catch (e) { return null; } },
    logout() { ls.del(SKEY); },
    logoutAdmin() { ls.del('nf-admin'); }
  };

  /* ---------------- Consultas ---------------- */
  const client = id => db().clients.find(c => c.id === id);
  const trainer = id => TRAINERS.find(t => t.id === id);
  const closure = date => db().closures.find(x => x.date === date);
  const isOpen = date => !!STUDIO[parse(date).getDay()] && !closure(date);
  const counts = b => b.status === 'ok' || b.status === 'late';

  function payment(clientId, month) {
    return db().payments.find(p => p.client === clientId && p.month === month) || null;
  }
  function bookingsOf(clientId) {
    return db().bookings.filter(b => b.clients.includes(clientId)).sort((a, b) => (a.date + pad(a.h)).localeCompare(b.date + pad(b.h)));
  }
  // Sesiones del bono: pagado → 8; si no, 0 (se reserva al pagar)
  function usage(clientId, month) {
    const c = client(clientId);
    const p = payment(clientId, month);
    const paid = !!p && p.status === 'paid';
    const used = db().bookings.filter(b => b.clients.includes(clientId) && b.date.startsWith(month) && counts(b)).length;
    const total = PLANS[c.plan].sessions;
    // "Pagaré en el estudio": puede reservar, pero el pago sigue pendiente en /admin
    const promised = !!p && p.status === 'pending' && !!p.promised;
    return { paid, promised, canBook: paid || promised, payment: p, total, used, left: Math.max(0, total - used), price: PLANS[c.plan].price };
  }
  function trainerBusy(tid, date, h) {
    const dow = parse(date).getDay();
    if (db().groups.some(g => g.dow === dow && g.h === h && g.trainer === tid)) return true;
    return db().bookings.some(b => b.trainer === tid && b.date === date && b.h === h && b.kind !== 'grupo' && counts(b));
  }
  function groupTaken(date, h) {
    return db().bookings.filter(b => b.kind === 'grupo' && b.date === date && b.h === h && counts(b)).length;
  }
  const bookable = (date, h) => at(date, h).getTime() - Date.now() >= MIN_LEAD_HOURS * 3600e3;

  /* Huecos de un día para un cliente.
     1:1 y pareja: horas libres del entrenador elegido.
     Grupo: sesiones fijas con plazas libres. */
  function slots(clientId, date, trainerId) {
    const c = client(clientId);
    if (!isOpen(date)) return [];
    const dow = parse(date).getDay();
    const mine = h => db().bookings.some(b => b.date === date && b.h === h && b.clients.includes(clientId) && counts(b));
    if (c.plan === 'grupo') {
      return db().groups.filter(g => g.dow === dow).map(g => {
        const taken = groupTaken(date, g.h);
        return { date, h: g.h, trainer: g.trainer, kind: 'grupo', free: g.cap - taken, cap: g.cap, mine: mine(g.h), ok: bookable(date, g.h) && taken < g.cap && !mine(g.h) };
      });
    }
    const tid = trainerId || c.trainer;
    const sh = SHIFTS[tid][dow];
    if (!sh) return [];
    const out = [];
    for (let h = sh[0]; h <= sh[1]; h++) {
      const isMine = mine(h);
      out.push({ date, h, trainer: tid, kind: c.plan, mine: isMine, ok: bookable(date, h) && !trainerBusy(tid, date, h) && !isMine });
    }
    return out;
  }

  /* ---------------- Acciones del cliente ---------------- */
  function book(clientId, items) {
    const c = client(clientId);
    const ids = c.partner ? [c.id, c.partner] : [c.id];
    const byMonth = {};
    items.forEach(it => { const m = it.date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + 1; });
    for (const m in byMonth) {
      const u = usage(clientId, m);
      if (!u.canBook) return { error: `El bono de ${monthName(m)} está pendiente de pago.` };
      if (byMonth[m] > u.left) return { error: `En ${monthName(m)} te quedan ${u.left} sesiones.` };
    }
    for (const it of items) {
      const s = slots(clientId, it.date, it.trainer).find(x => x.h === it.h);
      if (!s || !s.ok) return { error: `El hueco del ${dayLabel(it.date)} a las ${hourLabel(it.h)} ya no está libre.` };
    }
    const made = items.map(it => {
      const b = { id: uid('b'), date: it.date, h: it.h, trainer: it.trainer, kind: c.plan, clients: ids, status: 'ok', created: today() };
      db().bookings.push(b);
      return b;
    });
    save();
    return { ok: true, made };
  }
  function cancelInfo(b) {
    const hours = (at(b.date, b.h).getTime() - Date.now()) / 3600e3;
    return { hours, late: hours < CANCEL_HOURS, past: hours <= 0 };
  }
  function cancel(bookingId) {
    const b = db().bookings.find(x => x.id === bookingId);
    if (!b) return null;
    const info = cancelInfo(b);
    if (info.past) return null;
    b.status = info.late ? 'late' : 'cancelled';
    save();
    return b;
  }
  /* Pago: en producción crea una sesión de Stripe Checkout y el webhook marca
     el pago como cobrado. "En el estudio" queda pendiente hasta que el dueño
     lo confirme desde /admin. */
  function pay(clientId, month, method) {
    const c = client(clientId);
    let p = payment(clientId, month);
    if (!p) { p = { id: uid('p'), client: clientId, month, amount: PLANS[c.plan].price, status: 'pending', method, paidAt: null }; db().payments.push(p); }
    p.method = method;
    p.promised = method === 'cash' || method === 'transfer';
    if (method === 'card' || method === 'sepa') { p.status = 'paid'; p.paidAt = today(); }
    save();
    return p;
  }
  function updateProfile(clientId, fields) {
    Object.assign(client(clientId), fields);
    save();
  }

  /* ---------------- Acciones de administración ---------------- */
  function markPaid(paymentId, method) {
    const p = db().payments.find(x => x.id === paymentId);
    p.status = 'paid'; p.method = method || p.method; p.paidAt = today();
    save();
    return p;
  }
  function markPending(paymentId) {
    const p = db().payments.find(x => x.id === paymentId);
    p.status = 'pending'; p.paidAt = null;
    save();
  }
  // Crea los cargos del mes para los clientes activos que aún no lo tienen
  function ensureMonth(month) {
    let n = 0;
    db().clients.filter(c => c.active && c.since.slice(0, 7) <= month).forEach(c => {
      if (!payment(c.id, month)) { db().payments.push({ id: uid('p'), client: c.id, month, amount: PLANS[c.plan].price, status: 'pending', method: c.method, paidAt: null }); n++; }
    });
    if (n) save();
    return n;
  }
  function remind(clientId, month) {
    db().reminders.push({ client: clientId, month, at: new Date().toISOString() });
    save();
  }
  function lastReminder(clientId, month) {
    const r = db().reminders.filter(x => x.client === clientId && x.month === month);
    return r.length ? r[r.length - 1].at : null;
  }
  function saveClient(fields) {
    if (fields.id) { Object.assign(client(fields.id), fields); save(); return client(fields.id); }
    const c = Object.assign({ id: uid('c'), active: true, partner: null, since: today(), notes: '', method: 'transfer' }, fields);
    db().clients.push(c);
    ensureMonth(thisMonth());
    save();
    return c;
  }
  function toggleClosure(date, reason) {
    const d = db();
    const ex = closure(date);
    if (ex) d.closures = d.closures.filter(x => x !== ex);
    else d.closures.push({ id: uid('x'), date, reason: reason || 'Cerrado' });
    save();
    return !ex;
  }
  // Reservas que caen en un día cerrado (para avisar a esos clientes)
  function affectedBy(date) {
    return db().bookings.filter(b => b.date === date && counts(b));
  }
  function adminCancel(bookingId) {
    const b = db().bookings.find(x => x.id === bookingId);
    if (b) { b.status = 'cancelled'; save(); }
  }
  function adminBook(clientId, date, h, trainerId) {
    const c = client(clientId);
    const ids = c.partner ? [c.id, c.partner] : [c.id];
    const b = { id: uid('b'), date, h, trainer: trainerId, kind: c.plan, clients: ids, status: 'ok', created: today() };
    db().bookings.push(b);
    save();
    return b;
  }
  function saveGroup(g) {
    if (g.id) Object.assign(db().groups.find(x => x.id === g.id), g);
    else db().groups.push(Object.assign({ id: uid('g') }, g));
    save();
  }
  function removeGroup(id) { db().groups = db().groups.filter(g => g.id !== id); save(); }

  return {
    TRAINERS, PLANS, METHODS, STUDIO, SHIFTS, CANCEL_HOURS,
    db, reset, session,
    ymd, ym, parse, addDays, addMonths, at, today, thisMonth, monthName, monthLabel, dayLabel, hourLabel, cap, money, initials, DAYS, MONTHS,
    client, trainer, closure, isOpen, payment, bookingsOf, usage, slots, groupTaken, trainerBusy, counts,
    book, cancel, cancelInfo, pay, updateProfile,
    markPaid, markPending, ensureMonth, remind, lastReminder, saveClient, toggleClosure, affectedBy, adminCancel, adminBook, saveGroup, removeGroup
  };
})();
