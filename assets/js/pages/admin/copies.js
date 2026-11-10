import { CONFIG } from '../../config.js';
import { BookCopiesApi } from '../../api/services.js';
import { ApiError } from '../../api/http.js';
import { html, render, qs, on } from '../../core/dom.js';
import { COPY_STATUS, CONDITIONS, conditionLabel } from '../../core/format.js';
import { icon } from '../../ui/icons.js';
import { Modal, confirmDialog } from '../../ui/modal.js';
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
import { Lookups, pageHead, bookOptions } from './shared.js';

// Gestión de ejemplares físicos (código de barras, condición y estado), filtrable por libro y estado.
export async function mount(view, { params }) {
  const state = {
    bookId: params.get('bookId') ?? '',
    status: params.get('status') ?? '',
    page: 1,
    rows: [],
  };

  render(
    view,
    html`${pageHead({
      title: 'Ejemplares físicos',
      crumb: 'Inventario',
      subtitle: 'Cada copia tiene su propio código de barras y estado sincronizado con el stock.',
      actions: html`<button class="btn btn--primary" type="button" data-new-copy>${icon('plus')} Registrar ejemplar</button>`,
    })}
    <section class="panel">
      <div class="panel__header">
        <div class="row grow">
          <label class="grow" style="min-width:220px"><span class="sr-only">Libro</span>
            <select class="select" data-book-filter><option value="">Todos los libros</option></select></label>
          <label><span class="sr-only">Estado</span><select class="select" data-status-filter style="min-width:170px">
            <option value="">Todos los estados</option>
            ${Object.entries(COPY_STATUS).map(([value, s]) => html`<option value="${value}">${s.label}</option>`)}
          </select></label>
        </div>
      </div>
      <div data-table>${skeletonRows(6)}</div>
      <div class="panel__footer" data-pagination></div>
    </section>`
  );

  const tableSlot = qs('[data-table]', view);
  const paginationSlot = qs('[data-pagination]', view);
  const bookFilter = qs('[data-book-filter]', view);
  const statusFilter = qs('[data-status-filter]', view);
  statusFilter.value = state.status;

  Lookups.books()
    .then((books) => {
      render(bookFilter, bookOptions(books, { withStock: false, placeholder: 'Todos los libros' }));
      bookFilter.value = state.bookId;
    })
    .catch(() => {});

  async function load() {
    render(tableSlot, skeletonRows(6));
    try {
      const { data, meta } = await BookCopiesApi.list({
        bookId: state.bookId || undefined,
        status: state.status || undefined,
        page: state.page,
        limit: CONFIG.TABLE_PAGE_SIZE,
      });
      state.rows = data;
      if (!data.length) {
        render(tableSlot, emptyState('Sin ejemplares', 'No hay copias con estos filtros.', 'barcode'));
        render(paginationSlot, '');
        return;
      }
      render(
        tableSlot,
        html`<div class="table-wrap"><table class="table table--stack">
          <thead><tr><th>Código de barras</th><th>Libro</th><th>Condición</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map((c) => {
            const s = COPY_STATUS[c.status] ?? { label: c.status, tone: 'plain' };
            return html`<tr>
              <td data-label="Código"><span class="mono table__primary">${c.barcode}</span></td>
              <td data-label="Libro">${c.bookTitle ?? `Libro #${c.bookId}`}</td>
              <td data-label="Condición">${conditionLabel(c.physicalCondition)}</td>
              <td data-label="Estado">${badge(s.label, s.tone)}</td>
              <td class="table__actions">
                <button class="btn btn--sm btn--ghost" type="button" data-edit="${c.id}" title="Editar">${icon('edit')}<span class="sr-only">Editar ${c.barcode}</span></button>
                <button class="btn btn--sm btn--ghost" type="button" data-delete="${c.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}<span class="sr-only">Eliminar ${c.barcode}</span></button>
              </td>
            </tr>`;
          })}</tbody></table></div>`
      );
      render(paginationSlot, paginationView(meta, 'ejemplares'));
    } catch (error) {
      if (error.isUnauthorized) throw error;
      render(tableSlot, errorState(error, 'retry-copies'));
      qs('#retry-copies', view)?.addEventListener('click', load);
    }
  }

  function syncHash() {
    const query = new URLSearchParams();
    if (state.bookId) query.set('bookId', state.bookId);
    if (state.status) query.set('status', state.status);
    history.replaceState(null, '', `#/copies${query.size ? `?${query}` : ''}`);
  }

  async function openForm(copy = null) {
    let books = [];
    try {
      books = await Lookups.books();
    } catch (error) {
      notifyError(error);
      return;
    }
    // Ejemplares en préstamo o vendidos los gestiona el sistema: solo se permiten estados manuales seguros.
    const lockedStatus = copy && ['Borrowed', 'Sold'].includes(copy.status);
    const modal = new Modal({
      title: copy ? `Editar ejemplar ${copy.barcode}` : 'Registrar ejemplar',
      body: html`<form class="stack" id="copy-form" novalidate>
        <div data-form-alert></div>
        ${copy
          ? html`<dl class="kv"><dt>Libro</dt><dd>${copy.bookTitle ?? `#${copy.bookId}`}</dd></dl>`
          : html`<label class="field"><span class="field__label">Libro *</span>
              <select class="select" name="bookId" required>${bookOptions(books, { withStock: false })}</select><span class="field__error"></span></label>`}
        <div class="form-grid form-grid--2">
          <label class="field"><span class="field__label">Código de barras *</span>
            <input class="input mono" name="barcode" maxlength="50" required value="${copy?.barcode ?? ''}" /><span class="field__error"></span></label>
          <label class="field"><span class="field__label">Condición física</span>
            <select class="select" name="physicalCondition">${CONDITIONS.map(
              (c) => html`<option value="${c.value}" ${(copy?.physicalCondition ?? 'Good') === c.value ? 'selected' : ''}>${c.label}</option>`
            )}${copy && !CONDITIONS.some((c) => c.value === copy.physicalCondition) ? html`<option value="${copy.physicalCondition}" selected>${copy.physicalCondition}</option>` : ''}</select>
            <span class="field__error"></span></label>
          <label class="field field--full"><span class="field__label">Estado</span>
            <select class="select" name="status" ${lockedStatus ? 'disabled' : ''}>${['Available', 'Maintenance'].concat(lockedStatus ? [copy.status] : []).map(
              (value) => html`<option value="${value}" ${(copy?.status ?? 'Available') === value ? 'selected' : ''}>${COPY_STATUS[value].label}</option>`
            )}</select>
            ${lockedStatus ? html`<span class="field__hint">El estado “${COPY_STATUS[copy.status].label}” se gestiona desde préstamos/ventas.</span>` : ''}
            <span class="field__error"></span></label>
        </div>
      </form>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="copy-form" data-busy-text="Guardando…">${icon('check')} Guardar</button>`,
    }).open();

    const form = qs('#copy-form', modal.element);
    if (!copy && state.bookId) form.bookId.value = state.bookId;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        barcode: form.barcode.value.trim(),
        physicalCondition: form.physicalCondition.value,
        ...(!lockedStatus && { status: form.status.value }),
      };
      const errors = [];
      if (!copy) {
        payload.bookId = Number(form.bookId.value);
        if (!payload.bookId) errors.push({ field: 'bookId', message: 'Selecciona un libro' });
      }
      if (!payload.barcode) errors.push({ field: 'barcode', message: 'El código es obligatorio' });
      if (errors.length) {
        showFormErrors(form, new ApiError('Datos inválidos', 400, errors));
        return;
      }

      await withBusy(modal.element.querySelector('[type="submit"]'), async () => {
        try {
          if (copy) await BookCopiesApi.update(copy.id, payload);
          else await BookCopiesApi.create(payload);
          Lookups.invalidate('books', 'availableCopies');
          modal.close();
          toast(copy ? 'Ejemplar actualizado' : 'Ejemplar registrado y stock actualizado', 'success');
          load();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  async function remove(copyId) {
    const copy = state.rows.find((c) => c.id === copyId);
    const ok = await confirmDialog({
      title: 'Eliminar ejemplar',
      message: `¿Eliminar el ejemplar ${copy?.barcode ?? `#${copyId}`}? El stock disponible se ajustará automáticamente.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await BookCopiesApi.remove(copyId);
      Lookups.invalidate('books', 'availableCopies');
      toast('Ejemplar eliminado', 'success');
      load();
    } catch (error) {
      notifyError(error);
    }
  }

  bookFilter.addEventListener('change', () => {
    state.bookId = bookFilter.value;
    state.page = 1;
    syncHash();
    load();
  });
  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.page = 1;
    syncHash();
    load();
  });
  on(view, 'click', '[data-new-copy]', () => openForm());
  on(view, 'click', '[data-edit]', (_, b) => openForm(state.rows.find((c) => c.id === Number(b.dataset.edit))));
  on(view, 'click', '[data-delete]', (_, b) => remove(Number(b.dataset.delete)));
  on(paginationSlot, 'click', '[data-page]', (_, b) => {
    state.page = Number(b.dataset.page);
    load();
  });

  await load();
}
