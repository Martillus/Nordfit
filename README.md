# Nordfit — web

Web multipágina del estudio de entrenamiento personal **Nordfit** (C. de San Nazario, 1 · Chamartín, Madrid).

## Páginas
| Archivo | Contenido |
|---|---|
| `index.html` | Inicio: hero "la cima" (GSAP + ScrollTrigger), manifiesto, formatos en scroll horizontal, método, reseñas, equipo |
| `entrenamiento.html` | Formatos (acordeón), para quién, método y preguntas frecuentes |
| `equipo.html` | Entrenadores, valores |
| `estudio.html` | Foto del espacio con expansión parallax, material, rincones del estudio |
| `tarifas.html` | Planes con selector bono/sesión, comparativa |
| `contacto.html` | Contacto, formulario de reserva, mapa y horario |

## Editar
Las páginas se escriben en `src/pages/*.html`; cabecera, menú, loader y pie son comunes y se generan con:

```bash
node build.js
```

No hay dependencias: GSAP, ScrollTrigger y Lenis se cargan desde CDN, y las fuentes (Montserrat + Manrope) desde Google Fonts.

## Fotos pendientes
Los huecos rayados con el texto «Foto pendiente» indican qué foto va en cada sitio. Sustituye el bloque `{{ph(...)}}` del archivo en `src/pages/` por un `<img>` y vuelve a ejecutar `node build.js`.

## Revisar antes de publicar
- Precios de `tarifas.html` (son orientativos).
- Horario semanal de `contacto.html` (solo se conoce el cierre a las 22:00).
- El formulario de contacto no envía datos: conéctalo a tu servicio (Formspree, Netlify Forms, etc.).
