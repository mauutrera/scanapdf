// Detección automática del contorno de una hoja o tarjeta en una foto.
// El trabajo pesado lo hace detect.worker.js (OpenCV.js en segundo plano); si el worker o OpenCV
// no están disponibles, devuelve null y la app sigue con el ajuste manual de esquinas.

const WORK_SIZE = 720;          // px del lado largo de la copia que se analiza
const FIRST_TIMEOUT_MS = 60_000; // la primera vez se descarga OpenCV (~10 MB)
const TIMEOUT_MS = 15_000;

let worker = null;
let warmed = false;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./detect.worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('No se pudo iniciar el detector', err);
    return null;
  }
  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    clearTimeout(job.timer);
    if (data.error) console.warn('Detección de contorno falló:', data.error);
    else warmed = true;
    job.resolve(data.quad ?? null);
  };
  worker.onerror = (e) => {
    console.warn('El detector se detuvo', e.message);
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.resolve(null);
    }
    pending.clear();
    worker = null;
  };
  return worker;
}

/**
 * @param {HTMLCanvasElement} canvas  foto completa
 * @param {{aspect?: number}} [opts]  proporción esperada (lado largo / lado corto), p. ej. 1.586 para credenciales
 * @returns {Promise<{x:number,y:number}[]|null>} quad en píxeles de `canvas`, o null si no hay detección confiable
 */
export function detectQuad(canvas, { aspect = null } = {}) {
  const w = getWorker();
  if (!w) return Promise.resolve(null);

  const scale = Math.min(1, WORK_SIZE / Math.max(canvas.width, canvas.height));
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const imageData = ctx.getImageData(0, 0, small.width, small.height);

  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, warmed ? TIMEOUT_MS : FIRST_TIMEOUT_MS);
    pending.set(id, {
      timer,
      resolve: (quad) => resolve(quad ? quad.map((p) => ({ x: p.x / scale, y: p.y / scale })) : null),
    });
    w.postMessage({ id, imageData, aspect }, [imageData.data.buffer]);
  });
}

/** Empieza a descargar OpenCV en segundo plano para que la primera detección sea rápida. */
export function warmUpDetector() {
  const w = getWorker();
  if (!w || warmed) return;
  const tiny = new ImageData(8, 8);
  const id = nextId++;
  pending.set(id, { timer: 0, resolve: () => {} });
  w.postMessage({ id, imageData: tiny, aspect: null }, [tiny.data.buffer]);
}
