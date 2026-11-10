import { CONFIG, ROLES } from '../../config.js';
import { UsersApi } from '../../api/services.js';
import { ApiError } from '../../api/http.js';
import { html, render, qs, on, initials } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { Modal, confirmDialog, showTemporaryPassword } from '../../ui/modal.js';
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
import { Session } from '../../core/session.js';
import { Lookups, pageHead } from './shared.js';

// Control de usuarios: listado paginado, alta de clientes (clave temporal), edición y baja.
export async function mount(view) {
  const state = { page: 1, rows: [] };
  const me = Session.cachedUser;

  render(
    view,
    html`${pageHead({
      title: 'Control de usuarios',
      crumb: 'Personas',
      subtitle: 'Los clientes se registran con una contraseña temporal generada por el servidor.',
      actions: html`<button class="btn btn--primary" type="button" data-new-user>${icon('plus')} Nuevo cliente</button>`,
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
      const { data, meta } = await UsersApi.list({ page: state.page, limit: CONFIG.TABLE_PAGE_SIZE });
      state.rows = data;
      if (!data.length) {
        render(tableSlot, emptyState('Sin usuarios', 'Registra el primer cliente.', 'users'));
        render(paginationSlot, '');
        return;
      }
      render(
        tableSlot,
        html`<div class="table-wrap"><table class="table table--stack">
          <thead><tr><th>Usuario</th><th>Cédula</th><th>Teléfono</th><th>Rol</th><th><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map((u) => {
            const isAdmin = u.role?.name === ROLES.ADMIN;
            const isSelf = me?.id === u.id;
            return html`<tr>
              <td data-label="Usuario"><div class="row" style="flex-wrap:nowrap">
                <span class="avatar" style="${isAdmin ? 'background:var(--sidebar-bg)' : ''}">${initials(u.fullName)}</span>
                <div><div class="table__primary">${u.fullName}${isSelf ? html` <span class="text-xs text-muted">(tú)</span>` : ''}</div><div class="text-xs text-muted">${u.email}</div></div>
              </div></td>
              <td data-label="Cédula"><span class="mono">${u.idCard}</span></td>
              <td data-label="Teléfono">${u.phone || '—'}</td>
              <td data-label="Rol">${isAdmin ? badge('Administrador', 'plain') : badge('Cliente', 'brand')}</td>
              <td class="table__actions">
                <button class="btn btn--sm btn--ghost" type="button" data-edit="${u.id}" title="Editar">${icon('edit')}<span class="sr-only">Editar ${u.fullName}</span></button>
                ${isSelf ? '' : html`<button class="btn btn--sm btn--ghost" type="button" data-delete="${u.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}<span class="sr-only">Eliminar ${u.fullName}</span></button>`}
              </td>
            </tr>`;
          })}</tbody></table></div>`
      );
      render(paginationSlot, paginationView(meta, 'usuarios'));
    } catch (error) {
      if (error.isUnauthorized) throw error;
      render(tableSlot, errorState(error, 'retry-users'));
      qs('#retry-users', view)?.addEventListener('click', load);
    }
  }

  function openForm(user = null) {
    const modal = new Modal({
      title: user ? 'Editar usuario' : 'Registrar cliente',
      body: html`<form id="user-form" class="stack" novalidate>
        <div data-form-alert></div>
        <div class="form-grid form-grid--2">
          <label class="field"><span class="field__label">Cédula *</span>
            <input class="input" name="idCard" inputmode="numeric" maxlength="20" value="${user?.idCard ?? ''}" ${user ? 'disabled' : 'required'} />
            ${user ? html`<span class="field__hint">La identificación no se puede modificar.</span>` : ''}
            <span class="field__error"></span></label>
          <label class="field"><span class="field__label">Nombre completo *</span>
            <input class="input" name="fullName" maxlength="100" required value="${user?.fullName ?? ''}" /><span class="field__error"></span></label>
          <label class="field"><span class="field__label">Correo *</span>
            <input class="input" name="email" type="email" maxlength="100" required value="${user?.email ?? ''}" /><span class="field__error"></span></label>
          <label class="field"><span class="field__label">Teléfono</span>
            <input class="input" name="phone" maxlength="20" value="${user?.phone ?? ''}" /><span class="field__error"></span></label>
          <label class="field field--full"><span class="field__label">Dirección</span>
            <input class="input" name="address" maxlength="150" value="${user?.address ?? ''}" /><span class="field__error"></span></label>
        </div>
        ${user ? '' : html`<div class="alert">${icon('info')}<div>El usuario se crea con rol <strong>Cliente</strong> y una contraseña temporal que verás una sola vez.</div></div>`}
      </form>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="user-form" data-busy-text="Guardando…">${icon('check')} ${user ? 'Guardar cambios' : 'Registrar cliente'}</button>`,
    }).open();

    const form = qs('#user-form', modal.element);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const read = (name) => form[name].value.trim();
      const payload = {
        fullName: read('fullName'),
        email: read('email').toLowerCase(),
        phone: read('phone') || null,
        address: read('address') || null,
      };
      const errors = [];
      if (!user) {
        payload.idCard = read('idCard');
        if (!/^\d{1,20}$/.test(payload.idCard)) errors.push({ field: 'idCard', message: 'Solo números (máx. 20)' });
      }
      if (!payload.fullName) errors.push({ field: 'fullName', message: 'El nombre es obligatorio' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) errors.push({ field: 'email', message: 'Correo inválido' });
      if (errors.length) return showFormErrors(form, new ApiError('Datos inválidos', 400, errors));

      await withBusy(modal.element.querySelector('[type="submit"]'), async () => {
        try {
          if (user) {
            await UsersApi.update(user.id, payload);
            toast('Usuario actualizado', 'success');
          } else {
            const { data } = await UsersApi.create(payload);
            if (data?.temporaryPassword) showTemporaryPassword(data, data.temporaryPassword);
            else toast('Cliente registrado', 'success');
          }
          Lookups.invalidate('clients');
          modal.close();
          load();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  async function remove(userId) {
    const user = state.rows.find((u) => u.id === userId);
    const ok = await confirmDialog({
      title: 'Eliminar usuario',
      message: `¿Eliminar a ${user?.fullName ?? `#${userId}`}? Si tiene préstamos o compras registradas, la API rechazará la operación.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await UsersApi.remove(userId);
      Lookups.invalidate('clients');
      toast('Usuario eliminado', 'success');
      load();
    } catch (error) {
      notifyError(error);
    }
  }

  on(view, 'click', '[data-new-user]', () => openForm());
  on(view, 'click', '[data-edit]', (_, b) => openForm(state.rows.find((u) => u.id === Number(b.dataset.edit))));
  on(view, 'click', '[data-delete]', (_, b) => remove(Number(b.dataset.delete)));
  on(paginationSlot, 'click', '[data-page]', (_, b) => {
    state.page = Number(b.dataset.page);
    load();
  });

  await load();
}
