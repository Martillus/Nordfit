# Nordfit — prototipo de reservas y pagos

Copia de la web con el **área de clientes** y el **panel /admin** añadidos. La web original (raíz del repositorio) no se ha tocado.

Es un prototipo navegable: todo funciona, pero los datos son de ejemplo y se guardan solo en el navegador (localStorage). No se cobra nada ni se envían emails.

## Probarlo

| Página | Qué hace | Acceso de prueba |
|---|---|---|
| `index.html` (y resto) | Web pública con el botón **Reserva tus clases** arriba a la derecha. Con sesión iniciada pasa a ser **Mi cuenta** | — |
| `acceso.html` | Entrada con enlace por email (sin contraseña) | `lucia@ejemplo.com` (1:1 con Sergio) · `raul.medina@ejemplo.com` (grupo) |
| `cuenta.html` | Mi cuenta: **Reservar** (calendario + pago), **Mis sesiones**, **Pagos**, **Mis datos** | Tras entrar |
| `admin.html` (`/admin` en Vercel) | Panel privado: resumen, agenda semanal, clientes, pagos, calendario de cierres y grupos, estadísticas | `admin@nordfit.es` · `nordfit` |

En local: `python3 -m http.server` dentro de esta carpeta y abrir `http://localhost:8000`.
"Restablecer datos de prueba" (en Mi datos o en el panel) vuelve al estado inicial.

## Reglas que ya aplica

- Bonos de 8 sesiones al mes: 1:1 (360 €), pareja (240 € por persona) y grupo reducido (120 €).
- 1:1 y pareja reservan huecos libres de su entrenador (pueden ver también los del otro). Grupo reducido reserva plaza en los grupos fijos.
- Para reservar hay que tener el bono del mes pagado, o haber elegido "pagar en el estudio" (queda pendiente en /admin hasta que el dueño lo confirme).
- Cancelación gratis hasta 24 h antes; después, la sesión se descuenta.
- No se puede reservar con menos de 2 h de antelación.
- Los días cerrados desde /admin desaparecen del calendario y cancelan las reservas de ese día.

## Pendiente de confirmar con el dueño

- Turnos reales de Sergio y Jules (ahora: Sergio mañanas, Jules tardes).
- Horarios y plazas de los grupos reducidos (ahora: 6 grupos de ejemplo).
- ¿Las sesiones no usadas pasan al mes siguiente? (ahora: no).

## Para pasar a producción

1. **Supabase** (gratis para este volumen): login por enlace mágico, base de datos y cuentas de administrador. Solo cambia `assets/js/area/data.js`; la interfaz se queda igual.
2. **Stripe**: el dueño crea la cuenta (DNI/CIF e IBAN). Pago con Stripe Checkout (tarjeta, Apple/Google Pay y domiciliación SEPA) y un webhook en una función de Vercel que marca el bono como pagado.
3. **Emails automáticos** (Resend): confirmación de reserva, recordatorio el día antes y avisos de pago pendiente los días 1, 5 y 10.
4. **Dominio** propio (p. ej. nordfit.es, unos 10 €/año) conectado a Vercel.

## Archivos nuevos o cambiados respecto a la web original

- `src/pages/acceso.html`, `src/pages/cuenta.html`, `admin.html`
- `assets/js/area/` (`data.js`, `ui.js`, `acceso.js`, `cuenta.js`, `admin.js`)
- `assets/css/area.css`
- `build.js`: botón "Reserva tus clases", icono de cuenta en móvil y opciones `css`, `noCta`, `label`
- `assets/js/main.js`: cambia el botón por "Mi cuenta" si hay sesión
- `assets/css/styles.css`: estilos del botón de cuenta en la cabecera
