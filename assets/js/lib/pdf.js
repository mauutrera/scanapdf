// Generador de PDF mínimo, sin dependencias.
// Cada página puede llevar una imagen JPEG a tamaño completo y/o texto (operadores PDF en `ops`)
// con la fuente estándar Helvetica (/F1), codificación WinAnsi.
import { PT_PER_MM } from './paper.js';

const enc = new TextEncoder();

/**
 * @typedef {object} PdfPage
 * @property {number} wMm  ancho de la hoja
 * @property {number} hMm  alto de la hoja
 * @property {Uint8Array} [jpeg]  imagen a página completa (JPEG)
 * @property {{data: Uint8Array, gray: boolean}} [flate]  o imagen sin pérdida: píxeles RGB/gris comprimidos con zlib
 * @property {number} [width]     ancho de la imagen en px
 * @property {number} [height]    alto de la imagen en px
 * @property {string} [ops]       operadores de contenido adicionales (texto), dibujados encima de la imagen
 */

/**
 * @param {PdfPage[]} pages
 * @param {{title?: string}} [meta]
 * @returns {Blob}
 */
export function buildPdf(pages, { title = 'Escaneo' } = {}) {
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // Objetos: 1 catálogo, 2 árbol de páginas, 3 info, 4 fuente; luego 3 por página (página, contenido, imagen).
  const pageId = (i) => 5 + i * 3;
  const total = 4 + pages.length * 3;

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // comentario binario: marca el archivo como binario
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  object(3, () => push(`<< /Title ${pdfText(title)} /Producer (ScanaPDF) /CreationDate (D:${pdfDate(new Date())}) >>`));
  object(4, () => push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));

  pages.forEach((p, i) => {
    const id = pageId(i);
    const w = round(p.wMm * PT_PER_MM);
    const h = round(p.hMm * PT_PER_MM);
    const hasImage = !!(p.jpeg || p.flate);
    const content = (hasImage ? `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n` : '') + (p.ops ?? '');
    const resources = [
      hasImage ? `/XObject << /Im0 ${id + 2} 0 R >>` : '',
      p.ops ? '/Font << /F1 4 0 R >>' : '',
    ].join(' ');
    object(id, () => push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << ${resources} >> /Contents ${id + 1} 0 R >>`,
    ));
    const bytes = enc.encode(content); // el contenido es ASCII: los acentos van como escapes octales
    object(id + 1, () => {
      push(`<< /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push('\nendstream');
    });
    object(id + 2, () => {
      if (!hasImage) return push('null'); // objeto vacío para mantener la numeración
      const bytes = p.jpeg ?? p.flate.data;
      const space = p.flate?.gray ? '/DeviceGray' : '/DeviceRGB';
      const filter = p.jpeg ? '/DCTDecode' : '/FlateDecode';
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter ${filter} /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push('\nendstream');
    });
  });

  const xref = length;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= total; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Píxeles de un canvas como imagen sin pérdida para el PDF (FlateDecode = zlib).
 * En gris usa un solo canal: un tercio del tamaño.
 * @returns {Promise<{data: Uint8Array, gray: boolean, width: number, height: number}>}
 */
export async function flateImage(canvas, gray = false) {
  const { width, height } = canvas;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const raw = new Uint8Array(width * height * (gray ? 1 : 3));
  for (let i = 0, j = 0; i < px.length; i += 4) {
    if (gray) raw[j++] = px[i];
    else { raw[j++] = px[i]; raw[j++] = px[i + 1]; raw[j++] = px[i + 2]; }
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  const data = new Uint8Array(await new Response(stream).arrayBuffer());
  return { data, gray, width, height };
}

// Caracteres de Windows-1252 fuera de Latin-1 (posiciones 0x80–0x9F).
const CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/**
 * Texto como string literal de PDF en WinAnsi (Windows-1252): ASCII tal cual, el resto como escape octal.
 * Lo que no existe en WinAnsi se aproxima sin acento o se reemplaza por "?".
 */
export function pdfText(s) {
  let out = '(';
  for (const ch of String(s)) {
    let code = ch.codePointAt(0);
    if (CP1252[ch] !== undefined) code = CP1252[ch];
    else if (code > 0xff || (code >= 0x80 && code < 0xa0)) {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      code = base.length === 1 && base.codePointAt(0) < 0x80 ? base.codePointAt(0) : 0x3f;
    }
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 0x20 || code > 0x7e) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
