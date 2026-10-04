/* NORDFIT — acceso al área de clientes (enlace mágico simulado) */
(() => {
  const { session } = window.NF;
  const ses = session.get();
  if (ses && ses.role === 'client') { window.location.replace('cuenta.html'); return; }

  const root = document.querySelector('.auth__card');
  if (!root) return;
  const steps = root.querySelectorAll('[data-step]');
  const form = root.querySelector('[data-login]');
  const input = form.querySelector('input');
  let email = '';

  const show = name => {
    steps.forEach(s => { s.hidden = s.dataset.step !== name; });
    root.querySelectorAll('[data-email]').forEach(e => { e.textContent = email; });
    const first = root.querySelector(`[data-step="${name}"] button, [data-step="${name}"] input`);
    if (name !== 'email') first?.focus();
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    const field = input.closest('.field');
    const ok = input.value.trim() !== '' && input.checkValidity();
    field.classList.toggle('is-error', !ok);
    if (!ok) { input.focus(); return; }
    email = input.value.trim();
    // En producción: Supabase envía el enlace solo si el email existe.
    // Por privacidad la pantalla diría siempre "revisa tu correo"; aquí se
    // distingue para que el prototipo se pueda probar.
    const exists = window.NF.db().clients.some(c => c.active && c.email.toLowerCase() === email.toLowerCase());
    show(exists ? 'sent' : 'unknown');
  });
  input.addEventListener('input', () => input.closest('.field').classList.remove('is-error'));

  root.querySelector('[data-open-link]').addEventListener('click', () => {
    if (session.loginClient(email)) window.location.href = 'cuenta.html';
  });
  root.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { show('email'); input.focus(); }));
  root.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => {
    input.value = b.dataset.demo;
    form.requestSubmit();
  }));
})();
