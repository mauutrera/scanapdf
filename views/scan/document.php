<nav class="flex items-center gap-1.5 text-sm text-ink-500 dark:text-ink-400" aria-label="Ruta"><a href="<?= e(route('home')) ?>" class="rounded hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-lamp-500 dark:hover:text-ink-100">Inicio</a><span aria-hidden="true">/</span><span class="text-ink-700 dark:text-ink-200">Escanear documento</span></nav>
<h1 class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Escanear documento</h1>
<p class="mt-1 max-w-2xl text-ink-500 dark:text-ink-400">Cada foto se convierte en una página. Agrega varias para un PDF de varias hojas.</p>

<div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
    <!-- Vista previa y páginas -->
    <section class="min-w-0 space-y-5" aria-label="Vista previa">
        <div id="doc-drop" class="group relative rounded-xl bg-ink-100 p-6 transition data-[dragging=true]:bg-lamp-300/30 data-[dragging=true]:ring-2 data-[dragging=true]:ring-lamp-500 dark:bg-ink-900 sm:p-10">
            <div id="doc-preview" class="mx-auto max-w-sm"></div>
            <p id="doc-caption" class="mt-4 text-center font-mono text-xs text-ink-500 dark:text-ink-400"></p>
            <p class="pointer-events-none absolute inset-x-0 top-2 hidden text-center text-sm font-medium text-lamp-700 group-data-[dragging=true]:block dark:text-lamp-300">Suelta las fotos aquí</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <label for="doc-files" class="btn btn-primary cursor-pointer">
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1Z"/></svg>
                Agregar fotos
            </label>
            <input id="doc-files" type="file" accept="image/*" multiple class="sr-only">
            <button type="button" id="doc-shoot" class="btn btn-ghost">
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h2l1.2-1.6h4.6L13.5 5h2A1.5 1.5 0 0 1 17 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z"/><circle cx="10" cy="10.5" r="3"/></svg>
                Tomar fotos
            </button>
            <!-- Respaldo cuando la cámara no puede abrirse dentro de la página: usa la app de cámara del sistema. -->
            <input id="doc-camera" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true">
            <span class="hint hidden sm:inline">También puedes arrastrarlas o pegarlas (Ctrl + V).</span>
        </div>

        <div id="doc-pages-wrap" class="panel p-3" hidden>
            <div class="mb-2 flex items-center justify-between gap-2 px-1">
                <span class="label">Páginas</span>
                <div class="flex flex-wrap justify-end gap-1">
                    <button type="button" id="page-crop" class="btn btn-ghost px-2 py-1">Ajustar recorte</button>
                    <button type="button" id="page-left" class="btn btn-ghost px-2 py-1" title="Mover antes" aria-label="Mover página antes">←</button>
                    <button type="button" id="page-right" class="btn btn-ghost px-2 py-1" title="Mover después" aria-label="Mover página después">→</button>
                    <button type="button" id="page-delete" class="btn btn-ghost px-2 py-1 text-red-600 dark:text-red-400" title="Quitar página">Quitar</button>
                </div>
            </div>
            <ol id="doc-pages" class="flex gap-3 overflow-x-auto p-1 subtle-scroll"></ol>
        </div>
    </section>

    <!-- Ajustes -->
    <aside class="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto lg:pr-2.5 subtle-scroll">
        <form id="doc-settings" class="panel space-y-6 p-5">
            <?= partial('seg', ['idPrefix' => 'doc', 'legend' => 'Tamaño de hoja', 'name' => 'paper', 'checked' => 'carta',
                'options' => ['carta' => 'Carta', 'oficio' => 'Oficio', 'a4' => 'A4']]) ?>

            <?= partial('seg', ['idPrefix' => 'doc', 'legend' => 'Orientación', 'name' => 'orientation', 'checked' => 'auto',
                'options' => ['auto' => 'Automática', 'portrait' => 'Vertical', 'landscape' => 'Horizontal']]) ?>

            <fieldset class="space-y-2">
                <legend class="label">La foto es…</legend>
                <div class="grid gap-2">
                    <?php foreach ([
                        'full' => ['La hoja completa', 'Se recorta el contorno de la hoja y ocupa toda la página, como un escaneo normal.'],
                        'inside' => ['Contenido dentro del documento', 'La foto se coloca dentro de los márgenes de una hoja en blanco.'],
                    ] as $value => [$label, $help]): ?>
                        <label class="flex cursor-pointer gap-3 rounded-lg border border-ink-200 p-3 transition has-[:checked]:border-lamp-500 has-[:checked]:bg-lamp-300/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lamp-500 dark:border-ink-700">
                            <input type="radio" id="fit-<?= e($value) ?>" name="fit" value="<?= e($value) ?>" class="mt-0.5 accent-lamp-600" <?= $value === 'full' ? 'checked' : '' ?>>
                            <span>
                                <span class="block text-sm font-medium"><?= e($label) ?></span>
                                <span class="hint block"><?= e($help) ?></span>
                            </span>
                        </label>
                    <?php endforeach; ?>
                </div>
            </fieldset>

            <div id="inside-options" class="space-y-6">
                <?= partial('seg', ['idPrefix' => 'doc', 'legend' => 'Márgenes', 'name' => 'margin', 'checked' => 'normal',
                    'options' => ['none' => 'Sin', 'narrow' => 'Estrecho', 'normal' => 'Normal', 'custom' => 'Otro']]) ?>
                <div id="margin-custom-wrap" class="-mt-3 flex items-center gap-2" hidden>
                    <label for="margin-custom" class="hint">Margen en todos los lados</label>
                    <input id="margin-custom" name="marginCustom" type="number" min="0" max="60" step="1" value="20" class="field w-20 font-mono">
                    <span class="hint">mm</span>
                </div>
                <?= partial('seg', ['idPrefix' => 'doc', 'legend' => 'Posición', 'name' => 'align', 'checked' => 'top',
                    'options' => ['top' => 'Arriba', 'center' => 'Centrada']]) ?>
            </div>

            <?= partial('output', ['prefix' => 'doc', 'cleanLabel' => 'Limpiar fondo de la hoja',
                'cleanHelp' => 'Quita sombras y deja el papel blanco. Desactívalo si la foto no es un documento, por ejemplo una fotografía.']) ?>
        </form>
    </aside>
</div>
