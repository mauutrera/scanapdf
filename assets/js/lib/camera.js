// Cámara integrada: vista en vivo con el contorno detectado, ráfaga de varias fotos, linterna y cambio de cámara.
// Devuelve las fotos como File para que sigan el mismo camino que las elegidas desde el dispositivo.
import { detectQuad } from './detect.js';

const SVG = 'http://www.w3.org/2000/svg';
const LIVE_SIZE = 480;        // px del cuadro que se analiza en vivo
const LIVE_INTERVAL_MS = 350;

/** ¿Este navegador puede abrir la cámara dentro de la página? */
export function cameraSupported() {
  return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

/** Mensaje claro para cada motivo por el que la cámara no abre. */
function cameraError(err) {
  if (!window.isSecureContext) return 'La cámara solo funciona en sitios con HTTPS.';
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró una cámara en este dispositivo.';
    case 'NotReadableError':
      return 'La cámara está ocupada por otra aplicación. Ciérrala e inténtalo de nuevo.';
    default:
      return 'No se pudo abrir la cámara.';
  }
}

/**
 * Abre la cámara a pantalla completa.
 * @param {object} o
 * @param {number} [o.max]          número máximo de fotos (1 = una sola; se cierra al tomarla)
 * @param {string[]} [o.labels]     qué fotografiar en cada toma, p. ej. ['Frente', 'Reverso']
 * @param {string} [o.hint]         instrucción general
 * @param {number|null} [o.aspect]  proporción esperada del objeto (lado largo / corto) para la guía y la detección
 * @returns {Promise<File[]>} fotos tomadas (vacío si se cancela)
 * @throws {Error} con un mensaje legible si la cámara no está disponible
 */
export async function openCamera({ max = Infinity, labels = [], hint = 'Encuadra la hoja completa sobre un fondo que contraste.', aspect = null } = {}) {
  if (!cameraSupported()) throw new Error(cameraError(null));

  let facing = 'environment';
  let stream;
  const start = async () => {
    stream?.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
    } catch (err) {
      throw new Error(cameraError(err));
    }
  };
  await start();

  return new Promise((resolve) => {
    const shots = [];
    const dialog = document.createElement('dialog');
    dialog.className = 'm-0 h-full max-h-none w-full max-w-none bg-black p-0 text-white backdrop:bg-black';
    dialog.setAttribute('aria-label', 'Cámara');
    dialog.innerHTML = `
      <div class="flex h-full flex-col">
        <header class="flex items-center justify-between gap-3 px-3 pb-2 pt-3">
          <button type="button" class="btn px-3 text-white hover:bg-white/10" data-cancel>Cancelar</button>
          <p class="min-w-0 flex-1 text-center text-sm" data-prompt role="status"></p>
          <span class="flex gap-1">
            <button type="button" class="btn px-3 text-white hover:bg-white/10" data-torch hidden aria-pressed="false" title="Linterna">Luz</button>
            <button type="button" class="btn px-3 text-white hover:bg-white/10" data-flip title="Cambiar cámara" aria-label="Cambiar cámara">⇄</button>
          </span>
        </header>
        <div class="relative min-h-0 flex-1">
          <video class="absolute inset-0 h-full w-full object-contain" playsinline muted autoplay data-video></video>
          <svg class="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" data-svg>
            <rect fill="none" stroke="rgb(255 255 255 / .5)" stroke-width="2" stroke-dasharray="10 8" vector-effect="non-scaling-stroke" data-guide></rect>
            <polygon fill="rgb(45 212 191 / .18)" stroke="#2dd4bf" stroke-width="3" vector-effect="non-scaling-stroke" data-live hidden></polygon>
          </svg>
          <div class="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-150" data-flash></div>
        </div>
        <footer class="grid grid-cols-3 items-center gap-3 px-4 pb-6 pt-4">
          <div class="flex items-center gap-2" data-strip></div>
          <div class="flex justify-center">
            <button type="button" class="h-[4.5rem] w-[4.5rem] rounded-full border-4 border-white bg-white/20 transition active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-lamp-400" data-shutter aria-label="Tomar foto"></button>
          </div>
          <div class="flex justify-end">
            <button type="button" class="btn btn-primary px-4" data-done hidden>Listo</button>
          </div>
        </footer>
      </div>`;
    const $ = (s) => dialog.querySelector(`[data-${s}]`);
    const video = $('video');
    const svg = $('svg');

    let finished = false;
    let liveTimer = 0;
    const finish = (files) => {
      if (finished) return;
      finished = true;
      clearTimeout(liveTimer);
      stream?.getTracks().forEach((t) => t.stop());
      openWatch.disconnect();
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(files);
    };
    const openWatch = new MutationObserver(() => {
      if (!dialog.open) finish(shots);
    });

    function updatePrompt() {
      const n = shots.length;
      const label = labels[n];
      $('prompt').textContent = label ? `${label}: ${hint}` : n ? `${n} ${n === 1 ? 'foto' : 'fotos'} · ${hint}` : hint;
      $('done').hidden = n === 0 || max === 1;
      $('done').textContent = `Listo (${n})`;
    }

    async function attach() {
      video.srcObject = stream;
      await video.play().catch(() => {});
      await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
      const w = video.videoWidth, h = video.videoHeight;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      // Guía: rectángulo con la proporción esperada (credencial) o margen general (hoja).
      const guide = $('guide');
      const ratio = aspect ? (w >= h ? aspect : 1 / aspect) : null;
      let gw = w * 0.86, gh = ratio ? gw / ratio : h * 0.86;
      if (gh > h * 0.86) { gh = h * 0.86; gw = ratio ? gh * ratio : w * 0.86; }
      Object.entries({ x: (w - gw) / 2, y: (h - gh) / 2, width: gw, height: gh, rx: aspect ? gw * 0.04 : 0 })
        .forEach(([k, v]) => guide.setAttribute(k, v));
      // Linterna, si el dispositivo la tiene.
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() ?? {};
      $('torch').hidden = !caps.torch;
    }

    /** Analiza el video cada poco y dibuja el contorno encontrado. */
    async function liveLoop() {
      if (finished) return;
      if (video.videoWidth && document.visibilityState === 'visible') {
        const s = LIVE_SIZE / Math.max(video.videoWidth, video.videoHeight);
        const frame = document.createElement('canvas');
        frame.width = Math.round(video.videoWidth * s);
        frame.height = Math.round(video.videoHeight * s);
        frame.getContext('2d').drawImage(video, 0, 0, frame.width, frame.height);
        const quad = await detectQuad(frame, { aspect });
        if (finished) return;
        const live = $('live');
        live.toggleAttribute('hidden', !quad); // en SVG, .hidden no existe como propiedad: se usa el atributo
        if (quad) live.setAttribute('points', quad.map((p) => `${p.x / s},${p.y / s}`).join(' '));
      }
      liveTimer = setTimeout(liveLoop, LIVE_INTERVAL_MS);
    }

    // Las capturas se encadenan: "Listo" espera a que termine la última para no perderla.
    let pending = Promise.resolve();
    const shootQueued = () => (pending = pending.then(shoot));
    const finishWhenReady = () => pending.then(() => finish(shots));

    async function shoot() {
      if (finished || shots.length >= max || !video.videoWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const flash = $('flash');
      flash.classList.replace('opacity-0', 'opacity-70');
      setTimeout(() => flash.classList.replace('opacity-70', 'opacity-0'), 120);
      navigator.vibrate?.(25);

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      const n = shots.length + 1;
      const name = labels[n - 1] ? `${labels[n - 1].toLowerCase()}.jpg` : `foto-${String(n).padStart(2, '0')}.jpg`;
      shots.push(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));

      // Miniatura de la última foto con el contador.
      const thumb = document.createElement('img');
      thumb.src = URL.createObjectURL(blob);
      thumb.alt = '';
      thumb.className = 'h-14 w-11 rounded object-cover ring-2 ring-white/70';
      thumb.onload = () => URL.revokeObjectURL(thumb.src);
      const count = document.createElement('span');
      count.className = 'font-mono text-sm';
      count.textContent = String(n);
      $('strip').replaceChildren(thumb, count);

      if (shots.length >= max) finish(shots);
      else updatePrompt();
    }

    $('shutter').addEventListener('click', shootQueued);
    $('done').addEventListener('click', finishWhenReady);
    $('cancel').addEventListener('click', () => finish([]));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish([]);
    });
    dialog.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && e.target === dialog) {
        e.preventDefault();
        shootQueued();
      }
    });
    $('flip').addEventListener('click', async () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      try {
        await start();
        await attach();
      } catch (err) {
        $('prompt').textContent = err.message;
      }
    });
    $('torch').addEventListener('click', async () => {
      const btn = $('torch');
      const on = btn.getAttribute('aria-pressed') !== 'true';
      try {
        await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on }] });
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('bg-white/20', on);
      } catch { /* sin linterna disponible */ }
    });

    document.body.append(dialog);
    dialog.showModal();
    openWatch.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    $('shutter').focus();
    updatePrompt();
    attach().then(liveLoop);
  });
}
