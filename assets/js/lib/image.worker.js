// Worker de imagen: enderezar, limpiar, componer hojas y comprimir, fuera del hilo principal.
// Usa el mismo código que la página (geometry, enhance, compose, pdf) con OffscreenCanvas.
import { warpQuad } from './geometry.js';
import { enhanceDocument, enhanceCard } from './enhance.js';
import { composePage } from './compose.js';
import { flateImage } from './pdf.js';
import { canvasFrom } from './canvas.js';

const toBitmap = (canvas) => canvas.transferToImageBitmap();

const ops = {
  /** Endereza la región `quad` de la foto a un rectángulo w × h. */
  warp({ bitmap, quad, w, h }) {
    const src = canvasFrom(bitmap);
    bitmap.close();
    const out = toBitmap(warpQuad(src, quad, w, h));
    return { result: { bitmap: out }, transfer: [out] };
  },

  /** Limpieza: documento (fondo blanco y parejo) o tarjeta (balance de blancos). */
  enhance({ bitmap, kind }) {
    const src = canvasFrom(bitmap);
    bitmap.close();
    const out = toBitmap(kind === 'card' ? enhanceCard(src) : enhanceDocument(src));
    return { result: { bitmap: out }, transfer: [out] };
  },

  /** Compone una hoja completa y la entrega codificada (JPEG para el PDF o la descarga). */
  async compose({ layout, options, dpi, sources, encode }) {
    const canvas = composePage(layout, {
      ...options,
      dpi,
      sourceFor: (slot) => sources[slot] ?? null,
      labelFor: () => '',
      guides: false,
    });
    for (const b of Object.values(sources)) b?.close?.();
    const blob = await canvas.convertToBlob(encode);
    return { result: { blob, width: canvas.width, height: canvas.height }, transfer: [] };
  },

  /** Píxeles sin pérdida comprimidos con zlib para el PDF (FlateDecode). */
  async flate({ bitmap, gray }) {
    const src = canvasFrom(bitmap);
    bitmap.close();
    const image = await flateImage(src, gray);
    return { result: image, transfer: [image.data.buffer] };
  },
};

self.onmessage = async ({ data }) => {
  const { id, op, ...args } = data;
  try {
    const { result, transfer } = await ops[op](args);
    self.postMessage({ id, ...result }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
