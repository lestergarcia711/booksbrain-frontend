import { UsersApi, BooksApi, LoansApi, PurchasesApi } from '../../api/services.js';
import { html, render, qs } from '../../core/dom.js';
import { formatNumber, formatMoney, formatDate, formatDateTime, LOAN_STATUS } from '../../core/format.js';
import { icon } from '../../ui/icons.js';
import { badge, emptyState, skeletonRows } from '../../ui/feedback.js';
import { Lookups, pageHead } from './shared.js';

function statCard({ variant, label, value, iconName, href, linkText }) {
  return html`<article class="stat-card stat-card--${variant}">
    <div class="stat-card__body">
      <div><div class="card-number">${value}</div><div class="stat-card__label">${label}</div></div>
      ${icon(iconName, { className: 'stat-card__icon' })}
    </div>
    <a class="stat-card__footer" href="${href}">${linkText} ${icon('arrowRight', { size: 14 })}</a>
  </article>`;
}

const settledValue = (result, pick) => (result.status === 'fulfilled' ? pick(result.value) : null);
const show = (value) => (value === null ? '—' : formatNumber(value));

export async function mount(view) {
  render(
    view,
    html`${pageHead({
      title: 'Panel de control',
      subtitle: `Resumen operativo de la librería · ${formatDate(new Date().toISOString().slice(0, 10))}`,
      actions: html`<a class="btn" href="#/loans?new=1">${icon('swap')} Nuevo préstamo</a>
        <a class="btn btn--primary" href="#/purchases?new=1">${icon('cart')} Registrar venta</a>`,
    })}
    <section class="stat-grid" id="stats" aria-label="Indicadores">
      ${['users', 'books', 'authors', 'editorials'].map(
        (variant) => html`<div class="stat-card stat-card--${variant}"><div class="stat-card__body"><div class="spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div></div></div>`
      )}
    </section>
    <div class="dash-grid">
      <section class="panel">
        <div class="panel__header"><h3 class="panel-title">Préstamos activos recientes</h3><a class="btn btn--sm btn--ghost" href="#/loans">Ver todos</a></div>
        <div id="recent-loans" style="padding:1rem">${skeletonRows(4)}</div>
      </section>
      <section class="panel">
        <div class="panel__header"><h3 class="panel-title">Stock bajo</h3><a class="btn btn--sm btn--ghost" href="#/books">Inventario</a></div>
        <div id="low-stock" style="padding:1rem">${skeletonRows(4)}</div>
      </section>
      <section class="panel" style="grid-column:1/-1">
        <div class="panel__header"><h3 class="panel-title">Últimas compras</h3><a class="btn btn--sm btn--ghost" href="#/purchases">Ver registro</a></div>
        <div id="recent-purchases" style="padding:1rem">${skeletonRows(3)}</div>
      </section>
    </div>`
  );

  const [users, books, authors, categories, activeLoans, overdueLoans, purchases] = await Promise.allSettled([
    UsersApi.list({ limit: 1 }),
    Lookups.books(),
    Lookups.authors(),
    Lookups.categories(),
    LoansApi.list({ status: 'Active', limit: 5 }),
    LoansApi.list({ status: 'Overdue', limit: 5 }),
    PurchasesApi.list({ limit: 6 }),
  ]);

  const firstError = [users, books, authors, categories].find((r) => r.status === 'rejected');
  if (firstError?.reason?.isUnauthorized) throw firstError.reason;
  if (!view.isConnected) return;

  const bookList = settledValue(books, (v) => v) ?? [];
  const overdueTotal = settledValue(overdueLoans, (v) => v.meta.total);
  const activeTotal = settledValue(activeLoans, (v) => v.meta.total);

  render(
    qs('#stats', view),
    html`${statCard({ variant: 'users', label: 'Usuarios registrados', value: show(settledValue(users, (v) => v.meta.total)), iconName: 'users', href: '#/users', linkText: 'Gestionar usuarios' })}
      ${statCard({ variant: 'books', label: 'Títulos en catálogo', value: show(books.status === 'fulfilled' ? bookList.length : null), iconName: 'books', href: '#/books', linkText: 'Ver inventario' })}
      ${statCard({ variant: 'authors', label: 'Autores', value: show(settledValue(authors, (v) => v.length)), iconName: 'feather', href: '#/taxonomy', linkText: 'Ver autores' })}
      ${statCard({ variant: 'editorials', label: 'Categorías', value: show(settledValue(categories, (v) => v.length)), iconName: 'tag', href: '#/taxonomy', linkText: 'Ver categorías' })}
      ${statCard({ variant: 'dark', label: 'Préstamos activos', value: show(activeTotal), iconName: 'swap', href: '#/loans?status=Active', linkText: 'Controlar préstamos' })}
      ${statCard({ variant: 'editorials', label: 'Préstamos vencidos', value: show(overdueTotal), iconName: 'clock', href: '#/loans?status=Overdue', linkText: 'Gestionar devoluciones' })}
      ${statCard({ variant: 'books', label: 'Ejemplares disponibles', value: show(books.status === 'fulfilled' ? bookList.reduce((s, b) => s + (b.stock?.available ?? 0), 0) : null), iconName: 'barcode', href: '#/copies', linkText: 'Ver ejemplares' })}
      ${statCard({ variant: 'users', label: 'Compras registradas', value: show(settledValue(purchases, (v) => v.meta.total)), iconName: 'receipt', href: '#/purchases', linkText: 'Ver compras' })}`
  );

  // Préstamos: primero los vencidos (más urgentes), luego los activos.
  const loans = [
    ...(settledValue(overdueLoans, (v) => v.data) ?? []),
    ...(settledValue(activeLoans, (v) => v.data) ?? []),
  ].slice(0, 6);
  render(
    qs('#recent-loans', view),
    loans.length
      ? html`<ul class="mini-list" style="margin:-1rem">${loans.map((loan) => {
          const s = LOAN_STATUS[loan.status] ?? { label: loan.status, tone: 'plain' };
          return html`<li>
            <span class="avatar" style="background:var(--card-users)">${icon('swap', { size: 16 })}</span>
            <div class="grow"><strong>${loan.client.fullName ?? `Cliente #${loan.client.id}`}</strong>
              <div class="text-xs text-muted">${loan.items.length} ${loan.items.length === 1 ? 'libro' : 'libros'} · vence ${formatDate(loan.expectedReturnDate)}</div></div>
            ${badge(s.label, s.tone)}
          </li>`;
        })}</ul>`
      : emptyState('Sin préstamos activos', 'Todo está en su lugar.', 'checkCircle')
  );

  const low = bookList
    .filter((b) => (b.stock?.available ?? 0) <= (b.stock?.minimum ?? 0))
    .sort((a, b) => a.stock.available - b.stock.available)
    .slice(0, 6);
  render(
    qs('#low-stock', view),
    low.length
      ? html`<ul class="mini-list" style="margin:-1rem">${low.map((b) => {
          const pct = Math.min(100, (b.stock.available / Math.max(1, b.stock.minimum)) * 100);
          return html`<li>
            <div class="grow"><strong>${b.title}</strong><div class="text-xs text-muted">Disponibles ${b.stock.available} · mínimo ${b.stock.minimum}</div></div>
            <div class="stock-bar" aria-hidden="true"><span style="width:${pct.toFixed(0)}%"></span></div>
          </li>`;
        })}</ul>`
      : emptyState('Stock saludable', 'Ningún título está por debajo de su mínimo.', 'checkCircle')
  );

  const purchaseList = settledValue(purchases, (v) => v.data) ?? [];
  render(
    qs('#recent-purchases', view),
    purchaseList.length
      ? html`<div class="table-wrap" style="margin:-1rem"><table class="table table--stack">
          <thead><tr><th>Compra</th><th>Cliente</th><th>Fecha</th><th>Artículos</th><th class="text-right">Total</th></tr></thead>
          <tbody>${purchaseList.map(
            (p) => html`<tr>
              <td data-label="Compra"><span class="table__primary">#${p.id}</span></td>
              <td data-label="Cliente">${p.client.fullName ?? `#${p.client.id}`}</td>
              <td data-label="Fecha">${formatDateTime(p.purchaseDate)}</td>
              <td data-label="Artículos">${p.items.reduce((s, i) => s + i.quantity, 0)}</td>
              <td data-label="Total" class="text-right"><strong>${formatMoney(p.totalAmount)}</strong></td>
            </tr>`
          )}</tbody></table></div>`
      : emptyState('Sin compras todavía', 'Registra la primera venta desde el botón superior.', 'receipt')
  );
}
