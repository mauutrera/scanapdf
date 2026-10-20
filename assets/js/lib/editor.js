// Editor de recorte: muestra la foto con las 4 esquinas arrastrables (mouse, dedo o teclado),
// una lupa mientras se arrastra, y opciones para rotar, volver a detectar o usar toda la foto.
import { fullQuad, isConvex, orderQuad, rotateCanvas, rotateQuad } from './geometry.js';

const SVG = 'http://www.w3.org/2000/svg';
const CORNER_NAMES = ['superior izquierda', 'superior derecha', 'inferior derecha', 'inferior izquierda'];
const LOUPE = 112;   // px en pantalla
const ZOOM = 3;

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas   foto completa
 * @param {{x:number,y:number}[]} o.quad esquinas iniciales
 * @param {string} o.hint                instrucción breve (p. ej. "Arrastra cada esquina al borde de la hoja.")
 * @param {(canvas: HTMLCanvasElement) => Promise<{x:number,y:number}[]|null>} o.detect
 * @returns {Promise<{canvas: HTMLCanvasElement, quad: {x:number,y:number}[]} | null>} null si se cancela
 */
export function editCorners({ canvas, quad, hint, detect }) {
  return new Promise((resolve) => {
    let src = canvas;
    let q = quad.map((p) => ({ ...p }));
    let unit = 1; // píxeles de imagen por píxel de pantalla

    const dialog = document.createElement('dialog');
    dialog.className = 'm-0 h-full max-h-none w-full max-w-none bg-ink-950 p-0 text-ink-100 backdrop:bg-black/70 sm:m-auto sm:h-[90vh] sm:max-w-4xl sm:rounded-xl';
    dialog.setAttribute('aria-label', 'Ajustar recorte');
    dialog.innerHTML = `
      <div class="flex h-full flex-col">
        <header class="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div>
            <h2 class="font-semibold">Ajustar recorte</h2>
            <p class="text-xs text-ink-300" data-hint></p>
          </div>
          <span class="text-xs text-lamp-300" data-status role="status"></span>
        </header>
        <div class="relative min-h-0 flex-1 touch-none select-none px-3 pb-3" data-stage>
          <div class="relative h-full w-full">
            <canvas class="absolute inset-0 h-full w-full object-contain" data-photo></canvas>
            <svg class="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="xMidYMid meet" data-svg>
              <path fill="rgb(0 0 0 / .55)" fill-rule="evenodd" data-shade></path>
              <polygon fill="none" stroke-width="2" vector-effect="non-scaling-stroke" data-outline></polygon>
              <g data-handles></g>
            </svg>
          </div>
          <canvas width="${LOUPE * 2}" height="${LOUPE * 2}" class="pointer-events-none absolute top-2 rounded-full shadow-xl ring-2 ring-lamp-400" data-loupe hidden></canvas>
        </div>
        <footer class="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-3">
          <span class="inline-flex">
            <button type="button" class="btn rounded-r-none border border-white/15 px-3 text-ink-100 hover:bg-white/10" data-rotate="-1" title="Girar a la izquierda" aria-label="Girar a la izquierda">↺</button>
            <button type="button" class="btn -ml-px rounded-l-none border border-white/15 px-3 text-ink-100 hover:bg-white/10" data-rotate="1" title="Girar a la derecha" aria-label="Girar a la derecha">↻</button>
          </span>
          <button type="button" class="btn border border-white/15 px-3 text-ink-100 hover:bg-white/10" data-detect>Detectar</button>
          <button type="button" class="btn border border-white/15 px-3 text-ink-100 hover:bg-white/10" data-full>Toda la foto</button>
          <span class="ml-auto flex gap-2">
            <button type="button" class="btn px-3 text-ink-300 hover:bg-white/10" data-cancel>Cancelar</button>
            <button type="button" class="btn btn-primary px-5" data-apply>Aplicar</button>
          </span>
        </footer>
      </div>`;
    const $ = (sel) => dialog.querySelector(`[data-${sel}]`);
    $('hint').textContent = hint;

    const photo = $('photo');
    const svg = $('svg');
    const loupe = $('loupe');
    loupe.style.width = loupe.style.height = `${LOUPE}px`; // por CSSOM: la CSP bloquea atributos style en el HTML
    const handles = [];

    for (let i = 0; i < 4; i++) {
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Esquina ${CORNER_NAMES[i]}. Usa las flechas para moverla.`);
      g.classList.add('cursor-grab', 'outline-none');
      g.innerHTML = `
        <circle fill="transparent" data-hit></circle>
        <circle fill="rgb(20 184 166 / .25)" stroke="#5eead4" stroke-width="2" vector-effect="non-scaling-stroke" data-dot></circle>
        <circle fill="#5eead4" data-center></circle>`;
      $('handles').append(g);
      handles.push(g);
      bindHandle(g, i);
    }

    function setImage(c) {
      src = c;
      photo.width = c.width;
      photo.height = c.height;
      photo.getContext('2d').drawImage(c, 0, 0);
      svg.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`);
      measure();
    }

    function measure() {
      const box = svg.getBoundingClientRect();
      const s = Math.min(box.width / src.width, box.height / src.height) || 1;
      unit = 1 / s;
      draw();
    }

    function draw() {
      const pts = q.map((p) => `${p.x},${p.y}`).join(' ');
      const ok = isConvex(q);
      $('outline').setAttribute('points', pts);
      $('outline').setAttribute('stroke', ok ? '#2dd4bf' : '#f87171');
      $('shade').setAttribute('d', `M0 0H${src.width}V${src.height}H0Z M${q.map((p) => `${p.x} ${p.y}`).join(' L')}Z`);
      $('apply').disabled = !ok;
      $('status').textContent = ok ? '' : 'Las esquinas se cruzan';
      handles.forEach((g, i) => {
        const [hit, dot, center] = g.children;
        for (const c of g.children) {
          c.setAttribute('cx', q[i].x);
          c.setAttribute('cy', q[i].y);
        }
        hit.setAttribute('r', 26 * unit);
        dot.setAttribute('r', 13 * unit);
        center.setAttribute('r', 2.5 * unit);
      });
    }

    function toImage(e) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: Math.min(src.width, Math.max(0, p.x)), y: Math.min(src.height, Math.max(0, p.y)) };
    }

    function showLoupe(i) {
      const p = q[i];
      const ctx = loupe.getContext('2d');
      const r = (LOUPE / ZOOM) * unit; // radio de la zona ampliada, en px de imagen
      ctx.fillStyle = '#0d1216';
      ctx.fillRect(0, 0, loupe.width, loupe.height);
      ctx.save();
      ctx.beginPath();
      ctx.arc(LOUPE, LOUPE, LOUPE, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(src, p.x - r, p.y - r, r * 2, r * 2, 0, 0, loupe.width, loupe.height);
      ctx.restore();
      ctx.strokeStyle = '#5eead4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(LOUPE - 18, LOUPE); ctx.lineTo(LOUPE + 18, LOUPE);
      ctx.moveTo(LOUPE, LOUPE - 18); ctx.lineTo(LOUPE, LOUPE + 18);
      ctx.stroke();
      // La lupa se va al lado contrario de la esquina para no quedar bajo el dedo.
      const left = p.x > src.width / 2;
      loupe.style.left = left ? '0.75rem' : '';
      loupe.style.right = left ? '' : '0.75rem';
      loupe.hidden = false;
    }

    function bindHandle(g, i) {
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        g.classList.replace('cursor-grab', 'cursor-grabbing');
        showLoupe(i);
      });
      g.addEventListener('pointermove', (e) => {
        if (!g.hasPointerCapture(e.pointerId)) return;
        q[i] = toImage(e);
        draw();
        showLoupe(i);
      });
      const end = (e) => {
        if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
        g.classList.replace('cursor-grabbing', 'cursor-grab');
        loupe.hidden = true;
      };
      g.addEventListener('pointerup', end);
      g.addEventListener('pointercancel', end);
      g.addEventListener('keydown', (e) => {
        const step = (e.shiftKey ? 10 : 1) * unit;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) return;
        e.preventDefault();
        q[i] = { x: Math.min(src.width, Math.max(0, q[i].x + d[0])), y: Math.min(src.height, Math.max(0, q[i].y + d[1])) };
        draw();
      });
      g.addEventListener('focus', () => g.querySelector('[data-dot]').setAttribute('stroke-width', '4'));
      g.addEventListener('blur', () => g.querySelector('[data-dot]').setAttribute('stroke-width', '2'));
    }

    const observer = new ResizeObserver(measure);
    // Termina una sola vez, se cierre como se cierre. No se depende solo del evento `close`,
    // que algunos navegadores no entregan cuando la pestaña está en segundo plano.
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      openWatch.disconnect();
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    const close = (value) => finish(value);
    const openWatch = new MutationObserver(() => {
      if (!dialog.open) finish(null);
    });
    dialog.addEventListener('close', () => finish(null));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });

    for (const btn of dialog.querySelectorAll('[data-rotate]')) {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.rotate);
        q = rotateQuad(q, src.width, src.height, dir);
        setImage(rotateCanvas(src, dir));
      });
    }
    $('full').addEventListener('click', () => {
      q = fullQuad(src.width, src.height);
      draw();
    });
    $('detect').addEventListener('click', async () => {
      const btn = $('detect');
      btn.disabled = true;
      $('status').textContent = 'Buscando el borde…';
      const found = await detect(src);
      btn.disabled = false;
      if (found) {
        q = found;
        draw();
      } else {
        $('status').textContent = 'No se encontró el borde; ajústalo a mano';
      }
    });
    $('cancel').addEventListener('click', () => close(null));
    $('apply').addEventListener('click', () => close({ canvas: src, quad: orderQuad(q) }));

    document.body.append(dialog);
    dialog.showModal();
    openWatch.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    observer.observe(svg);
    setImage(src);
    handles[0].focus({ preventScroll: true });
  });
}
