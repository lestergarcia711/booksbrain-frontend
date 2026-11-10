import { CategoriesApi, AuthorsApi } from '../../api/services.js';
import { ApiError } from '../../api/http.js';
import { html, render, qs, on } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { Modal, confirmDialog } from '../../ui/modal.js';
import {
  emptyState,
  errorState,
  skeletonRows,
  toast,
  withBusy,
  showFormErrors,
  clearFormErrors,
  notifyError,
} from '../../ui/feedback.js';
import { Lookups, pageHead } from './shared.js';

// Configuración de los dos catálogos auxiliares (comparten la misma UI).
const KINDS = {
  categories: {
    api: CategoriesApi,
    cacheKey: 'categories',
    field: 'name',
    max: 50,
    title: 'Categorías',
    singular: 'categoría',
    addLabel: 'Nueva categoría',
    emptyHint: 'Agrega la primera categoría con el formulario.',
    placeholder: 'Ej. Novela histórica',
    icon: 'tag',
    color: 'var(--card-editorials)',
  },
  authors: {
    api: AuthorsApi,
    cacheKey: 'authors',
    field: 'fullName',
    max: 100,
    title: 'Autores',
    singular: 'autor',
    addLabel: 'Nuevo autor',
    emptyHint: 'Agrega el primer autor con el formulario.',
    placeholder: 'Ej. Gabriel García Márquez',
    icon: 'feather',
    color: 'var(--card-authors)',
  },
};

function panelView(key) {
  const kind = KINDS[key];
  return html`<section class="panel" data-kind="${key}">
    <div class="panel__header">
      <h3 class="panel-title row" style="gap:.5rem"><span style="color:${kind.color}">${icon(kind.icon, { size: 20 })}</span>${kind.title}</h3>
      <span class="badge badge--plain" data-count>…</span>
    </div>
    <div class="panel__body" style="padding-bottom:0">
      <form class="row" data-create novalidate style="align-items:flex-start">
        <label class="field grow"><span class="sr-only">${kind.addLabel}</span>
          <input class="input" name="${kind.field}" maxlength="${kind.max}" placeholder="${kind.placeholder}" required />
          <span class="field__error"></span></label>
        <button class="btn btn--primary" type="submit" data-busy-text="Agregando…">${icon('plus')} Agregar</button>
      </form>
      <input class="input" type="search" placeholder="Filtrar ${kind.title.toLowerCase()}…" data-filter aria-label="Filtrar ${kind.title.toLowerCase()}" style="margin-top:.75rem" />
    </div>
    <div data-list style="max-height:460px;overflow:auto;margin-top:.75rem">${skeletonRows(5)}</div>
  </section>`;
}

export async function mount(view) {
  const data = { categories: [], authors: [] };

  render(
    view,
    html`${pageHead({
      title: 'Categorías y autores',
      crumb: 'Inventario',
      subtitle: 'Catálogos auxiliares usados para clasificar los libros del inventario.',
    })}
    <div class="split">${panelView('categories')}${panelView('authors')}</div>`
  );

  function paint(key) {
    const kind = KINDS[key];
    const section = qs(`[data-kind="${key}"]`, view);
    const term = qs('[data-filter]', section).value.trim().toLowerCase();
    const items = data[key]
      .filter((item) => item[kind.field].toLowerCase().includes(term))
      .sort((a, b) => a[kind.field].localeCompare(b[kind.field], 'es'));
    qs('[data-count]', section).textContent = String(data[key].length);
    render(
      qs('[data-list]', section),
      items.length
        ? html`<ul class="mini-list">${items.map(
            (item) => html`<li>
              <span class="grow"><strong>${item[kind.field]}</strong> <span class="text-xs text-muted">#${item.id}</span></span>
              <button class="btn btn--sm btn--ghost" type="button" data-edit="${item.id}" title="Editar">${icon('edit')}<span class="sr-only">Editar ${item[kind.field]}</span></button>
              <button class="btn btn--sm btn--ghost" type="button" data-delete="${item.id}" title="Eliminar" style="color:var(--danger)">${icon('trash')}<span class="sr-only">Eliminar ${item[kind.field]}</span></button>
            </li>`
          )}</ul>`
        : emptyState(term ? 'Sin coincidencias' : `Sin ${kind.title.toLowerCase()}`, term ? '' : kind.emptyHint, kind.icon)
    );
  }

  async function load(key) {
    const section = qs(`[data-kind="${key}"]`, view);
    try {
      data[key] = await Lookups[key]();
      paint(key);
    } catch (error) {
      if (error.isUnauthorized) throw error;
      render(qs('[data-list]', section), errorState(error));
    }
  }

  function validate(kind, value) {
    if (!value) return new ApiError('Datos inválidos', 400, [{ field: kind.field, message: 'Este campo es obligatorio' }]);
    if (value.length > kind.max) return new ApiError('Datos inválidos', 400, [{ field: kind.field, message: `Máximo ${kind.max} caracteres` }]);
    return null;
  }

  async function edit(key, item) {
    const kind = KINDS[key];
    const modal = new Modal({
      title: `Editar ${kind.singular}`,
      size: 'sm',
      body: html`<form id="tax-form" class="stack" novalidate><div data-form-alert></div>
        <label class="field"><span class="field__label">Nombre</span>
          <input class="input" name="${kind.field}" maxlength="${kind.max}" value="${item[kind.field]}" required /><span class="field__error"></span></label></form>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn btn--primary" type="submit" form="tax-form" data-busy-text="Guardando…">Guardar</button>`,
    }).open();
    const form = qs('#tax-form', modal.element);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = form[kind.field].value.trim();
      const invalid = validate(kind, value);
      if (invalid) return showFormErrors(form, invalid);
      await withBusy(modal.element.querySelector('[type="submit"]'), async () => {
        try {
          await kind.api.update(item.id, { [kind.field]: value });
          Lookups.invalidate(kind.cacheKey, 'books');
          modal.close();
          toast('Cambios guardados', 'success');
          load(key);
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });
  }

  async function remove(key, item) {
    const kind = KINDS[key];
    const ok = await confirmDialog({
      title: `Eliminar ${kind.singular}`,
      message: `¿Eliminar “${item[kind.field]}”? No se puede eliminar si tiene libros asociados.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await kind.api.remove(item.id);
      Lookups.invalidate(kind.cacheKey);
      toast('Registro eliminado', 'success');
      load(key);
    } catch (error) {
      notifyError(error);
    }
  }

  Object.keys(KINDS).forEach((key) => {
    const kind = KINDS[key];
    const section = qs(`[data-kind="${key}"]`, view);
    const form = qs('[data-create]', section);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const value = form[kind.field].value.trim();
      const invalid = validate(kind, value);
      if (invalid) return showFormErrors(form, invalid);
      await withBusy(form.querySelector('[type="submit"]'), async () => {
        try {
          await kind.api.create({ [kind.field]: value });
          Lookups.invalidate(kind.cacheKey);
          form.reset();
          toast(`“${value}” agregado`, 'success');
          await load(key);
          form[kind.field].focus();
        } catch (error) {
          showFormErrors(form, error);
        }
      });
    });

    qs('[data-filter]', section).addEventListener('input', () => paint(key));
    on(section, 'click', '[data-edit]', (_, b) => edit(key, data[key].find((i) => i.id === Number(b.dataset.edit))));
    on(section, 'click', '[data-delete]', (_, b) => remove(key, data[key].find((i) => i.id === Number(b.dataset.delete))));
  });

  await Promise.all([load('categories'), load('authors')]);
}
