/** Configuración para el CLI de Tailwind. El tema vive en resources/tailwind.theme.json (lo comparte el modo CDN). */
module.exports = {
  content: ['./views/**/*.php', './assets/js/**/*.js'],
  // El tema lo decide js/theme.js (Sistema, Claro u Oscuro) poniendo data-theme en <html>.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: require('./resources/tailwind.theme.json'),
  },
};
