# BooksBrain · Frontend

Frontend web de **BooksBrain**, el sistema de venta y gestión de una librería presencial. Consume la API REST de [`library-system`](https://github.com/lestergarcia711/library-system) (`/api/v1`).

- **HTML5 + CSS3 puro** (variables CSS, Flexbox, Grid, container queries) — sin frameworks.
- **JavaScript Vanilla ES6+** con módulos nativos (`type="module"`), sin dependencias ni build.
- **Mobile-first**: se adapta a smartphones, tablets y escritorio.

---

## Funcionalidades

### Público / Cliente
| Página | Descripción |
| :--- | :--- |
| `index.html` | **Catálogo (vitrina)**: buscador en tiempo real (debounce), filtros por categoría, autor y disponibilidad, ordenamiento por título/precio, paginación, detalle del libro en modal y filtros sincronizados en la URL. |
| `login.html` | Inicio de sesión. Redirige al panel según el rol (`Administrator` → `admin.html`, `Client` → `account.html`). |
| `account.html` | **Panel del cliente**: resumen (préstamos activos, vencidos, compras), préstamos con fechas y barra de tiempo restante, historial de compras con detalle, y cambio de contraseña. |

### Administrador (`admin.html`, SPA con router por hash)
| Ruta | Descripción |
| :--- | :--- |
| `#/dashboard` | Tarjetas de estadísticas (usuarios, títulos, autores, categorías, préstamos activos/vencidos, ejemplares, compras), préstamos urgentes, stock bajo y últimas compras. |
| `#/books` | Inventario de libros: búsqueda, filtros por categoría y nivel de stock, alta/edición/baja. |
| `#/copies` | Ejemplares físicos: código de barras, condición y estado; filtro por libro y estado. |
| `#/taxonomy` | Categorías y autores (CRUD). |
| `#/purchases` | Registro de ventas en mostrador con carrito, total en vivo y validación de stock. |
| `#/loans` | Préstamos (por título o por código de barras) y **devoluciones parciales o totales** con condición de regreso. |
| `#/users` | Control de usuarios: alta de clientes, edición y baja. |

En ventas y préstamos se puede seleccionar un cliente existente o **registrar uno nuevo en línea**; la contraseña temporal que devuelve la API se muestra **una sola vez** con opción de copiarla.

---

## Estructura

```
booksbrain-frontend/
├── index.html              # Catálogo público
├── login.html              # Inicio de sesión
├── account.html            # Panel del cliente
├── admin.html              # Shell del panel administrativo
└── assets/
    ├── img/favicon.svg
    ├── css/
    │   ├── base.css        # Tokens (paleta oficial), reset y tipografía
    │   ├── components.css  # Botones, formularios, tarjetas, tablas, modales, toasts, loaders
    │   ├── layout.css      # Cabecera pública, sidebar + topbar, contenedores
    │   └── pages/          # catalog.css · auth.css · dashboard.css
    └── js/
        ├── config.js       # URL de la API, tamaños de página, roles y rutas
        ├── api/
        │   ├── http.js     # Cliente fetch (cookies, timeout, errores normalizados)
        │   └── services.js # Un método por endpoint de la API
        ├── core/
        │   ├── dom.js      # Plantillas html`` con escape automático, helpers
        │   ├── format.js   # Moneda, fechas, estados y condiciones
        │   └── session.js  # Sesión (GET /auth/me), login/logout, guardas por rol
        ├── ui/             # icons · feedback (toasts, loaders, errores) · modal · pagination · header · cover
        └── pages/
            ├── catalog.js · login.js · account.js
            └── admin/      # main (router) · shared · dashboard · books · copies · taxonomy · purchases · loans · users
```

---

## Puesta en marcha

1. **Levantar la API** (`library-system`) con MySQL configurado (ver su README).
2. **Permitir el origen del frontend en CORS**: en el `.env` de la API, `CORS_ORIGINS` es una lista (separada por comas) de orígenes permitidos y **debe incluir exactamente el origen desde el que abres el frontend**. La API la usa para CORS y para su protección CSRF (rechaza con `403` los `POST/PUT/PATCH/DELETE` cuyo `Origin` no esté en la lista). Ejemplo para Live Server (puerto 5500):
   ```env
   CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
   ```
   Reglas importantes:
   - La comparación es **exacta**: esquema + host + **puerto**. `http://localhost:5500` y `http://127.0.0.1:5500` son orígenes distintos, y cualquier otro puerto (por ejemplo `5173`) también hay que añadirlo.
   - **Reinicia la API** después de editar el `.env`; solo se lee al arrancar.
3. **Servir el frontend** con cualquier servidor estático (los módulos ES no funcionan con `file://`). Con **Live Server** de VS Code (puerto 5500 por defecto), abre `index.html` con "Open with Live Server". También sirve cualquier otro, por ejemplo:
   ```bash
   python3 -m http.server 5173
   ```
   En ese caso añade `http://localhost:5173` a `CORS_ORIGINS`.
4. **URL de la API**: por defecto `http://localhost:3000/api/v1` (en `assets/js/config.js`). Si la API corre en otro puerto, cámbiala ahí o sin tocar código desde la consola del navegador:
   ```js
   localStorage.setItem('booksbrain:apiBaseUrl', 'http://localhost:3011/api/v1');
   ```

> Usa el **mismo host** (`localhost` o `127.0.0.1`) en la API y en el frontend: la cookie de sesión es `SameSite=Lax` y ambos deben ser el mismo *site*. Recomendado: `localhost` en las dos. Si Live Server te abre `127.0.0.1`, cambia la URL del navegador a `localhost`.

**Si el navegador muestra "No se pudo conectar con el servidor" o `403 Origen de peticion no permitido`:** revisa que el origen de la barra de direcciones (con su puerto) esté en `CORS_ORIGINS` y que hayas reiniciado la API.

---

## Decisiones técnicas

- **Sesión segura**: el JWT vive en una cookie `httpOnly` emitida por la API; el frontend nunca lo lee ni lo guarda. Todas las peticiones usan `credentials: 'include'` y la sesión se valida con `GET /auth/me`. Solo se cachea el perfil público (nombre, correo, rol) en `sessionStorage` para pintar la cabecera.
- **Protección XSS**: todo el HTML se genera con la plantilla etiquetada `html```, que escapa automáticamente cada valor interpolado. Solo los iconos y estilos generados por la propia app se marcan como seguros.
- **Redirecciones seguras**: el parámetro `?next=` del login solo acepta páginas internas permitidas para el rol.
- **Errores de validación**: los `400` de la API (`details: [{ field, message }]`) se pintan junto a cada campo; los demás errores se muestran en alertas o toasts.
- **Rate limit**: la API limita las peticiones (100 por 15 min por defecto). El frontend usa debounce en la búsqueda, cancela búsquedas obsoletas con `AbortController` y cachea catálogos auxiliares (categorías, autores, libros, clientes) invalidándolos tras cada cambio.
- **Facetas del catálogo**: `/categories` y `/authors` son exclusivos del administrador, así que los filtros públicos de categoría y autor se derivan del propio catálogo y se cachean 10 minutos.
- **Portadas generadas**: la API no expone imágenes; cada libro recibe una portada determinística con colores de la paleta oficial.
- **Accesibilidad**: `<dialog>` nativo para modales (foco atrapado, `Esc`), roles ARIA en pestañas y menús, *skip links*, foco visible, tablas que se convierten en tarjetas en pantallas angostas y respeto de `prefers-reduced-motion`.

## Paleta

| Token | Color | Uso |
| :--- | :--- | :--- |
| `--brand-primary` | `#00897b` | Encabezado, acciones primarias |
| `--sidebar-bg` | `#222d32` | Menú lateral |
| `--bg-main` | `#f4f6f9` | Fondo general |
| `--card-users` | `#00bcd4` | Tarjetas de usuarios |
| `--card-books` | `#00897b` | Tarjetas de libros |
| `--card-authors` | `#ffb300` | Tarjetas de autores |
| `--card-editorials` | `#d81b60` | Tarjetas de categorías / alertas |
