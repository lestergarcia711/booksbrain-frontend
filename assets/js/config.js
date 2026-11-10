// Configuración global del frontend de BooksBrain.
// La URL de la API puede sobrescribirse sin tocar el código definiendo en la consola:
//   localStorage.setItem('booksbrain:apiBaseUrl', 'http://localhost:3011/api/v1')

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

function readOverride() {
  try {
    return localStorage.getItem('booksbrain:apiBaseUrl');
  } catch {
    return null;
  }
}

export const CONFIG = Object.freeze({
  API_BASE_URL: (readOverride() || DEFAULT_API_BASE_URL).replace(/\/+$/, ''),
  REQUEST_TIMEOUT_MS: 15000,
  SEARCH_DEBOUNCE_MS: 350,
  CATALOG_PAGE_SIZE: 12,
  TABLE_PAGE_SIZE: 10,
  CURRENCY: 'USD',
  LOCALE: 'es-CO',
});

export const ROLES = Object.freeze({
  ADMIN: 'Administrator',
  CLIENT: 'Client',
});

export const ROUTES = Object.freeze({
  CATALOG: 'index.html',
  LOGIN: 'login.html',
  ACCOUNT: 'account.html',
  ADMIN: 'admin.html',
});
