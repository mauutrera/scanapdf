// Carga de fotos desde el dispositivo. Nada sale del navegador: se trabaja con canvas y URLs blob locales.

const MAX_SIDE = 3200; // px; suficiente para 300 ppp en carta y evita agotar memoria en el celular

let nextId = 1;

/**
 * @typedef {object} ScanImage
 * @property {number} id
 * @property {string} name
 * @property {HTMLCanvasElement} canvas  foto completa (orientación EXIF ya aplicada)
 * @property {{x:number,y:number}[]|null} quad  recorte elegido
 * @property {HTMLCanvasElement|null} result    recorte enderezado
 * @property {string|null} url                  URL blob de `result` para mostrarlo
 * @property {boolean} detected                 si el recorte vino de la detección automática
 */

/** @param {File} file @returns {Promise<ScanImage>} */
export async function loadImage(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    throw new Error(`"${file.name}" es un PDF. Para darle estilo escaneado usa la opción "PDF" del menú.`);
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" no es una imagen.`);
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`No se pudo abrir "${file.name}". Si es HEIC (iPhone), cámbiala a JPG o configura la cámara en "Más compatible".`);
  }
  const s = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * s);
  canvas.height = Math.round(bitmap.height * s);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { id: nextId++, name: file.name, canvas, quad: null, result: null, url: null, detected: false };
}

/** Reemplaza el resultado mostrado de una imagen. */
export async function setResult(image, canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (image.url) URL.revokeObjectURL(image.url);
  image.result = canvas;
  image.url = URL.createObjectURL(blob);
}

export function releaseImage(image) {
  if (image?.url) URL.revokeObjectURL(image.url);
}

/** Imágenes de un evento de arrastrar o pegar. */
export function imageFilesFrom(dataTransfer) {
  return [...(dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
}

/** Activa arrastrar y soltar sobre un elemento. */
export function onDropImages(el, handler) {
  const over = (e) => {
    e.preventDefault();
    el.dataset.dragging = 'true';
  };
  const leave = () => delete el.dataset.dragging;
  el.addEventListener('dragenter', over);
  el.addEventListener('dragover', over);
  el.addEventListener('dragleave', leave);
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    leave();
    const files = imageFilesFrom(e.dataTransfer);
    if (files.length) handler(files);
  });
}
