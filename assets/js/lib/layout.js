// Cálculo de la composición de cada hoja, en milímetros. Funciones puras: las usan la vista
// previa y la exportación, para que lo que ves sea lo que se genera.
import { ID1, MARGINS, pageSize } from './paper.js';

// Si la proporción de la foto difiere menos que esto de la hoja, en "hoja completa" se ajusta exacta a la hoja.
const STRETCH_TOLERANCE = 0.08;

/** Encaja un rectángulo de proporción `aspect` dentro de `box` sin deformarlo. */
function fitInside(box, aspect, align = 'center') {
  let w = box.w;
  let h = w / aspect;
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  return {
    x: box.x + (box.w - w) / 2,
    y: align === 'top' ? box.y : box.y + (box.h - h) / 2,
    w, h,
  };
}

/**
 * Hoja de un documento a partir de una foto.
 * @param {object} o
 * @param {'carta'|'oficio'|'a4'} o.paper
 * @param {'portrait'|'landscape'|'auto'} o.orientation
 * @param {'full'|'inside'} o.fit  full: la foto es la hoja; inside: la foto va dentro de los márgenes
 * @param {{t:number,r:number,b:number,l:number}} o.margin
 * @param {'top'|'center'} o.align
 * @param {number|null} aspect  ancho / alto de la foto (null si aún no hay foto)
 */
export function documentLayout(o, aspect = null) {
  const landscape = o.orientation === 'landscape' || (o.orientation === 'auto' && aspect !== null && aspect > 1);
  const page = pageSize(o.paper, landscape);
  const whole = { x: 0, y: 0, w: page.w, h: page.h };

  if (o.fit === 'full') {
    const pageAspect = page.w / page.h;
    const close = aspect === null || Math.abs(aspect / pageAspect - 1) <= STRETCH_TOLERANCE;
    const rect = close ? whole : fitInside(whole, aspect);
    return { page, box: null, items: [{ ...rect, radius: 0, slot: 0 }] };
  }

  const m = o.margin;
  const box = { x: m.l, y: m.t, w: Math.max(page.w - m.l - m.r, 10), h: Math.max(page.h - m.t - m.b, 10) };
  const rect = fitInside(box, aspect ?? box.w / box.h, o.align);
  return { page, box, items: [{ ...rect, radius: 0, slot: 0 }] };
}

/**
 * Hoja con frente y reverso de una credencial.
 * @param {object} o
 * @param {'carta'|'oficio'|'a4'} o.paper
 * @param {'side'|'stacked'} o.arrangement
 * @param {'top'|'center'} o.position
 * @param {number|string} [o.scale]  1 = tamaño real, 1.5 o 2 = copia ampliada
 * @returns {{page, box:null, items:object[], arrangement:'side'|'stacked', sideFits:boolean}}
 */
export function credentialLayout(o) {
  const page = pageSize(o.paper, false);
  const scale = Number(o.scale) || 1;
  const gap = 10;
  const sideMargin = 10;
  const w = ID1.w * scale, h = ID1.h * scale, radius = ID1.radius * scale;

  // Lado a lado solo si las dos tarjetas caben a lo ancho; si no, una sobre otra.
  const sideFits = w * 2 + gap <= page.w - sideMargin * 2;
  const arrangement = o.arrangement === 'side' && sideFits ? 'side' : 'stacked';
  const side = arrangement === 'side';

  const groupW = side ? w * 2 + gap : w;
  const groupH = side ? h : h * 2 + gap;
  const x0 = (page.w - groupW) / 2;
  const top = Math.min(MARGINS.normal.t, (page.h - groupH) / 2);
  const y0 = o.position === 'center' ? (page.h - groupH) / 2 : top;

  const items = [
    { x: x0, y: y0, w, h, radius, slot: 'front' },
    side
      ? { x: x0 + w + gap, y: y0, w, h, radius, slot: 'back' }
      : { x: x0, y: y0 + h + gap, w, h, radius, slot: 'back' },
  ];
  return { page, box: null, items, arrangement, sideFits };
}
