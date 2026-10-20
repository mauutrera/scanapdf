// Medidas físicas en milímetros. Todo el layout se calcula en mm y se convierte al final
// (porcentajes en la vista previa, puntos en el PDF, píxeles en el canvas).

export const PAPERS = {
  carta:  { label: 'Carta',  w: 215.9, h: 279.4 },
  oficio: { label: 'Oficio', w: 216,   h: 340 },   // oficio mexicano
  a4:     { label: 'A4',     w: 210,   h: 297 },
};

// Márgenes predefinidos (superior, derecho, inferior, izquierdo).
export const MARGINS = {
  none:   { label: 'Sin margen', t: 0,    r: 0,    b: 0,    l: 0 },
  narrow: { label: 'Estrecho',   t: 12.7, r: 12.7, b: 12.7, l: 12.7 },
  normal: { label: 'Normal',     t: 25,   r: 30,   b: 25,   l: 30 },
};

// Tarjeta ISO/IEC 7810 ID-1 (INE, licencias, tarjetas bancarias).
export const ID1 = { w: 85.6, h: 53.98, radius: 3.18 };

export const MM_PER_INCH = 25.4;
export const PT_PER_MM = 72 / MM_PER_INCH;

/** Tamaño de hoja con la orientación aplicada. */
export function pageSize(paperKey, landscape = false) {
  const p = PAPERS[paperKey] ?? PAPERS.carta;
  return landscape ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

export function formatMm(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
