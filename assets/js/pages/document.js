import { MARGINS, PAPERS, formatMm } from '../lib/paper.js';
import { documentLayout } from '../lib/layout.js';
import { composePage, previewDpi } from '../lib/compose.js';
import { prepareClean, cleanedNow } from '../lib/threads.js';
import { exportSheets } from '../lib/export.js';
import { loadImage, releaseImage, imageFilesFrom, onDropImages } from '../lib/images.js';
import { processNew, adjustCrop } from '../lib/scan.js';
import { warmUpDetector } from '../lib/detect.js';
import { cameraSupported, openCamera } from '../lib/camera.js';
import { readForm, persistForm, toast } from '../lib/form.js';

const $ = (id) => document.getElementById(id);
const form = $('doc-settings');
const EXPORT_DPI = 200; // buena lectura de texto con archivos ligeros

/** @type {import('../lib/images.js').ScanImage[]} */
const pages = [];
let current = 0;
let busy = false;

function settings() {
  const f = readForm(form);
  const margin = f.margin === 'custom'
    ? { t: f.marginCustom || 0, r: f.marginCustom || 0, b: f.marginCustom || 0, l: f.marginCustom || 0 }
    : MARGINS[f.margin] ?? MARGINS.normal;
  return { ...f, marginKey: f.margin, margin };
}

/** Layout y opciones de composición de una página. */
function sheetFor(page, s = settings()) {
  const aspect = page?.result ? page.result.width / page.result.height : null;
  const layout = documentLayout(s, aspect);
  const options = {
    // Versión limpia (se calcula en el grupo de hilos); mientras no esté lista, la foto recortada.
    sourceFor: () => (page ? (s.clean ? cleanedNow(page) ?? page.result : page.result) : null) ?? null,
    labelFor: () => (page ? 'Procesando…' : 'Agrega o arrastra una foto'),
    style: s.style,
    look: s.look,
  };
  return { layout, options };
}

// Agrupa cambios seguidos en un solo dibujado.
let timer = 0;
function render() {
  clearTimeout(timer);
  timer = setTimeout(draw, 16);
}

function draw() {
  const s = settings();
  const page = pages[current] ?? null;
  const { layout, options } = sheetFor(page, s);
  // Limpieza pendiente de la página visible: se pide al grupo de hilos y se redibuja al terminar.
  if (s.clean && page?.result && !cleanedNow(page)) prepareClean(page, 'document').then(render);

  $('inside-options').hidden = s.fit !== 'inside';
  $('margin-custom-wrap').hidden = s.marginKey !== 'custom';

  const container = $('doc-preview');
  const landscape = layout.page.w > layout.page.h;
  container.classList.toggle('max-w-sm', !landscape);
  container.classList.toggle('max-w-lg', landscape);
  const canvas = composePage(layout, { ...options, dpi: previewDpi(container, layout.page.w), guides: s.fit === 'inside' });
  canvas.className = 'block h-auto w-full sheet-frame';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Vista previa de la página');
  container.replaceChildren(canvas);

  // Sin páginas, la hoja vacía funciona como botón para elegir fotos.
  const empty = pages.length === 0;
  container.classList.toggle('cursor-pointer', empty);
  if (empty) {
    container.tabIndex = 0;
    container.setAttribute('role', 'button');
    container.setAttribute('aria-label', 'Agregar fotos');
  } else {
    for (const attr of ['tabindex', 'role', 'aria-label']) container.removeAttribute(attr);
  }

  const size = `${PAPERS[s.paper].label} · ${formatMm(layout.page.w)} × ${formatMm(layout.page.h)} mm`;
  $('doc-caption').textContent = pages.length ? `${size} · Página ${current + 1} de ${pages.length}` : size;

  const ready = pages.filter((p) => p.result).length;
  for (const id of ['doc-export-pdf', 'doc-export-jpg']) $(id).disabled = busy || ready === 0;
  $('doc-export-hint').textContent = ready === 0
    ? 'Agrega al menos una foto para descargar.'
    : `${ready} ${ready === 1 ? 'página' : 'páginas'} · ${EXPORT_DPI} ppp`;

  renderPages();
}

function renderPages() {
  $('doc-pages-wrap').hidden = pages.length === 0;
  $('page-left').disabled = busy || current === 0;
  $('page-right').disabled = busy || current >= pages.length - 1;
  $('page-delete').disabled = busy;
  $('page-crop').disabled = busy || !pages[current]?.result;

  $('doc-pages').replaceChildren(...pages.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'shrink-0';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `block w-16 overflow-hidden rounded-md ring-2 transition focus:outline-none focus-visible:ring-lamp-500 ${
      i === current ? 'ring-lamp-500' : 'ring-transparent hover:ring-ink-300'
    }`;
    btn.setAttribute('aria-label', `Página ${i + 1}: ${p.name}`);
    btn.setAttribute('aria-current', i === current ? 'true' : 'false');

    const thumb = document.createElement(p.url ? 'img' : 'div');
    thumb.className = 'aspect-[3/4] w-full bg-ink-100 object-cover dark:bg-ink-800';
    if (p.url) {
      thumb.src = p.url;
      thumb.alt = '';
    } else {
      thumb.classList.add('animate-pulse');
    }
    const num = document.createElement('span');
    num.className = 'block bg-ink-100 py-0.5 text-center font-mono text-[10px] text-ink-600 dark:bg-ink-800 dark:text-ink-300';
    num.textContent = String(i + 1);
    btn.append(thumb, num);

    btn.addEventListener('click', () => {
      current = i;
      render();
    });
    li.append(btn);
    return li;
  }));
}

async function addFiles(files) {
  if (busy) return toast('Espera a que termine de procesar las fotos anteriores.');
  busy = true;
  const confirm = files.length === 1; // con una sola foto se revisa el recorte, como en CamScanner
  const missed = [];
  try {
    for (const file of files) {
      let image;
      try {
        image = await loadImage(file);
      } catch (err) {
        toast(err.message);
        continue;
      }
      pages.push(image);
      current = pages.length - 1;
      render();
      await processNew(image, 'document', { confirm });
      if (!image.detected && !confirm) missed.push(pages.length);
      render();
    }
  } finally {
    busy = false;
    render();
  }
  if (missed.length) {
    toast(`No encontré el borde en la página ${missed.join(', ')}. Usa "Ajustar recorte".`, 'info');
  }
}

function move(delta) {
  const to = current + delta;
  if (to < 0 || to >= pages.length) return;
  [pages[current], pages[to]] = [pages[to], pages[current]];
  current = to;
  render();
}

async function exportAs(format) {
  const s = settings();
  const ready = pages.filter((p) => p.result);
  // Todas las páginas se limpian en paralelo (grupo de hilos) antes de componer.
  if (s.clean) await Promise.all(ready.map((p) => prepareClean(p, 'document')));
  const sheets = ready.map((p) => sheetFor(p, s));
  await exportSheets(sheets, { format, dpi: EXPORT_DPI, prefix: 'escaneo', title: 'Documento escaneado' });
}

for (const id of ['doc-files', 'doc-camera']) {
  $(id).addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
}
$('doc-shoot').addEventListener('click', async () => {
  if (busy) return toast('Espera a que termine de procesar las fotos anteriores.');
  if (!cameraSupported()) {
    // Sin cámara en la página (p. ej. sin HTTPS): en el celular abre la app de cámara del sistema.
    if (matchMedia('(pointer: coarse)').matches) return $('doc-camera').click();
    return toast('La cámara solo funciona en sitios con HTTPS y en dispositivos con cámara.');
  }
  try {
    const files = await openCamera({ hint: 'Encuadra la hoja completa sobre un fondo que contraste.' });
    if (files.length) addFiles(files);
  } catch (err) {
    toast(err.message);
  }
});
$('page-left').addEventListener('click', () => move(-1));
$('page-right').addEventListener('click', () => move(1));
$('page-delete').addEventListener('click', () => {
  releaseImage(pages.splice(current, 1)[0]);
  current = Math.max(0, Math.min(current, pages.length - 1));
  render();
});
$('page-crop').addEventListener('click', async () => {
  const page = pages[current];
  if (page && await adjustCrop(page, 'document')) render();
});
$('doc-export-pdf').addEventListener('click', () => exportAs('pdf'));
$('doc-export-jpg').addEventListener('click', () => exportAs('jpg'));
onDropImages($('doc-drop'), addFiles);
document.addEventListener('paste', (e) => {
  if (form.closest('[data-view]')?.hidden) return; // solo la sección visible recibe lo que se pega
  const files = imageFilesFrom(e.clipboardData);
  if (files.length) addFiles(files);
});

persistForm(form, 'scanner.document.settings');
form.addEventListener('input', render);
new ResizeObserver(render).observe($('doc-preview'));
const pickIfEmpty = () => {
  if (pages.length === 0 && !busy) $('doc-files').click();
};
$('doc-preview').addEventListener('click', pickIfEmpty);
$('doc-preview').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pickIfEmpty();
  }
});
document.fonts?.ready.then(render);
render();
// Descarga OpenCV en segundo plano mientras eliges las fotos.
warmUpDetector();
