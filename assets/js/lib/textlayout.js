// Texto dentro del PDF: capa invisible sobre la imagen escaneada (texto seleccionable y buscable), palabra por palabra.
// También convierte el texto editado en bloques para el .docx.
import { PT_PER_MM } from './paper.js';
import { pdfText } from './pdf.js';

// Arial y Liberation Sans tienen las mismas medidas que Helvetica, la fuente estándar del PDF.
const FONT_STACK = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const measureCtx = document.createElement('canvas').getContext('2d');

/** Ancho en puntos de un texto en Helvetica al tamaño dado. */
function textWidth(text, sizePt) {
  measureCtx.font = `100px ${FONT_STACK}`;
  return (measureCtx.measureText(text).width * sizePt) / 100;
}

const n = (v) => Math.round(v * 100) / 100;

/**
 * Capa de texto invisible (modo de render 3) alineada con las palabras reconocidas.
 * @param {import('./ocr.js').OcrResult} ocr
 * @param {{x:number,y:number,w:number,h:number}} rect  dónde quedó la imagen en la hoja (mm)
 * @param {{w:number,h:number}} page                    tamaño de la hoja (mm)
 * @returns {string} operadores PDF
 */
export function invisibleTextOps(ocr, rect, page) {
  const sx = (rect.w / ocr.width) * PT_PER_MM;
  const sy = (rect.h / ocr.height) * PT_PER_MM;
  const ox = rect.x * PT_PER_MM;
  const top = (page.h - rect.y) * PT_PER_MM; // borde superior de la imagen, en coordenadas PDF (y hacia arriba)
  let ops = 'BT 3 Tr\n';
  for (const p of ocr.paragraphs) {
    for (const line of p.lines) {
      const lineH = (line.bbox.y1 - line.bbox.y0) * sy;
      const size = Math.max(3, lineH * 0.9);
      const baseline = top - line.bbox.y1 * sy + size * 0.2;
      line.words.forEach((word, i) => {
        const next = line.words[i + 1];
        // Cada palabra lleva su espacio (también la última del renglón) para que al copiar el texto salga separado.
        const text = `${word.text} `;
        const x = ox + word.bbox.x0 * sx;
        const target = ((next ? next.bbox.x0 : word.bbox.x1) - word.bbox.x0) * sx;
        // La última palabra se ajusta sin su espacio final, que queda fuera del renglón.
        const natural = textWidth(next ? text : word.text, size);
        const scale = natural > 0 ? Math.min(500, Math.max(20, (target / natural) * 100)) : 100;
        ops += `/F1 ${n(size)} Tf ${n(scale)} Tz 1 0 0 1 ${n(x)} ${n(baseline)} Tm ${pdfText(text)} Tj\n`;
      });
    }
  }
  return `${ops}ET\n`;
}

/**
 * Divide el texto editado en bloques: párrafos separados por línea en blanco;
 * un párrafo que empieza con "# " es un título.
 * @returns {{heading: boolean, lines: string[]}[]}
 */
export function parseBlocks(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = /^#\s+/.test(block);
      const body = heading ? block.replace(/^#\s+/, '') : block;
      return { heading, lines: body.split('\n').map((l) => l.trim()).filter(Boolean) };
    });
}
