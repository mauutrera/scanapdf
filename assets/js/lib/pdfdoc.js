// Lectura de PDFs digitales con pdf.js (cargado bajo demanda desde jsDelivr).
// Cada página se dibuja en un canvas para después aplicarle el efecto escaneado.
import { MM_PER_INCH } from './paper.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174';
// Huella de pdf.min.js (SRI): si el CDN entregara otro contenido, el navegador no lo ejecuta.
const PDFJS_SRI = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
const MAX_PIXELS = 16_000_000; // límite seguro de un canvas en celulares (iOS ≈ 16.7 MP)
const MAX_PAGES = 300;

let loading = null;

/** @returns {Promise<{lib: any}>} envuelto en objeto para no depender de cómo se resuelve el global */
function loadPdfJs() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS}/build/pdf.min.js`;
    script.integrity = PDFJS_SRI;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) return reject(new Error('No se pudo iniciar el lector de PDF.'));
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/build/pdf.worker.min.js`;
      resolve({ lib });
    };
    script.onerror = () => reject(new Error('No se pudo descargar el lector de PDF. Revisa tu conexión.'));
    document.head.append(script);
  });
  loading.catch(() => (loading = null)); // permite reintentar
  return loading;
}

/**
 * Abre un PDF y devuelve su documento y el tamaño de cada página en mm.
 * @param {File} file
 * @returns {Promise<{doc: any, name: string, pages: {w:number, h:number}[]}>}
 */
export async function openPdf(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) throw new Error(`"${file.name}" no es un PDF.`);

  const { lib } = await loadPdfJs();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false, // compatible con la CSP de la página
    cMapUrl: `${PDFJS}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS}/standard_fonts/`,
  });
  // Sin onPassword, pdf.js rechaza con PasswordException si el archivo pide contraseña.
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err?.name === 'PasswordException' || /password/i.test(String(err?.message))) {
      throw new Error('Este PDF está protegido con contraseña. Quítale la protección e inténtalo de nuevo.');
    }
    if (err?.name === 'InvalidPDFException') throw new Error(`"${file.name}" está dañado o no es un PDF válido.`);
    throw new Error(`No se pudo abrir "${file.name}".`);
  }

  if (doc.numPages > MAX_PAGES) {
    await doc.destroy();
    throw new Error(`El PDF tiene ${doc.numPages} páginas; el máximo es ${MAX_PAGES}. Divídelo en partes.`);
  }

  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 }); // ya considera la rotación de la página
    pages.push({ w: (vp.width / 72) * MM_PER_INCH, h: (vp.height / 72) * MM_PER_INCH });
    page.cleanup();
  }
  return { doc, name: file.name, pages };
}

/**
 * Dibuja una página (1 = primera) sobre fondo blanco a la resolución pedida.
 * Baja la resolución si el canvas resultante sería demasiado grande para el dispositivo.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPdfPage(doc, n, dpi) {
  const page = await doc.getPage(n);
  let scale = dpi / 72;
  const base = page.getViewport({ scale: 1 });
  const px = base.width * base.height * scale * scale;
  if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent "print": dibuja todo de una vez (sin esperar cuadros de animación) e incluye anotaciones imprimibles.
  await page.render({ canvasContext: ctx, viewport, intent: 'print', background: '#ffffff' }).promise;
  page.cleanup();
  return canvas;
}
