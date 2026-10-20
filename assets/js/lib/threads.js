// Trabajo de imagen en el grupo de hilos (image.worker.js). Cada función devuelve lo mismo que su versión
// directa; si el navegador no tiene OffscreenCanvas (Safari antiguo) o un hilo falla, se hace en el hilo principal.
import { WorkerPool, THREADS } from './pool.js';
import { warpQuad } from './geometry.js';
import { enhanceDocument, enhanceCard } from './enhance.js';
import { composePage } from './compose.js';
import { flateImage } from './pdf.js';
import { canvasFrom } from './canvas.js';

export { THREADS };

const threaded = typeof Worker !== 'undefined'
  && typeof OffscreenCanvas !== 'undefined'
  && typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  && typeof OffscreenCanvas.prototype.convertToBlob === 'function';

let pool = null;
const getPool = () => (pool ??= new WorkerPool(new URL('./image.worker.js', import.meta.url)));

/** Ejecuta `op` en un hilo; si falla, usa `fallback()` en el hilo principal. */
async function onThread(payload, transfer, fallback) {
  if (!threaded) return fallback();
  try {
    return await getPool().run(payload, transfer);
  } catch (err) {
    console.warn(`Tarea "${payload.op}" en el hilo principal:`, err.message);
    return fallback();
  }
}

const bitmapToCanvas = (bmp) => {
  const c = canvasFrom(bmp);
  bmp.close();
  return c;
};

/** Endereza la región `quad` de `src` a w × h px. */
export async function warp(src, quad, w, h) {
  const bitmap = threaded ? await createImageBitmap(src) : null;
  const res = await onThread({ op: 'warp', bitmap, quad, w, h }, bitmap ? [bitmap] : [], () => ({ canvas: warpQuad(src, quad, w, h) }));
  return res.canvas ?? bitmapToCanvas(res.bitmap);
}

/** Limpieza de documento o tarjeta. */
export async function enhance(src, kind) {
  const bitmap = threaded ? await createImageBitmap(src) : null;
  const res = await onThread({ op: 'enhance', bitmap, kind }, bitmap ? [bitmap] : [],
    () => ({ canvas: kind === 'card' ? enhanceCard(src) : enhanceDocument(src) }));
  return res.canvas ?? bitmapToCanvas(res.bitmap);
}

/**
 * Compone una hoja y la devuelve codificada.
 * @param {object} layout
 * @param {object} options  opciones de composePage; sourceFor(slot) da la imagen de cada espacio
 * @param {number} dpi
 * @param {{type: string, quality?: number}} encode
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
export async function composeEncoded(layout, options, dpi, encode) {
  const { sourceFor, labelFor, ...plain } = options; // las funciones no viajan a otro hilo
  const direct = async () => {
    const canvas = composePage(layout, { ...options, dpi, labelFor: () => '', guides: false });
    const blob = await new Promise((r) => canvas.toBlob(r, encode.type, encode.quality));
    return { blob, width: canvas.width, height: canvas.height };
  };
  if (!threaded) return direct();
  const sources = {};
  const transfer = [];
  for (const item of layout.items) {
    const src = sourceFor?.(item.slot);
    if (src && !(item.slot in sources)) {
      sources[item.slot] = await createImageBitmap(src);
      transfer.push(sources[item.slot]);
    }
  }
  return onThread({ op: 'compose', layout, options: plain, dpi, sources, encode }, transfer, direct);
}

/** Píxeles sin pérdida para el PDF (ver pdf.flateImage). */
export async function flate(canvas, gray) {
  const bitmap = threaded ? await createImageBitmap(canvas) : null;
  return onThread({ op: 'flate', bitmap, gray }, bitmap ? [bitmap] : [], () => flateImage(canvas, gray));
}

/**
 * Ejecuta `fn` sobre cada elemento con, como mucho, `limit` a la vez, conservando el orden de los resultados.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

// ---------- Versión limpia de cada foto (en segundo plano, guardada por foto) ----------

/**
 * Empieza (o reutiliza) la limpieza de una foto ya recortada. Se invalida sola cuando cambia el recorte.
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export function prepareClean(image, kind) {
  if (!image?.result) return Promise.resolve(null);
  if (image._clean?.source === image.result) return image._clean.promise;
  const entry = { source: image.result, canvas: null };
  entry.promise = enhance(image.result, kind).then((canvas) => {
    if (image._clean === entry) entry.canvas = canvas;
    return canvas;
  });
  image._clean = entry;
  return entry.promise;
}

/** La versión limpia si ya está lista (si no, null: se muestra la foto recortada mientras tanto). */
export function cleanedNow(image) {
  return image?._clean && image._clean.source === image.result ? image._clean.canvas : null;
}
