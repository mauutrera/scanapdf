// Reconstrucción digital de un documento fotografiado (el trabajo pesado está en reconstruct.worker.js).
// Corre en un grupo de hilos: varias páginas se digitalizan a la vez.
import { MM_PER_INCH } from './paper.js';
import { WorkerPool, THREADS } from './pool.js';
import { canvasFrom } from './canvas.js';

// Cada página a 300 ppp ocupa varios cientos de MB mientras se procesa: como mucho dos a la vez.
const pool = new WorkerPool(new URL('./reconstruct.worker.js', import.meta.url), Math.min(2, THREADS));

/**
 * Tamaño de trabajo: el que tendría la imagen al ocupar la hoja a cierta resolución.
 * @param {HTMLCanvasElement} src
 * @param {{w:number,h:number}} page  hoja (mm), ya con la orientación que usará la imagen
 * @param {number} dpi
 */
export function targetSize(src, page, dpi) {
  const aspect = src.width / src.height;
  const pw = (page.w / MM_PER_INCH) * dpi, ph = (page.h / MM_PER_INCH) * dpi;
  return aspect > pw / ph ? { w: pw, h: pw / aspect } : { w: ph * aspect, h: ph };
}

/**
 * @param {HTMLCanvasElement} src  recorte enderezado de la página
 * @param {{w:number,h:number}} size  tamaño de salida en px (ampliar antes de limpiar deja el texto más fino)
 * @param {{mode:'bw'|'gray', weight:number, inkColor:boolean, straighten:boolean}} opts
 * @returns {Promise<HTMLCanvasElement>}  con `info` (nivel del papel, enderezado aplicado) para revisar resultados
 */
export async function reconstruct(src, size, opts) {
  const input = canvasFrom(src, size.w, size.h);
  const image = input.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, input.width, input.height);
  input.width = input.height = 0; // libera memoria
  let data;
  try {
    data = await pool.run({ image, opts }, [image.data.buffer]);
  } catch (err) {
    throw new Error(/memoria|memory/i.test(err.message)
      ? 'El proceso de digitalización se quedó sin memoria. Intenta con una foto más pequeña.'
      : `No se pudo digitalizar la página: ${err.message}`);
  }
  const c = document.createElement('canvas');
  c.width = data.image.width;
  c.height = data.image.height;
  c.getContext('2d').putImageData(data.image, 0, 0);
  c.info = data.info;
  return c;
}
