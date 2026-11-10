import { ROLES } from '../../config.js';
import { html, render, qs, initials } from '../../core/dom.js';
import { Session } from '../../core/session.js';
import { icon } from '../../ui/icons.js';
import { mountTopProgress, errorState, loaderBlock } from '../../ui/feedback.js';

// Router por hash del panel administrativo. Cada vista se carga bajo demanda (import dinámico).
const ROUTES = [
  { path: '/dashboard', title: 'Panel de control', icon: 'dashboard', section: 'General', load: () => import('./dashboard.js') },
  { path: '/books', title: 'Inventario de libros', icon: 'books', section: 'Inventario', load: () => import('./books.js') },
  { path: '/copies', title: 'Ejemplares físicos', icon: 'barcode', section: 'Inventario', load: () => import('./copies.js') },
  { path: '/taxonomy', title: 'Categorías y autores', icon: 'tag', section: 'Inventario', load: () => import('./taxonomy.js') },
  { path: '/purchases', title: 'Registro de compras', icon: 'cart', section: 'Operación', load: () => import('./purchases.js') },
  { path: '/loans', title: 'Préstamos y devoluciones', icon: 'swap', section: 'Operación', load: () => import('./loans.js') },
  { path: '/users', title: 'Control de usuarios', icon: 'users', section: 'Personas', load: () => import('./users.js') },
];

const content = qs('#content');
const sidebar = qs('#sidebar');
const backdrop = qs('#sidebar-backdrop');
const toggle = qs('#sidebar-toggle');
let cleanup = null;
let navigationId = 0;

function renderSidebar(user) {
  render(
    qs('#sidebar-user'),
    html`<span class="avatar">${initials(user.fullName)}</span>
      <div class="grow"><div class="sidebar__user-name">${user.fullName}</div><div class="sidebar__user-role">Administrador</div></div>`
  );

  const sections = [...new Set(ROUTES.map((r) => r.section))];
  render(
    qs('#sidebar-nav'),
    sections.map(
      (section) => html`<div class="sidebar__section">${section}</div>
        ${ROUTES.filter((r) => r.section === section).map(
          (r) => html`<a class="sidebar__link" href="#${r.path}" data-path="${r.path}">${icon(r.icon)}<span>${r.title}</span></a>`
        )}`
    )
  );
}

function setSidebar(open) {
  sidebar.classList.toggle('is-open', open);
  backdrop.classList.toggle('is-visible', open);
  toggle.setAttribute('aria-expanded', String(open));
}

function parseHash() {
  const [path, queryString = ''] = location.hash.replace(/^#/, '').split('?');
  return { path: path || '/dashboard', params: new URLSearchParams(queryString) };
}

async function navigate() {
  const { path, params } = parseHash();
  const route = ROUTES.find((r) => r.path === path);
  if (!route) {
    location.replace('#/dashboard');
    return;
  }

  const currentId = ++navigationId;
  document.querySelectorAll('.sidebar__link').forEach((link) => {
    if (link.dataset.path === route.path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  qs('#topbar-title').textContent = route.title;
  document.title = `BooksBrain · ${route.title}`;
  setSidebar(false);

  cleanup?.();
  cleanup = null;
  render(content, loaderBlock());

  try {
    const module = await route.load();
    if (currentId !== navigationId) return;
    const view = document.createElement('div');
    view.className = 'view';
    content.replaceChildren(view);
    cleanup = (await module.mount(view, { params })) ?? null;
    content.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  } catch (error) {
    if (currentId !== navigationId) return;
    if (error?.isUnauthorized) {
      Session.expire();
      return;
    }
    render(content, errorState(error, 'retry-view'));
    qs('#retry-view')?.addEventListener('click', navigate);
  }
}

async function init() {
  mountTopProgress();
  let user;
  try {
    user = await Session.require(ROLES.ADMIN);
  } catch (error) {
    render(content, errorState(error, 'retry-view'));
    qs('#retry-view')?.addEventListener('click', () => location.reload());
    return;
  }
  if (!user) return;

  renderSidebar(user);
  toggle.addEventListener('click', () => setSidebar(!sidebar.classList.contains('is-open')));
  backdrop.addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebar(false);
  });
  qs('#logout-btn').addEventListener('click', () => Session.logout());

  // Si el token expira durante el uso, cualquier 401 devuelve al login.
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.isUnauthorized) Session.expire();
  });

  window.addEventListener('hashchange', navigate);
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  navigate();
}

init();
