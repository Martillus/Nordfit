/* Inicio: la cima del logotipo se abre hasta llenar la pantalla.
   Secuencia del scroll, en tres fases que no se pisan:
   1. Salen las palabras y el texto inferior; el aro se desvanece.
   2. La cima se abre hasta ocupar toda la pantalla.
   3. Se oscurece la foto y entra la cita. Pausa breve y se suelta el pin. */
window.NF_PAGE = window.NF_PAGE || [];
window.NF_PAGE.push(({ gsap, ST, EASE }) => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const pin = hero.querySelector('.hero__pin');
  const peak = hero.querySelector('.hero__peak');
  const img = peak.querySelector('img');
  const imgWrap = peak.querySelector('.hero__imgwrap');
  const shade = hero.querySelector('.hero__shade');
  const ring = hero.querySelector('.hero__ring');
  const circle = ring.querySelector('circle');
  const wl = hero.querySelector('.hero__word--l');
  const wr = hero.querySelector('.hero__word--r');
  const bottom = hero.querySelector('.hero__bottom');
  const scrollHint = hero.querySelector('.hero__scroll');
  const quote = hero.querySelector('.hero__quote');

  // Geometría: triángulo inscrito en el aro, igual que en el logotipo
  const geo = () => {
    const W = pin.clientWidth, H = pin.clientHeight;
    const mobile = W < 760;
    const S = mobile ? Math.min(W * .78, H * .42) : Math.min(H * .6, W * .4);
    const cx = W / 2, cy = mobile ? H * .43 : H * .45;
    const r = S / 2;
    return {
      W, H, cx, cy, r, mobile, ringR: r * 1.06,
      apex: [cx, cy - r * .74],
      bl: [cx - r * .8, cy + r * .72],
      br: [cx + r * .8, cy + r * .72]
    };
  };
  const poly = pts => `polygon(${pts.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(', ')})`;
  // La forma se calcula en cada frame: entrada (in) y apertura con el scroll (open)
  const clip = { in: 0, open: 0 };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const applyClip = () => {
    const g = geo();
    const base = [g.cx, g.cy + g.r * .72];
    const tri = [g.apex, g.apex, g.br, g.bl].map(pt => lerp(base, pt, clip.in));
    const full = [[0, 0], [g.W, 0], [g.W, g.H], [0, g.H]];
    peak.style.clipPath = poly(tri.map((pt, i) => lerp(pt, full[i], clip.open)));
  };

  // Coloca aro y palabras para que nada se superponga
  const layout = () => {
    const g = geo();
    const gutter = bottom.offsetLeft || 16;
    gsap.set(ring, { width: g.ringR * 2, height: g.ringR * 2, left: g.cx - g.ringR, top: g.cy - g.ringR });
    // Medida natural a 100px
    wl.style.fontSize = wr.style.fontSize = '100px';
    const nW = wl.offsetWidth / 100, fW = wr.offsetWidth / 100, lh = wl.offsetHeight / 100;
    let fs;
    if (!g.mobile) {
      const gap = g.W * .025;
      const avail = g.cx - g.ringR - gap - gutter;
      fs = Math.max(40, Math.min(220, avail / nW));
      wl.style.fontSize = wr.style.fontSize = fs + 'px';
      const h = lh * fs;
      gsap.set(wl, { left: g.cx - g.ringR - gap - nW * fs, top: g.cy - h / 2, right: 'auto' });
      gsap.set(wr, { left: g.cx + g.ringR + gap, top: g.cy - h / 2, right: 'auto' });
    } else {
      const header = 84;
      const spaceTop = g.cy - g.ringR - header - 10;
      fs = Math.max(36, Math.min(g.W * .24, (g.W - gutter * 2) / nW, spaceTop / lh));
      wl.style.fontSize = wr.style.fontSize = fs + 'px';
      const h = lh * fs;
      gsap.set(wl, { left: gutter, top: g.cy - g.ringR - h - 10, right: 'auto' });
      gsap.set(wr, { left: g.W - gutter - fW * fs, top: g.cy + g.ringR + 10, right: 'auto' });
    }
  };
  layout();
  ST.addEventListener('refreshInit', layout);
  applyClip();
  window.addEventListener('resize', applyClip, { passive: true });
  // Al inicio, el logotipo de la pared queda dentro de la cima
  gsap.set(img, { scale: 1.25, xPercent: pin.clientWidth < 760 ? 22 : 15, force3D: true });

  // Entrada tras el loader
  const intro = gsap.timeline({ paused: true });
  intro.to(clip, { in: 1, duration: 1.4, ease: 'power4.inOut', onUpdate: applyClip })
    .from(imgWrap, { scale: 1.35, duration: 2.2, ease: EASE, force3D: true }, 0)
    .fromTo(circle, { strokeDashoffset: 1000 }, { strokeDashoffset: 0, duration: 1.8, ease: 'power3.inOut' }, .2)
    .from(wl.firstElementChild, { xPercent: -40, opacity: 0, duration: 1.4, ease: EASE }, .5)
    .from(wr.firstElementChild, { xPercent: 40, opacity: 0, duration: 1.4, ease: EASE }, .5);
  document.addEventListener('nf:ready', () => intro.play(), { once: true });

  // Scroll
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero, start: 'top top', end: () => '+=' + window.innerHeight * 1.6,
      pin: pin, scrub: .5, anticipatePin: 1, invalidateOnRefresh: true
    }
  });
  // Fase 1 · salida limpia de lo que rodea a la cima
  tl.to(wl, { xPercent: -35, opacity: 0, duration: .3, ease: 'power2.in' }, 0)
    .to(wr, { xPercent: 35, opacity: 0, duration: .3, ease: 'power2.in' }, 0)
    .to([bottom, scrollHint], { y: 50, opacity: 0, duration: .25, ease: 'power2.in' }, 0)
    .to(ring, { scale: 1.25, opacity: 0, duration: .35, ease: 'power2.in' }, 0)
  // Fase 2 · la cima se abre
    .to(clip, { open: 1, duration: .6, ease: 'power2.inOut', onUpdate: applyClip }, .2)
    .to(img, { scale: 1.02, xPercent: 0, duration: .65, ease: 'power2.inOut' }, .2)
  // Fase 3 · la cita, ya con toda la foto a la vista
    .to(shade, { opacity: 1, duration: .2 }, .8)
    .fromTo(quote, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .2, ease: 'power2.out' }, .88)
    .to({}, { duration: .17 });
});
