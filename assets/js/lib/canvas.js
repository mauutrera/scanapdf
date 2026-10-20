// Lienzos que funcionan igual en la página y dentro de un worker: así el mismo código de imagen (enderezar,
// limpiar, componer la hoja) corre en el hilo principal o en el grupo de hilos sin cambios.

const inWorker = typeof document === 'undefined';

/** Canvas de w × h: OffscreenCanvas en un worker, <canvas> en la página. */
export function makeCanvas(w, h) {
  const width = Math.max(1, Math.round(w)), height = Math.max(1, Math.round(h));
  if (inWorker) return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** Copia una imagen (canvas, ImageBitmap…) a un canvas nuevo del mismo tamaño o del tamaño pedido. */
export function canvasFrom(src, w = src.width, h = src.height) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
