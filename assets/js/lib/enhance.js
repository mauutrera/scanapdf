// Limpieza de la imagen recortada, antes de componer la hoja.
// - Documento: elimina sombras e iluminación desigual (la hoja queda blanca) y refuerza la tinta.
// - Tarjeta: balance de blancos y niveles suaves, sin aplanar los colores de seguridad de la credencial.
// Funciona en la página o dentro de un worker (ver threads.js).
import { makeCanvas, canvasFrom } from './canvas.js';

/** Percentil `p` (0–1) de un histograma de 256 niveles. */
function percentile(hist, total, p) {
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * p) return i;
  }
  return 255;
}

/** Fondo estimado (papel sin texto) a baja resolución: máximo local + desenfoque. */
function estimateBackground(src) {
  const scale = Math.min(1, 160 / Math.max(src.width, src.height));
  const w = Math.max(4, Math.round(src.width * scale));
  const h = Math.max(4, Math.round(src.height * scale));
  const small = makeCanvas(w, h);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, w, h);
  let d = sctx.getImageData(0, 0, w, h).data;

  const pass = (fn, radius) => {
    const out = new Uint8ClampedArray(d.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let acc = fn === 'max' ? 0 : 0, n = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            for (let dx = -radius; dx <= radius; dx++) {
              const xx = Math.min(w - 1, Math.max(0, x + dx));
              const v = d[(yy * w + xx) * 4 + c];
              if (fn === 'max') acc = v > acc ? v : acc;
              else { acc += v; n++; }
            }
          }
          out[(y * w + x) * 4 + c] = fn === 'max' ? acc : acc / n;
        }
        out[(y * w + x) * 4 + 3] = 255;
      }
    }
    d = out;
  };
  pass('max', 2);
  pass('max', 2);
  pass('avg', 3);
  pass('avg', 3);

  sctx.putImageData(new ImageData(d, w, h), 0, 0);
  const big = makeCanvas(src.width, src.height);
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, src.width, src.height);
  return bctx.getImageData(0, 0, src.width, src.height).data;
}

/** Hoja de documento: papel blanco y parejo, tinta nítida. */
export function enhanceDocument(src) {
  const out = canvasFrom(src);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const bg = estimateBackground(src);

  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = (d[i + c] * 255) / Math.max(bg[i + c], 40);
      d[i + c] = v > 255 ? 255 : v;
    }
    hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
  }

  // Niveles: lleva el 1 % más oscuro a negro y un poco de contraste en los medios tonos.
  const black = Math.min(percentile(hist, d.length / 4, 0.01), 120);
  const white = 245;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - black) / (white - black)));
    lut[v] = Math.round(255 * Math.pow(t, 1.15));
  }
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Tarjeta: balance de blancos y estiramiento de niveles moderado. */
export function enhanceCard(src) {
  const out = canvasFrom(src);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const n = d.length / 4;

  const hists = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < d.length; i += 4) {
    hists[0][d[i]]++;
    hists[1][d[i + 1]]++;
    hists[2][d[i + 2]]++;
  }
  const STRENGTH = 0.7; // 1 = estiramiento completo; menos conserva el aspecto natural
  const luts = hists.map((h) => {
    const lo = percentile(h, n, 0.005);
    const hi = Math.max(lo + 40, percentile(h, n, 0.995));
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const stretched = ((v - lo) * 255) / (hi - lo);
      lut[v] = v + (stretched - v) * STRENGTH;
    }
    return lut;
  });
  for (let i = 0; i < d.length; i += 4) {
    d[i] = luts[0][d[i]];
    d[i + 1] = luts[1][d[i + 1]];
    d[i + 2] = luts[2][d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
// La versión limpia de cada foto se calcula en el grupo de hilos: ver prepareClean() en threads.js.
