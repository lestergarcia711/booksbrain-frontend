// Utilidades de DOM con plantillas seguras: todo valor interpolado se escapa por defecto.

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"'`]/g, (char) => ESCAPE_MAP[char]);
}

// Marca un fragmento como HTML de confianza (generado por la propia app, nunca datos de la API).
export class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(String(value));

function serialize(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  return escapeHtml(value);
}

// Tagged template: html`<p>${userInput}</p>` escapa userInput automáticamente.
export function html(strings, ...values) {
  let result = strings[0];
  values.forEach((value, index) => {
    result += serialize(value) + strings[index + 1];
  });
  return new SafeHtml(result);
}

export function render(target, content) {
  target.innerHTML = serialize(content);
}

export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Delegación de eventos: on(container, 'click', '[data-action]', handler)
export function on(target, eventName, selector, handler) {
  target.addEventListener(eventName, (event) => {
    const match = event.target.closest(selector);
    if (match && target.contains(match)) {
      handler(event, match);
    }
  });
}

export function initials(fullName = '') {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
}
