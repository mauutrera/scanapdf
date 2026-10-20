// Tema de la app: Sistema (sigue al dispositivo), Claro u Oscuro. Se carga en <head> de forma síncrona
// (no como módulo) para aplicar el tema antes de pintar la página y evitar un parpadeo.
(function () {
  var KEY = 'scanner.theme';
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var COLORS = { light: '#f5f7f8', dark: '#151c21' };

  function stored() {
    try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
  }

  function apply(pref) {
    var theme = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themePref = pref;
    root.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[theme]);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { pref: pref, theme: theme } }));
  }

  window.scannerTheme = {
    get: stored,
    /** @param {'system'|'light'|'dark'} pref */
    set: function (pref) {
      try { localStorage.setItem(KEY, pref); } catch (e) { /* sin almacenamiento: solo esta visita */ }
      apply(pref);
    },
  };

  media.addEventListener('change', function () { if (stored() === 'system') apply('system'); });
  apply(stored());
  // La etiqueta meta puede no existir todavía al ejecutarse este script: se ajusta de nuevo al cargar.
  document.addEventListener('DOMContentLoaded', function () { apply(stored()); });
})();
