import { AuthApi } from '../api/services.js';
import { ROLES, ROUTES } from '../config.js';

// Gestiona la sesión del usuario. El JWT vive en una cookie httpOnly (inaccesible desde JS),
// así que la fuente de verdad es siempre GET /auth/me. Solo se cachea el perfil público
// en sessionStorage para pintar la cabecera sin parpadeos.

const CACHE_KEY = 'booksbrain:profile';
let currentUser;

function readCache() {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeCache(user) {
  try {
    if (user) {
      const { id, fullName, email, role } = user;
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ id, fullName, email, role }));
    } else {
      sessionStorage.removeItem(CACHE_KEY);
    }
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export const Session = {
  get cachedUser() {
    return readCache();
  },

  // Devuelve el usuario autenticado o null si no hay sesión válida.
  async load({ force = false } = {}) {
    if (currentUser !== undefined && !force) return currentUser;
    try {
      const response = await AuthApi.me();
      currentUser = response?.data ?? null;
    } catch (error) {
      if (error.isUnauthorized) {
        currentUser = null;
      } else {
        throw error;
      }
    }
    writeCache(currentUser);
    return currentUser;
  },

  async login(email, password) {
    const response = await AuthApi.login(email, password);
    currentUser = response?.data ?? null;
    writeCache(currentUser);
    return currentUser;
  },

  async logout() {
    try {
      await AuthApi.logout();
    } finally {
      currentUser = null;
      writeCache(null);
      window.location.href = ROUTES.LOGIN;
    }
  },

  // La cookie expiró o fue revocada a mitad de uso: limpia el estado y vuelve al login.
  expire() {
    currentUser = null;
    writeCache(null);
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.hash);
    window.location.replace(`${ROUTES.LOGIN}?next=${next}`);
  },

  roleOf(user) {
    return user?.role?.name ?? null;
  },

  homeFor(user) {
    return this.roleOf(user) === ROLES.ADMIN ? ROUTES.ADMIN : ROUTES.ACCOUNT;
  },

  // Protege una página: redirige al login si no hay sesión o al panel correcto si el rol no coincide.
  async require(role) {
    const user = await this.load();
    if (!user) {
      const next = encodeURIComponent(location.pathname.split('/').pop() + location.hash);
      window.location.replace(`${ROUTES.LOGIN}?next=${next}`);
      return null;
    }
    if (role && this.roleOf(user) !== role) {
      window.location.replace(this.homeFor(user));
      return null;
    }
    return user;
  },
};
