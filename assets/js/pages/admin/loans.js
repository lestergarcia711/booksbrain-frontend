import { CONFIG } from '../../config.js';
import { LoansApi } from '../../api/services.js';
import { ApiError } from '../../api/http.js';
import { html, render, qs, qsa, on } from '../../core/dom.js';
import {
  formatDate,
  toIsoDate,
  addDays,
  daysUntil,
  LOAN_STATUS,
  CONDITIONS,
  conditionLabel,
} from '../../core/format.js';
import { icon } from '../../ui/icons.js';
import { Modal, showTemporaryPassword } from '../../ui/modal.js';
import { paginationView } from '../../ui/pagination.js';
import {
  badge,
  emptyState,
  errorState,
  skeletonRows,
  loaderBlock,
  toast,
  withBusy,
  showFormErrors,
  clearFormErrors,
  notifyError,
} from '../../ui/feedback.js';
import { Lookups, pageHead, clientPickerView, bindClientPicker, bookOptions } from './shared.js';

const STATUS_FILTERS = [
  ['', 'Todos'],
  ['Active', 'Activos'],
  ['Overdue', 'Vencidos'],
  ['Returned', 'Devueltos'],
];

const pendingItems = (loan) => loan.items.filter((i) => !i.checkinCondition);

// Préstamos presenciales: listado por estado, nuevo préstamo y control de devoluciones parciales/totales.
export async function mount(view, { params }) {
  const state = {
    status: STATUS_FILTERS.some(([v]) => v === params.get('status')) ? params.get('status') : '',
    page: 1,
    rows: [],
  };

  render(
    view,
    html`${pageHead({
      title: 'Préstamos y devoluciones',
      crumb: 'Operación',
      subtitle: 'Registra salidas de ejemplares y controla su regreso a la tienda.',
      actions: html`<button class="btn btn--primary" type="button" data-new-loan>${icon('plus')} Nuevo préstamo</button>`,
    })}
    <section class="panel">
      <div class="panel__header">
        <div class="segmented" role="group" aria-label="Filtrar por estado" data-filters></div>
      </div>
      <div data-table>${skeletonRows(6)}</div>
      <div class="panel__footer" data-pagination></div>
    </section>`
  );

  const tableSlot = qs('[data-table]', view);
  const paginationSlot = qs('[data-pagination]', view);

  function paintFilters() {
    render(
      qs('[data-filters]', view),
      STATUS_FILTERS.map(
        ([value, label]) => html`<button type="button" data-status="${value}" aria-pressed="${String(state.status === value)}">${label}</button>`
      )
    );
  }

  async function load() {
    paintFilters();
    render(tableSlot, skeletonRows(6));
    try {
      const { data, meta } = await LoansApi.list({
        status: state.status || undefined,
        page: state.page,
        limit: CONFIG.TABLE_PAGE_SIZE,
      });
      state.rows = data;
      if (!data.length) {
        render(tableSlot, emptyState('Sin préstamos', 'No hay préstamos con este estado.', 'swap'));
        render(paginationSlot, '');
        return;
      }
      render(
        tableSlot,
        html`<div class="table-wrap"><table class="table table--stack">
          <thead><tr><th>Préstamo</th><th>Cliente</th><th>Libros</th><th>Prestado</th><th>Devolución</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map((loan) => {
            const s = LOAN_STATUS[loan.status] ?? { label: loan.status, tone: 'plain' };
            const pending = pendingItems(loan).length;
            const left = daysUntil(loan.expectedReturnDate);
            return html`<tr>
              <td data-label="Préstamo"><span class="table__primary">#${loan.id}</span></td>
              <td data-label="Cliente"><div>${loan.client.fullName ?? `#${loan.client.id}`}</div><div class="text-xs text-muted">${loan.client.email ?? ''}</div></td>
              <td data-label="Libros">${loan.items.length}${pending && loan.status !== 'Returned' && pending !== loan.items.length ? html` <span class="text-xs text-muted">(${pending} pendientes)</span>` : ''}</td>
              <td data-label="Prestado" class="nowrap">${formatDate(loan.loanDate)}</td>
              <td data-label="Devolución" class="nowrap">${formatDate(loan.expectedReturnDate)}
                ${loan.status !== 'Returned' && left !== null ? html`<div class="text-xs" style="color:${left < 0 ? 'var(--danger)' : 'var(--text-muted)'}">${left < 0 ? `${Math.abs(left)} d de retraso` : left === 0 ? 'vence hoy' : `en ${left} d`}</div>` : ''}</td>
              <td data-label="Estado">${badge(s.label, s.tone)}</td>
              <td class="table__actions">
                <button class="btn btn--sm btn--ghost" type="button" data-view="${loan.id}" title="Detalle">${icon('eye')}<span class="sr-only">Detalle del préstamo ${loan.id}</span></button>
                ${loan.status !== 'Returned' ? html`<button class="btn btn--sm btn--primary" type="button" data-return="${loan.id}">${icon('undo')} Devolver</button>` : ''}
              </td>
            </tr>`;
          })}</tbody></table></div>`
      );
      render(paginationSlot, paginationView(meta, 'préstamos'));
    } catch (error) {
      if (error.isUnauthorized) throw error;
      render(tableSlot, errorState(error, 'retry-loans'));
      qs('#retry-loans', view)?.addEventListener('click', load);
    }
  }

  function loanDetailView(loan) {
    const s = LOAN_STATUS[loan.status] ?? { label: loan.status, tone: 'plain' };
    return html`<div class="stack">
      <dl class="kv">
        <dt>Cliente</dt><dd>${loan.client.fullName ?? `#${loan.client.id}`} <span class="text-muted">${loan.client.email ?? ''}</span></dd>
        <dt>Estado</dt><dd>${badge(s.label, s.tone)}</dd>
        <dt>Prestado</dt><dd>${formatDate(loan.loanDate)}</dd>
        <dt>Devolución esperada</dt><dd>${formatDate(loan.expectedReturnDate)}</dd>
        <dt>Devuelto</dt><dd>${loan.actualReturnDate ? formatDate(loan.actualReturnDate) : '—'}</dd>
      </dl>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Ejemplar</th><th>Libro</th><th>Salida</th><th>Regreso</th></tr></thead>
        <tbody>${loan.items.map(
          (i) => html`<tr><td class="mono">${i.barcode}</td><td>${i.bookTitle}</td><td>${conditionLabel(i.checkoutCondition)}</td>
            <td>${i.checkinCondition ? badge(conditionLabel(i.checkinCondition), 'success') : badge('Pendiente', 'warning')}</td></tr>`
        )}</tbody></table></div>
    </div>`;
  }

  async function openDetail(loanId) {
    const modal = new Modal({ title: `Préstamo #${loanId}`, size: 'lg', body: loaderBlock() }).open();
    try {
      const { data } = await LoansApi.getById(loanId);
      modal.setBody(loanDetailView(data));
    } catch (error) {
      modal.setBody(errorState(error));
    }
  }

  // ---------- Devolución ----------
  async function openReturn(loanId) {
    const modal = new Modal({ title: `Registrar devolución · préstamo #${loanId}`, size: 'lg', body: loaderBlock() }).open();
    let loan;
    try {
      ({ data: loan } = await LoansApi.getById(loanId));
    } catch (error) {
      modal.setBody(errorState(error));
      return;
    }
    const pending = pendingItems(loan);
    if (!pending.length) {
      modal.setBody(emptyState('Nada pendiente', 'Todos los ejemplares de este préstamo ya fueron devueltos.', 'checkCircle'));
      return;
    }

    modal.setBody(html`<form id="return-form" class="stack" novalidate>
      <div data-form-alert></div>
      <p class="text-sm text-muted">Cliente: <strong>${loan.client.fullName ?? `#${loan.client.id}`}</strong> · Selecciona los ejemplares que regresan y su condición física.</p>
      <label class="check"><input type="checkbox" data-select-all checked /> Seleccionar todos (${pending.length})</label>
      <div class="stack stack--sm">${pending.map(
        (i) => html`<div class="return-row">
          <label class="check"><input type="checkbox" name="copy" value="${i.copyId}" checked />
            <span><strong>${i.bookTitle}</strong><br /><span class="text-xs text-muted mono">${i.barcode}</span> · <span class="text-xs text-muted">salió: ${conditionLabel(i.checkoutCondition)}</span></span></label>
          <label><span class="sr-only">Condición de regreso de ${i.barcode}</span>
            <select class="select" data-condition="${i.copyId}">${CONDITIONS.map(
              (c) => html`<option value="${c.value}" ${c.value === (CONDITIONS.some((x) => x.value === i.checkoutCondition) ? i.checkoutCondition : 'Good') ? 'selected' : ''}>${c.label}</option>`
            )}</select></label>
        </div>`
      )}</div>
    </form>`);

    const footer = document.createElement('footer');
    footer.className = 'modal__footer';
    render(
      footer,
      html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="return-form" data-busy-text="Registrando…">${icon('undo')} Confirmar devolución</button>`
    );
    modal.element.append(footer);

    const form = qs('#return-form', modal.element);
    qs('[data-select-all]', form).addEventListener('change', (event) => {
      qsa('[name="copy"]', form).forEach((box) => {
        box.checked = event.target.checked;
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const returns = qsa('[name="copy"]:checked', form).map((box) => ({
        copyId: Number(box.value),
        checkinCondition: qs(`[data-condition="${box.value}"]`, form).value,
      }));
      if (!returns.length) {
        showFormErrors(form, new ApiError('Selecciona al menos un ejemplar para devolver'));
        return;
      }
      await withBusy(footer.querySelector('[type="submit"]'), async () => {
        try {
          const { data } = await LoansApi.returnCopies(loanId, returns);
          Lookups.invalidate('books', 'availableCopies');
          modal.close();
          toast(
            data.status === 'Returned'
              ? `Préstamo #${loanId} cerrado: todos los ejemplares fueron devueltos`
              : `Devolución parcial registrada (${returns.length} ejemplares)`,
            'success'
          );
          load();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  // ---------- Nuevo préstamo ----------
  async function openForm() {
    let books;
    try {
      books = await Lookups.books();
    } catch (error) {
      notifyError(error);
      return;
    }
    const today = new Date();
    const defaultDue = toIsoDate(addDays(today, 14));
    const options = bookOptions(books);
    const lineView = () => html`<div class="line-item line-item--single" data-line>
      <label><span class="sr-only">Libro</span><select class="select" data-book>${options}</select></label>
      <button class="btn btn--ghost btn--icon" type="button" data-remove-line aria-label="Quitar">${icon('trash')}</button>
    </div>`;

    const modal = new Modal({
      title: 'Nuevo préstamo',
      size: 'lg',
      body: html`<form id="loan-form" class="stack" novalidate>
        <div data-form-alert></div>
        ${clientPickerView()}
        <fieldset class="fieldset">
          <legend>Ejemplares a prestar</legend>
          <div class="stack stack--sm">
            <div class="segmented" role="group" aria-label="Modo de selección">
              <button type="button" data-mode="books" aria-pressed="true">Por título</button>
              <button type="button" data-mode="copies" aria-pressed="false">Por código de barras</button>
            </div>
            <p class="text-xs text-muted" data-mode-hint>El sistema asigna automáticamente un ejemplar disponible de cada título.</p>
            <div data-books-mode class="stack stack--sm">
              <div class="line-items" data-lines>${lineView()}</div>
              <div><button class="btn btn--sm" type="button" data-add-line>${icon('plus')} Agregar título</button></div>
            </div>
            <div data-copies-mode hidden>
              <input class="input" type="search" placeholder="Filtrar por código o título…" data-copy-filter aria-label="Filtrar ejemplares" />
              <div class="check-list" style="margin-top:.5rem;grid-template-columns:1fr" data-copy-list>${loaderBlock('Cargando ejemplares disponibles…')}</div>
            </div>
            <div class="field"><span class="field__error" data-items-error></span></div>
          </div>
        </fieldset>
        <label class="field" style="max-width:260px"><span class="field__label">Fecha de devolución</span>
          <input class="input" type="date" name="expectedReturnDate" value="${defaultDue}" min="${toIsoDate(addDays(today, 1))}" />
          <span class="field__hint">Por defecto la API asigna 14 días.</span><span class="field__error"></span></label>
      </form>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="loan-form" data-busy-text="Registrando…">${icon('check')} Registrar préstamo</button>`,
    }).open();

    const form = qs('#loan-form', modal.element);
    const lines = qs('[data-lines]', form);
    const picker = bindClientPicker(form);
    let mode = 'books';
    let copiesLoaded = false;

    async function loadCopies() {
      if (copiesLoaded) return;
      copiesLoaded = true;
      const list = qs('[data-copy-list]', form);
      try {
        const copies = await Lookups.availableCopies();
        render(
          list,
          copies.length
            ? copies.map(
                (c) => html`<label class="check" data-copy-text="${`${c.barcode} ${c.bookTitle ?? ''}`.toLowerCase()}"><input type="checkbox" name="copyIds" value="${c.id}" />
                  <span class="mono">${c.barcode}</span> · ${c.bookTitle ?? `Libro #${c.bookId}`}</label>`
              )
            : html`<p class="text-sm text-muted">No hay ejemplares disponibles.</p>`
        );
      } catch (error) {
        copiesLoaded = false;
        render(list, errorState(error));
      }
    }

    on(form, 'click', '[data-mode]', (_, button) => {
      mode = button.dataset.mode;
      qsa('[data-mode]', form).forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      qs('[data-books-mode]', form).hidden = mode !== 'books';
      qs('[data-copies-mode]', form).hidden = mode !== 'copies';
      qs('[data-mode-hint]', form).textContent =
        mode === 'books'
          ? 'El sistema asigna automáticamente un ejemplar disponible de cada título.'
          : 'Selecciona los ejemplares exactos (por código de barras) que salen de la tienda.';
      if (mode === 'copies') loadCopies();
    });
    qs('[data-copy-filter]', form).addEventListener('input', (event) => {
      const term = event.target.value.trim().toLowerCase();
      qsa('[data-copy-text]', form).forEach((label) => {
        label.hidden = Boolean(term) && !label.dataset.copyText.includes(term);
      });
    });
    on(form, 'click', '[data-add-line]', () => {
      if (qsa('[data-line]', lines).length >= 20) return toast('Máximo 20 títulos por préstamo', 'warning');
      lines.insertAdjacentHTML('beforeend', lineView().toString());
    });
    on(form, 'click', '[data-remove-line]', (_, button) => {
      if (qsa('[data-line]', lines).length > 1) button.closest('[data-line]').remove();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const client = picker.read();
      const errors = [...(client.errors ?? [])];
      const itemsError = qs('[data-items-error]', form);
      let selection;
      let itemsMessage = '';

      if (mode === 'books') {
        const bookIds = qsa('[data-book]', lines).map((s) => Number(s.value)).filter(Boolean);
        if (!bookIds.length) itemsMessage = 'Selecciona al menos un título';
        else if (bookIds.length > 20) itemsMessage = 'Máximo 20 títulos';
        selection = { bookIds };
      } else {
        const copyIds = qsa('[name="copyIds"]:checked', form).map((b) => Number(b.value));
        if (!copyIds.length) itemsMessage = 'Selecciona al menos un ejemplar';
        else if (copyIds.length > 20) itemsMessage = 'Máximo 20 ejemplares';
        selection = { copyIds };
      }

      const due = form.expectedReturnDate.value;
      if (due && due <= toIsoDate(today)) errors.push({ field: 'expectedReturnDate', message: 'Debe ser una fecha futura' });

      if (errors.length || itemsMessage) {
        if (errors.length) showFormErrors(form, new ApiError('Datos inválidos', 400, errors));
        itemsError.textContent = itemsMessage;
        return;
      }

      await withBusy(modal.element.querySelector('[type="submit"]'), async () => {
        try {
          const { data } = await LoansApi.create({
            ...client.payload,
            ...selection,
            ...(due && { expectedReturnDate: due }),
          });
          Lookups.invalidate('books', 'availableCopies', ...(client.payload.client ? ['clients'] : []));
          modal.close();
          toast(`Préstamo #${data.id} registrado · devolución ${formatDate(data.expectedReturnDate)}`, 'success');
          if (data.temporaryPassword) showTemporaryPassword(data.client, data.temporaryPassword);
          state.status = '';
          state.page = 1;
          load();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  on(view, 'click', '[data-status]', (_, b) => {
    state.status = b.dataset.status;
    state.page = 1;
    history.replaceState(null, '', state.status ? `#/loans?status=${state.status}` : '#/loans');
    load();
  });
  on(view, 'click', '[data-new-loan]', openForm);
  on(view, 'click', '[data-view]', (_, b) => openDetail(Number(b.dataset.view)));
  on(view, 'click', '[data-return]', (_, b) => openReturn(Number(b.dataset.return)));
  on(paginationSlot, 'click', '[data-page]', (_, b) => {
    state.page = Number(b.dataset.page);
    load();
  });

  await load();
  if (params.get('new') === '1') {
    history.replaceState(null, '', '#/loans');
    openForm();
  }
}
