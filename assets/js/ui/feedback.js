import { html, render, raw } from '../core/dom.js';
import { icon } from './icons.js';
import { http } from '../api/http.js';

// ---------- Toasts ----------
let toastRegion;

function ensureToastRegion() {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('role', 'status');
    toastRegion.setAttribute('aria-live', 'polite');
    document.body.append(toastRegion);
  }
  return toastRegion;
}

const TOAST_ICONS = { success: 'checkCircle', error: 'alert', warning: 'alert', info: 'info' };

export function toast(message, type = 'info', duration = 4200) {
  const region = ensureToastRegion();
  const element = document.createElement('div');
  element.className = `toast toast--${type}`;
  render(element, html`${icon(TOAST_ICONS[type] ?? 'info')}<div>${message}</div>`);
  region.append(element);

  const dismiss = () => {
    element.classList.add('is-leaving');
    element.addEventListener('animationend', () => element.remove(), { once: true });
  };
  setTimeout(dismiss, duration);
  element.addEventListener('click', dismiss);
}

// ---------- Barra de progreso global ligada al cliente HTTP ----------
export function mountTopProgress() {
  const bar = document.createElement('div');
  bar.className = 'top-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);
  http.onActivityChange((active) => bar.classList.toggle('is-active', active));
}

// ---------- Estados de carga / vacío / error ----------
export const loaderBlock = (text = 'Cargando…') =>
  html`<div class="loader-block" role="status"><span class="spinner"></span><span>${text}</span></div>`;

export function skeletonRows(count = 5) {
  return raw(
    Array.from({ length: count }, () => '<div class="skeleton skeleton--row"></div>').join('')
  );
}

export const emptyState = (title, text = '', iconName = 'inbox') =>
  html`<div class="empty-state">${icon(iconName)}<p class="empty-state__title">${title}</p><p class="text-sm">${text}</p></div>`;

export function errorState(error, onRetryId = '') {
  const offline = error?.isNetwork;
  return html`<div class="empty-state empty-state--error">
    ${icon(offline ? 'wifiOff' : 'alert')}
    <p class="empty-state__title">${offline ? 'Sin conexión con la API' : 'No pudimos cargar la información'}</p>
    <p class="text-sm">${error?.message ?? 'Error inesperado'}</p>
    ${onRetryId ? html`<button class="btn btn--sm" type="button" id="${onRetryId}">${icon('refresh')} Reintentar</button>` : ''}
  </div>`;
}

// ---------- Botones con estado "ocupado" ----------
export async function withBusy(button, task) {
  if (!button) return task();
  const original = button.innerHTML;
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${button.dataset.busyText ?? 'Procesando…'}`;
  try {
    return await task();
  } finally {
    button.removeAttribute('aria-busy');
    button.disabled = false;
    button.innerHTML = original;
  }
}

// ---------- Errores de formulario (400 con details[]) ----------
export function clearFormErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field__error').forEach((el) => {
    el.textContent = '';
  });
  form.querySelector('[data-form-alert]')?.replaceChildren();
}

export function showFormErrors(form, error) {
  clearFormErrors(form);
  const alertBox = form.querySelector('[data-form-alert]');
  const unmatched = [];

  if (error?.isValidation) {
    error.details.forEach(({ field, message }) => {
      const input = field ? form.querySelector(`[name="${CSS.escape(field)}"]`) : null;
      const slot = input?.closest('.field')?.querySelector('.field__error');
      if (input && slot) {
        input.setAttribute('aria-invalid', 'true');
        slot.textContent = message;
      } else {
        unmatched.push(message);
      }
    });
  }

  const messages = error?.isValidation ? unmatched : [error?.message ?? 'Ocurrió un error'];
  if (alertBox && messages.length) {
    render(
      alertBox,
      html`<div class="alert alert--danger" role="alert">${icon('alert')}<div>${
        messages.length === 1 ? messages[0] : html`<strong>Revisa los datos:</strong><ul>${messages.map((m) => html`<li>${m}</li>`)}</ul>`
      }</div></div>`
    );
  } else if (!alertBox && messages.length) {
    toast(messages.join(' · '), 'error');
  }
  form.querySelector('[aria-invalid="true"]')?.focus();
}

// Mensaje amigable para errores fuera de formularios.
export function notifyError(error) {
  if (error?.name === 'AbortError') return;
  if (error?.isValidation) {
    toast(error.details.map((d) => d.message).join(' · '), 'error', 6000);
    return;
  }
  toast(error?.message ?? 'Ocurrió un error inesperado', 'error', 6000);
}

export function badge(text, tone = 'plain') {
  return html`<span class="badge badge--${tone}">${text}</span>`;
}
