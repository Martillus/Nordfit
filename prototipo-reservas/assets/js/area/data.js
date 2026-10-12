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
    { id: 'sergio', name: 'Sergio', email: 'sergio@nordfit.es', role: 'owner' },
    { id: 'jules', name: 'Jules', email: 'jules@nordfit.es', role: 'trainer' },
    { id: 'adrian', name: 'Adrián', email: 'adrian@nordfit.es', role: 'trainer' }
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
    transfer: 'Transferencia',
    bizum: 'Bizum'
  };
  // Datos para pagar por transferencia o Bizum (de ejemplo: los pone el dueño)
  const BANK = { holder: 'Nordfit Entrenamiento Personal', iban: 'ES00 0000 0000 0000 0000 0000', bizum: '687 38 69 17' };
  // Horario del estudio: hora de inicio de cada sesión de 60 min
  const STUDIO = { 1: [7, 21], 2: [7, 21], 3: [7, 21], 4: [7, 21], 5: [7, 21], 6: [9, 13] };
  // Turnos de cada entrenador (orientativo, editable cuando lo confirme el dueño)
  const SHIFTS = {
    sergio: { 1: [7, 14], 2: [7, 14], 3: [7, 14], 4: [7, 14], 5: [7, 14], 6: [9, 13] },
    jules: { 1: [14, 21], 2: [14, 21], 3: [14, 21], 4: [14, 21], 5: [14, 21] },
    adrian: { 1: [9, 16], 2: [9, 16], 3: [9, 16], 4: [9, 16], 5: [9, 16], 6: [9, 13] }
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
    if (raw) { try { mem = JSON.parse(raw); if (mem.v !== 3) mem = null; } catch (e) { mem = null; } }
    const fresh = !mem;
    if (fresh) mem = seed();
    ensureMonths();
    if (fresh) seedRequests();
    save();
    return mem;
  }
  function save() { ls.set(KEY, JSON.stringify(mem)); }
  // Si otra pestaña cambia los datos (p. ej. el cliente paga y el panel está
  // abierto), se vuelven a leer y se avisa a la página para que se repinte
  try { window.addEventListener('storage', e => { if (e.key === KEY) { mem = null; window.dispatchEvent(new CustomEvent('nf:data')); } }); } catch (e) { /* sin almacenamiento */ }
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
      ['Carmen Ortiz', 'personal', 'adrian'], ['Javier Molina', 'personal', 'jules'], ['Nuria Castro', 'personal', 'sergio'],
      ['Daniel Rubio', 'personal', 'adrian'], ['Alba Navarro', 'personal', 'sergio'], ['Hugo Serrano', 'personal', 'adrian'],
      ['Sara Prieto', 'pareja', 'jules'], ['Óscar Prieto', 'pareja', 'jules'],
      ['Irene Vidal', 'pareja', 'sergio'], ['Andrés Vidal', 'pareja', 'sergio'],
      ['Claudia Ramos', 'pareja', 'jules'], ['Teresa Ramos', 'pareja', 'jules'],
      ['Raúl Medina', 'grupo', 'jules'], ['Paula Iglesias', 'grupo', 'jules'], ['Sofía Cano', 'grupo', 'sergio'],
      ['Diego Lozano', 'grupo', 'sergio'], ['Laura Pascual', 'grupo', 'jules'], ['Miguel Santos', 'grupo', 'sergio'],
      ['Elena Vega', 'grupo', 'jules'], ['Rubén León', 'grupo', 'sergio'], ['Inés Calvo', 'grupo', 'jules'],
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

    // Ausencias de ejemplo: un día entero de Sergio y unas horas de Jules
    const firstWeekday = (from, dow) => { let d = addDays(from, 1); while (d.getDay() !== dow) d = addDays(d, 1); return ymd(d); };
    const absences = [
      { id: uid('a'), trainer: 'sergio', date: firstWeekday(addDays(now, 5), 5), allDay: true, from: null, to: null, reason: 'Formación' },
      { id: uid('a'), trainer: 'jules', date: firstWeekday(addDays(now, 2), 3), allDay: false, from: 16, to: 18, reason: 'Médico' }
    ];
    const data = { v: 3, clients, groups, closures, absences, bookings: [], payments: [], reminders: [] };

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

    // Horario fijo de cada cliente: 2 sesiones por semana (las parejas comparten)
    const taken = new Set(groups.map(g => `${g.trainer}|${g.dow}|${g.h}`));
    const load = {};
    clients.forEach(c => {
      const partner = c.partner && clients.find(x => x.id === c.partner);
      if (partner && partner.schedule) { c.schedule = partner.schedule.map(x => Object.assign({}, x)); return; }
      c.schedule = [];
      if (c.plan === 'grupo') {
        const order = groups.slice().sort(() => rnd() - .5);
        for (const g of order) {
          if (c.schedule.length === 2) break;
          if ((load[g.id] || 0) >= g.cap || c.schedule.some(x => x.dow === g.dow)) continue;
          load[g.id] = (load[g.id] || 0) + 1;
          c.schedule.push({ dow: g.dow, h: g.h, trainer: g.trainer, group: g.id });
        }
        return;
      }
      const days = [1, 2, 3, 4, 5].filter(d => SHIFTS[c.trainer][d]);
      let tries = 0;
      while (c.schedule.length < 2 && tries++ < 200) {
        const dow = pick(days);
        const [from, to] = SHIFTS[c.trainer][dow];
        const h = from + Math.floor(rnd() * (to - from + 1));
        const key = `${c.trainer}|${dow}|${h}`;
        if (taken.has(key) || c.schedule.some(x => x.dow === dow) || Math.abs(dow - (c.schedule[0] || { dow: 9 }).dow) < 2) continue;
        taken.add(key);
        c.schedule.push({ dow, h, trainer: c.trainer });
      }
      c.schedule.sort((x, y) => x.dow - y.dow);
    });
    data.requests = [];
    data.gen = {};
    // Sesiones del mes anterior (ya pasadas), del actual y del siguiente
    [-1, 0, 1].forEach(k => { const m = addMonths(cur, k); clients.forEach(c => genFor(data, c, m)); data.gen[m] = true; });
    // Algunas faltas del mes pasado
    data.bookings.filter(b => b.date < ymd(now)).filter((_, i) => i % 17 === 3).forEach(b => { b.status = 'cancelled'; });
    data.bookings.filter(b => b.date < ymd(now)).filter((_, i) => i % 29 === 5).forEach(b => { b.status = 'late'; });
    return data;
  }

  /* ---------------- Horario fijo → sesiones del mes ----------------
     Cada cliente tiene un horario semanal. Sus sesiones del mes (hasta las 8
     del bono) se crean solas a partir de él. Si ese día el estudio está
     cerrado o el entrenador no está, esa sesión no se crea y el cliente puede
     pedir recuperarla. */
  function genFor(d, c, month, fromDate) {
    if (!c.active || !c.schedule || !c.schedule.length) return 0;
    if (c.partner && [c.id, c.partner].sort()[0] !== c.id) return 0;
    const ids = c.partner ? [c.id, c.partner] : [c.id];
    const live = b => b.status === 'ok' || b.status === 'late';
    let n = d.bookings.filter(b => b.clients.includes(c.id) && b.date.startsWith(month) && live(b)).length;
    const cap = PLANS[c.plan].sessions;
    const start = parse(month);
    let made = 0;
    for (let day = new Date(start); day.getMonth() === start.getMonth() && n < cap; day = addDays(day, 1)) {
      const date = ymd(day);
      if (date < c.since || (fromDate && date < fromDate)) continue;
      if (d.closures.some(x => x.date === date)) continue;
      for (const sl of c.schedule.filter(x => x.dow === day.getDay()).sort((x, y) => x.h - y.h)) {
        if (n >= cap) break;
        const origin = `${date}|${sl.h}`;
        if (d.bookings.some(b => b.origin === origin && b.clients.includes(c.id))) continue;
        if ((d.absences || []).some(a => a.trainer === sl.trainer && a.date === date && (a.allDay || (sl.h >= a.from && sl.h < a.to)))) continue;
        d.bookings.push({ id: uid('b'), date, h: sl.h, trainer: sl.trainer, kind: c.plan, clients: ids, status: 'ok', sched: true, origin, created: date });
        n++; made++;
      }
    }
    return made;
  }
  // Cada vez que se abre: se crean las sesiones del mes actual y del siguiente si aún no existen
  function ensureMonths() {
    [thisMonth(), addMonths(thisMonth(), 1)].forEach(m => {
      if (mem.gen[m]) return;
      mem.clients.forEach(c => genFor(mem, c, m));
      mem.gen[m] = true;
    });
  }
  // Cambia el horario fijo de un cliente: rehace sus sesiones futuras
  function setSchedule(clientId, schedule) {
    const c = client(clientId);
    const ids = c.partner ? [c.id, c.partner] : [c.id];
    ids.forEach(id => { client(id).schedule = schedule.map(x => Object.assign({}, x)); });
    const tomorrow = ymd(addDays(new Date(), 1));
    db().bookings = db().bookings.filter(b => !(b.clients.includes(c.id) && b.sched && !b.moved && b.status === 'ok' && b.date >= tomorrow));
    db().requests.filter(r => r.client === c.id && r.status === 'pending' && r.booking).forEach(r => { r.status = 'rejected'; r.note = 'Horario cambiado'; });
    const first = ids.slice().sort()[0];
    [thisMonth(), addMonths(thisMonth(), 1)].forEach(m => genFor(db(), client(first), m, tomorrow));
    save();
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
    // Prototipo: cada persona del equipo entra con su email; Sergio (dueño) ve
    // todo, Jules y Adrián solo su agenda y su calendario. En producción son
    // cuentas de Supabase con su rol.
    loginAdmin(user, pass) {
      const email = user.trim().toLowerCase() === 'admin@nordfit.es' ? 'sergio@nordfit.es' : user.trim().toLowerCase();
      const t = TRAINERS.find(x => x.email === email);
      if (!t || pass !== 'nordfit') return null;
      const s = { role: t.role, trainer: t.id, name: t.name, initials: initials(t.name) };
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
  // Ausencia de un entrenador: día entero o franja [from, to) en horas
  const absences = () => db().absences;
  const absencesOn = (date, tid) => absences().filter(b => b.date === date && (!tid || b.trainer === tid));
  const isAbsent = (tid, date, h) => absencesOn(date, tid).some(b => b.allDay || (h >= b.from && h < b.to));
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
  const pendingTo = (date, h, exceptId) => db().requests.filter(r => r.status === 'pending' && r.id !== exceptId && r.to.date === date && r.to.h === h);
  function trainerBusy(tid, date, h, exceptReq) {
    const dow = parse(date).getDay();
    if (db().groups.some(g => g.dow === dow && g.h === h && g.trainer === tid)) return true;
    if (pendingTo(date, h, exceptReq).some(r => r.to.trainer === tid && r.kind !== 'grupo')) return true;
    return db().bookings.some(b => b.trainer === tid && b.date === date && b.h === h && b.kind !== 'grupo' && counts(b));
  }
  function groupTaken(date, h, exceptReq) {
    return db().bookings.filter(b => b.kind === 'grupo' && b.date === date && b.h === h && counts(b)).length
      + pendingTo(date, h, exceptReq).filter(r => r.kind === 'grupo').length;
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
      return db().groups.filter(g => g.dow === dow && !isAbsent(g.trainer, date, g.h)).map(g => {
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
      const away = isAbsent(tid, date, h);
      out.push({ date, h, trainer: tid, kind: c.plan, mine: isMine, away, ok: !away && bookable(date, h) && !trainerBusy(tid, date, h) && !isMine });
    }
    return out;
  }

  /* ---------------- Solicitudes de cambio ----------------
     El cliente pide mover una sesión (o recuperar una perdida) a otro hueco
     libre. La solicitud le llega a su entrenador, que la acepta o rechaza. */
  const requestFor = bookingId => db().requests.find(r => r.booking === bookingId && r.status === 'pending') || null;
  function requestChange(clientId, bookingId, to, note) {
    const c = client(clientId);
    const b = bookingId ? db().bookings.find(x => x.id === bookingId) : null;
    const s = slots(clientId, to.date, to.trainer).find(x => x.h === to.h);
    if (!s || !s.ok) return { error: 'Ese hueco ya no está libre. Elige otro.' };
    if (b && requestFor(b.id)) return { error: 'Ya tienes un cambio pendiente para esa sesión.' };
    const r = {
      id: uid('r'), client: clientId, booking: b ? b.id : null, kind: c.plan,
      from: b ? { date: b.date, h: b.h, trainer: b.trainer } : null,
      to: { date: to.date, h: to.h, trainer: s.trainer },
      approver: b ? b.trainer : s.trainer,
      status: 'pending', note: note || '', created: new Date().toISOString()
    };
    db().requests.push(r);
    save();
    return { ok: true, request: r };
  }
  function cancelRequest(reqId) {
    const r = db().requests.find(x => x.id === reqId);
    if (r && r.status === 'pending') { r.status = 'withdrawn'; save(); }
  }
  // Solicitudes que ve cada entrenador (Sergio, como dueño, puede ver todas)
  function requestsFor(trainerId) {
    return db().requests.filter(r => r.status === 'pending' && (!trainerId || r.approver === trainerId))
      .sort((a, b) => (a.to.date + a.to.h).localeCompare(b.to.date + b.to.h));
  }
  function decideRequest(reqId, accept, by) {
    const r = db().requests.find(x => x.id === reqId);
    if (!r || r.status !== 'pending') return { error: 'Esta solicitud ya no está pendiente.' };
    if (accept) {
      const away = isAbsent(r.to.trainer, r.to.date, r.to.h) || closure(r.to.date);
      const busy = r.kind === 'grupo'
        ? groupTaken(r.to.date, r.to.h, r.id) >= ((db().groups.find(g => g.dow === parse(r.to.date).getDay() && g.h === r.to.h) || { cap: 0 }).cap)
        : trainerBusy(r.to.trainer, r.to.date, r.to.h, r.id);
      if (away || busy) return { error: 'El nuevo hueco ya no está libre. Rechaza la solicitud o habla con el cliente.' };
      if (r.booking) {
        const b = db().bookings.find(x => x.id === r.booking);
        Object.assign(b, { date: r.to.date, h: r.to.h, trainer: r.to.trainer, moved: true, status: 'ok' });
      } else {
        const c = client(r.client);
        db().bookings.push({ id: uid('b'), date: r.to.date, h: r.to.h, trainer: r.to.trainer, kind: c.plan, clients: c.partner ? [c.id, c.partner] : [c.id], status: 'ok', created: today(), recovered: true });
      }
    }
    r.status = accept ? 'accepted' : 'rejected';
    r.decidedBy = by || null;
    r.decidedAt = new Date().toISOString();
    save();
    return { ok: true };
  }
  // Solicitudes de ejemplo para que el panel no esté vacío
  function seedRequests() {
    const future = c => db().bookings.filter(b => b.clients.includes(c.id) && b.status === 'ok' && b.date > ymd(addDays(new Date(), 2))).sort((a, b) => a.date.localeCompare(b.date));
    ['Elías Romero', 'Carmen Ortiz', 'Isaac Arroyo', 'Daniel Rubio'].forEach((name, i) => {
      const c = db().clients.find(x => x.name === name);
      const b = future(c)[i % 2];
      if (!b) return;
      for (let k = 1; k < 10; k++) {
        const date = ymd(addDays(parse(b.date), k));
        const free = slots(c.id, date, b.trainer).find(x => x.ok);
        if (free) { requestChange(c.id, b.id, { date, h: free.h, trainer: free.trainer }, i === 1 ? 'Ese día tengo médico' : ''); break; }
      }
    });
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
    p.promised = ['cash', 'transfer', 'bizum'].includes(method);
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
  // Edición completa de un pago desde /admin (efectivo, transferencia, correcciones…)
  function setPayment(paymentId, f) {
    const p = db().payments.find(x => x.id === paymentId);
    p.status = f.status;
    p.method = f.method;
    p.amount = f.amount;
    p.note = f.note || '';
    p.paidAt = f.status === 'paid' ? (f.paidAt || today()) : null;
    if (f.status === 'paid') p.promised = false;
    save();
    return p;
  }
  // Cargo de un mes que aún no existe (p. ej. alguien paga noviembre por adelantado)
  function addPayment(clientId, month) {
    const c = client(clientId);
    const p = { id: uid('p'), client: clientId, month, amount: PLANS[c.plan].price, status: 'pending', method: c.method, paidAt: null };
    db().payments.push(p);
    save();
    return p;
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
  function addAbsence(f) {
    const b = { id: uid('a'), trainer: f.trainer, date: f.date, allDay: !!f.allDay, from: f.allDay ? null : f.from, to: f.allDay ? null : f.to, reason: f.reason || '' };
    db().absences.push(b);
    save();
    return b;
  }
  function removeAbsence(id) { db().absences = db().absences.filter(b => b.id !== id); save(); }
  // Reservas que se ven afectadas por una ausencia (para avisar y cancelarlas)
  function affectedByAbsence(f) {
    return db().bookings.filter(b => b.date === f.date && b.trainer === f.trainer && counts(b) && (f.allDay || (b.h >= f.from && b.h < f.to)));
  }
  function saveGroup(g) {
    if (g.id) Object.assign(db().groups.find(x => x.id === g.id), g);
    else db().groups.push(Object.assign({ id: uid('g') }, g));
    save();
  }
  function removeGroup(id) { db().groups = db().groups.filter(g => g.id !== id); save(); }

  return {
    TRAINERS, PLANS, METHODS, BANK, STUDIO, SHIFTS, CANCEL_HOURS,
    db, reset, session,
    ymd, ym, parse, addDays, addMonths, at, today, thisMonth, monthName, monthLabel, dayLabel, hourLabel, cap, money, initials, DAYS, MONTHS,
    client, trainer, closure, isOpen, absences, absencesOn, isAbsent, payment, bookingsOf, usage, slots, groupTaken, trainerBusy, counts,
    book, cancel, cancelInfo, pay, updateProfile,
    setSchedule, requestFor, requestChange, cancelRequest, requestsFor, decideRequest,
    markPaid, markPending, setPayment, addPayment, ensureMonth, remind, lastReminder, saveClient, toggleClosure, affectedBy, adminCancel, adminBook, saveGroup, removeGroup, addAbsence, removeAbsence, affectedByAbsence
  };
})();
