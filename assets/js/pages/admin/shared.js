import {
  CategoriesApi,
  AuthorsApi,
  BooksApi,
  UsersApi,
  BookCopiesApi,
  fetchAllPages,
} from '../../api/services.js';
import { ROLES } from '../../config.js';
import { html, render, qs, on } from '../../core/dom.js';
import { formatMoney } from '../../core/format.js';
import { icon } from '../../ui/icons.js';

// ---------------- Caché de catálogos auxiliares ----------------
// Evita repetir peticiones (la API tiene rate limit global) y se invalida tras cada mutación.
const cache = new Map();

async function cached(key, loader) {
  if (!cache.has(key)) {
    cache.set(key, loader().catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  return cache.get(key);
}

export const Lookups = {
  categories: () => cached('categories', async () => (await CategoriesApi.list()).data),
  authors: () => cached('authors', async () => (await AuthorsApi.list()).data),
  books: () => cached('books', () => fetchAllPages(BooksApi.list)),
  clients: () =>
    cached('clients', async () =>
      (await fetchAllPages(UsersApi.list)).filter((u) => u.role?.name === ROLES.CLIENT)
    ),
  availableCopies: () =>
    cached('availableCopies', () => fetchAllPages(BookCopiesApi.list, { status: 'Available' })),
  invalidate: (...keys) => {
    if (!keys.length) cache.clear();
    keys.forEach((key) => cache.delete(key));
  },
};

// ---------------- Encabezado de página ----------------
export function pageHead({ title, subtitle = '', crumb = '', actions = '' }) {
  return html`<div class="page-head">
    <div>
      ${crumb ? html`<div class="breadcrumb"><span>Administración</span><span>/</span><span>${crumb}</span></div>` : ''}
      <h2>${title}</h2>
      ${subtitle ? html`<p class="page-head__subtitle">${subtitle}</p>` : ''}
    </div>
    ${actions ? html`<div class="row">${actions}</div>` : ''}
  </div>`;
}

// ---------------- Selector de cliente (existente XOR nuevo) ----------------
export function clientPickerView() {
  return html`<fieldset class="fieldset" data-client-picker>
    <legend>Cliente</legend>
    <div class="stack">
      <div class="segmented" role="group" aria-label="Tipo de cliente">
        <button type="button" data-client-mode="existing" aria-pressed="true">Cliente registrado</button>
        <button type="button" data-client-mode="new" aria-pressed="false">Cliente nuevo</button>
      </div>

      <div data-client-existing class="stack stack--sm">
        <label class="field"><span class="field__label">Buscar cliente</span>
          <span class="input-icon">${icon('search')}<input class="input" type="search" data-client-filter placeholder="Nombre, correo o cédula" autocomplete="off" /></span>
        </label>
        <label class="field"><span class="sr-only">Cliente</span>
          <select class="select" name="clientId" size="5" data-client-select required><option value="">Cargando clientes…</option></select>
          <span class="field__error"></span>
        </label>
      </div>

      <div data-client-new hidden class="form-grid form-grid--2">
        <label class="field"><span class="field__label">Cédula *</span>
          <input class="input" name="client.idCard" inputmode="numeric" pattern="[0-9]*" maxlength="20" /><span class="field__error"></span></label>
        <label class="field"><span class="field__label">Nombre completo *</span>
          <input class="input" name="client.fullName" maxlength="100" /><span class="field__error"></span></label>
        <label class="field"><span class="field__label">Correo *</span>
          <input class="input" name="client.email" type="email" maxlength="100" /><span class="field__error"></span></label>
        <label class="field"><span class="field__label">Teléfono</span>
          <input class="input" name="client.phone" maxlength="20" /><span class="field__error"></span></label>
        <label class="field field--full"><span class="field__label">Dirección</span>
          <input class="input" name="client.address" maxlength="150" /><span class="field__error"></span></label>
        <p class="field--full text-xs text-muted">${icon('info', { size: 14 })} Se creará la cuenta del cliente y se mostrará su contraseña temporal una única vez.</p>
      </div>
    </div>
  </fieldset>`;
}

export function bindClientPicker(scope) {
  const picker = qs('[data-client-picker]', scope);
  const select = qs('[data-client-select]', picker);
  const filter = qs('[data-client-filter]', picker);
  let mode = 'existing';
  let clients = [];

  const paint = () => {
    const term = filter.value.trim().toLowerCase();
    const matches = clients.filter((c) =>
      [c.fullName, c.email, c.idCard].some((v) => String(v ?? '').toLowerCase().includes(term))
    );
    render(
      select,
      matches.length
        ? matches.slice(0, 200).map((c) => html`<option value="${c.id}">${c.fullName} · ${c.email} · CC ${c.idCard}</option>`)
        : html`<option value="" disabled>${clients.length ? 'Sin coincidencias' : 'Aún no hay clientes: usa “Cliente nuevo”'}</option>`
    );
  };

  Lookups.clients()
    .then((list) => {
      clients = list;
      paint();
    })
    .catch(() => render(select, html`<option value="" disabled>No se pudieron cargar los clientes</option>`));

  filter.addEventListener('input', paint);

  on(picker, 'click', '[data-client-mode]', (_, button) => {
    mode = button.dataset.clientMode;
    picker.querySelectorAll('[data-client-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    qs('[data-client-existing]', picker).hidden = mode !== 'existing';
    qs('[data-client-new]', picker).hidden = mode !== 'new';
  });

  // Devuelve { clientId } o { client: {...} } según el modo, o lanza detalles de validación.
  return {
    read() {
      if (mode === 'existing') {
        const clientId = Number(select.value);
        if (!clientId) return { errors: [{ field: 'clientId', message: 'Selecciona un cliente' }] };
        return { payload: { clientId } };
      }
      const get = (name) => picker.querySelector(`[name="client.${name}"]`).value.trim();
      const client = {
        idCard: get('idCard'),
        fullName: get('fullName'),
        email: get('email').toLowerCase(),
        phone: get('phone') || undefined,
        address: get('address') || undefined,
      };
      const errors = [];
      if (!/^\d{1,20}$/.test(client.idCard)) errors.push({ field: 'client.idCard', message: 'Solo números (máx. 20)' });
      if (!client.fullName) errors.push({ field: 'client.fullName', message: 'Obligatorio' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) errors.push({ field: 'client.email', message: 'Correo inválido' });
      return errors.length ? { errors } : { payload: { client } };
    },
  };
}

// ---------------- Opciones de libros ----------------
export function bookOptions(books, { withStock = true, placeholder = 'Selecciona un libro' } = {}) {
  return html`<option value="">${placeholder}</option>${books.map(
    (b) => html`<option value="${b.id}" data-price="${b.salePrice}" data-stock="${b.stock?.available ?? 0}" ${withStock && !(b.stock?.available > 0) ? 'disabled' : ''}>${b.title} — ${formatMoney(b.salePrice)}${withStock ? ` · stock ${b.stock?.available ?? 0}` : ''}</option>`
  )}`;
}
