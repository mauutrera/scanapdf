// Flujo de recorte de una foto: detectar → (confirmar en el editor) → enderezar.
import { detectQuad } from './detect.js';
import { editCorners } from './editor.js';
import { fullQuad, quadSize } from './geometry.js';
import { warp } from './threads.js';
import { setResult } from './images.js';
import { ID1, MM_PER_INCH } from './paper.js';
import { status } from './form.js';

const DOC_MAX_SIDE = 2400; // px del recorte de un documento (≈ 220 ppp en carta)
const CARD_DPI = 300;

const PROFILES = {
  document: {
    hint: 'Arrastra cada esquina al borde de la hoja.',
    aspect: null,
    size(quad) {
      const { w, h } = quadSize(quad);
      const s = Math.min(1, DOC_MAX_SIDE / Math.max(w, h));
      return { w: w * s, h: h * s };
    },
  },
  card: {
    hint: 'Arrastra cada esquina al borde de la tarjeta. Si las esquinas son redondas, sigue la línea recta de los lados.',
    aspect: ID1.w / ID1.h,
    // La tarjeta siempre sale horizontal: si la foto está vertical, uno de los lados largos pasa a ser el de arriba.
    normalize(quad) {
      const { w, h } = quadSize(quad);
      return w >= h ? quad : [quad[3], quad[0], quad[1], quad[2]];
    },
    size() {
      return { w: (ID1.w / MM_PER_INCH) * CARD_DPI, h: (ID1.h / MM_PER_INCH) * CARD_DPI };
    },
  },
};

async function detectWithStatus(canvas, profile) {
  const done = status('Buscando el borde…');
  try {
    return await detectQuad(canvas, { aspect: profile.aspect });
  } finally {
    done();
  }
}

/** Aplica un recorte a la imagen y genera su resultado enderezado. */
async function applyCrop(image, quad, profile) {
  image.quad = quad;
  const target = profile.normalize ? profile.normalize(quad) : quad;
  const { w, h } = profile.size(target);
  await setResult(image, await warp(image.canvas, target, w, h)); // en el grupo de hilos
}

/**
 * Procesa una foto recién agregada.
 * @param {import('./images.js').ScanImage} image
 * @param {keyof PROFILES} kind
 * @param {{confirm: boolean}} opts  confirm: abrir el editor para revisar el recorte
 */
export async function processNew(image, kind, { confirm }) {
  const profile = PROFILES[kind];
  const found = await detectWithStatus(image.canvas, profile);
  image.detected = !!found;
  let quad = found ?? fullQuad(image.canvas.width, image.canvas.height);

  if (confirm) {
    const edited = await openEditor(image, quad, profile);
    if (edited) quad = edited;
  }
  await applyCrop(image, quad, profile);
}

/** Abre el editor sobre una imagen ya procesada y aplica el cambio. Devuelve true si cambió. */
export async function adjustCrop(image, kind) {
  const profile = PROFILES[kind];
  const quad = image.quad ?? fullQuad(image.canvas.width, image.canvas.height);
  const edited = await openEditor(image, quad, profile);
  if (!edited) return false;
  await applyCrop(image, edited, profile);
  return true;
}

async function openEditor(image, quad, profile) {
  const res = await editCorners({
    canvas: image.canvas,
    quad,
    hint: profile.hint,
    detect: (c) => detectQuad(c, { aspect: profile.aspect }),
  });
  if (!res) return null;
  image.canvas = res.canvas; // pudo girarse
  return res.quad;
}
