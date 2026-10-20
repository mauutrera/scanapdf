// Geometría del recorte: esquinas, homografía y enderezado de perspectiva.
// Un "quad" son 4 puntos {x, y} en píxeles de la imagen, en orden: sup-izq, sup-der, inf-der, inf-izq.
import { makeCanvas } from './canvas.js';

/** Ordena 4 puntos en sentido horario empezando por el superior izquierdo. */
export function orderQuad(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  sorted.forEach((p, i) => {
    if (p.x + p.y < sorted[start].x + sorted[start].y) start = i;
  });
  return [0, 1, 2, 3].map((i) => ({ ...sorted[(start + i) % 4] }));
}

export function fullQuad(w, h) {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

export function isConvex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Ancho y alto aproximados del contenido del quad (lados más largos). */
export function quadSize(q) {
  return {
    w: Math.max(dist(q[0], q[1]), dist(q[3], q[2])),
    h: Math.max(dist(q[0], q[3]), dist(q[1], q[2])),
  };
}

export function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) a += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return Math.abs(a) / 2;
}

/** Mueve cada lado del quad `d` píxeles hacia adentro (paralelo a sí mismo) y recalcula las esquinas. */
export function insetQuad(q, d) {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  // Cada lado como recta desplazada: punto + dirección.
  const lines = q.map((a, i) => {
    const b = q[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    if ((cx - a.x) * nx + (cy - a.y) * ny < 0) { nx = -nx; ny = -ny; } // normal hacia el centro
    return { p: { x: a.x + nx * d, y: a.y + ny * d }, v: { x: b.x - a.x, y: b.y - a.y } };
  });
  return q.map((_, i) => {
    const l1 = lines[(i + 3) % 4], l2 = lines[i]; // lados que se cruzan en la esquina i
    const den = l1.v.x * l2.v.y - l1.v.y * l2.v.x;
    if (Math.abs(den) < 1e-9) return { ...q[i] };
    const t = ((l2.p.x - l1.p.x) * l2.v.y - (l2.p.y - l1.p.y) * l2.v.x) / den;
    return { x: l1.p.x + l1.v.x * t, y: l1.p.y + l1.v.y * t };
  });
}

/** Matriz 3x3 (9 valores, h8 = 1) que lleva cada punto de `from` al punto de `to`. */
function homography(from, to) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Eliminación gaussiana con pivoteo parcial.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

/** Gira un canvas 90°: dir = 1 en sentido horario, -1 en sentido antihorario. */
export function rotateCanvas(src, dir = 1) {
  const out = makeCanvas(src.height, src.width);
  const ctx = out.getContext('2d');
  if (dir > 0) ctx.translate(out.width, 0);
  else ctx.translate(0, out.height);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Lleva un quad a las coordenadas de la imagen girada 90° (w × h = tamaño antes de girar). */
export function rotateQuad(q, w, h, dir = 1) {
  return orderQuad(q.map((p) => (dir > 0 ? { x: h - p.y, y: p.x } : { x: p.y, y: w - p.x })));
}

function scaledCanvas(src, s) {
  const c = makeCanvas(src.width * s, src.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Endereza la región `quad` de `src` a un rectángulo de outW × outH píxeles.
 * Interpolación bilineal; si la región es mucho más grande que la salida, primero reduce la imagen
 * para no generar aliasing.
 */
export function warpQuad(src, quad, outW, outH) {
  outW = Math.round(outW);
  outH = Math.round(outH);
  const size = quadSize(quad);
  const s = Math.min(1, 1.5 * Math.max(outW / size.w, outH / size.h));
  if (s < 0.75) {
    src = scaledCanvas(src, s);
    quad = quad.map((p) => ({ x: p.x * s, y: p.y * s }));
  }

  const sw = src.width, sh = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = new ImageData(outW, outH);
  const od = out.data;
  const H = homography(fullQuad(outW, outH), quad); // salida -> origen

  for (let y = 0; y < outH; y++) {
    const py = y + 0.5;
    for (let x = 0; x < outW; x++) {
      const px = x + 0.5;
      const d = H[6] * px + H[7] * py + 1;
      let sx = (H[0] * px + H[1] * py + H[2]) / d - 0.5;
      let sy = (H[3] * px + H[4] * py + H[5]) / d - 0.5;
      sx = sx < 0 ? 0 : sx > sw - 1 ? sw - 1 : sx;
      sy = sy < 0 ? 0 : sy > sh - 1 ? sh - 1 : sy;
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 < sw - 1 ? x0 + 1 : x0, y1 = y0 < sh - 1 ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = (y * outW + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[i00 + k] + (sd[i10 + k] - sd[i00 + k]) * fx;
        const bot = sd[i01 + k] + (sd[i11 + k] - sd[i01 + k]) * fx;
        od[o + k] = top + (bot - top) * fy;
      }
      od[o + 3] = 255;
    }
  }

  const canvas = makeCanvas(outW, outH);
  canvas.getContext('2d').putImageData(out, 0, 0);
  return canvas;
}
