// Modo PDF: da apariencia de escaneo a un PDF digital, página por página.
import { formatMm } from '../lib/paper.js';
import { composePage, previewDpi } from '../lib/compose.js';
import { exportSheets } from '../lib/export.js';
import { openPdf, renderPdfPage } from '../lib/pdfdoc.js';
import { readForm, persistForm, status, toast } from '../lib/form.js';

const $ = (id) => document.getElementById(id);
const form = $('pdf-settings');
const THUMB_DPI = 18;
const MAX_THUMBS = 120;

/** @type {{doc:any, name:string, pages:{w:number,h:number}[]}|null} */
let pdf = null;
let current = 0;     // índice de página (0 = primera)
let busy = false;
const baseCache = new Map(); // "página@dpi" -> canvas sin efecto, para recomponer al cambiar ajustes

function settings() {
  const f = readForm(form);
  return { ...f, dpi: Number(f.dpi) || 200 };
}

/** Hoja de una página del PDF: ocupa toda la página, a su tamaño original. */
function sheetFor(index, s) {
  const size = pdf.pages[index];
  return {
    layout: { page: size, box: null, items: [{ x: 0, y: 0, w: size.w, h: size.h, radius: 0, slot: index }] },
    options: {
      sourceFor: () => null,
      style: s.style,
      look: 'scan',
      scan: { level: s.level, seed: index + 1, skew: !!s.skew },
    },
    render: (dpi) => renderPdfPage(pdf.doc, index + 1, dpi),
  };
}

/** Interpreta "1-3, 5, 8-" (1 = primera página). Devuelve índices 0-based o un error legible. */
function parseRange(text, total) {
  const value = text.trim();
  if (!value) return { pages: [...Array(total).keys()] };
  const pages = new Set();
  for (const part of value.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)?(?:(-)(\d+)?)?$/);
    if (!m || (!m[1] && !m[3])) return { error: `No entiendo "${part}". Usa números y guiones, p. ej. 1-3, 5.` };
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : total) : from;
    if (from < 1 || to > total || from > to) return { error: `"${part}" está fuera de las ${total} páginas.` };
    for (let p = from; p <= to; p++) pages.add(p - 1);
  }
  return { pages: [...pages].sort((a, b) => a - b) };
}

// Agrupa cambios seguidos en un solo dibujado.
let timer = 0;
let drawToken = 0;
function render() {
  clearTimeout(timer);
  timer = setTimeout(draw, 30);
}

async function draw() {
  const s = settings();
  $('pdf-empty').hidden = !!pdf;
  $('pdf-loaded').hidden = !pdf;

  const range = pdf ? parseRange(s.range ?? '', pdf.pages.length) : { pages: [] };
  $('pdf-range-hint').textContent = range.error ?? (pdf && range.pages.length !== pdf.pages.length
    ? `Se incluirán ${range.pages.length} de ${pdf.pages.length} páginas.`
    : 'Déjalo vacío para incluir todas.');
  $('pdf-range-hint').classList.toggle('text-red-600', !!range.error);

  const ready = pdf && !range.error && range.pages.length > 0;
  for (const id of ['pdf-export-pdf', 'pdf-export-jpg']) $(id).disabled = busy || !ready;
  $('pdf-export-hint').textContent = !pdf
    ? 'Elige un PDF para empezar.'
    : ready ? `${range.pages.length} ${range.pages.length === 1 ? 'página' : 'páginas'} · ${s.dpi} ppp` : 'Revisa el rango de páginas.';

  if (!pdf) return;
  const size = pdf.pages[current];
  $('pdf-caption').textContent = `Página ${current + 1} de ${pdf.pages.length} · ${formatMm(size.w)} × ${formatMm(size.h)} mm`;
  $('pdf-prev').disabled = current === 0;
  $('pdf-next').disabled = current >= pdf.pages.length - 1;
  markThumb();

  const container = $('pdf-preview');
  const landscape = size.w > size.h;
  container.classList.toggle('max-w-sm', !landscape);
  container.classList.toggle('max-w-lg', landscape);

  // La base (página sin efecto) se renderiza una vez por página y resolución; los ajustes solo recomponen.
  const token = ++drawToken;
  const dpi = Math.round(previewDpi(container, size.w));
  const key = `${current}@${dpi}`;
  let base = baseCache.get(key);
  if (!base) {
    base = await renderPdfPage(pdf.doc, current + 1, dpi);
    if (baseCache.size > 12) baseCache.delete(baseCache.keys().next().value);
    baseCache.set(key, base);
  }
  if (token !== drawToken) return; // llegó otro cambio mientras se renderizaba

  const sheet = sheetFor(current, s);
  const canvas = composePage(sheet.layout, { ...sheet.options, sourceFor: () => base, dpi });
  canvas.className = 'block h-auto w-full sheet-frame';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Vista previa de la página ${current + 1}`);
  container.replaceChildren(canvas);
}

function markThumb() {
  for (const btn of $('pdf-thumbs').querySelectorAll('button')) {
    const on = Number(btn.dataset.index) === current;
    btn.classList.toggle('ring-lamp-500', on);
    btn.classList.toggle('ring-transparent', !on);
    btn.setAttribute('aria-current', on ? 'true' : 'false');
  }
}

/** Miniaturas en segundo plano, una por una, sin bloquear la interfaz. */
async function buildThumbs(doc, total) {
  const list = $('pdf-thumbs');
  list.replaceChildren();
  list.hidden = total < 2;
  for (let i = 0; i < Math.min(total, MAX_THUMBS); i++) {
    if (pdf?.doc !== doc) return; // se cargó otro archivo
    const li = document.createElement('li');
    li.className = 'shrink-0';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.index = String(i);
    btn.className = 'block w-14 overflow-hidden rounded-md bg-white ring-2 ring-transparent transition hover:ring-ink-300 focus:outline-none focus-visible:ring-lamp-500';
    btn.setAttribute('aria-label', `Página ${i + 1}`);
    btn.addEventListener('click', () => {
      current = i;
      render();
    });
    const thumb = await renderPdfPage(doc, i + 1, THUMB_DPI);
    thumb.className = 'block h-auto w-full';
    const num = document.createElement('span');
    num.className = 'block bg-ink-100 py-0.5 text-center font-mono text-[10px] text-ink-600 dark:bg-ink-800 dark:text-ink-300';
    num.textContent = String(i + 1);
    btn.append(thumb, num);
    li.append(btn);
    list.append(li);
    markThumb();
  }
}

async function loadFile(file) {
  if (busy) return;
  busy = true;
  const done = status('Abriendo PDF…');
  try {
    const opened = await openPdf(file);
    await pdf?.doc.destroy();
    baseCache.clear();
    pdf = opened;
    current = 0;
    $('pdf-range').value = ''; // el rango anterior era de otro archivo
    $('pdf-name').textContent = pdf.name;
    const n = pdf.pages.length;
    $('pdf-meta').textContent = `${n} ${n === 1 ? 'página' : 'páginas'}`;
    buildThumbs(pdf.doc, n);
  } catch (err) {
    toast(err.message);
  } finally {
    done();
    busy = false;
    render();
  }
}

async function exportAs(format) {
  const s = settings();
  const { pages, error } = parseRange(s.range ?? '', pdf.pages.length);
  if (error) return toast(error);
  if (format === 'jpg' && pages.length > 10) {
    toast(`Se descargarán ${pages.length} imágenes por separado.`, 'info');
  }
  busy = true;
  render();
  try {
    const base = pdf.name.replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'documento';
    await exportSheets(pages.map((i) => sheetFor(i, s)), { format, dpi: s.dpi, prefix: `${base}-escaneado`, title: pdf.name });
  } finally {
    busy = false;
    render();
  }
}

$('pdf-file').addEventListener('change', (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
  e.target.value = '';
});
// Arrastrar un PDF a la zona vacía o sobre la vista previa.
for (const el of [$('pdf-empty'), $('pdf-drop')]) {
  for (const type of ['dragenter', 'dragover']) {
    el.addEventListener(type, (e) => {
      e.preventDefault();
      el.dataset.dragging = 'true';
    });
  }
  el.addEventListener('dragleave', () => delete el.dataset.dragging);
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    delete el.dataset.dragging;
    const file = [...(e.dataTransfer?.files ?? [])][0];
    if (file) loadFile(file);
  });
}
$('pdf-prev').addEventListener('click', () => {
  current = Math.max(0, current - 1);
  render();
});
$('pdf-next').addEventListener('click', () => {
  current = Math.min(pdf.pages.length - 1, current + 1);
  render();
});
$('pdf-export-pdf').addEventListener('click', () => exportAs('pdf'));
$('pdf-export-jpg').addEventListener('click', () => exportAs('jpg'));

persistForm(form, 'scanner.pdf.settings');
form.addEventListener('input', render);
new ResizeObserver(render).observe($('pdf-preview'));
render();
