import { ROUTES } from '../config.js';
import { qs } from '../core/dom.js';
import { Session } from '../core/session.js';
import { ApiError } from '../api/http.js';
import { mountTopProgress, withBusy, showFormErrors, clearFormErrors } from '../ui/feedback.js';

const form = qs('#login-form');
const submit = form.querySelector('[type="submit"]');

// Solo se permiten redirecciones internas a páginas conocidas (evita open-redirects).
function safeNext(user) {
  const next = new URLSearchParams(location.search).get('next') ?? '';
  const [page, hash = ''] = next.split('#');
  const allowed = { [ROUTES.ACCOUNT]: true, [ROUTES.ADMIN]: true, [ROUTES.CATALOG]: true };
  const home = Session.homeFor(user);
  if (allowed[page] && (page === home || page === ROUTES.CATALOG)) {
    return hash ? `${page}#${hash.replace(/[^\w/-]/g, '')}` : page;
  }
  return home;
}

function validate(email, password) {
  const details = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) details.push({ field: 'email', message: 'Ingresa un correo válido' });
  if (!password) details.push({ field: 'password', message: 'La contraseña es obligatoria' });
  return details.length ? new ApiError('Datos inválidos', 400, details) : null;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormErrors(form);
  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;

  const invalid = validate(email, password);
  if (invalid) {
    showFormErrors(form, invalid);
    return;
  }

  await withBusy(submit, async () => {
    try {
      const user = await Session.login(email, password);
      window.location.replace(safeNext(user));
    } catch (error) {
      showFormErrors(form, error);
      form.password.value = '';
    }
  });
});

qs('[data-toggle-password]').addEventListener('click', (event) => {
  const input = form.password;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  event.currentTarget.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
});

// Si ya hay sesión activa, se envía directamente al panel correspondiente.
mountTopProgress();
Session.load()
  .then((user) => {
    if (user) window.location.replace(Session.homeFor(user));
  })
  .catch(() => {});
form.email.focus();
