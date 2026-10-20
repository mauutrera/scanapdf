// Navegación sin recarga. Las rutas siguen siendo las del servidor (/documento, /pdf…): abrir una URL directo,
// recargar o compartir un enlace funciona igual. Al hacer clic en un enlace interno:
//   - si la sección ya se visitó, se vuelve a mostrar tal como quedó (fotos, ajustes, scroll);
//   - si no, se pide la página al servidor, se toma su contenido y su script, y se agrega como una sección más.
// Si algo falla, se hace una navegación normal.

const HEADER = 'scanner-router'; // el service worker reconoce estas peticiones para servirlas sin conexión
const main = document.getElementById('contenido');
const base = (document.body.dataset.scope || '/').replace(/\/$/, '');

/** Ruta sin barra final ("/" en la raíz), igual que en el servidor. */
const normalize = (path) => {
  const p = `/${path.replace(/^\/+|\/+$/g, '')}`;
  return p === '/' ? '/' : p;
};

const views = new Map();        // ruta -> contenedor de la sección
const loaded = new Set();       // scripts de sección ya ejecutados
const scroll = new Map();       // ruta -> posición de scroll al salir
for (const v of main.querySelectorAll(':scope > [data-view]')) views.set(normalize(v.dataset.view), v);
for (const s of document.querySelectorAll('script[data-page-script]')) loaded.add(new URL(s.src, location.href).href);

let current = normalize(location.pathname);
let pending = null; // navegación en curso (si llega otra, gana la última)

// Barra de progreso fina arriba, solo si la carga tarda.
const bar = document.createElement('div');
bar.className = 'route-progress';
bar.hidden = true;
document.body.append(bar);
let barTimer = 0;
const progress = (on) => {
  clearTimeout(barTimer);
  if (on) barTimer = setTimeout(() => { bar.hidden = false; }, 120);
  else bar.hidden = true;
};

/** ¿Es un enlace a una sección de esta app que se puede abrir sin recargar? */
function isAppLink(a, e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.hasAttribute('download') || (a.target && a.target !== '_self') || a.dataset.reload !== undefined) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (!url.pathname.startsWith(base || '/')) return false;
  if (/\/(assets\/|sw\.js|manifest\.webmanifest|favicon\.ico)/.test(url.pathname)) return false;
  if (url.hash && normalize(url.pathname) === current) return false; // ancla en la misma página
  return true;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || !isAppLink(a, e)) return;
  e.preventDefault();
  const url = new URL(a.href, location.href);
  navigate(url.pathname, { push: true });
});

window.addEventListener('popstate', () => navigate(location.pathname, { push: false }));

/**
 * @param {string} target  ruta (con la base de la app)
 * @param {{push: boolean}} o  push: agregar al historial (false al usar atrás/adelante)
 */
async function navigate(target, { push }) {
  const path = normalize(target);
  if (path === current) {
    if (push) window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const token = (pending = {});
  scroll.set(current, window.scrollY);

  let view = views.get(path);
  let scripts = [];
  if (!view) {
    progress(true);
    try {
      const res = await fetch(path, { headers: { 'X-Requested-With': HEADER }, credentials: 'same-origin' });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const fresh = doc.querySelector('#contenido > [data-view]');
      if (!fresh) throw new Error('Respuesta sin sección');
      if (token !== pending) return; // llegó otra navegación mientras se cargaba esta
      view = document.adoptNode(fresh);
      view.hidden = true;
      main.append(view);
      views.set(path, view);
      scripts = [...doc.querySelectorAll('script[data-page-script]')].map((s) => new URL(s.getAttribute('src'), location.href).href);
    } catch (err) {
      console.warn('Navegación sin recarga no disponible; se recarga la página.', err);
      location.href = path;
      return;
    } finally {
      progress(false);
    }
  }
  if (token !== pending) return;

  if (push) history.pushState({}, '', path);
  show(view, path);

  // El script de la sección se ejecuta una sola vez, cuando su contenido ya está en la página.
  for (const src of scripts) {
    if (loaded.has(src)) continue;
    loaded.add(src);
    try {
      await import(src);
    } catch (err) {
      console.error('No se pudo iniciar la sección', err);
    }
  }
}

function show(view, path) {
  for (const v of views.values()) v.hidden = v !== view;
  current = path;
  document.title = view.dataset.title || document.title;
  markNav(path);

  view.classList.remove('view-enter');
  void view.offsetWidth; // reinicia la animación
  view.classList.add('view-enter');
  window.scrollTo(0, scroll.get(path) ?? 0);

  // Accesibilidad: el foco pasa al título de la nueva sección (los lectores de pantalla lo anuncian).
  const heading = view.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

/** Marca la sección activa en la navegación superior y en las pestañas inferiores. */
function markNav(path) {
  for (const a of document.querySelectorAll('.nav-link, .tab-link')) {
    const on = normalize(new URL(a.href, location.href).pathname) === path;
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
