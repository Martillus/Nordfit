#!/usr/bin/env node
/* Despliegue en Vercel: la portada (vercel/lanzador.html) con las tres entradas
   y, en /web, la copia de la web con el sistema de reservas y el panel.
   Uso: node vercel-build.js  → genera dist/ */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
const src = path.join(root, 'prototipo-reservas');
const skip = new Set(['src', 'build.js', 'README.md'].map(f => path.join(src, f)));

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, path.join(out, 'web'), { recursive: true, filter: p => !skip.has(p) });
fs.copyFileSync(path.join(root, 'vercel', 'lanzador.html'), path.join(out, 'index.html'));
console.log('✓ dist/ listo');
