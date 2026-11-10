import { html, raw } from '../core/dom.js';

// Genera una portada visual determinística por libro (la API no expone imágenes).
// Cada título recibe una combinación de la paleta oficial según su id.
const PAIRS = [
  ['#00897b', '#004d45'],
  ['#00bcd4', '#006978'],
  ['#d81b60', '#7a0e36'],
  ['#ffb300', '#b26a00'],
  ['#2c3b41', '#11181b'],
  ['#00897b', '#222d32'],
  ['#5e35b1', '#311b92'],
  ['#00acc1', '#00897b'],
];

export function coverColors(seed) {
  const n = Math.abs(Number(seed) || String(seed).split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  return PAIRS[n % PAIRS.length];
}

export function coverView(book, { status = '' } = {}) {
  const [a, b] = coverColors(book.id);
  const initial = (book.title ?? '?').trim().charAt(0).toUpperCase();
  return html`<div class="cover" style="${raw(`--cover-a:${a};--cover-b:${b}`)}">
    <span class="cover__initial" aria-hidden="true">${initial}</span>
    ${status ? html`<span class="cover__status">${status}</span>` : ''}
    <span class="cover__title">${book.title}</span>
  </div>`;
}
