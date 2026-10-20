<nav class="flex items-center gap-1.5 text-sm text-ink-500 dark:text-ink-400" aria-label="Ruta"><a href="<?= e(route('home')) ?>" class="rounded hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-lamp-500 dark:hover:text-ink-100">Inicio</a><span aria-hidden="true">/</span><span class="text-ink-700 dark:text-ink-200">Digitalizar documento</span></nav>
<h1 class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Digitalizar documento</h1>
<p class="mt-1 max-w-2xl text-ink-500 dark:text-ink-400">Convierte la foto de un documento en una página que parece hecha en computadora: renglones rectos, fondo blanco, texto nítido y tablas limpias, con el color de firmas y sellos.</p>

<div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
    <section class="min-w-0 space-y-5" aria-label="Páginas">
        <!-- Sin páginas: toda la zona abre el selector de fotos (mismo estilo que la pantalla PDF) -->
        <label id="dz-empty" for="dz-files"
               class="flex min-h-[22rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink-200 bg-white p-8 text-center transition hover:border-lamp-500 focus-within:ring-2 focus-within:ring-lamp-500 data-[dragging=true]:border-lamp-500 data-[dragging=true]:bg-lamp-300/10 dark:border-ink-700 dark:bg-ink-900">
            <svg viewBox="0 0 120 80" class="h-20 w-auto" aria-hidden="true">
                    <g transform="rotate(-6 30 38)">
                        <rect x="8" y="6" width="44" height="62" rx="2" fill="#e9e1cf" class="stroke-ink-400" stroke-width="1.5"/>
                        <path d="M14 16h32M14 22h32v18H14zM30 22v18M14 31h32M14 48h26M14 55h20" fill="none" stroke="#6b6358" stroke-width="1.6"/>
                    </g>
                    <path d="M58 37h10m-4-4 4 4-4 4" class="stroke-lamp-500" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    <rect x="72" y="6" width="44" height="62" rx="1" fill="#fff" class="stroke-ink-400" stroke-width="1.5"/>
                    <rect x="78" y="22" width="32" height="6" fill="#bfdbfe"/>
                    <path d="M78 15h32M78 22h32v18H78zM94 22v18M78 31h32M78 48h26M78 55h20" fill="none" stroke="#111" stroke-width="1.6"/>
            </svg>
            <span class="text-base font-medium">Elige fotos del documento</span>
            <span class="hint">o arrástralas aquí · una foto por página, de frente y con buena luz</span>
        </label>

        <div id="dz-drop" class="rounded-xl bg-ink-100 p-4 transition data-[dragging=true]:ring-2 data-[dragging=true]:ring-lamp-500 dark:bg-ink-900 sm:p-6" hidden>
            <!-- Con páginas -->
            <div id="dz-page" class="space-y-3" hidden>
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="seg w-auto" role="group" aria-label="Qué mostrar">
                        <label class="seg-option"><input type="radio" class="sr-only" name="dz-view" id="dz-view-digital" value="digital" checked><span>Digital</span></label>
                        <label class="seg-option"><input type="radio" class="sr-only" name="dz-view" id="dz-view-photo" value="photo"><span>Foto original</span></label>
                    </div>
                    <span id="dz-status" class="hint" role="status"></span>
                </div>
                <div class="relative">
                    <div id="dz-view" class="mx-auto max-w-xl"></div>
                    <div id="dz-busy" class="absolute inset-0 flex items-center justify-center" hidden>
                        <span class="flex items-center gap-2 rounded-full bg-ink-900/85 px-4 py-2 text-sm text-white">
                            <span class="h-2 w-2 animate-pulse rounded-full bg-lamp-400"></span>Digitalizando…
                        </span>
                    </div>
                </div>
                <p id="dz-caption" class="text-center font-mono text-xs text-ink-500 dark:text-ink-400"></p>
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <label for="dz-files" class="btn btn-primary cursor-pointer">
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z"/></svg>
                Agregar fotos
            </label>
            <input id="dz-files" type="file" accept="image/*" multiple class="sr-only">
            <button type="button" id="dz-shoot" class="btn btn-ghost">
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h2l1.2-1.6h4.6L13.5 5h2A1.5 1.5 0 0 1 17 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z"/><circle cx="10" cy="10.5" r="3"/></svg>
                Tomar fotos
            </button>
            <input id="dz-camera" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true">
            <span class="hint hidden sm:inline">También puedes arrastrarlas o pegarlas (Ctrl + V).</span>
        </div>

        <div id="dz-pages-wrap" class="panel p-3" hidden>
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <span class="label">Páginas</span>
                <div class="flex flex-wrap justify-end gap-1">
                    <button type="button" id="dz-crop" class="btn btn-ghost px-2 py-1">Ajustar recorte</button>
                    <button type="button" id="dz-left" class="btn btn-ghost px-2 py-1" title="Mover antes" aria-label="Mover página antes">←</button>
                    <button type="button" id="dz-right" class="btn btn-ghost px-2 py-1" title="Mover después" aria-label="Mover página después">→</button>
                    <button type="button" id="dz-delete" class="btn btn-ghost px-2 py-1 text-red-600 dark:text-red-400">Quitar</button>
                </div>
            </div>
            <ol id="dz-pages" class="flex gap-3 overflow-x-auto p-1 subtle-scroll"></ol>
        </div>

        <!-- Texto (opcional) -->
        <details id="dz-text-panel" class="panel group p-4" hidden>
            <summary class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
                <span>Texto del documento <span class="hint font-normal">(opcional: Word, .txt o copiar)</span></span>
                <span class="text-ink-400 transition group-open:rotate-90" aria-hidden="true">›</span>
            </summary>
            <div class="mt-4 space-y-3">
                <div class="flex items-center justify-between gap-2">
                    <label for="dz-text" class="label">Texto reconocido de la página</label>
                    <span id="dz-ocr-status" class="hint" role="status"></span>
                </div>
                <textarea id="dz-text" spellcheck="true" lang="es" class="field min-h-[14rem] resize-y font-mono text-[13px] leading-relaxed" placeholder="Aquí aparecerá el texto de la página."></textarea>
                <p class="hint">Puedes corregirlo. Deja una línea en blanco entre párrafos; empieza una línea con <span class="font-mono">#</span> para hacerla título.</p>
                <div class="grid grid-cols-3 gap-2">
                    <button type="button" id="dz-export-docx" class="btn btn-ghost px-2" disabled>Word</button>
                    <button type="button" id="dz-export-txt" class="btn btn-ghost px-2" disabled>.txt</button>
                    <button type="button" id="dz-copy" class="btn btn-ghost px-2" disabled>Copiar</button>
                </div>
            </div>
        </details>
    </section>

    <aside class="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto lg:pr-2.5 subtle-scroll">
        <form id="dz-settings" class="panel space-y-6 p-5">
            <?= partial('seg', ['idPrefix' => 'dz', 'legend' => 'Estilo', 'name' => 'mode', 'checked' => 'bw',
                'options' => ['bw' => 'Blanco y negro', 'gray' => 'Grises']]) ?>

            <label class="flex cursor-pointer items-start gap-3">
                <input type="checkbox" id="dz-ink-color" name="inkColor" class="mt-1 h-4 w-4 accent-lamp-600" checked>
                <span>
                    <span class="block text-sm font-medium">Conservar colores de la tinta</span>
                    <span class="hint block">Firmas, sellos y texto de color mantienen su color. El fondo siempre queda blanco.</span>
                </span>
            </label>

            <?= partial('seg', ['idPrefix' => 'dz', 'legend' => 'Grosor del texto', 'name' => 'weight', 'checked' => '0',
                'options' => ['-1' => 'Fino', '0' => 'Normal', '1' => 'Grueso']]) ?>

            <label class="flex cursor-pointer items-start gap-3">
                <input type="checkbox" id="dz-straighten" name="straighten" class="mt-1 h-4 w-4 accent-lamp-600" checked>
                <span>
                    <span class="block text-sm font-medium">Enderezar renglones</span>
                    <span class="hint block">Corrige renglones curvos o inclinados por una hoja doblada o una foto no del todo de frente.</span>
                </span>
            </label>

            <?= partial('seg', ['idPrefix' => 'dz', 'legend' => 'Tamaño de hoja', 'name' => 'paper', 'checked' => 'carta',
                'options' => ['carta' => 'Carta', 'oficio' => 'Oficio', 'a4' => 'A4']]) ?>

            <div class="space-y-3">
                <label class="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" id="dz-selectable" name="selectable" class="mt-1 h-4 w-4 accent-lamp-600" checked>
                    <span>
                        <span class="block text-sm font-medium">Texto seleccionable en el PDF</span>
                        <span class="hint block">Se reconoce el texto para poder seleccionarlo, copiarlo y buscarlo.</span>
                    </span>
                </label>
                <div id="dz-lang-wrap">
                    <?= partial('seg', ['idPrefix' => 'dz', 'legend' => 'Idioma del documento', 'name' => 'lang', 'checked' => 'spa',
                        'options' => ['spa' => 'Español', 'eng' => 'Inglés']]) ?>
                </div>
            </div>

            <div class="space-y-2 border-t border-ink-200 pt-5 dark:border-ink-800">
                <div class="flex gap-2">
                    <button type="button" id="dz-export-pdf" class="btn btn-primary flex-1" disabled>Descargar PDF</button>
                    <button type="button" id="dz-export-png" class="btn btn-ghost" disabled>PNG</button>
                </div>
                <p id="dz-export-hint" class="hint text-center">Agrega fotos para empezar.</p>
            </div>
        </form>
    </aside>
</div>
