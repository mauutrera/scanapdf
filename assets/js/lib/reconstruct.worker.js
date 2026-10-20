// Worker de reconstrucción digital: convierte la foto (ya recortada) de un documento en una imagen que parece
// generada por computadora: renglones rectos, papel blanco puro, tinta nítida y, si se pide, tinta de color.
//
// Pasos: 1) iluminación pareja (fondo estimado → papel blanco)  2) renglones rectos (curvatura e inclinación)
//        3) nivel del papel  4) nitidez  5) trazos: color y motas  6) composición en B/N o grises

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const INK_BLACK = [18, 18, 20];
const ERASE = -2; // trazo descartado (mota)
const BLACK = -1; // trazo negro

self.onmessage = ({ data }) => {
  const { id, image, opts } = data;
  try {
    const out = reconstruct(image, opts);
    self.postMessage({ id, image: out, info: out.info }, [out.data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};

/**
 * @param {ImageData} img
 * @param {{mode:'bw'|'gray', weight:number, inkColor:boolean, straighten:boolean}} opts
 *        weight: -1 texto fino, 0 normal, 1 grueso · inkColor: conservar el color de firmas, sellos y texto de color
 *        straighten: enderezar renglones curvos o inclinados
 */
function reconstruct(img, { mode = 'bw', weight = 0, inkColor = true, straighten = true }) {
  const W = img.width, H = img.height, N = W * H;
  let d = img.data;
  const scale = Math.max(W, H) / 3300; // 1 ≈ hoja carta a 300 ppp
  const info = {};

  normalizeIllumination(d, W, H);
  let { L, C } = lumaChroma(d, N);

  if (straighten) {
    const warp = estimateWarp(L, W, H);
    info.straighten = warp.bands
      ? { bands: warp.bands.length, maxShiftPx: Math.round(warp.maxShift), spacing: warp.spacing }
      : { skipped: warp.reason };
    if (warp.bands) {
      d = remapRows(d, W, H, warp);
      ({ L, C } = lumaChroma(d, N));
    }
  }

  // Nivel del papel: el tono claro más frecuente. Todo lo que esté cerca de él es papel (blanco puro),
  // aunque el original sea crema o la iluminación no haya quedado perfecta.
  const P = paperLevel(L);
  info.paper = P;

  // Nitidez: quita el ruido de cada píxel y refuerza bordes, para que puntos y comas recuperen su tono.
  const quiet = boxBlur(L, W, H, 1);
  const blur = boxBlur(L, W, H, Math.max(2, Math.round(3 * scale)));
  const S = new Uint8ClampedArray(N);
  for (let i = 0; i < N; i++) S[i] = quiet[i] + 1.6 * (quiet[i] - blur[i]);

  // Ventana de tinta relativa al papel (el texto de una foto queda en grises medios por el desenfoque).
  const hi = Math.min(212, P - 34) + weight * 12;
  const lo = hi - 72 + weight * 8;
  const alphaOf = (v) => {
    const t = clamp(((hi - v) / (hi - lo) - 0.15) / 0.7, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const A = new Uint8Array(N);
  for (let i = 0; i < N; i++) A[i] = alphaOf(S[i]) * 255;

  const fill = mode === 'gray' ? fillMask(L, W, H, scale, P) : null;
  const strokes = analyzeStrokes(d, S, A, fill, W, H, {
    inkColor,
    minArea: Math.max(4, Math.round(10 * scale * scale)),
    faint: (lo + hi) / 2,
  });

  const edge = Math.max(2, Math.round(24 * scale)); // orilla del recorte (~2 mm): sombra o hilos del fondo
  const out = new ImageData(W, H);
  const o = out.data;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    o[p + 3] = 255;
    const x = i % W, y = (i / W) | 0;
    const stroke = strokes.of(i);
    if (stroke === ERASE || x < edge || y < edge || x >= W - edge || y >= H - edge) {
      o[p] = o[p + 1] = o[p + 2] = 255;
      continue;
    }
    const a = A[i] / 255;
    const ink = stroke >= 0 ? strokes.colors[stroke] : INK_BLACK;

    if (mode === 'bw') {
      const t = clamp((a - 0.5) * 3 + 0.5, 0, 1); // blanco o tinta, con un borde fino suave
      o[p] = 255 + (ink[0] - 255) * t;
      o[p + 1] = 255 + (ink[1] - 255) * t;
      o[p + 2] = 255 + (ink[2] - 255) * t;
      continue;
    }
    // Grises: papel blanco, rellenos (celdas sombreadas) como gris plano y tinta encima.
    let base = 255;
    if (fill && fill[i] && a < 0.5) base = Math.round(L[i] / 20) * 20 + 4;
    if (stroke >= 0) {
      o[p] = base + (ink[0] - base) * a;
      o[p + 1] = base + (ink[1] - base) * a;
      o[p + 2] = base + (ink[2] - base) * a;
    } else {
      o[p] = o[p + 1] = o[p + 2] = clamp(base + (18 - base) * a, 0, 255);
    }
  }
  out.info = info;
  return out;
}

function lumaChroma(d, N) {
  const L = new Uint8ClampedArray(N);
  const C = new Uint8ClampedArray(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    C[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  return { L, C };
}

/** Tono más frecuente entre los claros (≥150): el papel. */
function paperLevel(L) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < L.length; i += 3) hist[L[i]]++;
  let best = 245, count = 0;
  for (let v = 150; v < 256; v++) if (hist[v] > count) { count = hist[v]; best = v; }
  return best;
}

/** Divide cada canal entre el fondo estimado (máximos locales suavizados): papel blanco y parejo. */
function normalizeIllumination(d, W, H) {
  const B = Math.max(12, Math.ceil(Math.max(W, H) / 140));
  const gw = Math.ceil(W / B), gh = Math.ceil(H / B);
  let grid = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let best = -1, br = 255, bgc = 255, bb = 255;
      for (let y = gy * B; y < Math.min(H, (gy + 1) * B); y += 2) {
        for (let x = gx * B; x < Math.min(W, (gx + 1) * B); x += 2) {
          const p = (y * W + x) * 4;
          const l = d[p] + d[p + 1] + d[p + 2];
          if (l > best) { best = l; br = d[p]; bgc = d[p + 1]; bb = d[p + 2]; }
        }
      }
      const g = (gy * gw + gx) * 3;
      grid[g] = br; grid[g + 1] = bgc; grid[g + 2] = bb;
    }
  }
  const pass = (fn) => {
    const next = new Float32Array(grid.length);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        for (let c = 0; c < 3; c++) {
          let acc = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const v = grid[(clamp(y + dy, 0, gh - 1) * gw + clamp(x + dx, 0, gw - 1)) * 3 + c];
              if (fn === 'max') acc = v > acc ? v : acc;
              else { acc += v; n++; }
            }
          }
          next[(y * gw + x) * 3 + c] = fn === 'max' ? acc : acc / n;
        }
      }
    }
    grid = next;
  };
  pass('max'); pass('max'); pass('avg'); pass('avg');

  for (let y = 0; y < H; y++) {
    const fy = clamp(y / B - 0.5, 0, gh - 1);
    const y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = clamp(x / B - 0.5, 0, gw - 1);
      const x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const p = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = grid[(y0 * gw + x0) * 3 + c], b = grid[(y0 * gw + x1) * 3 + c];
        const e = grid[(y1 * gw + x0) * 3 + c], f = grid[(y1 * gw + x1) * 3 + c];
        const bg = Math.max(40, (a + (b - a) * tx) * (1 - ty) + (e + (f - e) * tx) * ty);
        d[p + c] = clamp((d[p + c] * 255) / bg, 0, 255);
      }
    }
  }
}

/**
 * Curvatura e inclinación de los renglones. Se divide la página en franjas verticales y bandas horizontales;
 * en cada banda se compara el perfil de tinta de cada franja con el de su vecina para saber cuánto "sube" o
 * "baja" el renglón al avanzar a la derecha. Con eso se ajusta una curva suave (parábola) por banda.
 * @returns {{bands?: {y:number, a:number, b:number, c:number}[], maxShift?:number, spacing?:number, reason?:string}}
 *          desplazamiento vertical dy(x) = a + b·x + c·x² en cada banda (px de la imagen completa); sin ands (y con
 *          eason) si no hay renglones claros o no hace falta corregir
 */
function estimateWarp(L, W, H) {
  // Copia reducida (~900 px de ancho) con la "cantidad de tinta" de cada píxel.
  const f = Math.max(1, Math.round(W / 900));
  const sw = Math.floor(W / f), sh = Math.floor(H / f);
  const ink = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let s = 0;
      for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) s += L[(y * f + yy) * W + x * f + xx];
      ink[y * sw + x] = Math.max(0, 200 - s / (f * f));
    }
  }

  // Interlineado: primer pico de la autocorrelación del perfil horizontal de una franja angosta del centro.
  // (Con todo el ancho, si los renglones están curvos el perfil se emborrona y la repetición no se ve.)
  const total = new Float32Array(sh);
  const cx0 = Math.round(sw * 0.42), cx1 = Math.round(sw * 0.58);
  for (let y = 0; y < sh; y++) { let s = 0; for (let x = cx0; x < cx1; x++) s += ink[y * sw + x]; total[y] = s; }
  const mean = total.reduce((a, b) => a + b, 0) / sh;
  if (mean < 1) return { reason: 'página vacía' };
  const ac = (lag) => { let s = 0; for (let y = 0; y + lag < sh; y++) s += (total[y] - mean) * (total[y + lag] - mean); return s / (sh - lag); };
  const ac0 = ac(0) || 1;
  // Picos (máximos locales) de la autocorrelación; el interlineado es el PRIMERO que llega al 60 % del más alto
  // (los siguientes son múltiplos: dos renglones, un párrafo…).
  const peaks = [];
  for (let lag = Math.max(4, Math.round(sh * 0.006)); lag < sh * 0.08; lag++) {
    const v = ac(lag) / ac0;
    if (v > 0 && v > ac(lag - 1) / ac0 && v >= ac(lag + 1) / ac0) peaks.push({ lag, v });
  }
  const top = Math.max(0, ...peaks.map((p) => p.v));
  const first = peaks.find((p) => p.v >= top * 0.6);
  const spacing = first?.lag ?? 0, peak = first?.v ?? 0;
  if (!spacing || peak < 0.12) return { reason: `sin renglones regulares (pico ${peak.toFixed(2)})` }; // no se toca

  const K = 16;                                   // franjas verticales (anchas: más texto en cada una)
  const stripW = sw / K;
  const bandH = Math.max(spacing * 6, Math.round(sh / 10));
  // Entre franjas vecinas la curvatura cambia poco: pasos chicos (y nunca de un renglón a otro).
  const maxStep = Math.max(2, Math.round(spacing * 0.3));
  const profile = (s, y0, y1) => {
    const out = new Float32Array(y1 - y0);
    const x0 = Math.floor(s * stripW), x1 = Math.floor((s + 1) * stripW);
    for (let y = y0; y < y1; y++) { let v = 0; for (let x = x0; x < x1; x++) v += ink[y * sw + x]; out[y - y0] = v; }
    return out;
  };

  const bands = [];
  for (let yc = bandH / 2; yc < sh; yc += bandH / 2) {
    const y0 = Math.max(0, Math.round(yc - bandH / 2)), y1 = Math.min(sh, Math.round(yc + bandH / 2));
    if (y1 - y0 < spacing * 3) continue;
    const prof = Array.from({ length: K }, (_, s) => profile(s, y0, y1));
    const weight = prof.map((p) => p.reduce((a, b) => a + b, 0));
    const center = Math.floor(K / 2);
    const minWeight = Math.max(...weight) * 0.15; // franjas casi vacías no cuentan
    if (weight[center] < minWeight) continue;

    // Correlación normalizada entre la franja central y la franja s desplazada `dlt`.
    const ncc = (s, dlt) => {
      const a = prof[center], b = prof[s];
      let sa = 0, sb = 0, n = 0;
      for (let y = 0; y < a.length; y++) { const yb = y + dlt; if (yb >= 0 && yb < b.length) { sa += a[y]; sb += b[yb]; n++; } }
      if (n < a.length * 0.6) return -1;
      const ma = sa / n, mb = sb / n;
      let num = 0, da = 0, db = 0;
      for (let y = 0; y < a.length; y++) {
        const yb = y + dlt;
        if (yb < 0 || yb >= b.length) continue;
        const va = a[y] - ma, vb = b[yb] - mb;
        num += va * vb; da += va * va; db += vb * vb;
      }
      return num / (Math.sqrt(da * db) || 1);
    };
    // Cada franja se compara DIRECTAMENTE con la central (así el error no se acumula), buscando cerca de lo
    // que predice su vecina ya resuelta (así no salta a otro renglón aunque la curva sea grande).
    const offs = new Float32Array(K);
    const reliable = new Uint8Array(K);
    reliable[center] = 1;
    const solve = (s, pred) => {
      if (weight[s] < minWeight) { offs[s] = pred; return; }
      let best = pred, bestV = -Infinity;
      for (let dlt = pred - maxStep; dlt <= pred + maxStep; dlt++) {
        const v = ncc(s, dlt);
        if (v > bestV) { bestV = v; best = dlt; }
      }
      offs[s] = bestV >= 0.4 ? best : pred;
      reliable[s] = bestV >= 0.4 ? 1 : 0;
    };
    for (let s = center + 1; s < K; s++) solve(s, Math.round(offs[s - 1]));
    for (let s = center - 1; s >= 0; s--) solve(s, Math.round(offs[s + 1]));

    // Banda útil solo si la mayoría de las franjas con texto coincidieron con confianza.
    const withText = weight.filter((w) => w >= minWeight).length;
    const good = [...reliable].filter((r, s) => r && weight[s] >= minWeight).length;
    if (withText < K * 0.4 || good < withText * 0.6) continue;

    // Parábola por mínimos cuadrados ponderados (x centrado en la página, en px de la imagen completa).
    const pts = [];
    for (let s = 0; s < K; s++) if (reliable[s] && weight[s] >= minWeight) pts.push({ x: ((s + 0.5) * stripW - sw / 2) * f, y: offs[s] * f, w: weight[s] });
    if (pts.length < 5) continue;
    const fit = fitParabola(pts);
    // La curva solo vale donde hubo texto: fuera de ese tramo se usa el valor del extremo (sin extrapolar).
    if (fit) bands.push({ y: yc * f, ...fit, xMin: Math.min(...pts.map((p) => p.x)), xMax: Math.max(...pts.map((p) => p.x)) });
  }
  if (!bands.length) return { reason: 'sin bandas con suficiente texto' };

  let maxShift = 0;
  for (const b of bands) for (const x of [b.xMin, 0, b.xMax]) maxShift = Math.max(maxShift, Math.abs(b.a + b.b * x + b.c * x * x));
  if (maxShift < 2) return { reason: 'ya está derecho' };
  if (maxShift > H * 0.06) return { reason: `estimación poco confiable (${Math.round(maxShift)} px)` };
  return { bands, maxShift, spacing: spacing * f };
}

/** y = a + b·x + c·x² por mínimos cuadrados ponderados. */
function fitParabola(pts) {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const { x, y, w } of pts) {
    const x2 = x * x;
    s0 += w; s1 += w * x; s2 += w * x2; s3 += w * x2 * x; s4 += w * x2 * x2;
    t0 += w * y; t1 += w * x * y; t2 += w * x2 * y;
  }
  const M = [[s0, s1, s2, t0], [s1, s2, s3, t1], [s2, s3, s4, t2]];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j < 4; j++) M[r][j] -= k * M[c][j];
    }
  }
  return { a: M[0][3] / M[0][0], b: M[1][3] / M[1][1], c: M[2][3] / M[2][2] };
}

/** Vuelve a muestrear la imagen moviendo cada columna verticalmente: out(x, y) = in(x, y + dy(x, y)). */
function remapRows(d, W, H, { bands }) {
  const out = new Uint8ClampedArray(d.length);
  const dyRow = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    // Interpolación lineal entre las curvas de las dos bandas más cercanas.
    let j = bands.findIndex((b) => b.y > y);
    if (j === -1) j = bands.length;
    const A = bands[Math.max(0, j - 1)], B = bands[Math.min(bands.length - 1, j)];
    const t = A === B ? 0 : clamp((y - A.y) / (B.y - A.y), 0, 1);
    for (let x = 0; x < W; x++) {
      const xc = x - W / 2;
      const xa = clamp(xc, A.xMin, A.xMax), xb = clamp(xc, B.xMin, B.xMax); // sin extrapolar fuera del texto
      const ya = A.a + A.b * xa + A.c * xa * xa;
      const yb = B.a + B.b * xb + B.c * xb * xb;
      dyRow[x] = ya + (yb - ya) * t;
    }
    for (let x = 0; x < W; x++) {
      const sy = clamp(y + dyRow[x], 0, H - 1);
      const y0 = sy | 0, y1 = Math.min(H - 1, y0 + 1), ty = sy - y0;
      const p = (y * W + x) * 4, p0 = (y0 * W + x) * 4, p1 = (y1 * W + x) * 4;
      out[p] = d[p0] + (d[p1] - d[p0]) * ty;
      out[p + 1] = d[p0 + 1] + (d[p1 + 1] - d[p0 + 1]) * ty;
      out[p + 2] = d[p0 + 2] + (d[p1 + 2] - d[p0 + 2]) * ty;
      out[p + 3] = 255;
    }
  }
  return out;
}

/** Desenfoque de caja separable (radio r). */
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(src.length);
  const out = new Uint8ClampedArray(src.length);
  const span = r * 2 + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + clamp(x + r + 1, 0, W - 1)] - src[row + clamp(x - r, 0, W - 1)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / span;
      acc += tmp[clamp(y + r + 1, 0, H - 1) * W + x] - tmp[clamp(y - r, 0, H - 1) * W + x];
    }
  }
  return out;
}

/**
 * Celdas o franjas sombreadas (solo en grises): bloques uniformes claramente más oscuros que el papel,
 * con al menos dos vecinos iguales. El papel crema o con iluminación desigual nunca entra: se mide contra P.
 */
function fillMask(L, W, H, scale, P) {
  const B = Math.max(6, Math.round(12 * scale));
  const gw = Math.ceil(W / B), gh = Math.ceil(H / B);
  const grid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0, sq = 0, n = 0;
      for (let y = gy * B; y < Math.min(H, (gy + 1) * B); y++) {
        for (let x = gx * B; x < Math.min(W, (gx + 1) * B); x++) { const v = L[y * W + x]; sum += v; sq += v * v; n++; }
      }
      const mean = sum / n, std = Math.sqrt(Math.max(0, sq / n - mean * mean));
      grid[gy * gw + gx] = mean < P - 30 && mean > 60 && std < 10 ? 1 : 0;
    }
  }
  const count = (g, gx, gy) => {
    let nb = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const y = gy + dy, x = gx + dx;
      if ((dx || dy) && y >= 0 && y < gh && x >= 0 && x < gw && g[y * gw + x]) nb++;
    }
    return nb;
  };
  const core = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) core[gy * gw + gx] = grid[gy * gw + gx] && count(grid, gx, gy) >= 3 ? 1 : 0;
  const mask = new Uint8Array(W * H);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!core[gy * gw + gx] && count(core, gx, gy) < 3) continue;
      for (let y = gy * B; y < Math.min(H, (gy + 1) * B); y++) mask.fill(1, y * W + gx * B, y * W + Math.min(W, (gx + 1) * B));
    }
  }
  return mask;
}

/**
 * Agrupa la tinta en trazos conectados (8 vecinos) y decide, para cada trazo completo:
 *  - borrarlo, si es una mota pequeña y tenue (polvo, ruido). Un punto o una coma son pequeños pero oscuros;
 *  - su color: si su parte central es neutra, negro; si tiene color (firma azul, sello rojo), ese color promedio,
 *    más saturado y sólido. Así un trazo de color queda de un solo color aunque sus bordes casi no lo tengan.
 * @returns {{colors: number[][], of: (i:number) => number}} of(i): ERASE, BLACK o índice en `colors`
 */
function analyzeStrokes(d, S, A, fill, W, H, { inkColor, minArea, faint }) {
  const N = W * H;
  const parent = new Int32Array(N).fill(-1);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a, b) => {
    a = find(a); b = find(b);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); // la raíz es siempre el índice menor del trazo
  };
  const isInk = (i) => A[i] > 25 && !(fill && fill[i] && A[i] < 128);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isInk(i)) continue;
      parent[i] = i;
      if (x > 0 && parent[i - 1] !== -1) union(i, i - 1);
      if (y > 0) {
        if (parent[i - W] !== -1) union(i, i - W);
        if (x > 0 && parent[i - W - 1] !== -1) union(i, i - W - 1);
        if (x < W - 1 && parent[i - W + 1] !== -1) union(i, i - W + 1);
      }
    }
  }

  // 1) Cada píxel apunta directo a su raíz (las raíces son el índice menor, así que no se tocan antes de tiempo).
  for (let i = 0; i < N; i++) if (parent[i] !== -1) parent[i] = find(i);
  // 2) Se numera cada trazo y se acumulan sus datos.
  const ids = new Map();
  for (let i = 0; i < N; i++) if (parent[i] !== -1 && !ids.has(parent[i])) ids.set(parent[i], ids.size);
  const n = ids.size;
  const area = new Uint32Array(n), core = new Uint32Array(n);
  const sr = new Float64Array(n), sg = new Float64Array(n), sb = new Float64Array(n);
  const minS = new Uint8Array(n).fill(255);
  // Trazos que tocan la orilla de la imagen: fondo, sombra o el borde de la hoja (un documento tiene margen).
  const tol = Math.max(3, Math.round(Math.min(W, H) * 0.015));
  const touchesEdge = new Uint8Array(n);
  for (let i = 0; i < N; i++) {
    if (parent[i] === -1) continue;
    const k = ids.get(parent[i]);
    area[k]++;
    const x = i % W, y = (i / W) | 0;
    if (x < tol || y < tol || x >= W - tol || y >= H - tol) touchesEdge[k] = 1;
    if (S[i] < minS[k]) minS[k] = S[i];
    if (A[i] > 178) {
      const p = i * 4;
      core[k]++; sr[k] += d[p]; sg[k] += d[p + 1]; sb[k] += d[p + 2];
    }
  }
  // 3) Cada píxel guarda el número de su trazo (se busca por la raíz que ya tenía guardada).
  for (let i = 0; i < N; i++) if (parent[i] !== -1) parent[i] = ids.get(parent[i]);

  const colors = [];
  const decision = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    if (touchesEdge[k] || area[k] <= 1 || (area[k] < minArea && minS[k] > faint)) { decision[k] = ERASE; continue; }
    if (!inkColor || !core[k]) { decision[k] = BLACK; continue; }
    const m = [sr[k] / core[k], sg[k] / core[k], sb[k] / core[k]];
    if (Math.max(...m) - Math.min(...m) < 24) { decision[k] = BLACK; continue; }
    const l = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
    decision[k] = colors.push(m.map((v) => clamp(l * 0.85 + (v - l) * 1.35, 0, 255))) - 1;
  }

  return {
    colors,
    of(i) {
      if (parent[i] !== -1) return decision[parent[i]];
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && parent[j] !== -1) return decision[parent[j]];
      return BLACK;
    },
  };
}
