import { CONFIG } from '../../config.js';
import { BooksApi } from '../../api/services.js';
import { ApiError } from '../../api/http.js';
import { html, render, qs, on, debounce } from '../../core/dom.js';
import { formatMoney } from '../../core/format.js';
import { icon } from '../../ui/icons.js';
import { Modal, confirmDialog } from '../../ui/modal.js';
import { coverColors } from '../../ui/cover.js';
import { paginationView } from '../../ui/pagination.js';
import {
  badge,
  emptyState,
  errorState,
  skeletonRows,
  toast,
  withBusy,
  showFormErrors,
  notifyError,
} from '../../ui/feedback.js';
import { Lookups, pageHead } from './shared.js';

// Gestión de inventario de libros: listado con búsqueda local, alta, edición y baja.
export async function mount(view) {
  const state = { term: '', categoryId: '', stock: '', page: 1, books: [] };

  render(
    view,
    html`${pageHead({
      title: 'Inventario de libros',
      crumb: 'Inventario',
      subtitle: 'Administra los títulos, precios, categorías, autores y niveles de stock.',
      actions: html`<button class="btn btn--primary" type="button" data-new-book>${icon('plus')} Nuevo libro</button>`,
    })}
    <section class="panel">
      <div class="panel__header">
        <div class="row grow">
          <label class="input-icon grow" style="min-width:200px"><span class="sr-only">Buscar</span>${icon('search')}
            <input class="input" type="search" placeholder="Buscar por título, ISBN o autor…" data-search /></label>
          <label><span class="sr-only">Categoría</span><select class="select" data-category style="min-width:180px"><option value="">Todas las categorías</option></select></label>
          <label><span class="sr-only">Stock</span><select class="select" data-stock style="min-width:160px">
            <option value="">Todo el stock</option><option value="low">Stock bajo</option><option value="out">Agotados</option></select></label>
        </div>
      </div>
      <div data-table>${skeletonRows(6)}</div>
      <div class="panel__footer" data-pagination></div>
    </section>`
  );

  const tableSlot = qs('[data-table]', view);
  const paginationSlot = qs('[data-pagination]', view);

  function filtered() {
    const term = state.term.toLowerCase();
    return state.books.filter((b) => {
      if (state.categoryId && String(b.category?.id) !== state.categoryId) return false;
      if (state.stock === 'out' && b.stock.available > 0) return false;
      if (state.stock === 'low' && b.stock.available > b.stock.minimum) return false;
      if (!term) return true;
      return [b.title, b.isbn, ...b.authors.map((a) => a.fullName)].some((v) => String(v).toLowerCase().includes(term));
    });
  }

  function paint() {
    const rows = filtered();
    const limit = CONFIG.TABLE_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(rows.length / limit));
    state.page = Math.min(state.page, totalPages);
    const pageRows = rows.slice((state.page - 1) * limit, state.page * limit);

    if (!rows.length) {
      render(tableSlot, emptyState(state.books.length ? 'Sin coincidencias' : 'Aún no hay libros', state.books.length ? 'Ajusta la búsqueda o los filtros.' : 'Crea el primer título del inventario.', 'books'));
      render(paginationSlot, '');
      return;
    }

    render(
      tableSlot,
      html`<div class="table-wrap"><table class="table table--stack">
        <thead><tr><th>Libro</th><th>ISBN</th><th>Categoría</th><th class="text-right">Precio</th><th>Stock</th><th><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody>${pageRows.map((b) => {
          const [a, c] = coverColors(b.id);
          const stockTone = b.stock.available === 0 ? 'danger' : b.stock.available <= b.stock.minimum ? 'warning' : 'success';
          return html`<tr>
            <td data-label="Libro"><div class="row" style="flex-wrap:nowrap;gap:.75rem">
              <span class="avatar" style="border-radius:4px;background:linear-gradient(150deg,${a},${c})">${(b.title || '?').charAt(0)}</span>
              <div><div class="table__primary">${b.title}</div><div class="text-xs text-muted">${b.authors.map((x) => x.fullName).join(', ')}</div></div>
            </div></td>
            <td data-label="ISBN"><span class="mono">${b.isbn}</span></td>
            <td data-label="Categoría">${badge(b.category?.name ?? '—', 'brand')}</td>
            <td data-label="Precio" class="text-right nowrap">${formatMoney(b.salePrice)}</td>
            <td data-label="Stock">${badge(`${b.stock.available} disp. · mín ${b.stock.minimum}`, stockTone)}</td>
            <td class="table__actions">
              <a class="btn btn--sm btn--ghost" href="#/copies?bookId=${b.id}" title="Ver ejemplares">${icon('barcode')}<span class="sr-only">Ejemplares de ${b.title}</span></a>
              <button class="btn btn--sm btn--ghost" type="button" data-edit="${b.id}" title="Editar">${icon('edit')}<span class="sr-only">Editar ${b.title}</span></button>
              <button class="btn btn--sm btn--ghost" type="button" data-delete="${b.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}<span class="sr-only">Eliminar ${b.title}</span></button>
            </td>
          </tr>`;
        })}</tbody></table></div>`
    );
    render(paginationSlot, paginationView({ page: state.page, limit, total: rows.length, totalPages }, 'libros'));
  }

  async function load() {
    render(tableSlot, skeletonRows(6));
    try {
      const [books, categories] = await Promise.all([Lookups.books(), Lookups.categories()]);
      state.books = books;
      const select = qs('[data-category]', view);
      const current = select.value;
      render(select, html`<option value="">Todas las categorías</option>${categories.map((c) => html`<option value="${c.id}">${c.name}</option>`)}`);
      select.value = current;
      paint();
    } catch (error) {
      if (error.isUnauthorized) throw error;
      render(tableSlot, errorState(error, 'retry-books'));
      qs('#retry-books', view)?.addEventListener('click', load);
    }
  }

  // ---------- Formulario ----------
  async function openForm(book = null) {
    let categories;
    let authors;
    try {
      [categories, authors] = await Promise.all([Lookups.categories(), Lookups.authors()]);
    } catch (error) {
      notifyError(error);
      return;
    }

    if (!categories.length || !authors.length) {
      toast('Primero registra al menos una categoría y un autor.', 'warning');
      location.hash = '#/taxonomy';
      return;
    }

    const selectedAuthors = new Set(book?.authors.map((a) => a.id) ?? []);
    const modal = new Modal({
      title: book ? 'Editar libro' : 'Nuevo libro',
      size: 'lg',
      body: html`<form class="stack" id="book-form" novalidate>
        <div data-form-alert></div>
        <div class="form-grid form-grid--2">
          <label class="field field--full"><span class="field__label">Título *</span>
            <input class="input" name="title" maxlength="150" required value="${book?.title ?? ''}" /><span class="field__error"></span></label>
          <label class="field"><span class="field__label">ISBN *</span>
            <input class="input mono" name="isbn" maxlength="20" required value="${book?.isbn ?? ''}" placeholder="978-…" />
            <span class="field__hint">ISBN-10 o ISBN-13 válido.</span><span class="field__error"></span></label>
          <label class="field"><span class="field__label">Precio de venta *</span>
            <input class="input" name="salePrice" type="number" min="0" step="0.01" required value="${book?.salePrice ?? ''}" /><span class="field__error"></span></label>
          <label class="field field--full"><span class="field__label">Categoría *</span>
            <select class="select" name="categoryId" required><option value="">Selecciona…</option>${categories.map(
              (c) => html`<option value="${c.id}" ${book?.category?.id === c.id ? 'selected' : ''}>${c.name}</option>`
            )}</select><span class="field__error"></span></label>
          <div class="field field--full"><span class="field__label" id="authors-label">Autores * <span class="text-muted text-xs">(1 a 10)</span></span>
            <input class="input" type="search" placeholder="Filtrar autores…" data-author-filter aria-label="Filtrar autores" />
            <div class="check-list" role="group" aria-labelledby="authors-label" data-author-list>${authors.map(
              (a) => html`<label class="check" data-author-name="${a.fullName.toLowerCase()}"><input type="checkbox" name="authorIds" value="${a.id}" ${selectedAuthors.has(a.id) ? 'checked' : ''} /> ${a.fullName}</label>`
            )}</div><span class="field__error"></span></div>
        </div>
      </form>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="book-form" data-busy-text="Guardando…">${icon('check')} ${book ? 'Guardar cambios' : 'Crear libro'}</button>`,
    }).open();

    const form = qs('#book-form', modal.element);
    qs('[data-author-filter]', form).addEventListener('input', (event) => {
      const term = event.target.value.trim().toLowerCase();
      form.querySelectorAll('[data-author-name]').forEach((label) => {
        label.hidden = term && !label.dataset.authorName.includes(term);
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        title: form.title.value.trim(),
        isbn: form.isbn.value.trim(),
        salePrice: Number(form.salePrice.value),
        categoryId: Number(form.categoryId.value),
        authorIds: [...form.querySelectorAll('[name="authorIds"]:checked')].map((i) => Number(i.value)),
      };

      const errors = [];
      if (!payload.title) errors.push({ field: 'title', message: 'El título es obligatorio' });
      if (!/^(\d{9}[\dXx]|\d{13})$/.test(payload.isbn.replace(/[-\s]/g, ''))) errors.push({ field: 'isbn', message: 'ISBN inválido' });
      if (form.salePrice.value === '' || payload.salePrice < 0 || !/^\d+(\.\d{1,2})?$/.test(form.salePrice.value)) errors.push({ field: 'salePrice', message: 'Precio inválido (máx. 2 decimales)' });
      if (!payload.categoryId) errors.push({ field: 'categoryId', message: 'Selecciona una categoría' });
      if (payload.authorIds.length < 1 || payload.authorIds.length > 10) errors.push({ field: 'authorIds', message: 'Selecciona entre 1 y 10 autores' });
      if (errors.length) {
        showFormErrors(form, new ApiError('Datos inválidos', 400, errors));
        return;
      }

      await withBusy(modal.element.querySelector('[type="submit"]'), async () => {
        try {
          if (book) await BooksApi.update(book.id, payload);
          else await BooksApi.create(payload);
          Lookups.invalidate('books');
          modal.close();
          toast(book ? 'Libro actualizado' : 'Libro creado en el inventario', 'success');
          load();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  async function remove(bookId) {
    const book = state.books.find((b) => b.id === bookId);
    const ok = await confirmDialog({
      title: 'Eliminar libro',
      message: `Se eliminará “${book?.title ?? `#${bookId}`}”. Si tiene ejemplares, préstamos o ventas asociadas, la API rechazará la operación.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await BooksApi.remove(bookId);
      Lookups.invalidate('books');
      toast('Libro eliminado', 'success');
      load();
    } catch (error) {
      notifyError(error);
    }
  }

  // ---------- Eventos ----------
  qs('[data-search]', view).addEventListener(
    'input',
    debounce((event) => {
      state.term = event.target.value.trim();
      state.page = 1;
      paint();
    }, 200)
  );
  qs('[data-category]', view).addEventListener('change', (event) => {
    state.categoryId = event.target.value;
    state.page = 1;
    paint();
  });
  qs('[data-stock]', view).addEventListener('change', (event) => {
    state.stock = event.target.value;
    state.page = 1;
    paint();
  });
  on(view, 'click', '[data-new-book]', () => openForm());
  on(view, 'click', '[data-edit]', (_, button) => openForm(state.books.find((b) => b.id === Number(button.dataset.edit))));
  on(view, 'click', '[data-delete]', (_, button) => remove(Number(button.dataset.delete)));
  on(paginationSlot, 'click', '[data-page]', (_, button) => {
    state.page = Number(button.dataset.page);
    paint();
  });

  await load();
}
