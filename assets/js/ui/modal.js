import { html, render } from '../core/dom.js';
import { icon } from './icons.js';

// Modal accesible basado en <dialog> nativo (foco atrapado, Esc para cerrar, backdrop).
export class Modal {
  #dialog;
  #onClose;

  constructor({ title, size = '', body = '', footer = '', onClose } = {}) {
    this.#onClose = onClose;
    this.#dialog = document.createElement('dialog');
    this.#dialog.className = `modal ${size ? `modal--${size}` : ''}`;
    this.#dialog.setAttribute('aria-labelledby', 'modal-title');
    render(
      this.#dialog,
      html`<header class="modal__header">
          <h2 class="panel-title" id="modal-title">${title}</h2>
          <button class="btn btn--ghost btn--icon" type="button" data-modal-close aria-label="Cerrar">${icon('close')}</button>
        </header>
        <div class="modal__body">${body}</div>
        ${footer ? html`<footer class="modal__footer">${footer}</footer>` : ''}`
    );

    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog || event.target.closest('[data-modal-close]')) {
        this.close();
      }
    });
    this.#dialog.addEventListener('close', () => {
      this.#onClose?.();
      this.#dialog.remove();
    });
    document.body.append(this.#dialog);
  }

  get element() {
    return this.#dialog;
  }

  get body() {
    return this.#dialog.querySelector('.modal__body');
  }

  setBody(content) {
    render(this.body, content);
  }

  open() {
    this.#dialog.showModal();
    return this;
  }

  close() {
    if (this.#dialog.open) this.#dialog.close();
  }
}

// Diálogo de confirmación que devuelve una promesa booleana.
export function confirmDialog({ title = '¿Estás seguro?', message, confirmText = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const modal = new Modal({
      title,
      size: 'sm',
      body: html`<p>${message}</p>`,
      footer: html`<button class="btn" type="button" data-modal-close>Cancelar</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${confirmText}</button>`,
      onClose: () => resolve(result),
    });
    modal.element.querySelector('[data-confirm]').addEventListener('click', () => {
      result = true;
      modal.close();
    });
    modal.open();
    modal.element.querySelector('[data-confirm]').focus();
  });
}

// Muestra una contraseña temporal (emitida por la API una sola vez) con opción de copiar.
export function showTemporaryPassword(user, password) {
  const modal = new Modal({
    title: 'Cliente registrado',
    size: 'sm',
    body: html`<div class="stack">
      <div class="alert alert--warning">${icon('key')}<div>Esta contraseña temporal <strong>solo se muestra una vez</strong>. Entrégala al cliente para que inicie sesión y la cambie.</div></div>
      <dl class="kv"><dt>Cliente</dt><dd>${user?.fullName ?? '—'}</dd><dt>Correo</dt><dd>${user?.email ?? '—'}</dd></dl>
      <div class="secret-box"><span data-secret>${password}</span>
        <button class="btn btn--sm" type="button" data-copy>${icon('copy')} Copiar</button></div>
    </div>`,
    footer: html`<button class="btn btn--primary" type="button" data-modal-close>Entendido</button>`,
  });
  modal.element.querySelector('[data-copy]').addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(password);
      event.currentTarget.textContent = 'Copiada ✓';
    } catch {
      event.currentTarget.textContent = 'Copia manualmente';
    }
  });
  modal.open();
}
