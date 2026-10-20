import { ID1, PAPERS, formatMm } from '../lib/paper.js';
import { credentialLayout } from '../lib/layout.js';
import { composePage, previewDpi } from '../lib/compose.js';
import { prepareClean, cleanedNow } from '../lib/threads.js';
import { exportSheets } from '../lib/export.js';
import { loadImage, releaseImage, onDropImages } from '../lib/images.js';
import { processNew, adjustCrop } from '../lib/scan.js';
import { warmUpDetector } from '../lib/detect.js';
import { cameraSupported, openCamera } from '../lib/camera.js';
import { readForm, persistForm, toast } from '../lib/form.js';

const $ = (id) => document.getElementById(id);
const form = $('cred-settings');
const LABELS = { front: 'Frente', back: 'Reverso' };
const EXPORT_DPI = 300;
const slotEl = (attr, slot) => document.querySelector(`[data-${attr}="${slot}"]`);

/** @type {{front: import('../lib/images.js').ScanImage|null, back: import('../lib/images.js').ScanImage|null}} */
const images = { front: null, back: null };
let busy = false;

/** Layout y opciones de composición con los ajustes actuales. */
function sheet() {
  const s = readForm(form);
  const layout = credentialLayout(s);
  const options = {
    // Versión limpia (se calcula en el grupo de hilos); mientras no esté lista, la foto recortada.
    sourceFor: (slot) => (s.clean ? cleanedNow(images[slot]) ?? images[slot]?.result : images[slot]?.result) ?? null,
    labelFor: (slot) => (images[slot] ? 'Procesando…' : LABELS[slot]),
    style: s.style,
    edge: s.edge,
    look: s.look,
  };
  return { s, layout, options };
}

// Agrupa cambios seguidos (p. ej. al mover varios ajustes) en un solo dibujado.
let timer = 0;
function render() {
  clearTimeout(timer);
  timer = setTimeout(draw, 16);
}

/**
 * Botones transparentes sobre cada tarjeta de la vista previa: al tocar "Frente" o "Reverso" se elige su foto
 * (o se cambia, si ya tiene una).
 */
function slotButtons(layout) {
  const { page } = layout;
  return layout.items.map((item) => {
    const slot = item.slot;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'absolute rounded-[4%] transition hover:bg-lamp-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-lamp-500';
    btn.setAttribute('aria-label', `${images[slot] ? 'Cambiar' : 'Elegir'} foto del ${LABELS[slot].toLowerCase()}`);
    btn.title = btn.getAttribute('aria-label');
    Object.assign(btn.style, {
      left: `${(item.x / page.w) * 100}%`, top: `${(item.y / page.h) * 100}%`,
      width: `${(item.w / page.w) * 100}%`, height: `${(item.h / page.h) * 100}%`,
    });
    btn.disabled = busy;
    btn.addEventListener('click', () => $(`file-${slot}`).click());
    return btn;
  });
}

function draw() {
  const { s, layout, options } = sheet();
  // Limpieza pendiente: se pide al grupo de hilos y se vuelve a dibujar cuando termine.
  if (s.clean) {
    for (const img of Object.values(images)) if (img?.result && !cleanedNow(img)) prepareClean(img, 'card').then(render);
  }
  const container = $('cred-preview');
  const canvas = composePage(layout, { ...options, dpi: previewDpi(container, layout.page.w) });
  canvas.className = 'block h-auto w-full sheet-frame';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Vista previa de la hoja');
  container.replaceChildren(canvas, ...slotButtons(layout));

  const factor = Number(s.scale) || 1;
  const scale = factor === 1 ? 'tarjetas a tamaño real' : `tarjetas ampliadas al ${factor * 100} %`;
  $('cred-caption').textContent = `${PAPERS[s.paper].label} · ${formatMm(layout.page.w)} × ${formatMm(layout.page.h)} mm · ${scale}`;
  $('arrangement-hint').hidden = layout.sideFits;
  $('cred-arrangement-side').disabled = !layout.sideFits;

  for (const slot of Object.keys(images)) {
    const url = images[slot]?.url ?? null;
    const thumb = slotEl('thumb', slot);
    thumb.hidden = !url;
    if (url) thumb.src = url;
    slotEl('empty', slot).hidden = !!url;
    slotEl('actions', slot).hidden = !url || busy;
  }

  const ready = Object.values(images).filter((i) => i?.result).length;
  $('cred-swap').hidden = ready === 0 || busy;
  for (const id of ['cred-export-pdf', 'cred-export-jpg']) $(id).disabled = busy || ready === 0;
  $('cred-export-hint').textContent = ready === 0
    ? 'Agrega al menos una foto para descargar.'
    : ready === 1 ? 'Falta una cara; se descargará solo la que agregaste.' : `Se genera a ${EXPORT_DPI} ppp.`;
}

async function setImage(slot, file) {
  if (busy) return toast('Espera a que termine de procesar la foto anterior.');
  busy = true;
  try {
    const image = await loadImage(file);
    releaseImage(images[slot]);
    images[slot] = image;
    render();
    await processNew(image, 'card', { confirm: true });
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
    render();
  }
}

async function exportAs(format) {
  if (readForm(form).clean) await Promise.all(Object.values(images).filter(Boolean).map((img) => prepareClean(img, 'card')));
  const { layout, options } = sheet();
  await exportSheets([{ layout, options }], { format, dpi: EXPORT_DPI, prefix: 'credencial', title: 'Credencial' });
}

for (const slot of Object.keys(images)) {
  for (const id of [`file-${slot}`, `camera-${slot}`]) {
    $(id).addEventListener('change', (e) => {
      if (e.target.files[0]) setImage(slot, e.target.files[0]);
      e.target.value = '';
    });
  }
  // Soltar dos fotos a la vez en un espacio llena frente y reverso.
  onDropImages($(`slot-${slot}`), async ([first, second]) => {
    await setImage(slot, first);
    if (second) await setImage(slot === 'front' ? 'back' : 'front', second);
  });
  slotEl('remove', slot).addEventListener('click', () => {
    releaseImage(images[slot]);
    images[slot] = null;
    render();
  });
  slotEl('crop', slot).addEventListener('click', async () => {
    if (images[slot] && await adjustCrop(images[slot], 'card')) render();
  });
}

/**
 * Toma fotos con la cámara para los espacios indicados, en orden.
 * Sin cámara en la página (p. ej. sin HTTPS), en el celular usa la app de cámara del sistema para el primero.
 */
async function shoot(slots) {
  if (busy) return toast('Espera a que termine de procesar la foto anterior.');
  if (!cameraSupported()) {
    if (matchMedia('(pointer: coarse)').matches) return $(`camera-${slots[0]}`).click();
    return toast('La cámara solo funciona en sitios con HTTPS y en dispositivos con cámara.');
  }
  try {
    const files = await openCamera({
      max: slots.length,
      labels: slots.map((s) => LABELS[s]),
      hint: 'Coloca la credencial dentro del recuadro, sobre un fondo oscuro.',
      aspect: ID1.w / ID1.h,
    });
    for (const [i, file] of files.entries()) await setImage(slots[i], file);
  } catch (err) {
    toast(err.message);
  }
}

$('cred-shoot-both').addEventListener('click', () => shoot(['front', 'back']));
for (const btn of document.querySelectorAll('[data-shoot]')) {
  btn.addEventListener('click', () => shoot([btn.dataset.shoot]));
}

$('cred-swap').addEventListener('click', () => {
  [images.front, images.back] = [images.back, images.front];
  render();
});
$('cred-export-pdf').addEventListener('click', () => exportAs('pdf'));
$('cred-export-jpg').addEventListener('click', () => exportAs('jpg'));

persistForm(form, 'scanner.credential.settings');
form.addEventListener('input', render);
new ResizeObserver(render).observe($('cred-preview'));
document.fonts?.ready.then(render);
render();
// Descarga OpenCV en segundo plano mientras eliges las fotos.
warmUpDetector();
