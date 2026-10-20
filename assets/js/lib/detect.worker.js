// Worker de detección de contornos. Corre OpenCV.js fuera del hilo principal:
// la interfaz no se congela y OpenCV puede compilar su código sin relajar la CSP de la página.
import { orderQuad, isConvex, insetQuad, quadArea, quadSize } from './geometry.js';

const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.2/dist/opencv.js';
// Huella del archivo (SRI): si el CDN entregara otro contenido, no se ejecuta. Cambia junto con OPENCV_URL.
const OPENCV_SRI = 'sha384-i0aokRC/FHyybXeYNiEdEj+j/sZBWuQjZLgZSjydZL+Wq7uQeNsmJ2Jv5XOjshzx';
const EDGE_INSET = 2.5; // px: los bordes detectados quedan un poco hacia afuera por la dilatación y la sombra

let ready = null;

/** Descarga y arranca OpenCV dentro del worker. */
function loadCv() {
  ready ??= (async () => {
    const res = await fetch(OPENCV_URL, { integrity: OPENCV_SRI });
    if (!res.ok) throw new Error(`OpenCV no disponible (${res.status})`);
    (0, eval)(await res.text()); // define `cv` en el ámbito global del worker
    for (let i = 0; i < 600 && !self.cv?.Mat; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!self.cv?.Mat) throw new Error('OpenCV no terminó de iniciar');
    return { cv: self.cv }; // envuelto: el objeto cv es "thenable"
  })();
  ready.catch(() => (ready = null)); // permite reintentar
  return ready;
}

self.onmessage = async ({ data }) => {
  const { id, imageData, aspect } = data;
  try {
    const { cv } = await loadCv();
    const quad = findBest(cv, imageData, aspect);
    self.postMessage({ id, quad: quad ? insetQuad(quad, EDGE_INSET) : null });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};

function findBest(cv, imageData, aspect) {
  const mats = [];
  const keep = (m) => (mats.push(m), m);
  try {
    const W = imageData.width, H = imageData.height, A = W * H;
    const src = keep(cv.matFromImageData(imageData));
    const gray = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

    const rgb = keep(new cv.Mat());
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const hsv = keep(new cv.Mat());
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const channels = keep(new cv.MatVector());
    cv.split(hsv, channels);
    const sat = keep(channels.get(1));
    cv.GaussianBlur(sat, sat, new cv.Size(5, 5), 0);

    const kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    const bigKernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)));
    const candidates = [];

    const consider = (contour, weight) => {
      const area = cv.contourArea(contour);
      if (area < 0.12 * A) return;
      const hull = keep(new cv.Mat());
      cv.convexHull(contour, hull);
      const peri = cv.arcLength(hull, true);
      let quad = null;
      for (const eps of [0.015, 0.025, 0.04]) {
        const approx = keep(new cv.Mat());
        cv.approxPolyDP(hull, approx, eps * peri, true);
        if (approx.rows === 4) {
          quad = [0, 1, 2, 3].map((i) => ({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] }));
          break;
        }
      }
      if (!quad) {
        // Sin 4 vértices claros: rectángulo rotado mínimo, con menos confianza.
        quad = cv.RotatedRect.points(cv.minAreaRect(hull)).map((p) => ({ x: p.x, y: p.y }));
        weight *= 0.7;
      }
      quad = orderQuad(quad);
      if (!isConvex(quad)) return;
      candidates.push({ quad, score: score(quad, W, H, aspect) * weight * Math.min(1, area / quadArea(quad)) });
    };

    const collect = (binary, weight) => {
      const contours = keep(new cv.MatVector());
      const hierarchy = keep(new cv.Mat());
      cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) consider(keep(contours.get(i)), weight);
    };

    // 1) Bordes (Canny) con dos sensibilidades.
    for (const [lo, hi] of [[20, 60], [50, 150]]) {
      const edges = keep(new cv.Mat());
      cv.Canny(gray, edges, lo, hi);
      cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);
      collect(edges, 1);
    }

    // 2) Umbral automático (Otsu) sobre brillo y saturación, en ambas polaridades.
    for (const channel of [gray, sat]) {
      for (const type of [cv.THRESH_BINARY, cv.THRESH_BINARY_INV]) {
        const bin = keep(new cv.Mat());
        cv.threshold(channel, bin, 0, 255, type | cv.THRESH_OTSU);
        cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, bigKernel);
        cv.morphologyEx(bin, bin, cv.MORPH_OPEN, bigKernel);
        collect(bin, 0.9);
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] && candidates[0].score > 0.15 ? candidates[0].quad : null;
  } finally {
    mats.forEach((m) => m.delete());
  }
}

function score(quad, W, H, aspect) {
  let s = quadArea(quad) / (W * H);
  // Un contorno pegado a todo el borde de la foto casi siempre es el marco de la imagen, no la hoja.
  const margin = Math.min(W, H) * 0.01;
  const onBorder = quad.filter((p) => p.x < margin || p.y < margin || p.x > W - margin || p.y > H - margin).length;
  if (onBorder >= 3) s *= 0.35;
  if (aspect) {
    const { w, h } = quadSize(quad);
    const ratio = Math.max(w, h) / Math.min(w, h);
    s *= Math.exp(-Math.abs(Math.log(ratio / aspect)) * 4);
  }
  return s;
}
