// Exportación: compone las hojas a alta resolución en el grupo de hilos (varias a la vez) y las entrega
// como PDF o JPG, en el mismo orden.
import { buildPdf } from './pdf.js';
import { composeEncoded, mapLimit, THREADS } from './threads.js';
import { status, toast } from './form.js';

const JPEG = { type: 'image/jpeg', quality: 0.85 };

/** Nombre de archivo con fecha y hora: credencial-2026-10-18-1530.pdf */
export function fileName(prefix, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Compone una hoja a la resolución de exportación y la codifica en JPEG (en un hilo del grupo).
 * Si la hoja trae `render(dpi)`, su imagen se genera antes en la página (p. ej. una página de PDF con pdf.js).
 */
async function composeSheet(sheet, dpi) {
  const source = sheet.render ? await sheet.render(dpi) : null;
  const options = source ? { ...sheet.options, sourceFor: () => source } : sheet.options;
  const out = await composeEncoded(sheet.layout, options, dpi, JPEG);
  if (source) source.width = source.height = 0; // libera la memoria cuanto antes (importante en celulares)
  return out;
}

/**
 * @param {{layout: object, options: object, render?: (dpi:number) => Promise<HTMLCanvasElement>, ops?: string}[]} sheets
 *        una entrada por hoja: su layout, las opciones de composePage (sin dpi), opcionalmente cómo generar su imagen
 *        y operadores PDF extra (texto) para esa hoja
 * @param {{format: 'pdf'|'jpg', dpi: number, prefix: string, title: string}} o
 */
export async function exportSheets(sheets, { format, dpi, prefix, title }) {
  const label = format === 'pdf' ? 'Generando PDF' : sheets.length > 1 ? 'Generando imágenes' : 'Generando imagen';
  const done = status(`${label}…`);
  let finished = 0;
  try {
    // Varias hojas a la vez: tantas como hilos, para aprovechar el procesador sin agotar la memoria.
    const results = await mapLimit(sheets, THREADS, async (sheet) => {
      const out = await composeSheet(sheet, dpi);
      finished++;
      if (sheets.length > 1) done.update(`${label}… ${finished} de ${sheets.length}`);
      return out;
    });

    if (format === 'pdf') {
      const pages = await Promise.all(results.map(async (r, i) => ({
        jpeg: new Uint8Array(await r.blob.arrayBuffer()),
        width: r.width, height: r.height,
        wMm: sheets[i].layout.page.w, hMm: sheets[i].layout.page.h,
        ops: sheets[i].ops, // capa de texto opcional (p. ej. texto reconocido, invisible)
      })));
      const pdf = buildPdf(pages, { title });
      download(pdf, fileName(prefix, 'pdf'));
      return pdf;
    }

    results.forEach((r, i) => download(r.blob, fileName(sheets.length > 1 ? `${prefix}-p${i + 1}` : prefix, 'jpg')));
    return null;
  } catch (err) {
    console.error(err);
    toast('No se pudo generar el archivo. Si el documento tiene muchas páginas, prueba con una resolución menor.');
    return null;
  } finally {
    done();
  }
}
