# Nordfit — prototipo de reservas y pagos

Copia de la web con el **área de clientes** y el **panel /admin** añadidos. La web original (raíz del repositorio) no se ha tocado.

Es un prototipo navegable: todo funciona, pero los datos son de ejemplo y se guardan solo en el navegador (localStorage). No se cobra nada ni se envían emails.

## Probarlo

| Página | Qué hace | Acceso de prueba |
|---|---|---|
| `index.html` (y resto) | Web pública con el botón **Reserva tus clases** arriba a la derecha. Con sesión iniciada pasa a ser **Mi cuenta** | — |
| `acceso.html` | Entrada con enlace por email (sin contraseña) | `lucia@ejemplo.com` (1:1 con Sergio) · `raul.medina@ejemplo.com` (grupo) |
| `cuenta.html` | Mi cuenta: **Mi horario** (horario fijo, calendario y solicitudes de cambio), **Mis sesiones**, **Pagos**, **Mis datos** | Tras entrar |
| `admin.html` (`/admin` en Vercel) | Panel del equipo. **Sergio (dueño)**: resumen, agenda, clientes, pagos, calendario y estadísticas. **Jules y Adrián**: su día, su agenda y su calendario para bloquear días u horas | `sergio@nordfit.es`, `jules@nordfit.es`, `adrian@nordfit.es` · `nordfit` |

En local: `python3 -m http.server` dentro de esta carpeta y abrir `http://localhost:8000`.
"Restablecer datos de prueba" (en Mi datos o en el panel) vuelve al estado inicial.

## Reglas que ya aplica

- Bonos de 8 sesiones al mes: 1:1 (360 €), pareja (240 € por persona) y grupo reducido (120 €).
- Cada cliente tiene un **horario fijo semanal** (lo pone Sergio en su ficha). Sus 8 sesiones del mes se crean solas a partir de él; si un día está cerrado o el entrenador no está, esa sesión no se crea y el cliente puede pedir recuperarla.
- Para cambiar una sesión concreta, el cliente elige otro hueco libre y envía una **solicitud** a su entrenador, que la acepta o la rechaza desde su panel. Hasta entonces mantiene su sesión original.
- Las sesiones no se acumulan: lo que no se usa en el mes se pierde.
- Pago del bono: tarjeta de crédito o débito (Stripe, queda pagado al momento) o transferencia/Bizum (se muestran los datos y el concepto; el cliente reserva ya y el pago queda pendiente hasta que el dueño lo confirma en /admin).
- Cancelación gratis hasta 24 h antes; después, la sesión se descuenta.
- No se pueden pedir cambios con menos de 2 h de antelación.
- Bloqueos: cada entrenador bloquea sus días u horas; Sergio puede bloquear a cualquiera o cerrar el estudio entero (festivos). Los clientes no pueden reservar en esos huecos y, si había reservas, se cancelan y vuelven al bono.

## Pendiente de confirmar con el dueño

- Turnos reales de Sergio, Jules y Adrián (ahora: Sergio 7–15 h, Adrián 9–17 h, Jules 14–22 h).
- Horarios y plazas de los grupos reducidos (ahora: 6 grupos de ejemplo).
- IBAN y titular reales para la transferencia, y número de Bizum.

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
