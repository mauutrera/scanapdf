<nav class="flex items-center gap-1.5 text-sm text-ink-500 dark:text-ink-400" aria-label="Ruta"><a href="<?= e(route('home')) ?>" class="rounded hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-lamp-500 dark:hover:text-ink-100">Inicio</a><span aria-hidden="true">/</span><span class="text-ink-700 dark:text-ink-200">PDF con estilo escaneado</span></nav>
<h1 class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">PDF con estilo escaneado</h1>
<p class="mt-1 max-w-2xl text-ink-500 dark:text-ink-400">Sube un PDF digital y descárgalo como si lo hubieras impreso y pasado por el escáner. Se conserva el tamaño de cada página.</p>

<div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
    <section class="min-w-0 space-y-5" aria-label="Vista previa">
        <!-- Sin archivo -->
        <label id="pdf-empty" for="pdf-file"
               class="flex min-h-[22rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink-200 bg-white p-8 text-center transition hover:border-lamp-500 focus-within:ring-2 focus-within:ring-lamp-500 data-[dragging=true]:border-lamp-500 data-[dragging=true]:bg-lamp-300/10 dark:border-ink-700 dark:bg-ink-900">
            <svg viewBox="0 0 48 56" class="h-14 w-auto" aria-hidden="true">
                <path d="M4 2h28l12 12v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" class="fill-paper stroke-ink-400" stroke-width="2"/>
                <path d="M32 2v12h12" class="fill-none stroke-ink-400" stroke-width="2"/>
                <text x="23" y="40" text-anchor="middle" class="fill-lamp-700 font-mono" font-size="11" font-weight="600">PDF</text>
            </svg>
            <span class="text-base font-medium">Elige un PDF</span>
            <span class="hint">o arrástralo aquí · hasta 300 páginas</span>
        </label>
        <input id="pdf-file" type="file" accept="application/pdf,.pdf" class="sr-only">

        <!-- Con archivo -->
        <div id="pdf-loaded" class="space-y-5" hidden>
            <div class="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                    <p id="pdf-name" class="truncate text-sm font-medium"></p>
                    <p id="pdf-meta" class="hint font-mono"></p>
                </div>
                <label for="pdf-file" class="btn btn-ghost cursor-pointer px-3 py-1.5">Cambiar archivo</label>
            </div>

            <div id="pdf-drop" class="relative rounded-xl bg-ink-100 p-6 transition data-[dragging=true]:ring-2 data-[dragging=true]:ring-lamp-500 dark:bg-ink-900 sm:p-10">
                <div id="pdf-preview" class="mx-auto max-w-sm"></div>
                <div class="mt-4 flex items-center justify-center gap-3">
                    <button type="button" id="pdf-prev" class="btn btn-ghost px-3 py-1" aria-label="Página anterior">←</button>
                    <p id="pdf-caption" class="text-center font-mono text-xs text-ink-500 dark:text-ink-400"></p>
                    <button type="button" id="pdf-next" class="btn btn-ghost px-3 py-1" aria-label="Página siguiente">→</button>
                </div>
            </div>

            <ol id="pdf-thumbs" class="flex gap-3 overflow-x-auto p-1 subtle-scroll" aria-label="Páginas"></ol>
        </div>
    </section>

    <aside class="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto lg:pr-2.5 subtle-scroll">
        <form id="pdf-settings" class="panel space-y-6 p-5">
            <?= partial('seg', ['idPrefix' => 'pdf', 'legend' => 'Intensidad del efecto', 'name' => 'level', 'checked' => 'normal',
                'options' => ['subtle' => 'Sutil', 'normal' => 'Normal', 'strong' => 'Marcada']]) ?>

            <?= partial('seg', ['idPrefix' => 'pdf', 'legend' => 'Color', 'name' => 'style', 'checked' => 'color',
                'options' => ['color' => 'Color', 'gray' => 'Grises', 'bw' => 'B/N']]) ?>

            <label class="flex cursor-pointer items-start gap-3">
                <input type="checkbox" id="pdf-skew" name="skew" class="mt-1 h-4 w-4 accent-lamp-600" checked>
                <span>
                    <span class="block text-sm font-medium">Inclinar ligeramente cada página</span>
                    <span class="hint block">Como hojas colocadas a mano en el escáner; cada una queda distinta.</span>
                </span>
            </label>

            <div class="space-y-2">
                <?= partial('seg', ['idPrefix' => 'pdf', 'legend' => 'Resolución', 'name' => 'dpi', 'checked' => '200',
                    'options' => ['150' => '150 ppp', '200' => '200 ppp', '300' => '300 ppp']]) ?>
                <p class="hint">200 ppp es lo habitual en un escáner de oficina. 300 ppp se ve más nítido pero pesa más.</p>
            </div>

            <div class="space-y-2">
                <label for="pdf-range" class="label">Páginas</label>
                <input id="pdf-range" name="range" type="text" inputmode="numeric" autocomplete="off" placeholder="Todas (p. ej. 1-3, 5)" class="field font-mono">
                <p id="pdf-range-hint" class="hint">Déjalo vacío para incluir todas.</p>
            </div>

            <div class="space-y-2 border-t border-ink-200 pt-5 dark:border-ink-800">
                <div class="flex gap-2">
                    <button type="button" id="pdf-export-pdf" class="btn btn-primary flex-1" disabled>Descargar PDF</button>
                    <button type="button" id="pdf-export-jpg" class="btn btn-ghost" disabled>JPG</button>
                </div>
                <p id="pdf-export-hint" class="hint text-center">Elige un PDF para empezar.</p>
            </div>
        </form>
    </aside>
</div>
