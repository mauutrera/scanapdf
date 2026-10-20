// Utilidades para leer y recordar los ajustes de un formulario.

/** Valores del formulario como objeto plano (radios, selects y números). */
export function readForm(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
    } else if (el.type === 'checkbox') {
      data[el.name] = el.checked;
    } else if (el.type === 'number') {
      data[el.name] = el.valueAsNumber;
    } else if (el.type !== 'file') {
      data[el.name] = el.value;
    }
  }
  return data;
}

/** Guarda los ajustes en el navegador y los restaura al volver (si el navegador lo permite). */
export function persistForm(form, key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved) {
      for (const el of form.elements) {
        if (!el.name || !(el.name in saved) || el.type === 'file') continue;
        if (el.type === 'radio') {
          // Solo si la opción guardada todavía existe; si no, se queda el valor por defecto.
          const exists = [...form.elements].some((o) => o.name === el.name && o.value === String(saved[el.name]));
          if (exists) el.checked = el.value === String(saved[el.name]);
        } else if (el.type === 'checkbox') {
          el.checked = !!saved[el.name];
        } else {
          el.value = saved[el.name];
        }
      }
    }
  } catch { /* sin almacenamiento: se usan los valores por defecto */ }

  // Los formularios de ajustes nunca se envían (Enter en un campo numérico recargaría la página).
  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('input', () => {
    try {
      localStorage.setItem(key, JSON.stringify(readForm(form)));
    } catch { /* ignorar */ }
  });
}

/** Aviso persistente mientras dura una tarea. Devuelve la función que lo quita. */
export function status(message) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = 'fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-ink-100 dark:text-ink-900';
  el.innerHTML = '<span class="h-2 w-2 animate-pulse rounded-full bg-lamp-400"></span>';
  el.append(message);
  document.body.append(el);
  const remove = () => el.remove();
  remove.update = (text) => { el.lastChild.textContent = text; }; // cambia el mensaje (p. ej. el progreso)
  return remove;
}

export function toast(message, tone = 'error') {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = `fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${
    tone === 'error' ? 'bg-red-600 text-white' : 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900'
  }`;
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4500);
}
