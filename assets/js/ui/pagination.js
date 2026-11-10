import { html } from '../core/dom.js';
import { icon } from './icons.js';
import { formatNumber } from '../core/format.js';

// Renderiza controles de paginación a partir del objeto meta de la API.
export function paginationView(meta, label = 'registros') {
  if (!meta || !meta.total) return '';
  const { page, limit, total, totalPages } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return html`<nav class="pagination" aria-label="Paginación">
    <span>Mostrando <strong>${formatNumber(from)}–${formatNumber(to)}</strong> de <strong>${formatNumber(total)}</strong> ${label}</span>
    <div class="pagination__controls">
      <button class="btn btn--sm" type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevronLeft')}</button>
      <span class="btn btn--sm btn--ghost" aria-current="page">${page} / ${Math.max(totalPages, 1)}</span>
      <button class="btn btn--sm" type="button" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="Página siguiente">${icon('chevronRight')}</button>
    </div>
  </nav>`;
}
