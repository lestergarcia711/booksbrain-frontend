import { CONFIG } from '../../config.js';
import { PurchasesApi } from '../../api/services.js';
import { ApiError } from '../../api/http.js';
import { html, render, qs, qsa, on } from '../../core/dom.js';
import { formatMoney, formatDateTime } from '../../core/format.js';
import { icon } from '../../ui/icons.js';
import { Modal, showTemporaryPassword } from '../../ui/modal.js';
import { paginationView } from '../../ui/pagination.js';
import {
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

// Registro de compras presenciales: historial paginado, detalle y nueva venta con carrito.
export async function mount(view, { params }) {
  const state = { page: 1 };

  render(
    view,
    html`${pageHead({
      title: 'Registro de compras',
      crumb: 'Operación',
      subtitle: 'Ventas en mostrador. El stock y los ejemplares se descuentan automáticamente.',
      actions: html`<button class="btn btn--primary" type="button" data-new-purchase>${icon('cart')} Registrar venta</button>`,
    })}
    <section class="panel">
      <div data-table>${skeletonRows(6)}</div>
      <div class="panel__footer" data-pagination></div>
    </section>`
  );

  const tableSlot = qs('[data-table]', view);
  const paginationSlot = qs('[data-pagination]', view);

  async function load() {
    render(tableSlot, skeletonRows(6));
    try {
      const { data, meta } = await PurchasesApi.list({ page: state.page, limit: CONFIG.TABLE_PAGE_SIZE });
      if (!data.length) {
        render(tableSlot, emptyState('Sin compras registradas', 'Registra la primera venta en mostrador.', 'receipt'));
        render(paginationSlot, '');
        return;
      }
      render(
        tableSlot,
        html`<div class="table-wrap"><table class="table table--stack">
          <thead><tr><th>Compra</th><th>Cliente</th><th>Fecha</th><th>Artículos</th><th class="text-right">Total</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(
            (p) => html`<tr>
              <td data-label="Compra"><span class="table__primary">#${p.id}</span></td>
              <td data-label="Cliente"><div>${p.client.fullName ?? `#${p.client.id}`}</div><div class="text-xs text-muted">${p.client.email ?? ''}</div></td>
              <td data-label="Fecha" class="nowrap">${formatDateTime(p.purchaseDate)}</td>
              <td data-label="Artículos">${p.items.reduce((s, i) => s + i.quantity, 0)}</td>
              <td data-label="Total" class="text-right"><strong>${formatMoney(p.totalAmount)}</strong></td>
              <td class="table__actions"><button class="btn btn--sm" type="button" data-view="${p.id}">${icon('eye')} Detalle</button></td>
            </tr>`
          )}</tbody></table></div>`
      );
      render(paginationSlot, paginationView(meta, 'compras'));
    } catch (error) {
      if (error.isUnauthorized) throw error;
      render(tableSlot, errorState(error, 'retry-purchases'));
      qs('#retry-purchases', view)?.addEventListener('click', load);
    }
  }

  async function openDetail(purchaseId) {
    const modal = new Modal({ title: `Compra #${purchaseId}`, body: loaderBlock() }).open();
    try {
      const { data: p } = await PurchasesApi.getById(purchaseId);
      modal.setBody(html`<div class="stack">
        <dl class="kv">
          <dt>Cliente</dt><dd>${p.client.fullName ?? `#${p.client.id}`}</dd>
          <dt>Correo</dt><dd>${p.client.email ?? '—'}</dd>
          <dt>Fecha</dt><dd>${formatDateTime(p.purchaseDate)}</dd>
          <dt>Registrada por</dt><dd>Admin #${p.adminId}</dd>
        </dl>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Libro</th><th class="text-right">Cant.</th><th class="text-right">Precio</th><th class="text-right">Subtotal</th></tr></thead>
          <tbody>${p.items.map(
            (i) => html`<tr><td>${i.bookTitle}</td><td class="text-right">${i.quantity}</td><td class="text-right">${formatMoney(i.unitPrice)}</td><td class="text-right">${formatMoney(i.subtotal)}</td></tr>`
          )}</tbody></table></div>
        <div class="totals"><span>Total</span><strong>${formatMoney(p.totalAmount)}</strong></div>
      </div>`);
    } catch (error) {
      modal.setBody(errorState(error));
    }
  }

  async function openForm() {
    let books;
    try {
      books = await Lookups.books();
    } catch (error) {
      notifyError(error);
      return;
    }
    const options = bookOptions(books);
    const lineView = () => html`<div class="line-item" data-line>
      <label><span class="sr-only">Libro</span><select class="select" data-book>${options}</select></label>
      <label><span class="sr-only">Cantidad</span><input class="input" type="number" min="1" max="100" value="1" data-qty /></label>
      <button class="btn btn--ghost btn--icon" type="button" data-remove-line aria-label="Quitar libro">${icon('trash')}</button>
    </div>`;

    const modal = new Modal({
      title: 'Registrar venta',
      size: 'lg',
      body: html`<form id="purchase-form" class="stack" novalidate>
        <div data-form-alert></div>
        ${clientPickerView()}
        <fieldset class="fieldset">
          <legend>Libros</legend>
          <div class="stack stack--sm">
            <div class="line-items" data-lines>${lineView()}</div>
            <div><button class="btn btn--sm" type="button" data-add-line>${icon('plus')} Agregar libro</button></div>
            <div class="field"><span class="field__error" data-items-error></span></div>
          </div>
        </fieldset>
        <div class="totals"><span>Total estimado</span><strong data-total>${formatMoney(0)}</strong></div>
      </form>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="purchase-form" data-busy-text="Registrando…">${icon('check')} Confirmar venta</button>`,
    }).open();

    const form = qs('#purchase-form', modal.element);
    const lines = qs('[data-lines]', form);
    const picker = bindClientPicker(form);

    const readLines = () =>
      qsa('[data-line]', lines).map((line) => {
        const select = qs('[data-book]', line);
        const option = select.selectedOptions[0];
        return {
          bookId: Number(select.value),
          quantity: Number(qs('[data-qty]', line).value),
          price: Number(option?.dataset.price ?? 0),
          stock: Number(option?.dataset.stock ?? 0),
          title: option?.textContent ?? '',
        };
      });

    const updateTotal = () => {
      const total = readLines().reduce((sum, l) => sum + (l.bookId ? l.price * (l.quantity || 0) : 0), 0);
      qs('[data-total]', form).textContent = formatMoney(total);
    };

    on(form, 'click', '[data-add-line]', () => {
      if (qsa('[data-line]', lines).length >= 50) return toast('Máximo 50 líneas por venta', 'warning');
      lines.insertAdjacentHTML('beforeend', lineView().toString());
    });
    on(form, 'click', '[data-remove-line]', (_, button) => {
      if (qsa('[data-line]', lines).length > 1) button.closest('[data-line]').remove();
      updateTotal();
    });
    form.addEventListener('input', updateTotal);
    form.addEventListener('change', updateTotal);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const client = picker.read();
      const items = readLines().filter((l) => l.bookId);
      const errors = [...(client.errors ?? [])];
      const itemsError = qs('[data-items-error]', form);

      // Consolidar cantidades por libro para validar contra el stock disponible.
      const totals = new Map();
      items.forEach((l) => totals.set(l.bookId, { ...l, quantity: (totals.get(l.bookId)?.quantity ?? 0) + l.quantity }));
      let itemsMessage = '';
      if (!items.length) itemsMessage = 'Agrega al menos un libro';
      else if (items.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100)) itemsMessage = 'Las cantidades deben estar entre 1 y 100';
      else {
        const short = [...totals.values()].find((l) => l.quantity > l.stock);
        if (short) itemsMessage = `Stock insuficiente: ${short.title.split(' — ')[0]} (disponibles ${short.stock})`;
      }

      if (errors.length || itemsMessage) {
        if (errors.length) showFormErrors(form, new ApiError('Datos inválidos', 400, errors));
        itemsError.textContent = itemsMessage;
        return;
      }

      await withBusy(modal.element.querySelector('[type="submit"]'), async () => {
        try {
          const { data } = await PurchasesApi.create({
            ...client.payload,
            items: items.map(({ bookId, quantity }) => ({ bookId, quantity })),
          });
          Lookups.invalidate('books', 'availableCopies', ...(client.payload.client ? ['clients'] : []));
          modal.close();
          toast(`Venta #${data.id} registrada · ${formatMoney(data.totalAmount)}`, 'success');
          if (data.temporaryPassword) showTemporaryPassword(data.client, data.temporaryPassword);
          state.page = 1;
          load();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  on(view, 'click', '[data-new-purchase]', openForm);
  on(view, 'click', '[data-view]', (_, b) => openDetail(Number(b.dataset.view)));
  on(paginationSlot, 'click', '[data-page]', (_, b) => {
    state.page = Number(b.dataset.page);
    load();
  });

  await load();
  if (params.get('new') === '1') {
    history.replaceState(null, '', '#/purchases');
    openForm();
  }
}
