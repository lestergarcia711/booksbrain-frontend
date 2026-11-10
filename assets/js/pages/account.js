import { CONFIG, ROLES } from '../config.js';
import { MeApi, AuthApi } from '../api/services.js';
import { html, render, qs, qsa, on, initials } from '../core/dom.js';
import {
  formatMoney,
  formatDate,
  formatDateTime,
  formatNumber,
  daysUntil,
  parseDate,
  LOAN_STATUS,
  conditionLabel,
} from '../core/format.js';
import { Session } from '../core/session.js';
import { icon } from '../ui/icons.js';
import { Modal } from '../ui/modal.js';
import { renderUserArea } from '../ui/header.js';
import { paginationView } from '../ui/pagination.js';
import {
  mountTopProgress,
  loaderBlock,
  emptyState,
  errorState,
  badge,
  toast,
  withBusy,
  showFormErrors,
  clearFormErrors,
} from '../ui/feedback.js';
import { ApiError } from '../api/http.js';

const root = qs('#account-root');
const state = {
  tab: 'loans',
  loanStatus: '',
  loanPage: 1,
  purchasePage: 1,
};

// ---------------- Layout ----------------
function layout(user) {
  return html`<section class="welcome view">
      <span class="avatar">${initials(user.fullName)}</span>
      <div class="grow">
        <h1>Hola, ${user.fullName.split(' ')[0]}</h1>
        <p>${user.email} · Cliente BooksBrain</p>
      </div>
      <a class="btn btn--light" href="index.html">${icon('store')} Explorar catálogo</a>
    </section>

    <section class="stat-grid" style="margin-top:1.25rem" id="summary" aria-label="Resumen">
      ${summaryCard('books', 'Préstamos activos', '…', 'book')}
      ${summaryCard('editorials', 'Préstamos vencidos', '…', 'clock')}
      ${summaryCard('users', 'Compras realizadas', '…', 'receipt')}
    </section>

    <section class="panel" style="margin-top:1.5rem">
      <div class="tabs" role="tablist" aria-label="Secciones de la cuenta" style="padding:0 1rem">
        <button class="tab" role="tab" id="tab-loans" aria-controls="panel" data-tab="loans">${icon('book')} Mis préstamos</button>
        <button class="tab" role="tab" id="tab-purchases" aria-controls="panel" data-tab="purchases">${icon('receipt')} Mis compras</button>
        <button class="tab" role="tab" id="tab-security" aria-controls="panel" data-tab="security">${icon('lock')} Seguridad</button>
      </div>
      <div class="panel__body" id="panel" role="tabpanel"></div>
    </section>`;
}

function summaryCard(variant, label, value, iconName) {
  return html`<article class="stat-card stat-card--${variant}">
    <div class="stat-card__body">
      <div><div class="card-number" data-value>${value}</div><div class="stat-card__label">${label}</div></div>
      ${icon(iconName, { className: 'stat-card__icon' })}
    </div>
  </article>`;
}

async function loadSummary() {
  const cards = qsa('#summary [data-value]');
  const results = await Promise.allSettled([
    MeApi.loans({ status: 'Active', limit: 1 }),
    MeApi.loans({ status: 'Overdue', limit: 1 }),
    MeApi.purchases({ limit: 1 }),
  ]);
  results.forEach((result, index) => {
    cards[index].textContent = result.status === 'fulfilled' ? formatNumber(result.value.meta?.total ?? 0) : '—';
  });
}

// ---------------- Tabs ----------------
function selectTab(tab) {
  state.tab = tab;
  qsa('[data-tab]').forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  qs('#panel').setAttribute('aria-labelledby', `tab-${tab}`);
  history.replaceState(null, '', `#${tab}`);
  ({ loans: renderLoans, purchases: renderPurchases, security: renderSecurity })[tab]();
}

// ---------------- Préstamos ----------------
function dueMeter(loan) {
  if (loan.status === 'Returned') return '';
  const start = parseDate(loan.loanDate);
  const end = parseDate(loan.expectedReturnDate);
  const left = daysUntil(loan.expectedReturnDate);
  if (!start || !end || left === null) return '';
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const used = Math.min(100, Math.max(0, ((totalDays - left) / totalDays) * 100));
  const tone = left < 0 ? 'late' : left <= 3 ? 'warn' : '';
  const text =
    left < 0
      ? `Vencido hace ${Math.abs(left)} ${Math.abs(left) === 1 ? 'día' : 'días'}`
      : left === 0
        ? 'Vence hoy'
        : `Quedan ${left} ${left === 1 ? 'día' : 'días'} para devolver`;
  return html`<div class="due-meter ${tone ? `due-meter--${tone}` : ''}">
    <div class="row row--between"><span>${text}</span><span>${Math.round(used)}%</span></div>
    <div class="due-meter__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used)}" aria-label="Tiempo de préstamo consumido">
      <div class="due-meter__bar" style="width:${used.toFixed(0)}%"></div>
    </div>
  </div>`;
}

function loanCard(loan) {
  const status = LOAN_STATUS[loan.status] ?? { label: loan.status, tone: 'plain' };
  const modifier = loan.status === 'Overdue' ? 'loan-card--overdue' : loan.status === 'Returned' ? 'loan-card--returned' : '';
  return html`<article class="loan-card ${modifier}">
    <div class="loan-card__head">
      <strong>Préstamo #${loan.id}</strong>
      ${badge(status.label, status.tone)}
    </div>
    <div class="loan-card__body">
      <div class="loan-dates">
        <div><span>Fecha de préstamo</span>${formatDate(loan.loanDate)}</div>
        <div><span>Devolución esperada</span><strong>${formatDate(loan.expectedReturnDate)}</strong></div>
        <div><span>Devuelto el</span>${loan.actualReturnDate ? formatDate(loan.actualReturnDate) : '—'}</div>
      </div>
      ${dueMeter(loan)}
      <ul class="item-list" aria-label="Libros del préstamo">
        ${loan.items.map(
          (item) => html`<li>
            <span>${icon('book', { size: 16 })} <strong>${item.bookTitle}</strong></span>
            ${item.checkinCondition
              ? badge(`Devuelto · ${conditionLabel(item.checkinCondition)}`, 'success')
              : badge('En tu poder', 'info')}
          </li>`
        )}
      </ul>
    </div>
  </article>`;
}

async function renderLoans() {
  const panel = qs('#panel');
  const filters = [
    ['', 'Todos'],
    ['Active', 'Activos'],
    ['Overdue', 'Vencidos'],
    ['Returned', 'Devueltos'],
  ];
  render(
    panel,
    html`<div class="row row--between" style="margin-bottom:1rem">
        <div class="segmented" role="group" aria-label="Filtrar por estado">
          ${filters.map(
            ([value, label]) => html`<button type="button" data-loan-status="${value}" aria-pressed="${String(state.loanStatus === value)}">${label}</button>`
          )}
        </div>
      </div>
      <div id="loans-list">${loaderBlock('Cargando tus préstamos…')}</div>
      <div id="loans-pagination" style="margin-top:1.25rem"></div>`
  );

  try {
    const { data, meta } = await MeApi.loans({
      status: state.loanStatus || undefined,
      page: state.loanPage,
      limit: CONFIG.TABLE_PAGE_SIZE,
    });
    if (state.tab !== 'loans') return;
    render(
      qs('#loans-list'),
      data.length
        ? html`<div class="loan-list">${data.map(loanCard)}</div>`
        : emptyState('No tienes préstamos aquí', 'Cuando lleves un libro en préstamo aparecerá en esta sección.', 'book')
    );
    render(qs('#loans-pagination'), paginationView(meta, 'préstamos'));
  } catch (error) {
    render(qs('#loans-list'), errorState(error));
  }
}

// ---------------- Compras ----------------
async function renderPurchases() {
  const panel = qs('#panel');
  render(panel, html`<div id="purchases-list">${loaderBlock('Cargando tus compras…')}</div><div id="purchases-pagination" style="margin-top:1.25rem"></div>`);

  try {
    const { data, meta } = await MeApi.purchases({ page: state.purchasePage, limit: CONFIG.TABLE_PAGE_SIZE });
    if (state.tab !== 'purchases') return;
    if (!data.length) {
      render(qs('#purchases-list'), emptyState('Aún no tienes compras', 'Tus compras en mostrador aparecerán aquí.', 'receipt'));
      return;
    }
    render(
      qs('#purchases-list'),
      html`<div class="table-wrap"><table class="table table--stack">
        <thead><tr><th>Compra</th><th>Fecha</th><th>Libros</th><th class="text-right">Total</th><th><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${data.map(
          (p) => html`<tr>
            <td data-label="Compra"><span class="table__primary">#${p.id}</span></td>
            <td data-label="Fecha">${formatDateTime(p.purchaseDate)}</td>
            <td data-label="Libros">${p.items.reduce((sum, i) => sum + i.quantity, 0)} ${p.items.length === 1 ? `· ${p.items[0].bookTitle}` : 'ejemplares'}</td>
            <td data-label="Total" class="text-right"><strong>${formatMoney(p.totalAmount)}</strong></td>
            <td class="table__actions"><button class="btn btn--sm" type="button" data-purchase="${p.id}">${icon('eye')} Ver</button></td>
          </tr>`
        )}</tbody></table></div>`
    );
    render(qs('#purchases-pagination'), paginationView(meta, 'compras'));
  } catch (error) {
    render(qs('#purchases-list'), errorState(error));
  }
}

async function openPurchase(purchaseId) {
  const modal = new Modal({ title: `Compra #${purchaseId}`, body: loaderBlock() }).open();
  try {
    const { data: p } = await MeApi.purchase(purchaseId);
    modal.setBody(html`<div class="stack">
      <dl class="kv"><dt>Fecha</dt><dd>${formatDateTime(p.purchaseDate)}</dd><dt>Artículos</dt><dd>${p.items.length}</dd></dl>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Libro</th><th class="text-right">Cant.</th><th class="text-right">Precio</th><th class="text-right">Subtotal</th></tr></thead>
        <tbody>${p.items.map(
          (i) => html`<tr><td>${i.bookTitle}</td><td class="text-right">${i.quantity}</td><td class="text-right">${formatMoney(i.unitPrice)}</td><td class="text-right">${formatMoney(i.subtotal)}</td></tr>`
        )}</tbody>
      </table></div>
      <div class="totals"><span>Total pagado</span><strong>${formatMoney(p.totalAmount)}</strong></div>
    </div>`);
  } catch (error) {
    modal.setBody(errorState(error));
  }
}

// ---------------- Seguridad ----------------
function renderSecurity() {
  render(
    qs('#panel'),
    html`<form id="password-form" class="stack" style="max-width:460px" novalidate>
      <div>
        <h2 class="panel-title">Cambiar contraseña</h2>
        <p class="text-sm text-muted">Si recibiste una contraseña temporal en mostrador, cámbiala por una propia.</p>
      </div>
      <div data-form-alert></div>
      <label class="field"><span class="field__label">Contraseña actual</span>
        <input class="input" type="password" name="currentPassword" autocomplete="current-password" required />
        <span class="field__error"></span></label>
      <label class="field"><span class="field__label">Nueva contraseña</span>
        <input class="input" type="password" name="newPassword" autocomplete="new-password" minlength="8" maxlength="64" required />
        <span class="field__hint">Entre 8 y 64 caracteres, con al menos una letra y un número.</span>
        <span class="field__error"></span></label>
      <label class="field"><span class="field__label">Confirmar nueva contraseña</span>
        <input class="input" type="password" name="confirmPassword" autocomplete="new-password" required />
        <span class="field__error"></span></label>
      <div><button class="btn btn--primary" type="submit" data-busy-text="Guardando…">${icon('shield')} Actualizar contraseña</button></div>
    </form>`
  );

  const form = qs('#password-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const currentPassword = form.currentPassword.value;
    const newPassword = form.newPassword.value;
    const details = [];
    if (!currentPassword) details.push({ field: 'currentPassword', message: 'Ingresa tu contraseña actual' });
    if (newPassword.length < 8 || newPassword.length > 64) details.push({ field: 'newPassword', message: 'Debe tener entre 8 y 64 caracteres' });
    else if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) details.push({ field: 'newPassword', message: 'Debe incluir al menos una letra y un número' });
    else if (newPassword === currentPassword) details.push({ field: 'newPassword', message: 'Debe ser diferente a la actual' });
    if (form.confirmPassword.value !== newPassword) details.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden' });
    if (details.length) {
      showFormErrors(form, new ApiError('Datos inválidos', 400, details));
      return;
    }

    await withBusy(form.querySelector('[type="submit"]'), async () => {
      try {
        await AuthApi.changePassword(currentPassword, newPassword);
        form.reset();
        toast('Contraseña actualizada correctamente', 'success');
      } catch (error) {
        showFormErrors(form, error);
      }
    });
  });
}

// ---------------- Arranque ----------------
async function init() {
  mountTopProgress();
  let user;
  try {
    user = await Session.require(ROLES.CLIENT);
  } catch (error) {
    render(root, errorState(error));
    return;
  }
  if (!user) return;

  renderUserArea(qs('#user-area'), user);
  render(root, layout(user));

  on(root, 'click', '[data-tab]', (_, button) => selectTab(button.dataset.tab));
  on(root, 'keydown', '[role="tab"]', (event, tab) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const tabs = qsa('[role="tab"]');
    const index = tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1);
    const next = tabs[(index + tabs.length) % tabs.length];
    next.focus();
    selectTab(next.dataset.tab);
  });
  on(root, 'click', '[data-loan-status]', (_, button) => {
    state.loanStatus = button.dataset.loanStatus;
    state.loanPage = 1;
    renderLoans();
  });
  on(root, 'click', '#loans-pagination [data-page]', (_, button) => {
    state.loanPage = Number(button.dataset.page);
    renderLoans();
  });
  on(root, 'click', '#purchases-pagination [data-page]', (_, button) => {
    state.purchasePage = Number(button.dataset.page);
    renderPurchases();
  });
  on(root, 'click', '[data-purchase]', (_, button) => openPurchase(button.dataset.purchase));

  const initialTab = ['loans', 'purchases', 'security'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'loans';
  selectTab(initialTab);
  loadSummary();
}

init();
