import { http } from './http.js';

// Capa de servicios: un método por endpoint de la API REST (/api/v1).
// Las respuestas paginadas tienen la forma { status, data, meta: { page, limit, total, totalPages } }.

const id = (value) => encodeURIComponent(String(value));

export const AuthApi = {
  login: (email, password) => http.post('/auth/login', { email, password }),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    http.patch('/auth/password', { currentPassword, newPassword }),
};

export const CatalogApi = {
  list: (filters, options) => http.get('/catalog', { ...options, query: filters }),
  getById: (bookId) => http.get(`/catalog/${id(bookId)}`),
};

export const MeApi = {
  loans: (query) => http.get('/me/loans', { query }),
  loan: (loanId) => http.get(`/me/loans/${id(loanId)}`),
  purchases: (query) => http.get('/me/purchases', { query }),
  purchase: (purchaseId) => http.get(`/me/purchases/${id(purchaseId)}`),
};

// CRUD genérico para recursos administrativos.
function resource(basePath, { updateMethod = 'patch' } = {}) {
  return {
    list: (query) => http.get(basePath, { query }),
    getById: (resourceId) => http.get(`${basePath}/${id(resourceId)}`),
    create: (payload) => http.post(basePath, payload),
    update: (resourceId, payload) => http[updateMethod](`${basePath}/${id(resourceId)}`, payload),
    remove: (resourceId) => http.delete(`${basePath}/${id(resourceId)}`),
  };
}

export const CategoriesApi = resource('/categories', { updateMethod: 'put' });
export const AuthorsApi = resource('/authors', { updateMethod: 'put' });
export const UsersApi = resource('/users');
export const BooksApi = resource('/books');
export const BookCopiesApi = resource('/book-copies');

export const RolesApi = {
  list: () => http.get('/roles'),
};

export const LoansApi = {
  list: (query) => http.get('/loans', { query }),
  getById: (loanId) => http.get(`/loans/${id(loanId)}`),
  create: (payload) => http.post('/loans', payload),
  returnCopies: (loanId, returns) => http.post(`/loans/${id(loanId)}/return`, { returns }),
};

export const PurchasesApi = {
  list: (query) => http.get('/purchases', { query }),
  getById: (purchaseId) => http.get(`/purchases/${id(purchaseId)}`),
  create: (payload) => http.post('/purchases', payload),
};

// Recorre todas las páginas de un recurso paginado (limit máx. 100 en la API).
export async function fetchAllPages(listFn, query = {}, maxPages = 5) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await listFn({ ...query, page, limit: 100 });
    items.push(...(response?.data ?? []));
    totalPages = response?.meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages && page <= maxPages);
  return items;
}
