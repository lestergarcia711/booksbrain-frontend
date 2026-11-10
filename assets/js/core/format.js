import { CONFIG } from '../config.js';

const currencyFormatter = new Intl.NumberFormat(CONFIG.LOCALE, {
  style: 'currency',
  currency: CONFIG.CURRENCY,
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat(CONFIG.LOCALE);

const dateFormatter = new Intl.DateTimeFormat(CONFIG.LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(CONFIG.LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatMoney = (value) => currencyFormatter.format(Number(value) || 0);
export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

// Las fechas tipo DATE (YYYY-MM-DD) se interpretan en hora local para evitar desfases de un día.
export function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Días enteros entre hoy y la fecha dada (negativo = vencido).
export function daysUntil(value) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export const LOAN_STATUS = {
  Active: { label: 'Activo', tone: 'info' },
  Overdue: { label: 'Vencido', tone: 'danger' },
  Returned: { label: 'Devuelto', tone: 'success' },
};

export const COPY_STATUS = {
  Available: { label: 'Disponible', tone: 'success' },
  Borrowed: { label: 'Prestado', tone: 'info' },
  Maintenance: { label: 'Mantenimiento', tone: 'warning' },
  Sold: { label: 'Vendido', tone: 'plain' },
};

export const CONDITIONS = [
  { value: 'New', label: 'Nuevo' },
  { value: 'Good', label: 'Bueno' },
  { value: 'Fair', label: 'Regular' },
  { value: 'Damaged', label: 'Dañado' },
];

export function conditionLabel(value) {
  return CONDITIONS.find((c) => c.value === value)?.label ?? value ?? '—';
}
