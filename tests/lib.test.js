// Pruebas de las funciones puras del motor (sin navegador): `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderQuad, isConvex, quadArea, quadSize, fullQuad } from '../assets/js/lib/geometry.js';
import { pageSize } from '../assets/js/lib/paper.js';
import { pdfText, buildPdf } from '../assets/js/lib/pdf.js';
import { paragraphsToText } from '../assets/js/lib/ocr.js';
import { buildDocx } from '../assets/js/lib/docx.js';

test('orderQuad ordena en sentido horario desde arriba a la izquierda', () => {
  const q = orderQuad([{ x: 10, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 10 }, { x: 90, y: 90 }]);
  assert.deepEqual(q, [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]);
});

test('isConvex, quadArea y quadSize de un rectángulo', () => {
  const q = fullQuad(40, 20);
  assert.equal(isConvex(q), true);
  assert.equal(quadArea(q), 800);
  assert.deepEqual(quadSize(q), { w: 40, h: 20 });
  assert.equal(isConvex([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), false); // cruzado
});

test('pageSize gira la hoja y usa carta si no la conoce', () => {
  assert.deepEqual(pageSize('carta', true), { w: 279.4, h: 215.9 });
  assert.deepEqual(pageSize('desconocido'), pageSize('carta'));
});

test('pdfText escapa paréntesis y codifica acentos en WinAnsi', () => {
  assert.equal(pdfText('a(b)\\'), '(a\\(b\\)\\\\)');
  assert.equal(pdfText('ñ€'), '(\\361\\200)');
  assert.equal(pdfText('ő'), '(o)'); // fuera de WinAnsi: sin acento
  assert.equal(pdfText('漢'), '(?)');
});

test('buildPdf arma una tabla xref con desplazamientos correctos', async () => {
  const blob = buildPdf([{ wMm: 215.9, hMm: 279.4, ops: 'BT /F1 12 Tf (Hola) Tj ET' }], { title: 'Prueba' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(xref).startsWith('xref'));
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}`));
});

test('paragraphsToText une líneas, palabras cortadas con guion y separa párrafos', () => {
  const line = (text, base) => ({ text, base, bbox: { x0: 0, y0: base - 10, x1: 100, y1: base }, words: [{ text }] });
  const text = paragraphsToText([{ lines: [
    line('Hola mun-', 20), line('do de prueba', 40), line('sigue aquí', 60), line('Otro párrafo', 120),
  ] }]);
  assert.equal(text, 'Hola mundo de prueba sigue aquí\n\nOtro párrafo');
});

test('buildDocx genera un ZIP con los archivos del documento', async () => {
  const blob = buildDocx([[{ heading: true, lines: ['Título'] }, { heading: false, lines: ['a < b & c'] }]], { w: 215.9, h: 279.4 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) assert.ok(text.includes(name), name);
  assert.ok(text.includes('a &lt; b &amp; c'));
});
