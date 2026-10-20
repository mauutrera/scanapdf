// Compositor de página: dibuja la hoja final en un canvas a la resolución pedida.
// Lo usan la vista previa (a baja resolución) y la exportación (a 300 ppp): lo que ves es lo que se genera.
import { MM_PER_INCH } from './paper.js';
import { makeCanvas } from './canvas.js';

/**
 * @param {{page:{w:number,h:number}, box:object|null, items:object[]}} layout  en mm (ver layout.js)
 * @param {object} o
 * @param {number} o.dpi
 * @param {(slot:any) => HTMLCanvasElement|null} o.sourceFor  imagen recortada de cada espacio
 * @param {(slot:any) => string} [o.labelFor]                 texto del espacio vacío (solo vista previa)
 * @param {'color'|'gray'|'bw'} [o.style]
 * @param {'shadow'|'line'|'none'} [o.edge]                   contorno de las imágenes con esquinas redondeadas
 * @param {'clean'|'scan'} [o.look]                           scan: apariencia de escáner (papel, grano, leve giro)
 * @param {{level?: string, seed?: number, skew?: boolean}} [o.scan]  ajustes del efecto escaneado (ver SCAN_LEVELS)
 * @param {boolean} [o.guides]                                 dibujar la guía de márgenes (solo vista previa)
 * @returns {HTMLCanvasElement}
 */
export function composePage(layout, { dpi, sourceFor, labelFor = () => '', style = 'color', edge = 'none', look = 'clean', scan = {}, guides = false }) {
  const k = dpi / MM_PER_INCH; // px por mm
  const canvas = makeCanvas(layout.page.w * k, layout.page.h * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';

  for (const item of layout.items) {
    const x = item.x * k, y = item.y * k, w = item.w * k, h = item.h * k, r = item.radius * k;
    const src = sourceFor(item.slot);

    if (!src) {
      if (!labelFor(item.slot)) continue;
      ctx.save();
      ctx.setLineDash([2 * k, 1.5 * k]);
      ctx.lineWidth = Math.max(1, 0.4 * k);
      ctx.strokeStyle = '#c3ccd3';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
      ctx.fillStyle = '#8595a1';
      const label = labelFor(item.slot);
      const font = (px) => `500 ${px}px Figtree, system-ui, sans-serif`;
      let size = Math.round(Math.min(w, h) * 0.1);
      ctx.font = font(size);
      const fits = w * 0.85;
      if (ctx.measureText(label).width > fits) {
        size = Math.floor((size * fits) / ctx.measureText(label).width); // reduce la letra hasta que el texto quepa
        ctx.font = font(size);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
      ctx.restore();
      continue;
    }

    if (edge === 'shadow') {
      // Sombra suave como la que deja la tapa del escáner alrededor de una tarjeta.
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 1.2 * k;
      ctx.shadowOffsetY = 0.3 * k;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    ctx.drawImage(src, x, y, w, h);
    ctx.restore();

    if (edge === 'line') {
      ctx.save();
      ctx.lineWidth = Math.max(1, 0.25 * k);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (style !== 'color') applyTone(ctx, canvas.width, canvas.height, style);
  if (look === 'scan') applyScanLook(canvas, k, scan);

  if (guides && layout.box) {
    const b = layout.box;
    ctx.save();
    ctx.setLineDash([1.5 * k, 1.5 * k]);
    ctx.lineWidth = Math.max(1, 0.3 * k);
    ctx.strokeStyle = 'rgba(20, 184, 166, 0.6)';
    ctx.strokeRect(b.x * k, b.y * k, b.w * k, b.h * k);
    ctx.restore();
  }
  return canvas;
}

/** Escala de grises o blanco y negro sobre toda la hoja (el blanco del papel se mantiene). */
function applyTone(ctx, w, h, style) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (style === 'bw') v = (v - 128) * 1.9 + 150;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/** Generador pseudoaleatorio con semilla: el grano sale igual en la vista previa y en el PDF. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Niveles del efecto escaneado. Medidas en mm para que la vista previa y el PDF se vean igual
 * aunque se generen a distinta resolución.
 *  rotate: giro máximo (°) · blur: desenfoque óptico (mm) · grain: ruido (0–255)
 *  shade: oscurecimiento de orillas · toner: el negro no llega a negro puro · dust: motas por cada 10 000 mm²
 *  lid: sombra de la tapa del escáner en un borde
 */
const SCAN_LEVELS = {
  subtle: { rotate: 0.2, blur: 0.08, grain: 5, shade: 0.025, toner: 10, dust: 1, lid: 0 },
  normal: { rotate: 0.45, blur: 0.12, grain: 8, shade: 0.045, toner: 22, dust: 4, lid: 0.08 },
  strong: { rotate: 0.9, blur: 0.17, grain: 13, shade: 0.08, toner: 38, dust: 10, lid: 0.18 },
};

/**
 * Apariencia de hoja escaneada: contenido un poco suave y ligeramente girado, tóner que no llega
 * al negro puro, papel cálido con grano, motas de polvo y sombreado hacia las orillas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} k  px por mm
 * @param {{level?: keyof SCAN_LEVELS, seed?: number, skew?: boolean}} [o]
 *        seed: cambia el giro, el polvo y el grano de cada página; skew: false para no girar
 */
function applyScanLook(canvas, k, { level = 'subtle', seed = 1, skew = true } = {}) {
  const p = SCAN_LEVELS[level] ?? SCAN_LEVELS.subtle;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rand = rng(20261018 + seed * 7919);

  // Suavizado óptico: reducir y volver a ampliar desenfoca ~1/f px.
  const f = Math.max(0.35, Math.min(1, 1 / Math.max(1, p.blur * k)));
  const soft = makeCanvas(W * f, H * f);
  const sctx = soft.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, soft.width, soft.height);

  // Giro y pequeño desplazamiento, como una hoja colocada a mano en el cristal; distinto en cada página.
  const angle = skew ? p.rotate * (0.45 + 0.55 * rand()) * (rand() < 0.5 ? -1 : 1) : 0;
  const shiftX = skew ? (rand() - 0.5) * 0.8 * k : 0;
  const shiftY = skew ? (rand() - 0.5) * 0.8 * k : 0;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + shiftX, H / 2 + shiftY);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, -W / 2, -H / 2, W, H);
  ctx.restore();

  // Motas de polvo y fibras en el cristal.
  const specks = Math.round(((W / k) * (H / k) * p.dust) / 10_000);
  for (let s = 0; s < specks; s++) {
    ctx.fillStyle = `rgba(40, 38, 35, ${0.25 + rand() * 0.45})`;
    ctx.beginPath();
    const r = (0.06 + rand() * 0.18) * k;
    ctx.ellipse(rand() * W, rand() * H, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tóner: compresión del rango (negro → gris muy oscuro) con papel apenas cálido.
  const lo = p.toner;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = lo + (v * (253 - lo)) / 255;

  const lidSide = rand() < 0.5 ? 0 : 1; // la sombra de la tapa cae en el borde izquierdo o derecho
  const lidWidth = 4 * k;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const vy = Math.abs(y / H - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const vx = Math.abs(x / W - 0.5) * 2;
      let shade = 1 - p.shade * vx ** 4 - p.shade * 0.4 * vy ** 4;
      if (p.lid) {
        const dist = lidSide ? W - 1 - x : x;
        if (dist < lidWidth) shade -= p.lid * (1 - dist / lidWidth) ** 2;
      }
      const n = (rand() - 0.5) * p.grain;
      const i = (y * W + x) * 4;
      d[i] = (lut[d[i]] + n + 2) * shade;
      d[i + 1] = (lut[d[i + 1]] + n + 1) * shade;
      d[i + 2] = (lut[d[i + 2]] * 0.985 + n) * shade;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Resolución adecuada para mostrar la hoja en un contenedor de cierto ancho en pantalla. */
export function previewDpi(container, pageWidthMm) {
  const px = container.clientWidth * (window.devicePixelRatio || 1);
  return Math.min(150, Math.max(60, px / (pageWidthMm / MM_PER_INCH)));
}
