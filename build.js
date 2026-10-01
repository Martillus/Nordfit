#!/usr/bin/env node
/* Ensambla las páginas de /src/pages con las piezas comunes (cabecera, menú,
   loader, pie) y escribe HTML estático en la raíz del proyecto.
   Uso: node build.js */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const svgPath = f => fs.readFileSync(path.join(root, 'assets/img', f), 'utf8').match(/ d="([^"]+)"/)[1];
const MARK = svgPath('nordfit-mark.svg');
const WORD = svgPath('nordfit-word.svg');

const mark = (cls = '', label = '') => `<svg class="${cls}" viewBox="0 0 534 440" fill="currentColor" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path fill-rule="evenodd" d="${MARK}"/></svg>`;
const word = (cls = '', label = '') => `<svg class="${cls}" viewBox="0 0 986 165" fill="currentColor" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path fill-rule="evenodd" d="${WORD}"/></svg>`;
const lockup = (cls = '') => `<svg class="${cls}" viewBox="0 0 994 668" fill="currentColor" role="img" aria-label="Nordfit"><g transform="translate(212 0)"><path fill-rule="evenodd" d="${MARK}"/></g><g transform="translate(0 499)"><path fill-rule="evenodd" d="${WORD}"/></g></svg>`;
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 13L13 3M5 3h8v8"/></svg>';
const STAR = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3.1-5.4 3.1 1.2-6L1.3 7.8l6.1-.7z"/></svg>';

const NAV = [
  { key: 'inicio', href: 'index.html', label: 'Inicio' },
  { key: 'entrenamiento', href: 'entrenamiento.html', label: 'Entrenamiento' },
  { key: 'equipo', href: 'equipo.html', label: 'Equipo' },
  { key: 'estudio', href: 'estudio.html', label: 'El estudio' },
  { key: 'tarifas', href: 'tarifas.html', label: 'Tarifas' },
  { key: 'contacto', href: 'contacto.html', label: 'Contacto' }
];

const btn = (href, text, cls = '', attrs = '') =>
  `<a class="btn ${cls}" href="${href}" data-label="Contacto" data-magnetic=".3" ${attrs}><span class="roll"><span>${text}</span><span aria-hidden="true">${text}</span></span><span class="ico">${ARROW}</span></a>`;
const roll = t => `<span class="link-roll"><span>${t}</span><span aria-hidden="true">${t}</span></span>`;

const ph = (title, desc, extra = '') => `<div class="ph" ${extra} role="img" aria-label="Foto pendiente: ${title}"><div class="ph__in">${mark()}<strong>Foto pendiente · ${title}</strong><span>${desc}</span></div></div>`;

function head(meta) {
  return `<!doctype html>
<html lang="es" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${meta.title}</title>
<meta name="description" content="${meta.desc}">
<meta name="theme-color" content="#0d121a">
<meta property="og:title" content="${meta.title}">
<meta property="og:description" content="${meta.desc}">
<meta property="og:image" content="assets/img/estudio-nordfit-sala.jpg">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Montserrat:wght@200;300;600;700;800;900&display=swap">
<link rel="stylesheet" href="assets/css/styles.css">
<link rel="stylesheet" href="assets/css/pages.css">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ExerciseGym","name":"Nordfit","description":"Estudio boutique de entrenamiento personal en Chamartín, Madrid.","telephone":"+34 687 38 69 17","address":{"@type":"PostalAddress","streetAddress":"C. de San Nazario, 1","addressLocality":"Madrid","postalCode":"28002","addressRegion":"Madrid","addressCountry":"ES"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"5.0","reviewCount":"80"}}</script>
</head>
<body data-page="${meta.key}">
<a class="sr-only" href="#main">Saltar al contenido</a>`;
}

function loader(meta) {
  const label = NAV.find(n => n.key === meta.key)?.label || '';
  return `<div class="loader" aria-hidden="true">
  <div class="loader__inner">
    <div class="loader__mark">${mark('ghost')}<div class="fill">${mark()}</div></div>
    <div class="loader__word">${word()}</div>
  </div>
  <div class="loader__meta"><span class="loader__page">${label}</span><span class="loader__count">000</span></div>
</div>
<div class="cursor" aria-hidden="true"><div class="cursor__dot"></div><div class="cursor__ring"><span>Ver</span></div></div>`;
}

function header(meta) {
  const links = NAV.filter(n => n.key !== 'inicio').map(n =>
    `<li><a href="${n.href}" data-label="${n.label}"${n.key === meta.key ? ' aria-current="page"' : ''}>${roll(n.label)}</a></li>`).join('');
  const menuLinks = NAV.map((n, i) =>
    `<li><a class="menu__link" href="${n.href}" data-label="${n.label}"${n.key === meta.key ? ' aria-current="page"' : ''}><small>${String(i + 1).padStart(2, '0')}</small>${n.label}</a></li>`).join('');
  return `<header class="header">
  <a class="brand" href="index.html" data-label="Inicio" aria-label="Nordfit, ir al inicio">${mark('brand__mark')}${word('brand__word')}</a>
  <nav class="nav" aria-label="Principal">
    <ul class="nav__links">${links}</ul>
    ${btn('contacto.html#reserva', 'Primera sesión')}
    <button class="burger" aria-label="Abrir menú" aria-expanded="false" aria-controls="menu"><span></span><span></span></button>
  </nav>
</header>
<div class="menu" id="menu">
  <ol>${menuLinks}</ol>
  <div class="menu__foot">
    <span>C. de San Nazario, 1 · Chamartín, Madrid</span>
    <span>687 38 69 17</span>
  </div>
</div>`;
}

function footer(meta) {
  const cta = meta.key === 'contacto' ? '' : `
  <div class="footer__cta">
    <h2 class="display" data-split="lines">Tu primera sesión<br><span class="thin">empieza aquí</span></h2>
    ${btn('contacto.html#reserva', 'Reservar valoración')}
  </div>`;
  return `<footer class="footer">${cta}
  <div class="footer__grid">
    <div>
      <a href="index.html" data-label="Inicio" aria-label="Nordfit, inicio">${lockup('footer__logo')}</a>
      <div class="badge-row"><span class="badge">Espacio LGBTQ+ friendly</span><span class="badge">Negocio de propietarias mujeres</span></div>
    </div>
    <div>
      <h3>Visítanos</h3>
      <ul><li>C. de San Nazario, 1</li><li>Chamartín, 28002 Madrid</li><li><a class="u-line" href="https://www.google.com/maps/search/?api=1&query=Nordfit+C.+de+San+Nazario+1+Madrid" target="_blank" rel="noopener">Cómo llegar</a></li></ul>
    </div>
    <div>
      <h3>Habla con nosotros</h3>
      <ul><li><a class="u-line" href="tel:+34687386917">687 38 69 17</a></li><li><a class="u-line" href="https://wa.me/34687386917" target="_blank" rel="noopener">WhatsApp</a></li><li>Abierto hasta las 22:00</li></ul>
    </div>
    <div>
      <h3>Páginas</h3>
      <ul>${NAV.map(n => `<li><a class="u-line" href="${n.href}" data-label="${n.label}">${n.label}</a></li>`).join('')}</ul>
    </div>
  </div>
  <div class="footer__big" aria-hidden="true">${word()}</div>
  <div class="footer__legal"><span>© ${new Date().getFullYear()} Nordfit · Entrenamiento personal en Madrid</span><span><span data-count="5.0">5,0</span> en Google · <span data-count="80">80</span> reseñas</span></div>
</footer>`;
}

function scripts(meta) {
  return `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
${meta.js ? `<script src="assets/js/${meta.js}"></script>` : ''}
<script src="assets/js/main.js"></script>
</body>
</html>
`;
}

const helpers = { mark, word, lockup, ARROW, STAR, btn, roll, ph };
const pagesDir = path.join(root, 'src/pages');
for (const f of fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'))) {
  let src = fs.readFileSync(path.join(pagesDir, f), 'utf8');
  const metaMatch = src.match(/^<!--(\{[\s\S]*?\})-->\s*/);
  const meta = JSON.parse(metaMatch[1]);
  src = src.slice(metaMatch[0].length);
  // {{ expresión }} se evalúa con los helpers
  src = src.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => Function(...Object.keys(helpers), `return (${expr});`)(...Object.values(helpers)));
  const out = head(meta) + '\n' + loader(meta) + '\n' + header(meta) + '\n<main id="main">\n' + src + '\n</main>\n' + footer(meta) + '\n' + scripts(meta);
  fs.writeFileSync(path.join(root, f), out);
  console.log('✓', f);
}
fs.writeFileSync(path.join(root, 'assets/img/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -80 614 600"><rect x="-40" y="-80" width="614" height="600" rx="120" fill="#161d28"/><path fill="#cfd4db" fill-rule="evenodd" d="${MARK}"/></svg>`);
