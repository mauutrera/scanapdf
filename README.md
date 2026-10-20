# ScanaPDF

Convierte fotos tomadas con el celular en escaneos PDF:

- **Documento**: una o varias fotos, una por página. Detecta el borde de la hoja, endereza la perspectiva,
  limpia sombras (papel blanco) y permite elegir si la foto **es la hoja completa** o va **dentro del documento**
  respetando márgenes. Hoja carta, oficio o A4.
- **Credencial**: frente y reverso recortados al borde de la tarjeta, con esquinas redondeadas, a tamaño real
  (85.6 × 54 mm) o ampliados al 150 % / 200 %, lado a lado o uno sobre otro.
- **PDF**: sube un PDF digital y descárgalo con apariencia de escaneado, conservando el tamaño y la orientación
  de cada página. Intensidad sutil / normal / marcada (giro, desenfoque, tóner, grano, polvo, sombra de la tapa),
  inclinación distinta por página, 150 / 200 / 300 ppp y rango de páginas (`1-3, 5`). Hasta 300 páginas.
- **Digitalizar**: la foto de un documento se reconstruye como si fuera un documento digital: renglones rectos
  (corrige curvatura e inclinación), papel blanco puro aunque el original sea crema, texto y líneas negros y nítidos,
  y opcionalmente la tinta de color (firmas, sellos) con su color sólido. Estilo blanco y negro o grises, grosor del
  texto ajustable. La vista previa muestra la hoja con su tamaño real y el texto se puede seleccionar ahí mismo.
  Descarga en PDF sin pérdida (FlateDecode) a 300 ppp, opcionalmente con texto seleccionable (OCR invisible con
  Tesseract.js), o PNG. El texto reconocido también se puede corregir y bajar como Word (.docx) o .txt.
  El procesamiento de imagen está en `assets/js/lib/reconstruct.worker.js`.
- **Cámara integrada**: toma una o varias fotos seguidas sin salir de la página, con el contorno detectado en vivo,
  linterna y cambio de cámara. En Credencial pide frente y luego reverso con un recuadro guía del tamaño de la tarjeta.
  Requiere HTTPS (o `localhost`); sin eso, en el celular se usa la app de cámara del sistema.
- **Navegación sin recarga**: las secciones se cargan y se cambian sin recargar la página, conservando su trabajo
  (fotos, ajustes, scroll) al ir y volver. Las rutas del servidor siguen funcionando para abrir, recargar o compartir.
- **Multihilo**: enderezar, limpiar, componer las hojas, digitalizar y comprimir corren en un grupo de workers
  (uno por núcleo); al exportar, varias páginas se procesan a la vez y la interfaz no se congela.
- **Tema** Sistema / Claro / Oscuro, recordado en el dispositivo.
- **App instalable (PWA)**: se instala en Android, iPhone, Windows y Mac con su propio ícono y a pantalla completa;
  funciona sin conexión (páginas y archivos propios se guardan al instalar; OpenCV, pdf.js y Tesseract se guardan la
  primera vez que se usa cada modo). Avisa cuando hay una versión nueva.
- Estilo color, grises o blanco y negro; apariencia "escaneado" (papel, grano, giro mínimo) o "digital limpio".
- Exporta a PDF (todas las páginas) o JPG.

Las fotos se procesan en el navegador y **no se suben al servidor**.

## Stack

- **PHP 8.1+** sin dependencias ni extensiones especiales. Todo entra por `index.php` con un router propio y URLs limpias
  (`/documento`, `/credencial`); no se exponen extensiones ni la estructura de carpetas.
- **Tailwind CSS 3.4.17**, compilado con Node (`npm run build:css`). Node solo se usa en desarrollo; producción no lo necesita.
- **JavaScript sin framework** (módulos ES). OpenCV.js para detectar bordes, cargado en un Web Worker desde jsDelivr.
  pdf.js 3.11.174 (jsDelivr) para leer PDFs, solo en la pantalla PDF. Tesseract.js 5.1.1 (jsDelivr) para el OCR,
  solo en la pantalla Digitalizar. La CSP permite `'wasm-unsafe-eval'` porque el worker de Tesseract hereda la de la página.
  Las tres librerías se verifican con su huella SRI antes de ejecutarse.
  Los PDF con texto y el .docx también se generan a mano (Helvetica/WinAnsi y un ZIP sin compresión).
  El enderezado, la limpieza, la composición de la hoja y el PDF de salida están escritos a mano, sin librerías.

## Desarrollo

```bash
php -S localhost:8000 index.php
```

Abre http://localhost:8000. `index.php` funciona también como router del servidor integrado: solo sirve directamente lo que está en `/assets`.
Para ver errores de PHP en pantalla, define `APP_DEBUG=1` antes de arrancar (en PowerShell: `$env:APP_DEBUG=1`).

### CSS (Tailwind)

El tema está en `resources/tailwind.theme.json`, los componentes en `resources/css/app.css` y la configuración en
`tailwind.config.cjs`. Requiere Node 18+; la primera vez instala Tailwind (v3.4.17, fijada en `package.json`):

```bash
npm install
npm run build:css    # compila y minifica a assets/css/app.css
npm run watch:css    # recompila al guardar, mientras desarrollas
```

**Vuelve a compilar después de agregar clases nuevas** en las vistas o en el JS.
Si `assets/css/app.css` no existe, el layout usa Tailwind por CDN con el mismo tema (solo para desarrollo, y sin CSP).

### Pruebas

`npm test` corre las pruebas de las funciones puras del motor (geometría, PDF, OCR → texto, .docx) con `node:test`,
sin navegador. Están en `tests/`.

## Estructura

```
index.php                 punto de entrada único
.htaccess                 Apache: todo a index.php excepto /assets; tipos MIME y caché
app/                      router, configuración, helpers y rutas (no accesible desde la web)
views/                    plantillas PHP: layouts/, scan/, partials/, errors/
assets/css/app.css        CSS compilado
assets/js/pages/          un script por pantalla (document.js, credential.js, digital.js para PDFs)
assets/js/lib/            motor: detección (worker), editor de esquinas, geometría, limpieza,
                          compositor de hoja, PDF y exportación
resources/                fuentes de Tailwind (no se suben a producción)
tests/                    pruebas (npm test; no se suben a producción)
package.json              Tailwind y scripts de desarrollo (no se sube a producción)
```

Para agregar una página: define la ruta en `app/routes.php` y crea su vista en `views/`.

### Navegación sin recarga

- `assets/js/router.js` intercepta los enlaces internos, pide la página al servidor (cabecera
  `X-Requested-With: scanner-router`), toma su contenedor `[data-view]` y su script de sección (`data-page-script`) y lo
  agrega a `<main>`. Cada sección se ejecuta una sola vez y después solo se muestra u oculta.
- Por eso los ids deben ser únicos entre secciones: el parcial `seg` recibe `idPrefix` (`doc`, `cred`, `pdf`, `dz`).
- Como todo vive en un solo documento, la CSP es la misma para toda la app (`app/config.php`).

### Hilos

- `assets/js/lib/pool.js`: grupo de workers genérico (uno por núcleo menos uno, entre 2 y 6).
- `assets/js/lib/image.worker.js`: enderezar, limpiar, componer y comprimir con `OffscreenCanvas`, reutilizando
  `geometry.js`, `enhance.js`, `compose.js` y `pdf.js` (usan `canvas.js` para crear lienzos en la página o en un worker).
- `assets/js/lib/threads.js`: la interfaz que usan las secciones; si el navegador no tiene `OffscreenCanvas`,
  hace lo mismo en el hilo principal.
- Además: detección de bordes (`detect.worker.js`), digitalización (`reconstruct.worker.js`, 2 a la vez) y OCR
  (Tesseract) en sus propios workers.

### Cómo funciona una foto

1. `images.js` la lee (respetando la orientación EXIF) y la limita a 3200 px.
2. `detect.js` envía una copia reducida al worker (`detect.worker.js`), que busca el contorno con OpenCV.
3. `editor.js` muestra las 4 esquinas para revisarlas (lupa, teclado, girar, "toda la foto").
4. `geometry.js` endereza la región elegida (homografía + interpolación bilineal).
5. `enhance.js` la limpia: sombras y fondo en documentos; balance de blancos en tarjetas.
6. `layout.js` calcula la hoja en milímetros y `compose.js` la dibuja; la vista previa y la exportación usan el mismo código.
7. `pdf.js` arma el PDF con una imagen JPEG por página.

## Despliegue

Sube solo esto: `index.php`, `.htaccess`, `app/`, `views/`, `assets/`. No subas `node_modules/`, `package.json`,
`package-lock.json`, `tests/`, `resources/`, `tailwind.config.cjs` ni `.claude/` (el `.htaccess` igual los bloquea con 404).
Antes de subir, compila el CSS (paso anterior).

- **Apache / hosting compartido:** requiere `mod_rewrite` (y de preferencia `mod_headers`) y `AllowOverride All` (o al menos
  `FileInfo Options Indexes`) para que se lea el `.htaccess`. Funciona en la raíz del dominio o en un subdirectorio.
- **Nginx:**

  ```nginx
  location /assets/ {
      try_files $uri =404;
      location ~* \.(js|mjs|css)$ { add_header Cache-Control "no-cache"; }
  }
  location / {
      include fastcgi_params;
      fastcgi_param SCRIPT_FILENAME $document_root/index.php;
      fastcgi_param SCRIPT_NAME /index.php;
      fastcgi_pass unix:/run/php/php-fpm.sock;
  }
  ```

- Usa **HTTPS**: los celulares solo permiten abrir la cámara e instalar la app desde sitios seguros.

### PWA

- `/manifest.webmanifest` y `/sw.js` son rutas de PHP (`app/routes.php`), así funcionan también en un subdirectorio.
  El código del service worker está en `app/pwa/sw.js`; la ruta le antepone la versión y la lista de archivos.
- La versión del service worker se calcula con las fechas de modificación de `assets/` y `views/` (incluida `views/home.php`): al subir cambios,
  los usuarios ven el aviso "Hay una versión nueva" y se actualiza con un clic.
- Íconos en `assets/img/` (192, 512, maskable 512 y apple-touch-icon 180).
- Para probar la instalación localmente usa Chrome o Edge en `http://localhost:8000` (localhost cuenta como seguro).
- Los errores no se muestran en producción (`APP_DEBUG` apagado); se registran en el log de PHP y el visitante ve una página 500.

### Seguridad

- Las páginas envían una CSP estricta: solo scripts propios, sin scripts ni estilos en línea, sin `eval`.
  OpenCV necesita compilar código, por eso corre en un Web Worker, que tiene su propio contexto.
- Como la navegación es sin recarga (un solo documento), la CSP es la misma para toda la app: está en `app/config.php` e
  incluye jsDelivr (pdf.js, Tesseract), workers `blob:` y `'wasm-unsafe-eval'`.
- `/assets` se sirve **sin CSP**: el worker de detección ejecuta OpenCV con `eval`. No agregues una CSP global en el
  servidor (p. ej. `add_header` en nginx para todo el sitio) o la detección de bordes deja de funcionar.
- OpenCV, pdf.js y Tesseract se verifican con SRI (`OPENCV_SRI` en `detect.worker.js`, `PDFJS_SRI` en `pdfdoc.js`,
  `TESSERACT_SRI` en `ocr.js`). Si cambias la versión o el CDN, actualiza la URL **y** su huella:
  `curl -sL <url> | openssl dgst -sha384 -binary | base64` (con el prefijo `sha384-`).
