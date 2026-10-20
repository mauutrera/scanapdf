// Modo Digitalizar: la foto de un documento se reconstruye como si fuera un documento digital
// (enderezado, fondo blanco, texto nítido, colores planos, imágenes conservadas). Opcionalmente con texto
// seleccionable (OCR invisible encima) y el texto aparte para Word o .txt.
import { MARGINS, pageSize } from '../lib/paper.js';
import { documentLayout } from '../lib/layout.js';
import { download, fileName } from '../lib/export.js';
import { loadImage, releaseImage, imageFilesFrom, onDropImages } from '../lib/images.js';
import { processNew, adjustCrop } from '../lib/scan.js';
import { warmUpDetector } from '../lib/detect.js';
import { cameraSupported, openCamera } from '../lib/camera.js';
import { reconstruct, targetSize } from '../lib/reconstruct.js';
import { recognize, warmUpOcr, LANGUAGES } from '../lib/ocr.js';
import { invisibleTextOps, parseBlocks } from '../lib/textlayout.js';
import { buildPdf } from '../lib/pdf.js';
import { flate, mapLimit, THREADS } from '../lib/threads.js';
import { buildDocx } from '../lib/docx.js';
import { readForm, persistForm, status, toast } from '../lib/form.js';

const $ = (id) => document.getElementById(id);
const form = $('dz-settings');
const PREVIEW_DPI = 200; // vista previa y OCR (con menos, la letra pequeña de las tablas se lee mal)
const EXPORT_DPI = 300;

/**
 * @typedef {import('../lib/images.js').ScanImage & {
 *   version: number,
 *   digital: {key: string, canvas: HTMLCanvasElement}|null,
 *   ocr: {state: 'waiting'|'reading'|'done'|'error', progress: number, result: any, text: string, lang: string, version: number}|null
 * }} Page
 */
/** @type {Page[]} */
const pages = [];
let current = 0;
let busy = false;     // agregando o recortando fotos
let exporting = false;

function settings() {
  const f = readForm(form);
  return {
    ...f,
    mode: f.mode === 'gray' ? 'gray' : 'bw',
    weight: Number(f.weight) || 0,
    inkColor: !!f.inkColor,
    straighten: !!f.straighten,
    selectable: !!f.selectable,
  };
}

/** Opciones de reconstrucción que dependen de los ajustes. */
const reconstructOpts = (s) => ({ mode: s.mode, weight: s.weight, inkColor: s.inkColor, straighten: s.straighten });

/** Hoja donde va una página: orientación según la foto, la imagen ocupa la hoja completa. */
function sheetFor(page, s) {
  const aspect = page.result.width / page.result.height;
  return documentLayout({ paper: s.paper, orientation: 'auto', fit: 'full', margin: MARGINS.none, align: 'top' }, aspect);
}

const styleKey = (s) => `${s.mode}|${s.weight}|${s.inkColor}|${s.straighten}`;

// ---------- Digitalización en segundo plano ----------

let working = false;
async function runDigitize() {
  if (working) return;
  working = true;
  try {
    for (;;) {
      const s = settings();
      const key = (p) => `${p.version}|${styleKey(s)}|${s.paper}`;
      // Primero la página que se está viendo, luego las demás en orden.
      const next = [pages[current], ...pages].find((p) => p?.result && p.digital?.key !== key(p));
      if (!next) break;
      const k = key(next);
      render();
      try {
        const layout = sheetFor(next, s);
        const canvas = await reconstruct(next.result, targetSize(next.result, layout.page, PREVIEW_DPI), reconstructOpts(s));
        if (pages.includes(next)) next.digital = { key: k, canvas };
      } catch (err) {
        toast(err.message);
        next.digital = { key: k, canvas: null };
      }
      if (next.ocr?.state === 'waiting') runOcr();
      render();
    }
  } finally {
    working = false;
    render();
  }
}

// ---------- Texto (OCR) en cola, sobre la versión digital ----------

const wantsText = () => settings().selectable || $('dz-text-panel').open;

let reading = false;
async function runOcr() {
  if (reading || !wantsText()) return;
  reading = true;
  try {
    for (;;) {
      const page = pages.find((p) => p.ocr?.state === 'waiting' && p.digital?.canvas);
      if (!page) break;
      const lang = settings().lang in LANGUAGES ? settings().lang : 'spa';
      Object.assign(page.ocr, { state: 'reading', progress: 0, lang, version: page.version });
      render();
      try {
        const result = await recognize(page.digital.canvas, lang, (p) => {
          page.ocr.progress = p;
          if (pages[current] === page) renderStatus();
        });
        if (page.ocr.state !== 'reading' || page.ocr.version !== page.version) continue; // cambió mientras se leía
        Object.assign(page.ocr, { state: 'done', result, text: result.text });
      } catch (err) {
        Object.assign(page.ocr, { state: 'error', error: err.message });
      }
      render();
    }
  } finally {
    reading = false;
    render();
  }
}

function queueOcr(page) {
  page.ocr = { state: 'waiting', progress: 0, result: null, text: '', lang: settings().lang, version: page.version };
  runOcr();
}

// ---------- Interfaz ----------

function render() {
  const s = settings();
  const page = pages[current] ?? null;
  $('dz-empty').hidden = !!page;
  $('dz-drop').hidden = !page;
  $('dz-page').hidden = !page;
  $('dz-text-panel').hidden = !page;
  $('dz-lang-wrap').hidden = !s.selectable && !$('dz-text-panel').open;

  if (page) {
    const showPhoto = $('dz-view-photo').checked;
    const digital = page.digital?.canvas;
    if (showPhoto || !digital || !page.result) showPhotoView(page);
    else showSheetView(page, s, digital);
    const stale = !showPhoto && (!digital || page.digital.key !== `${page.version}|${styleKey(s)}|${s.paper}`);
    $('dz-busy').hidden = !(stale && page.result);
    $('dz-caption').textContent = `Página ${current + 1} de ${pages.length}`;

    const text = $('dz-text');
    if (document.activeElement !== text || text.dataset.page !== String(page.id)) {
      text.value = page.ocr?.text ?? '';
      text.dataset.page = String(page.id);
    }
    text.readOnly = page.ocr?.state !== 'done';
  }
  renderStatus();
  renderPages();

  const ready = pages.filter((p) => p.result);
  const stillWorking = busy || exporting || ready.length !== pages.length;
  for (const id of ['dz-export-pdf', 'dz-export-png']) $(id).disabled = stillWorking || !ready.length;
  const textReady = pages.length > 0 && pages.every((p) => p.ocr?.state === 'done');
  for (const id of ['dz-export-docx', 'dz-export-txt', 'dz-copy']) $(id).disabled = !textReady;

  const reading = pages.filter((p) => p.ocr && ['waiting', 'reading'].includes(p.ocr.state)).length;
  $('dz-export-hint').textContent = !pages.length
    ? 'Agrega fotos para empezar.'
    : stillWorking ? 'Procesando las fotos…'
      : s.selectable && reading ? `Reconociendo texto… faltan ${reading}. Si descargas ahora, esas páginas irán sin texto seleccionable.`
        : `${ready.length} ${ready.length === 1 ? 'página' : 'páginas'} · ${EXPORT_DPI} ppp, sin pérdida`;
}

// ---------- Vista previa ----------

/** La foto tal como se tomó (ya recortada). */
function showPhotoView(page) {
  const view = $('dz-view');
  let wrap = view.querySelector(':scope > [data-photo]');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.dataset.photo = '';
    wrap.innerHTML = `
      <div data-loading class="mx-auto flex aspect-[3/4] w-full max-w-xs flex-col items-center justify-center gap-3 bg-white text-sm text-ink-500 sheet-frame">
        <span class="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-lamp-600 dark:border-ink-700 dark:border-t-lamp-400"></span>
        <span>Procesando…</span>
      </div>
      <img alt="Foto original de la página" class="mx-auto block h-auto max-h-[42rem] w-auto max-w-full bg-white sheet-frame" hidden>`;
    const img = wrap.querySelector('img');
    // La foto solo se muestra cuando ya cargó; antes, la hoja de espera (sin ícono de imagen rota).
    img.addEventListener('load', () => {
      img.hidden = false;
      wrap.querySelector('[data-loading]').hidden = true;
    });
    view.replaceChildren(wrap);
  }
  const img = wrap.querySelector('img');
  if (!page.url || img.getAttribute('src') === page.url) return;
  img.hidden = true;
  wrap.querySelector('[data-loading]').hidden = false;
  img.src = page.url;
}

/**
 * La hoja completa con el tamaño elegido (carta, oficio, A4) y la página digitalizada en su lugar,
 * igual que en el PDF, con la capa de texto seleccionable encima.
 */
function showSheetView(page, s, digital) {
  const view = $('dz-view');
  const layout = sheetFor(page, s);
  const { page: size } = layout;
  const rect = layout.items[0];

  let sheet = view.querySelector(':scope > [data-sheet]');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.dataset.sheet = '';
    sheet.className = 'relative mx-auto bg-white sheet-frame';
    sheet.innerHTML = '<div class="absolute" data-rect><div class="text-layer" data-text></div></div>';
    view.replaceChildren(sheet);
  }
  // Tamaño en pantalla: ocupa el ancho disponible sin pasar de ~42rem de alto.
  const maxW = view.clientWidth || 600;
  const maxH = Math.min(672, window.innerHeight * 0.75);
  const w = Math.min(maxW, (maxH * size.w) / size.h);
  sheet.style.width = `${w}px`;
  sheet.style.height = `${(w * size.h) / size.w}px`;
  sheet.setAttribute('aria-label', `Hoja ${s.paper} con la página digitalizada`);

  const box = sheet.querySelector('[data-rect]');
  Object.assign(box.style, {
    left: `${(rect.x / size.w) * 100}%`, top: `${(rect.y / size.h) * 100}%`,
    width: `${(rect.w / size.w) * 100}%`, height: `${(rect.h / size.h) * 100}%`,
  });
  if (box.firstChild !== digital) {
    digital.className = 'block h-full w-full';
    digital.setAttribute('role', 'img');
    digital.setAttribute('aria-label', 'Página digitalizada');
    box.prepend(digital);
    for (const c of box.querySelectorAll(':scope > canvas')) if (c !== digital) c.remove();
  }
  renderTextLayer(box.querySelector('[data-text]'), page, (w * rect.w) / size.w);
}

const measureCtx = document.createElement('canvas').getContext('2d');

/**
 * Palabras reconocidas como texto transparente en su posición: se pueden seleccionar y copiar en la vista previa.
 * @param {HTMLElement} layer
 * @param {number} boxWidth  ancho en pantalla de la imagen
 */
function renderTextLayer(layer, page, boxWidth) {
  const ocr = page.ocr?.state === 'done' && page.ocr.version === page.version ? page.ocr.result : null;
  const key = ocr ? `${page.id}|${page.version}|${Math.round(boxWidth)}` : '';
  if (layer.dataset.key === key) return;
  layer.dataset.key = key;
  if (!ocr) return layer.replaceChildren();

  const k = boxWidth / ocr.width;
  const spans = [];
  for (const p of ocr.paragraphs) {
    for (const line of p.lines) {
      const size = Math.max(4, (line.bbox.y1 - line.bbox.y0) * k * 0.9);
      measureCtx.font = `${size}px Arial, "Liberation Sans", Helvetica, sans-serif`;
      line.words.forEach((word, i) => {
        const next = line.words[i + 1];
        const span = document.createElement('span');
        span.textContent = `${word.text} `;
        const target = ((next ? next.bbox.x0 : word.bbox.x1) - word.bbox.x0) * k;
        const natural = measureCtx.measureText(next ? span.textContent : word.text).width || 1;
        Object.assign(span.style, {
          left: `${word.bbox.x0 * k}px`,
          top: `${line.bbox.y0 * k}px`,
          fontSize: `${size}px`,
          transform: `scaleX(${target / natural})`,
        });
        spans.push(span);
      });
      // Salto de línea al copiar varios renglones.
      spans.push(document.createElement('br'));
    }
  }
  layer.replaceChildren(...spans);
}

function renderStatus() {
  const page = pages[current];
  const ocr = page?.ocr;
  $('dz-status').textContent = !page ? '' : !page.result ? 'Recortando…'
    : ocr?.state === 'reading' ? `Reconociendo texto… ${Math.round(ocr.progress * 100)} %` : '';
  const messages = {
    waiting: 'En espera…',
    reading: `Leyendo… ${Math.round((ocr?.progress ?? 0) * 100)} %`,
    done: ocr?.result ? `Confianza ${Math.round(ocr.result.confidence)} %` : 'Listo',
    error: ocr?.error ?? 'No se pudo leer',
  };
  $('dz-ocr-status').textContent = ocr ? messages[ocr.state] : wantsText() ? '' : 'Abre esta sección para reconocer el texto.';
}

function renderPages() {
  $('dz-pages-wrap').hidden = pages.length === 0;
  $('dz-left').disabled = busy || current === 0;
  $('dz-right').disabled = busy || current >= pages.length - 1;
  $('dz-delete').disabled = busy || exporting;
  $('dz-crop').disabled = busy || exporting || !pages[current]?.result;

  $('dz-pages').replaceChildren(...pages.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'shrink-0';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `block w-16 overflow-hidden rounded-md ring-2 transition focus:outline-none focus-visible:ring-lamp-500 ${
      i === current ? 'ring-lamp-500' : 'ring-transparent hover:ring-ink-300'
    }`;
    btn.setAttribute('aria-label', `Página ${i + 1}`);
    btn.setAttribute('aria-current', i === current ? 'true' : 'false');
    const thumb = document.createElement(p.url ? 'img' : 'div');
    thumb.className = 'aspect-[3/4] w-full bg-ink-100 object-cover dark:bg-ink-800';
    if (p.url) { thumb.src = p.url; thumb.alt = ''; } else thumb.classList.add('animate-pulse');
    const num = document.createElement('span');
    num.className = 'block bg-ink-100 py-0.5 text-center font-mono text-[10px] text-ink-600 dark:bg-ink-800 dark:text-ink-300';
    num.textContent = String(i + 1);
    btn.append(thumb, num);
    btn.addEventListener('click', () => {
      current = i;
      render();
      runDigitize();
    });
    li.append(btn);
    return li;
  }));
}

// ---------- Fotos ----------

function adopt(image) {
  image.version = 1;
  image.digital = null;
  queueOcr(image);
}

async function addFiles(files) {
  if (busy) return toast('Espera a que termine de procesar las fotos anteriores.');
  busy = true;
  const confirm = files.length === 1;
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
      adopt(image);
      runDigitize();
    }
  } finally {
    busy = false;
    render();
  }
}

function move(delta) {
  const to = current + delta;
  if (to < 0 || to >= pages.length) return;
  [pages[current], pages[to]] = [pages[to], pages[current]];
  current = to;
  render();
}

// ---------- Exportación ----------

/** Hoja final a 300 ppp: la página digitalizada sobre papel blanco, en su lugar dentro de la hoja. */
async function exportSheet(page, s) {
  const layout = sheetFor(page, s);
  const rect = layout.items[0];
  const k = EXPORT_DPI / 25.4;
  const digital = await reconstruct(page.result, { w: rect.w * k, h: rect.h * k }, reconstructOpts(s));
  const sheet = document.createElement('canvas');
  sheet.width = Math.round(layout.page.w * k);
  sheet.height = Math.round(layout.page.h * k);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.drawImage(digital, Math.round(rect.x * k), Math.round(rect.y * k));
  digital.width = digital.height = 0;
  return { layout, rect, sheet };
}

async function exportPdf() {
  const s = settings();
  exporting = true;
  render();
  const done = status('Digitalizando a 300 ppp…');
  let finished = 0;
  try {
    // Varias páginas a la vez: la digitalización (2 hilos) y la compresión (grupo de hilos) en paralelo.
    const out = await mapLimit(pages, THREADS, async (page) => {
      const { layout, rect, sheet } = await exportSheet(page, s);
      // Sin tinta de color, la imagen va en gris de un canal: un tercio del tamaño.
      const image = await flate(sheet, !s.inkColor);
      sheet.width = sheet.height = 0;
      finished++;
      if (pages.length > 1) done.update(`Digitalizando a 300 ppp… ${finished} de ${pages.length}`);
      const ocr = s.selectable && page.ocr?.state === 'done' && page.ocr.version === page.version ? page.ocr.result : null;
      return { ...image, flate: image, wMm: layout.page.w, hMm: layout.page.h, ops: ocr ? invisibleTextOps(ocr, rect, layout.page) : undefined };
    });
    download(buildPdf(out, { title: 'Documento digitalizado' }), fileName('documento-digitalizado', 'pdf'));
  } catch (err) {
    console.error(err);
    toast('No se pudo generar el PDF. Si son muchas páginas, prueba con menos.');
  } finally {
    done();
    exporting = false;
    render();
  }
}

async function exportPng() {
  const s = settings();
  exporting = true;
  render();
  const done = status('Generando imágenes a 300 ppp…');
  try {
    const blobs = await mapLimit(pages, THREADS, async (page) => {
      const { sheet } = await exportSheet(page, s);
      const blob = await new Promise((r) => sheet.toBlob(r, 'image/png'));
      sheet.width = sheet.height = 0;
      return blob;
    });
    blobs.forEach((blob, i) => download(blob, fileName(pages.length > 1 ? `documento-digitalizado-p${i + 1}` : 'documento-digitalizado', 'png')));
  } finally {
    done();
    exporting = false;
    render();
  }
}

const texts = () => pages.filter((p) => p.ocr?.state === 'done').map((p) => p.ocr.text);
const sections = () => texts().map(parseBlocks);

async function copyText() {
  const text = texts().map((t) => t.trim()).filter(Boolean).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Texto copiado.', 'info');
  } catch {
    $('dz-text').focus();
    $('dz-text').select();
    toast('No se pudo copiar automáticamente; selecciona el texto y cópialo.', 'info');
  }
}

// ---------- Eventos ----------

for (const id of ['dz-files', 'dz-camera']) {
  $(id).addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
}
$('dz-shoot').addEventListener('click', async () => {
  if (busy) return toast('Espera a que termine de procesar las fotos anteriores.');
  if (!cameraSupported()) {
    if (matchMedia('(pointer: coarse)').matches) return $('dz-camera').click();
    return toast('La cámara solo funciona en sitios con HTTPS y en dispositivos con cámara.');
  }
  try {
    const files = await openCamera({ hint: 'Encuadra la hoja completa, de frente, con buena luz y sin reflejos.' });
    if (files.length) addFiles(files);
  } catch (err) {
    toast(err.message);
  }
});
for (const radio of document.querySelectorAll('input[name="dz-view"]')) radio.addEventListener('change', render);
$('dz-text').addEventListener('input', (e) => {
  const page = pages.find((p) => String(p.id) === e.target.dataset.page);
  if (page?.ocr?.state === 'done') page.ocr.text = e.target.value;
});
$('dz-text-panel').addEventListener('toggle', () => {
  runOcr();
  render();
});
$('dz-left').addEventListener('click', () => move(-1));
$('dz-right').addEventListener('click', () => move(1));
$('dz-delete').addEventListener('click', () => {
  const [removed] = pages.splice(current, 1);
  if (removed?.ocr) removed.ocr.state = 'error';
  releaseImage(removed);
  current = Math.max(0, Math.min(current, pages.length - 1));
  render();
});
$('dz-crop').addEventListener('click', async () => {
  const page = pages[current];
  if (page && await adjustCrop(page, 'document')) {
    page.version++;
    queueOcr(page); // el recorte cambió: se vuelve a digitalizar y a leer
    runDigitize();
    render();
  }
});
$('dz-export-pdf').addEventListener('click', exportPdf);
$('dz-export-png').addEventListener('click', exportPng);
$('dz-export-docx').addEventListener('click', () => download(buildDocx(sections(), pageSize(settings().paper, false)), fileName('documento-digitalizado', 'docx')));
$('dz-export-txt').addEventListener('click', () => download(new Blob([texts().join('\n\n').replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), fileName('documento-digitalizado', 'txt')));
$('dz-copy').addEventListener('click', copyText);
onDropImages($('dz-drop'), addFiles);
onDropImages($('dz-empty'), addFiles);
document.addEventListener('paste', (e) => {
  if (form.closest('[data-view]')?.hidden) return; // solo la sección visible recibe lo que se pega
  if (e.target === $('dz-text')) return;
  const files = imageFilesFrom(e.clipboardData);
  if (files.length) addFiles(files);
});

form.addEventListener('change', (e) => {
  if (e.target.name === 'lang') {
    const stale = pages.filter((p) => p.ocr && p.ocr.lang !== e.target.value && p.ocr.state !== 'reading');
    stale.forEach(queueOcr);
    warmUpOcr(e.target.value);
  }
  if (e.target.name === 'selectable') runOcr();
  // Enderezar mueve las palabras de lugar: el texto reconocido ya no coincide y se vuelve a leer.
  if (e.target.name === 'straighten') pages.filter((p) => p.ocr && p.ocr.state !== 'reading').forEach(queueOcr);
});
new ResizeObserver(() => render()).observe($('dz-view'));
persistForm(form, 'scanner.digitize.settings');
form.addEventListener('input', () => {
  render();
  runDigitize(); // estilo, grosor, fotos o tamaño de hoja: se recalcula la vista
});
render();
warmUpDetector();
if (settings().selectable) warmUpOcr(settings().lang);
