/* Inicio: la cima del logotipo se abre hasta llenar la pantalla */
window.NF_PAGE = window.NF_PAGE || [];
window.NF_PAGE.push(({ gsap, ST, EASE }) => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const pin = hero.querySelector('.hero__pin');
  const peak = hero.querySelector('.hero__peak');
  const img = peak.querySelector('img');
  const imgWrap = peak.querySelector('.hero__imgwrap');
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
    const S = mobile ? Math.min(W * .86, H * .5) : Math.min(H * .62, W * .44);
    const cx = W / 2, cy = mobile ? H * .44 : H * .45;
    const r = S / 2;
    return {
      W, H, cx, cy, r,
      apex: [cx, cy - r * .74],
      bl: [cx - r * .8, cy + r * .72],
      br: [cx + r * .8, cy + r * .72]
    };
  };
  const poly = pts => `polygon(${pts.map(p => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(', ')})`;
  const startClip = () => { const g = geo(); return poly([g.apex, g.apex, g.br, g.bl]); };
  const endClip = () => { const g = geo(); return poly([[0, 0], [g.W, 0], [g.W, g.H], [0, g.H]]); };
  const placeRing = () => {
    const g = geo();
    gsap.set(ring, { width: g.r * 2.12, height: g.r * 2.12, left: g.cx - g.r * 1.06, top: g.cy - g.r * 1.06 });
  };
  placeRing();
  gsap.set(peak, { clipPath: startClip() });
  // Al inicio, el logotipo de la pared queda dentro de la cima
  gsap.set(img, { scale: 1.25, xPercent: pin.clientWidth < 760 ? 22 : 15 });

  // Entrada tras el loader
  const intro = gsap.timeline({ paused: true });
  intro.fromTo(peak, { clipPath: () => { const g = geo(); return poly([[g.cx, g.cy + g.r * .72], [g.cx, g.cy + g.r * .72], [g.cx, g.cy + g.r * .72], [g.cx, g.cy + g.r * .72]]); } },
    { clipPath: startClip, duration: 1.4, ease: 'power4.inOut' })
    .from(imgWrap, { scale: 1.35, duration: 2.2, ease: EASE }, 0)
    .fromTo(circle, { strokeDashoffset: 1000 }, { strokeDashoffset: 0, duration: 1.8, ease: 'power3.inOut' }, .2)
    .from(wl.firstElementChild, { xPercent: -60, opacity: 0, duration: 1.6, ease: EASE }, .5)
    .from(wr.firstElementChild, { xPercent: 60, opacity: 0, duration: 1.6, ease: EASE }, .5);
  document.addEventListener('nf:ready', () => intro.play(), { once: true });

  // Scroll: la cima se expande hasta llenar la pantalla
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero, start: 'top top', end: () => '+=' + window.innerHeight * 1.3,
      pin: pin, scrub: 1, invalidateOnRefresh: true,
      onRefresh: () => placeRing()
    }
  });
  tl.to(peak, { clipPath: endClip, ease: 'power2.inOut', duration: 1 }, 0)
    .to(img, { scale: 1.02, xPercent: 0, ease: 'power1.inOut', duration: 1 }, 0)
    .to(ring, { scale: 3.2, opacity: 0, ease: 'power2.in', duration: .8 }, 0)
    .to(wl, { xPercent: -120, ease: 'power2.in', duration: .7 }, 0)
    .to(wr, { xPercent: 120, ease: 'power2.in', duration: .7 }, 0)
    .to([bottom, scrollHint], { y: 80, opacity: 0, ease: 'power2.in', duration: .4 }, 0)
    .to(hero.querySelector('.hero__shade'), { opacity: 1, duration: .4 }, .6)
    .fromTo(quote, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, .7);
  window.addEventListener('resize', () => { placeRing(); }, { passive: true });
});
