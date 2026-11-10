import { CONFIG } from '../config.js';

// Error normalizado de la API: { status, message, details } según errorHandler del backend.
export class ApiError extends Error {
  constructor(message, status = 0, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isValidation() {
    return this.status === 400 && Array.isArray(this.details);
  }

  get isNetwork() {
    return this.status === 0;
  }
}

// Cliente HTTP sobre fetch. La sesión viaja en una cookie httpOnly, por eso siempre
// se usa credentials: 'include' y nunca se guarda el token en JavaScript.
export class HttpClient {
  #baseUrl;
  #timeoutMs;
  #listeners = new Set();
  #pending = 0;

  constructor(baseUrl = CONFIG.API_BASE_URL, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS) {
    this.#baseUrl = baseUrl;
    this.#timeoutMs = timeoutMs;
  }

  // Permite a la UI mostrar una barra de progreso global mientras hay peticiones en vuelo.
  onActivityChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #setPending(delta) {
    this.#pending = Math.max(0, this.#pending + delta);
    this.#listeners.forEach((listener) => listener(this.#pending > 0));
  }

  #buildUrl(path, query) {
    const url = new URL(`${this.#baseUrl}${path}`);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }
    return url;
  }

  async request(method, path, { query, body, signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), this.#timeoutMs);
    const onExternalAbort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    this.#setPending(1);
    try {
      const response = await fetch(this.#buildUrl(path, query), {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 204) {
        return null;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new ApiError(
          payload?.message ?? `Error ${response.status}`,
          response.status,
          payload?.details
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (error?.name === 'TimeoutError' || controller.signal.reason?.name === 'TimeoutError') {
        throw new ApiError('El servidor tardó demasiado en responder. Intenta de nuevo.');
      }
      throw new ApiError('No se pudo conectar con el servidor. Verifica que la API esté en ejecución.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onExternalAbort);
      this.#setPending(-1);
    }
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, body, options) {
    return this.request('POST', path, { ...options, body });
  }

  put(path, body, options) {
    return this.request('PUT', path, { ...options, body });
  }

  patch(path, body, options) {
    return this.request('PATCH', path, { ...options, body });
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }
}

export const http = new HttpClient();
