// Comportamiento común a todas las páginas: navegación sin recarga, PWA (service worker, instalación,
// actualización), tema y aviso sin conexión.
import './router.js';

const body = document.body;
const swUrl = body.dataset.sw;
// Botones que abren la instalación y secciones que solo se muestran cuando se puede instalar.
const installButtons = () => document.querySelectorAll('[data-install], [data-install-panel]');

// ---------- Service worker y actualizaciones ----------

if ('serviceWorker' in navigator && swUrl) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { scope: body.dataset.scope || '/' });
      // Hay una versión nueva esperando: se ofrece actualizar (no se recarga sola para no perder trabajo).
      const offer = (worker) => {
        if (!worker || !navigator.serviceWorker.controller) return;
        banner('Hay una versión nueva de la app.', 'Actualizar', () => worker.postMessage('skip-waiting'));
      };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => worker.state === 'installed' && offer(worker));
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    } catch (err) {
      console.warn('No se pudo registrar el service worker', err);
    }
  });
}

// ---------- Instalar la app ----------

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredPrompt = null;

function showInstall(show) {
  for (const btn of installButtons()) btn.hidden = !show;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // el botón propio decide cuándo mostrar el diálogo
  deferredPrompt = e;
  showInstall(true);
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  showInstall(false);
  banner('Listo: la app quedó instalada.');
});

// En iPhone/iPad no existe el diálogo de instalación: se explica cómo agregarla a la pantalla de inicio.
if (isIOS && !standalone) showInstall(true);

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-install]');
  if (!btn) return;
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') showInstall(false);
    return;
  }
  if (isIOS) {
    banner('En Safari toca Compartir y luego "Agregar a pantalla de inicio".');
    return;
  }
  banner('Abre el menú del navegador y elige "Instalar app" o "Agregar a pantalla de inicio".');
});

// ---------- Tema (Sistema / Claro / Oscuro) ----------

function markTheme() {
  const pref = window.scannerTheme?.get() ?? 'system';
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === pref)));
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-theme-set]');
  if (!btn) return;
  window.scannerTheme?.set(btn.dataset.themeSet);
  markTheme();
});
document.addEventListener('themechange', markTheme);
markTheme();

// ---------- Sin conexión ----------

function updateOnline() {
  const offline = !navigator.onLine;
  document.querySelectorAll('[data-offline]').forEach((el) => (el.hidden = !offline));
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

// ---------- Aviso flotante ----------

function banner(message, actionLabel, onAction) {
  document.querySelector('[data-banner]')?.remove();
  const el = document.createElement('div');
  el.dataset.banner = '';
  el.setAttribute('role', 'status');
  el.className = 'app-banner';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (actionLabel) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'app-banner-action';
    action.textContent = actionLabel;
    action.addEventListener('click', () => { el.remove(); onAction?.(); });
    el.append(action);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'app-banner-close';
  close.setAttribute('aria-label', 'Cerrar aviso');
  close.textContent = '×';
  close.addEventListener('click', () => el.remove());
  el.append(close);
  document.body.append(el);
  if (!actionLabel) setTimeout(() => el.remove(), 7000);
}
