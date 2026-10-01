/* NORDFIT — interacción y movimiento
   GSAP + ScrollTrigger + Lenis. Todo estado inicial oculto se aplica desde JS,
   así la web se lee completa aunque falle un script. */
(() => {
  const html = document.documentElement;
  html.classList.remove('no-js');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = typeof window.gsap !== 'undefined';
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  };

  if (!hasGSAP) { document.querySelector('.loader')?.remove(); return; }
  const { gsap } = window;
  gsap.registerPlugin(window.ScrollTrigger);
  const ST = window.ScrollTrigger;
  const EASE = 'expo.out';

  /* ---------------- Lenis ---------------- */
  let lenis = null;
  if (!reduced && typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ST.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  /* ---------------- División de texto ---------------- */
  function splitWords(el) {
    const nodes = [...el.childNodes];
    el.innerHTML = '';
    nodes.forEach(n => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'word'; w.textContent = part; el.appendChild(w);
        });
      } else if (n.nodeType === 1 && n.tagName === 'BR') {
        el.appendChild(n);
      } else if (n.nodeType === 1) {
        // Conserva clases (p. ej. .thin) envolviendo cada palabra
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'word ' + n.className; w.textContent = part; el.appendChild(w);
        });
      }
    });
    return [...el.querySelectorAll('.word')];
  }
  function splitLines(el) {
    const words = splitWords(el);
    const lines = []; let top = null; let cur = null;
    words.forEach(w => {
      const t = w.offsetTop;
      if (top === null || Math.abs(t - top) > 4) { cur = []; lines.push(cur); top = t; }
      cur.push(w);
    });
    el.innerHTML = '';
    lines.forEach(ws => {
      const mask = document.createElement('span'); mask.className = 'line-mask';
      const inner = document.createElement('span');
      ws.forEach((w, i) => { inner.appendChild(w); if (i < ws.length - 1) inner.appendChild(document.createTextNode(' ')); });
      mask.appendChild(inner); el.appendChild(mask);
    });
    return [...el.querySelectorAll('.line-mask > span')];
  }
  function splitChars(el) {
    const words = splitWords(el);
    words.forEach(w => {
      const txt = w.textContent; w.textContent = '';
      [...txt].forEach(c => { const s = document.createElement('span'); s.className = 'char'; s.textContent = c; w.appendChild(s); });
    });
    return [...el.querySelectorAll('.char')];
  }

  /* ---------------- Loader + transición entre páginas ---------------- */
  const loader = document.querySelector('.loader');
  const firstVisit = !store.get('nf-visited');
  store.set('nf-visited', '1');
  const peakClosed = 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 100%, 0% 100%)';
  const peakGone = 'polygon(0% 0%, 100% 0%, 100% 0%, 50% 0%, 0% 0%)';
  
  function runLoader() {
    return new Promise(resolve => {
      if (!loader || reduced) { loader?.remove(); resolve(); return; }
      const fill = loader.querySelector('.fill');
      const word = loader.querySelector('.loader__word svg');
      const count = loader.querySelector('.loader__count');
      const n = { v: 0 };
      const dur = firstVisit ? 1.5 : .55;
      const tl = gsap.timeline({ onComplete: () => { loader.style.display = 'none'; resolve(); } });
      tl.to(fill, { clipPath: 'inset(0% 0 0 0)', duration: dur, ease: 'power3.inOut' }, 0)
        .to(n, { v: 100, duration: dur, ease: 'power3.inOut', onUpdate: () => { if (count) count.textContent = String(Math.round(n.v)).padStart(3, '0'); } }, 0)
        .to(word, { y: 0, duration: .8, ease: EASE }, dur * .35)
        // La salida dibuja una cima: el centro sube antes que los lados
        .to(loader.querySelector('.loader__inner'), { y: -60, opacity: 0, duration: .6, ease: 'power3.in' }, dur)
        .to(loader, { clipPath: 'polygon(0% 0%, 100% 0%, 100% 62%, 50% 0%, 0% 62%)', duration: firstVisit ? .55 : .4, ease: 'power3.in' }, dur + .1)
        .to(loader, { clipPath: peakGone, duration: firstVisit ? .55 : .4, ease: 'power3.out' });
    });
  }

  function leaveTo(href) {
    if (!loader || reduced) { window.location.href = href; return; }
    loader.style.display = 'grid';
    gsap.set(loader.querySelector('.loader__inner'), { y: 40, opacity: 0 });
    gsap.set(loader.querySelector('.fill'), { clipPath: 'inset(100% 0 0 0)' });
    const page = loader.querySelector('.loader__page');
    const target = document.querySelector(`a[href="${href}"][data-label]`);
    if (page && target) page.textContent = target.dataset.label;
    gsap.timeline({ onComplete: () => { window.location.href = href; } })
      .fromTo(loader, { clipPath: 'polygon(0% 100%, 50% 100%, 100% 100%, 100% 100%, 0% 100%)' },
        { clipPath: 'polygon(0% 70%, 50% 0%, 100% 70%, 100% 100%, 0% 100%)', duration: .4, ease: 'power3.in' })
      .to(loader, { clipPath: 'polygon(0% 0%, 50% 0%, 100% 0%, 100% 100%, 0% 100%)', duration: .35, ease: 'power3.out' })
      .to(loader.querySelector('.loader__inner'), { y: 0, opacity: 1, duration: .4, ease: EASE }, .4);
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || href.startsWith('#') || /^(https?:|mailto:|tel:)/.test(href)) return;
    if (!/\.html(#.*)?$/.test(href)) return;
    e.preventDefault();
    closeMenu();
    leaveTo(href);
  });
  window.addEventListener('pageshow', ev => { if (ev.persisted && loader) loader.style.display = 'none'; });

  /* ---------------- Cabecera ---------------- */
  const header = document.querySelector('.header');
  let lastY = 0;
  function onScroll(y) {
    if (!header) return;
    header.classList.toggle('is-scrolled', y > 40);
    const menuOpen = html.classList.contains('menu-open');
    header.classList.toggle('is-hidden', !menuOpen && y > lastY && y > 400);
    lastY = y;
  }
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

  /* ---------------- Menú móvil ---------------- */
  const menu = document.querySelector('.menu');
  const burger = document.querySelector('.burger');
  let menuTl = null;
  if (menu && burger) {
    menuTl = gsap.timeline({ paused: true })
      .set(menu, { visibility: 'visible' })
      .fromTo(menu, { clipPath: 'polygon(0% 0%, 100% 0%, 100% 0%, 50% 0%, 0% 0%)' }, { clipPath: 'polygon(0% 0%, 100% 0%, 100% 45%, 50% 90%, 0% 45%)', duration: .45, ease: 'power3.in' })
      .to(menu, { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 100%, 0% 100%)', duration: .4, ease: 'power3.out' })
      .from(menu.querySelectorAll('.menu__link'), { yPercent: 110, duration: .8, stagger: .06, ease: EASE }, .35)
      .from(menu.querySelector('.menu__foot'), { opacity: 0, y: 20, duration: .6, ease: EASE }, .6);
    burger.addEventListener('click', () => {
      const open = !html.classList.contains('menu-open');
      html.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      if (open) { menuTl.timeScale(1).play(); lenis?.stop(); } else { menuTl.timeScale(1.6).reverse(); lenis?.start(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  }
  function closeMenu() {
    if (!html.classList.contains('menu-open')) return;
    html.classList.remove('menu-open');
    burger?.setAttribute('aria-expanded', 'false');
    menuTl?.timeScale(1.6).reverse(); lenis?.start();
  }

  /* ---------------- Cursor + magnetismo ---------------- */
  if (fine && !reduced) {
    const cursor = document.querySelector('.cursor');
    if (cursor) {
      const dot = cursor.querySelector('.cursor__dot');
      const ring = cursor.querySelector('.cursor__ring');
      const label = ring.querySelector('span');
      const xd = gsap.quickTo(dot, 'x', { duration: .12, ease: 'power3' });
      const yd = gsap.quickTo(dot, 'y', { duration: .12, ease: 'power3' });
      const xr = gsap.quickTo(ring, 'x', { duration: .5, ease: 'power3' });
      const yr = gsap.quickTo(ring, 'y', { duration: .5, ease: 'power3' });
      window.addEventListener('pointermove', e => { cursor.classList.add('is-live'); xd(e.clientX); yd(e.clientY); xr(e.clientX); yr(e.clientY); });
      document.addEventListener('pointerover', e => {
        const v = e.target.closest('[data-cursor]');
        const l = e.target.closest('a, button, [role="button"], label, input, textarea, select');
        cursor.classList.toggle('is-view', !!v);
        cursor.classList.toggle('is-link', !v && !!l);
        if (v) label.textContent = v.dataset.cursor;
      });
    }
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      const s = parseFloat(el.dataset.magnetic) || .35;
      const xTo = gsap.quickTo(el, 'x', { duration: .8, ease: 'elastic.out(1, .4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: .8, ease: 'elastic.out(1, .4)' });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * s);
        yTo((e.clientY - r.top - r.height / 2) * s);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------------- Utilidades de página ---------------- */
  // Copiar teléfono
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const txt = btn.dataset.copy;
      const done = () => { const o = btn.textContent; btn.textContent = 'Copiado'; setTimeout(() => { btn.textContent = o; }, 1600); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done).catch(done); else done();
    });
  });

  // Acordeones
  document.querySelectorAll('.acc__item').forEach(item => {
    const btn = item.querySelector('.acc__q');
    const panel = item.querySelector('.acc__a');
    btn?.addEventListener('click', () => {
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      gsap.to(panel, { height: open ? 'auto' : 0, duration: .7, ease: 'power4.inOut', onComplete: () => ST.refresh() });
    });
  });

  // Selector de tarifas
  const toggle = document.querySelector('[data-plan-toggle]');
  if (toggle) {
    const opts = toggle.querySelectorAll('button');
    const pill = toggle.querySelector('.toggle__pill');
    const set = btn => {
      opts.forEach(o => o.setAttribute('aria-pressed', String(o === btn)));
      gsap.to(pill, { x: btn.offsetLeft - 4, width: btn.offsetWidth, duration: .6, ease: 'power4.out' });
      const mode = btn.dataset.mode;
      document.querySelectorAll('[data-price]').forEach(p => {
        const target = parseFloat(p.dataset[mode]);
        const obj = { v: parseFloat(p.textContent) || 0 };
        gsap.to(obj, { v: target, duration: .8, ease: 'power3.out', onUpdate: () => { p.textContent = Math.round(obj.v); } });
      });
      document.querySelectorAll('[data-unit]').forEach(u => { u.textContent = u.dataset[mode]; });
    };
    opts.forEach(o => o.addEventListener('click', () => set(o)));
    requestAnimationFrame(() => set(opts[0]));
  }

  // Formulario (sin envío real: muestra confirmación)
  const form = document.querySelector('[data-form]');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const req = [...form.querySelectorAll('[required]')];
      let ok = true;
      req.forEach(f => {
        const valid = f.type === 'checkbox' ? f.checked : f.value.trim() !== '' && f.checkValidity();
        f.closest('.field')?.classList.toggle('is-error', !valid);
        if (!valid) ok = false;
      });
      if (!ok) { form.querySelector('.is-error input, .is-error textarea, .is-error select')?.focus(); return; }
      const done = form.parentElement.querySelector('.form-done');
      gsap.to(form, { opacity: 0, y: -20, duration: .5, ease: 'power3.in', onComplete: () => {
        form.hidden = true; done.hidden = false;
        gsap.from(done.children, { y: 30, opacity: 0, stagger: .08, duration: .9, ease: EASE });
        ST.refresh();
      } });
    });
    form.querySelectorAll('input, textarea, select').forEach(f => f.addEventListener('input', () => f.closest('.field')?.classList.remove('is-error')));
  }

  /* ---------------- Animaciones (tras fuentes) ---------------- */
  const introQueue = [];
  function initMotion() {
    if (reduced) return;

    // Titulares por líneas
    document.querySelectorAll('[data-split="lines"]').forEach(el => {
      const lines = splitLines(el);
      const intro = el.closest('[data-intro]');
      const tw = gsap.from(lines, {
        yPercent: 115, rotate: 2, duration: 1.3, ease: EASE, stagger: .09, paused: !!intro,
        scrollTrigger: intro ? null : { trigger: el, start: 'top 88%', once: true }
      });
      if (intro) introQueue.push(tw);
    });
    // Titulares por letras
    document.querySelectorAll('[data-split="chars"]').forEach(el => {
      const chars = splitChars(el);
      el.style.overflow = 'hidden';
      const intro = el.closest('[data-intro]');
      const tw = gsap.from(chars, {
        yPercent: 120, duration: 1.2, ease: EASE, stagger: .025, paused: !!intro,
        scrollTrigger: intro ? null : { trigger: el, start: 'top 90%', once: true }
      });
      if (intro) introQueue.push(tw);
    });
    // Texto que se ilumina palabra a palabra con el scroll
    document.querySelectorAll('[data-scrub-words]').forEach(el => {
      const words = splitWords(el);
      gsap.fromTo(words, { opacity: .14 }, {
        opacity: 1, stagger: .05, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true }
      });
    });
    // Entradas sobrias
    document.querySelectorAll('[data-reveal]').forEach(el => {
      const intro = el.closest('[data-intro]');
      const tw = gsap.from(el, { y: 40, opacity: 0, duration: 1.2, ease: EASE, paused: !!intro, scrollTrigger: intro ? null : { trigger: el, start: 'top 90%', once: true } });
      if (intro) introQueue.push(tw);
    });
    document.querySelectorAll('[data-stagger]').forEach(el => {
      gsap.from(el.children, { y: 50, opacity: 0, duration: 1.1, ease: EASE, stagger: .1, scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });
    // Imágenes que se expanden (parallax + clip)
    document.querySelectorAll('[data-expand]').forEach(el => {
      const img = el.querySelector('img, .ph');
      const from = el.dataset.expand || 'inset(14% 12% 14% 12% round 28px)';
      gsap.fromTo(el, { clipPath: from }, {
        clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'center 45%', scrub: 1 }
      });
      if (img) gsap.fromTo(img, { scale: 1.35, yPercent: -6 }, {
        scale: 1, yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
    // Revelado en forma de cima
    document.querySelectorAll('[data-peak]').forEach(el => {
      gsap.fromTo(el, { clipPath: 'polygon(50% 100%, 50% 100%, 100% 100%, 0% 100%)' }, {
        clipPath: 'polygon(50% 0%, 100% 0%, 100% 100%, 0% 100%)', duration: 1.6, ease: 'power4.inOut',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
      const img = el.querySelector('img, .ph__in');
      if (img) gsap.from(img, { scale: 1.3, duration: 2, ease: EASE, scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });
    // Parallax simple
    document.querySelectorAll('[data-parallax]').forEach(el => {
      const s = parseFloat(el.dataset.parallax) || 15;
      gsap.fromTo(el, { yPercent: -s }, { yPercent: s, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // Aro girando con el scroll
    document.querySelectorAll('[data-spin]').forEach(el => {
      gsap.to(el, { rotate: parseFloat(el.dataset.spin) || 120, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    // Contadores
    document.querySelectorAll('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count); const dec = (el.dataset.count.split(/[.,]/)[1] || '').length;
      const o = { v: 0 };
      gsap.to(o, { v: end, duration: 2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: () => { el.textContent = o.v.toFixed(dec).replace('.', ','); } });
    });
    // Línea de progreso (método)
    document.querySelectorAll('[data-progress]').forEach(el => {
      gsap.fromTo(el, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top 60%', end: 'bottom 60%', scrub: true } });
    });
    document.querySelectorAll('.step').forEach(step => {
      ST.create({ trigger: step, start: 'top 62%', end: 'bottom 62%', toggleClass: 'is-active' });
    });

    // Scroll horizontal fijado
    document.querySelectorAll('[data-hscroll]').forEach(sec => {
      const track = sec.querySelector('.hs__track');
      if (!track || window.innerWidth < 900) return;
      const dist = () => track.scrollWidth - window.innerWidth;
      const tween = gsap.to(track, { x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: sec, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true } });
      sec.querySelectorAll('.hs__card .ph, .hs__card img').forEach(m => {
        gsap.fromTo(m, { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: m.closest('.hs__card'), containerAnimation: tween, start: 'left right', end: 'center center', scrub: true } });
      });
      const bar = sec.querySelector('.hs__bar span');
      if (bar) gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top top', end: () => '+=' + dist(), scrub: true } });
    });

    // Revelado de imagen al pasar por una lista (equipo / servicios)
    if (fine) {
      document.querySelectorAll('[data-hover-reveal]').forEach(list => {
        const fig = list.querySelector('.hover-fig');
        if (!fig) return;
        const items = list.querySelectorAll('[data-fig]');
        const xTo = gsap.quickTo(fig, 'x', { duration: .7, ease: 'power3' });
        const yTo = gsap.quickTo(fig, 'y', { duration: .7, ease: 'power3' });
        const rTo = gsap.quickTo(fig, 'rotate', { duration: .9, ease: 'power3' });
        let px = 0;
        list.addEventListener('pointermove', e => {
          const r = list.getBoundingClientRect();
          xTo(e.clientX - r.left); yTo(e.clientY - r.top);
          rTo(gsap.utils.clamp(-8, 8, (e.clientX - px) * .6)); px = e.clientX;
        });
        items.forEach(it => {
          it.addEventListener('pointerenter', () => {
            fig.querySelectorAll('.hover-fig__item').forEach(f => f.classList.toggle('is-on', f.dataset.key === it.dataset.fig));
            gsap.to(fig, { scale: 1, opacity: 1, duration: .6, ease: EASE });
          });
        });
        list.addEventListener('pointerleave', () => gsap.to(fig, { scale: .6, opacity: 0, duration: .5, ease: 'power3.out' }));
      });
    }

    // Inclinación 3D en tarjetas
    if (fine) {
      document.querySelectorAll('[data-tilt]').forEach(card => {
        const rx = gsap.quickTo(card, 'rotationX', { duration: .6, ease: 'power3' });
        const ry = gsap.quickTo(card, 'rotationY', { duration: .6, ease: 'power3' });
        gsap.set(card, { transformPerspective: 900 });
        card.addEventListener('pointermove', e => {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
          ry(x * 8); rx(-y * 8);
          card.style.setProperty('--mx', `${(x + .5) * 100}%`); card.style.setProperty('--my', `${(y + .5) * 100}%`);
        });
        card.addEventListener('pointerleave', () => { rx(0); ry(0); });
      });
    }

    // Hooks específicos por página
    (window.NF_PAGE || []).forEach(fn => fn({ gsap, ST, EASE, splitChars, splitLines, splitWords, lenis, fine }));
  }

  const fontsReady = document.fonts?.ready || Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 1800))]).then(() => {
    initMotion();
    window.scrollTo(0, 0);
    runLoader().then(() => {
      lenis?.start();
      ST.refresh();
      introQueue.forEach((tw, i) => gsap.delayedCall(i * .08, () => tw.play()));
      document.dispatchEvent(new CustomEvent('nf:ready'));
    });
  });
})();
