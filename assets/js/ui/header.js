import { html, render, initials } from '../core/dom.js';
import { icon } from './icons.js';
import { Session } from '../core/session.js';
import { ROLES, ROUTES } from '../config.js';

// Pinta la zona de usuario de la cabecera pública (botón "Ingresar" o menú desplegable).
export function renderUserArea(container, user) {
  if (!user) {
    render(
      container,
      html`<a class="btn btn--light" href="${ROUTES.LOGIN}">${icon('login')} <span>Ingresar</span></a>`
    );
    return;
  }

  const isAdmin = Session.roleOf(user) === ROLES.ADMIN;
  render(
    container,
    html`<div class="user-menu">
      <button class="user-menu__trigger" type="button" aria-haspopup="menu" aria-expanded="false" data-menu-trigger>
        <span class="avatar">${initials(user.fullName)}</span>
        <span class="user-menu__name">${user.fullName}</span>
      </button>
      <div class="user-menu__panel" role="menu" hidden data-menu-panel>
        <div class="user-menu__meta">
          <strong class="text-sm">${user.fullName}</strong>
          <div class="text-xs text-muted">${user.email}</div>
        </div>
        ${isAdmin
          ? html`<a class="user-menu__item" role="menuitem" href="${ROUTES.ADMIN}">${icon('dashboard')} Panel administrativo</a>`
          : html`<a class="user-menu__item" role="menuitem" href="${ROUTES.ACCOUNT}">${icon('user')} Mi cuenta</a>`}
        <a class="user-menu__item" role="menuitem" href="${ROUTES.CATALOG}">${icon('store')} Catálogo</a>
        <button class="user-menu__item" role="menuitem" type="button" data-logout>${icon('logout')} Cerrar sesión</button>
      </div>
    </div>`
  );

  const trigger = container.querySelector('[data-menu-trigger]');
  const panel = container.querySelector('[data-menu-panel]');
  const toggle = (open) => {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle(panel.hidden);
  });
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) toggle(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      toggle(false);
      trigger.focus();
    }
  });
  container.querySelector('[data-logout]').addEventListener('click', () => Session.logout());
}
