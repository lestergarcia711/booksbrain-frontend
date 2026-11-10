import { CONFIG } from '../config.js';
import { CatalogApi } from '../api/services.js';
import { html, render, qs, on, debounce } from '../core/dom.js';
import { formatMoney, formatNumber } from '../core/format.js';
import { Session } from '../core/session.js';
import { icon } from '../ui/icons.js';
import { coverView } from '../ui/cover.js';
import { Modal } from '../ui/modal.js';
import { renderUserArea } from '../ui/header.js';
import { mountTopProgress, emptyState, errorState, loaderBlock, badge, notifyError } from '../ui/feedback.js';
import { paginationView } from '../ui/pagination.js';

// ---------------- Estado ----------------
const SORTS = {
  'title-asc': { sortBy: 'title', order: 'asc', label: 'Título (A–Z)' },
  'title-desc': { sortBy: 'title', order: 'desc', label: 'Título (Z–A)' },
  'salePrice-asc': { sortBy: 'salePrice', order: 'asc', label: 'Precio: menor a mayor' },
  'salePrice-desc': { sortBy: 'salePrice', order: 'desc', label: 'Precio: mayor a menor' },
};

const state = {
  search: '',
  categoryId: '',
  authorId: '',
  availableOnly: false,
  sort: 'title-asc',
  page: 1,
  facets: { categories: [], authors: [], total: 0, available: 0 },
};

let inFlight;

const el = {
  grid: qs('#book-grid'),
  pagination: qs('#catalog-pagination'),
  resultCount: qs('#result-count'),
  chips: qs('#active-chips'),
  search: qs('#search'),
  category: qs('#filter-category'),
  author: qs('#filter-author'),
  sort: qs('#filter-sort'),
  available: qs('#filter-available'),
  clear: qs('#clear-filters'),
  heroStats: qs('#hero-stats'),
  userArea: qs('#user-area'),
};

// ---------------- URL <-> estado ----------------
function readUrl() {
  const params = new URLSearchParams(location.search);
  state.search = params.get('q') ?? '';
  state.categoryId = params.get('category') ?? '';
  state.authorId = params.get('author') ?? '';
  state.availableOnly = params.get('available') === '1';
  state.sort = SORTS[params.get('sort')] ? params.get('sort') : 'title-asc';
  state.page = Math.max(1, Number(params.get('page')) || 1);
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.categoryId) params.set('category', state.categoryId);
  if (state.authorId) params.set('author', state.authorId);
  if (state.availableOnly) params.set('available', '1');
  if (state.sort !== 'title-asc') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function syncControls() {
  el.search.value = state.search;
  el.category.value = state.categoryId;
  el.author.value = state.authorId;
  el.sort.value = state.sort;
  el.available.checked = state.availableOnly;
}

// ---------------- Facetas (categorías / autores) ----------------
// Los endpoints /categories y /authors son administrativos, así que las facetas públicas
// se derivan del propio catálogo y se cachean 10 minutos para respetar el rate limit.
const FACETS_KEY = 'booksbrain:catalog-facets';
const FACETS_TTL = 10 * 60 * 1000;

async function loadFacets() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(FACETS_KEY) ?? 'null');
    if (cached && Date.now() - cached.at < FACETS_TTL) return cached.data;
  } catch {
    /* sin caché */
  }

  const categories = new Map();
  const authors = new Map();
  let available = 0;
  let total = 0;
  let page = 1;
  let totalPages = 1;

  do {
    const response = await CatalogApi.list({ page, limit: 100 });
    total = response.meta?.total ?? 0;
    totalPages = response.meta?.totalPages ?? 1;
    response.data.forEach((book) => {
      if (book.category?.id) categories.set(book.category.id, book.category.name);
      book.authors?.forEach((a) => authors.set(a.id, a.fullName));
      if (book.available) available += 1;
    });
    page += 1;
  } while (page <= totalPages && page <= 3);

  const sortByName = (a, b) => a.name.localeCompare(b.name, 'es');
  const data = {
    categories: [...categories].map(([id, name]) => ({ id, name })).sort(sortByName),
    authors: [...authors].map(([id, name]) => ({ id, name })).sort(sortByName),
    total,
    available,
  };

  try {
    sessionStorage.setItem(FACETS_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignorar */
  }
  return data;
}

function renderFacets() {
  const { categories, authors, total, available } = state.facets;
  render(
    el.category,
    html`<option value="">Todas las categorías</option>${categories.map(
      (c) => html`<option value="${c.id}">${c.name}</option>`
    )}`
  );
  render(
    el.author,
    html`<option value="">Todos los autores</option>${authors.map(
      (a) => html`<option value="${a.id}">${a.name}</option>`
    )}`
  );
  render(
    el.heroStats,
    html`<div><strong>${formatNumber(total)}</strong>títulos</div>
      <div><strong>${formatNumber(available)}</strong>disponibles hoy</div>
      <div><strong>${formatNumber(categories.length)}</strong>categorías</div>`
  );
  syncControls();
}

// ---------------- Render de resultados ----------------
function skeletonGrid(count = 10) {
  return Array.from(
    { length: count },
    () => html`<div class="book-card book-card--skeleton" aria-hidden="true">
      <div class="cover skeleton"></div>
      <div class="book-card__body">
        <div class="skeleton skeleton--text" style="width:40%"></div>
        <div class="skeleton skeleton--title"></div>
        <div class="skeleton skeleton--text" style="width:60%"></div>
      </div>
    </div>`
  );
}

function bookCard(book) {
  const authors = book.authors?.map((a) => a.fullName).join(', ') || 'Autor desconocido';
  return html`<button class="book-card" type="button" data-book-id="${book.id}" aria-label="Ver detalle de ${book.title}">
    ${coverView(book, {
      status: book.available ? badge('Disponible', 'success') : badge('Agotado', 'danger'),
    })}
    <div class="book-card__body">
      <span class="book-card__category">${book.category?.name ?? 'General'}</span>
      <span class="book-card__title">${book.title}</span>
      <span class="book-card__authors">${authors}</span>
      <div class="book-card__foot">
        <span class="price">${formatMoney(book.salePrice)}</span>
      </div>
    </div>
  </button>`;
}

function renderChips() {
  const chips = [];
  if (state.search) chips.push({ key: 'search', label: `“${state.search}”` });
  if (state.categoryId) {
    const name = state.facets.categories.find((c) => String(c.id) === state.categoryId)?.name;
    chips.push({ key: 'categoryId', label: name ?? 'Categoría' });
  }
  if (state.authorId) {
    const name = state.facets.authors.find((a) => String(a.id) === state.authorId)?.name;
    chips.push({ key: 'authorId', label: name ?? 'Autor' });
  }
  if (state.availableOnly) chips.push({ key: 'availableOnly', label: 'Solo disponibles' });

  el.clear.hidden = chips.length === 0;
  render(
    el.chips,
    chips.map(
      (chip) => html`<span class="chip">${chip.label}
        <button type="button" data-remove-filter="${chip.key}" aria-label="Quitar filtro ${chip.label}">${icon('close')}</button></span>`
    )
  );
}

async function loadCatalog() {
  inFlight?.abort();
  inFlight = new AbortController();
  writeUrl();
  renderChips();
  render(el.grid, skeletonGrid());
  el.grid.setAttribute('aria-busy', 'true');
  render(el.pagination, '');
  el.resultCount.textContent = 'Buscando…';

  const { sortBy, order } = SORTS[state.sort];
  try {
    const response = await CatalogApi.list(
      {
        search: state.search || undefined,
        categoryId: state.categoryId || undefined,
        authorId: state.authorId || undefined,
        availableOnly: state.availableOnly ? 'true' : undefined,
        sortBy,
        order,
        page: state.page,
        limit: CONFIG.CATALOG_PAGE_SIZE,
      },
      { signal: inFlight.signal }
    );

    const { data, meta } = response;
    el.resultCount.textContent = `${formatNumber(meta.total)} ${meta.total === 1 ? 'resultado' : 'resultados'}`;

    if (!data.length) {
      el.grid.classList.add('is-empty');
      render(
        el.grid,
        emptyState('No encontramos libros', 'Prueba con otra búsqueda o quita algunos filtros.', 'search')
      );
    } else {
      el.grid.classList.remove('is-empty');
      render(el.grid, data.map(bookCard));
    }
    render(el.pagination, paginationView(meta, 'libros'));
  } catch (error) {
    if (error.name === 'AbortError') return;
    el.resultCount.textContent = '';
    render(el.grid, errorState(error, 'retry-catalog'));
    qs('#retry-catalog')?.addEventListener('click', loadCatalog);
  } finally {
    el.grid.removeAttribute('aria-busy');
  }
}

// ---------------- Detalle ----------------
async function openDetail(bookId) {
  const modal = new Modal({ title: 'Detalle del libro', size: 'lg', body: loaderBlock('Cargando detalle…') }).open();
  try {
    const { data: book } = await CatalogApi.getById(bookId);
    modal.setBody(html`<article class="book-detail">
      ${coverView(book)}
      <div>
        <span class="book-card__category">${book.category?.name ?? 'General'}</span>
        <h3 class="book-detail__title">${book.title}</h3>
        <p class="text-muted" style="margin-top:.35rem">por ${book.authors?.map((a) => a.fullName).join(', ') || 'Autor desconocido'}</p>
        <div class="book-detail__price">${formatMoney(book.salePrice)}</div>
        <div style="margin-top:.75rem">${book.available ? badge('Disponible en tienda', 'success') : badge('Sin ejemplares disponibles', 'danger')}</div>
        <div class="callout">${icon('store')}<p>BooksBrain es una librería presencial: acércate a nuestro mostrador para <strong>comprar</strong> este título o solicitarlo en <strong>préstamo</strong>. Tu historial quedará disponible en <em>Mi cuenta</em>.</p></div>
      </div>
    </article>`);
  } catch (error) {
    modal.setBody(errorState(error));
  }
}

// ---------------- Eventos ----------------
function bindEvents() {
  const updateSearch = debounce(() => {
    const value = el.search.value.trim().slice(0, 150);
    if (value === state.search) return;
    state.search = value;
    state.page = 1;
    loadCatalog();
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  el.search.addEventListener('input', updateSearch);
  qs('#filters-form').addEventListener('submit', (event) => event.preventDefault());

  el.category.addEventListener('change', () => {
    state.categoryId = el.category.value;
    state.page = 1;
    loadCatalog();
  });
  el.author.addEventListener('change', () => {
    state.authorId = el.author.value;
    state.page = 1;
    loadCatalog();
  });
  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    state.page = 1;
    loadCatalog();
  });
  el.available.addEventListener('change', () => {
    state.availableOnly = el.available.checked;
    state.page = 1;
    loadCatalog();
  });

  el.clear.addEventListener('click', () => {
    Object.assign(state, { search: '', categoryId: '', authorId: '', availableOnly: false, page: 1 });
    syncControls();
    loadCatalog();
  });

  on(el.chips, 'click', '[data-remove-filter]', (_, button) => {
    const key = button.dataset.removeFilter;
    state[key] = key === 'availableOnly' ? false : '';
    state.page = 1;
    syncControls();
    loadCatalog();
  });

  on(el.grid, 'click', '[data-book-id]', (_, card) => openDetail(card.dataset.bookId));

  on(el.pagination, 'click', '[data-page]', (_, button) => {
    state.page = Number(button.dataset.page);
    loadCatalog();
    qs('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------------- Arranque ----------------
async function init() {
  mountTopProgress();
  readUrl();
  syncControls();
  bindEvents();

  renderUserArea(el.userArea, Session.cachedUser);
  Session.load()
    .then((user) => renderUserArea(el.userArea, user))
    .catch(() => {});

  loadFacets()
    .then((facets) => {
      state.facets = facets;
      renderFacets();
      renderChips();
    })
    .catch(notifyError);

  loadCatalog();
}

init();
