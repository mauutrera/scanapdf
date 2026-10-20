// Reconocimiento de texto (OCR) con Tesseract.js, en el navegador: las fotos no salen del dispositivo.
// La primera vez descarga el motor (~4 MB) y el idioma (~2–3 MB); el navegador los guarda para la siguiente.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist';
// Huella de tesseract.min.js (SRI): si el CDN entregara otro contenido, el navegador no lo ejecuta.
const TESSERACT_SRI = 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const LANG_DATA = (lang) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int`;

export const LANGUAGES = { spa: 'Español', eng: 'Inglés' };

let library = null;
const workers = new Map(); // idioma -> Promise<worker>
let onProgress = null;     // progreso del reconocimiento en curso

/** @returns {Promise<{T: any}>} */
function loadLibrary() {
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${TESSERACT}/tesseract.min.js`;
    script.integrity = TESSERACT_SRI;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => (window.Tesseract ? resolve({ T: window.Tesseract }) : reject(new Error('No se pudo iniciar el lector de texto.')));
    script.onerror = () => reject(new Error('No se pudo descargar el lector de texto. Revisa tu conexión.'));
    document.head.append(script);
  });
  library.catch(() => (library = null));
  return library;
}

function getWorker(lang) {
  if (!workers.has(lang)) {
    const created = loadLibrary().then(({ T }) => T.createWorker(lang, 1 /* LSTM */, {
      workerPath: `${TESSERACT}/worker.min.js`,
      corePath: CORE,
      langPath: LANG_DATA(lang),
      workerBlobURL: true, // el worker se crea desde una URL blob (la página lo permite en su CSP)
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress);
      },
    }).then(async (worker) => {
      // Segmentación automática (modo 3). El modo por defecto de Tesseract.js trata la página como un solo
      // bloque y descarta títulos grandes o texto separado del cuerpo.
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
      return { worker };
    }));
    created.catch(() => workers.delete(lang));
    workers.set(lang, created);
  }
  return workers.get(lang);
}

/** Empieza a descargar el motor y el idioma en segundo plano. */
export function warmUpOcr(lang = 'spa') {
  getWorker(lang).catch(() => {});
}

/**
 * @typedef {{x0:number,y0:number,x1:number,y1:number}} Box
 * @typedef {{text:string, bbox:Box}} Word
 * @typedef {{text:string, bbox:Box, words:Word[]}} Line
 * @typedef {{lines:Line[], bbox:Box}} Paragraph
 * @typedef {{width:number, height:number, paragraphs:Paragraph[], text:string, confidence:number}} OcrResult
 */

/**
 * Reconoce el texto de una imagen.
 * @param {HTMLCanvasElement} canvas
 * @param {keyof LANGUAGES} lang
 * @param {(p:number) => void} [progress]  0–1
 * @returns {Promise<OcrResult>}
 */
export async function recognize(canvas, lang = 'spa', progress) {
  let worker;
  try {
    ({ worker } = await getWorker(lang));
  } catch (err) {
    throw new Error(err?.message?.startsWith('No se pudo') ? err.message : 'No se pudo preparar el lector de texto.');
  }
  onProgress = progress ?? null;
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const paragraphs = [];
    for (const block of data.blocks ?? []) {
      for (const p of block.paragraphs ?? []) {
        const lines = (p.lines ?? [])
          .map((l) => ({
            text: l.text.replace(/\s+$/, ''),
            bbox: l.bbox,
            // Altura de la línea base (donde se apoyan las letras); mide el interlineado mejor que el rectángulo.
            base: l.baseline ? (l.baseline.y0 + l.baseline.y1) / 2 : l.bbox.y1,
            words: (l.words ?? []).filter((w) => w.text.trim()).map((w) => ({ text: w.text, bbox: w.bbox })),
          }))
          .filter((l) => l.words.length);
        if (lines.length) paragraphs.push({ lines, bbox: p.bbox });
      }
    }
    return { width: canvas.width, height: canvas.height, paragraphs, text: paragraphsToText(paragraphs), confidence: data.confidence ?? 0 };
  } finally {
    onProgress = null;
  }
}

/**
 * Texto legible: una línea en blanco entre párrafos y las líneas de un párrafo unidas
 * (si una línea termina en guion y la siguiente sigue en minúscula, se une la palabra cortada).
 * Los párrafos se arman por el espacio vertical entre líneas: los que detecta Tesseract
 * suelen cortar un mismo párrafo en varios.
 */
export function paragraphsToText(paragraphs) {
  const lines = paragraphs.flatMap((p) => p.lines);
  if (!lines.length) return '';
  const baseOf = (l) => l.base ?? l.bbox.y1;
  // Interlineado típico: distancia entre líneas base consecutivas (solo las que avanzan hacia abajo).
  const pitches = lines.slice(1).map((l, i) => baseOf(l) - baseOf(lines[i])).filter((d) => d > 0).sort((a, b) => a - b);
  const heights = lines.map((l) => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
  // Cuartil inferior: en páginas con pocas líneas, los saltos de párrafo pesan mucho en la mediana.
  const pitch = pitches[Math.floor(pitches.length / 4)] || (heights[Math.floor(heights.length / 2)] || 1) * 1.5;

  const groups = [];
  let prev = null;
  for (const line of lines) {
    const step = prev ? baseOf(line) - baseOf(prev) : 0;
    // Párrafo nuevo si el salto entre líneas base es claramente mayor al interlineado (línea en blanco)
    // o si el texto "retrocede" hacia arriba (otra columna). El rectángulo de la línea no sirve para esto:
    // cambia con acentos, "¿" y letras como p o g.
    const newParagraph = !prev || step > pitch * 1.45 || step <= 0;
    if (newParagraph) groups.push([]);
    groups[groups.length - 1].push(line.text.trim());
    prev = line;
  }

  return groups
    .map((g) => g.reduce((acc, t) => {
      if (!acc) return t;
      if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]-$/.test(acc) && /^[a-záéíóúüñ]/.test(t)) return acc.slice(0, -1) + t;
      return `${acc} ${t}`;
    }, ''))
    .filter(Boolean)
    .join('\n\n');
}
