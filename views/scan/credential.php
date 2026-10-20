<nav class="flex items-center gap-1.5 text-sm text-ink-500 dark:text-ink-400" aria-label="Ruta"><a href="<?= e(route('home')) ?>" class="rounded hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-lamp-500 dark:hover:text-ink-100">Inicio</a><span aria-hidden="true">/</span><span class="text-ink-700 dark:text-ink-200">Escanear credencial</span></nav>
<h1 class="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Escanear credencial</h1>
<p class="mt-1 max-w-2xl text-ink-500 dark:text-ink-400">Sube una foto del frente y otra del reverso. Se recortan al borde de la tarjeta y se colocan en la hoja como una copia de escáner.</p>

<div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
    <section class="min-w-0 space-y-5" aria-label="Vista previa">
        <div class="rounded-xl bg-ink-100 p-6 dark:bg-ink-900 sm:p-10">
            <div id="cred-preview" class="relative mx-auto max-w-sm"></div>
            <p id="cred-caption" class="mt-4 text-center font-mono text-xs text-ink-500 dark:text-ink-400"></p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <?php foreach (['front' => ['Frente', 'frente'], 'back' => ['Reverso', 'reverso']] as $slot => [$label, $noun]): ?>
                <div id="slot-<?= e($slot) ?>" data-slot="<?= e($slot) ?>"
                     class="panel group relative p-3 transition data-[dragging=true]:border-lamp-500 data-[dragging=true]:ring-2 data-[dragging=true]:ring-lamp-500">
                    <div class="mb-2 flex items-center justify-between px-1">
                        <span class="label"><?= e($label) ?></span>
                        <span class="flex gap-3" data-actions="<?= e($slot) ?>" hidden>
                            <button type="button" data-crop="<?= e($slot) ?>" class="text-xs font-medium text-lamp-700 hover:underline dark:text-lamp-300">Ajustar recorte</button>
                            <button type="button" data-remove="<?= e($slot) ?>" class="text-xs font-medium text-red-600 hover:underline dark:text-red-400">Quitar</button>
                        </span>
                    </div>
                    <label for="file-<?= e($slot) ?>" class="flex aspect-[85.6/53.98] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-ink-200 bg-ink-50 text-center text-sm text-ink-500 transition hover:border-lamp-500 focus-within:ring-2 focus-within:ring-lamp-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-400">
                        <img data-thumb="<?= e($slot) ?>" alt="" class="h-full w-full object-cover" hidden>
                        <span data-empty="<?= e($slot) ?>" class="px-4">Elegir foto del <?= e($noun) ?><span class="hint mt-1 block">o arrástrala aquí</span></span>
                    </label>
                    <input id="file-<?= e($slot) ?>" type="file" accept="image/*" class="sr-only">
                    <button type="button" data-shoot="<?= e($slot) ?>" class="btn btn-ghost mt-2 w-full">Tomar foto del <?= e($noun) ?></button>
                    <!-- Respaldo cuando la cámara no puede abrirse dentro de la página: usa la app de cámara del sistema. -->
                    <input id="camera-<?= e($slot) ?>" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1" aria-hidden="true">
                </div>
            <?php endforeach; ?>
        </div>
        <div class="flex flex-wrap gap-2">
            <button type="button" id="cred-shoot-both" class="btn btn-primary">
                <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h2l1.2-1.6h4.6L13.5 5h2A1.5 1.5 0 0 1 17 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z"/><circle cx="10" cy="10.5" r="3"/></svg>
                Tomar frente y reverso
            </button>
            <button type="button" id="cred-swap" class="btn btn-ghost" hidden>⇄ Intercambiar frente y reverso</button>
        </div>
    </section>

    <aside class="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto lg:pr-2.5 subtle-scroll">
        <form id="cred-settings" class="panel space-y-6 p-5">
            <?= partial('seg', ['idPrefix' => 'cred', 'legend' => 'Tamaño de hoja', 'name' => 'paper', 'checked' => 'carta',
                'options' => ['carta' => 'Carta', 'oficio' => 'Oficio', 'a4' => 'A4']]) ?>

            <div class="space-y-2">
                <?= partial('seg', ['idPrefix' => 'cred', 'legend' => 'Tamaño de la copia', 'name' => 'scale', 'checked' => '1',
                    'options' => ['1' => 'Real', '1.5' => '150 %', '2' => '200 %']]) ?>
                <p class="hint">Real: <span class="font-mono">85.6 × 54 mm</span>, el de la INE y las tarjetas bancarias. 150 % y 200 % son copias ampliadas.</p>
            </div>

            <div class="space-y-2">
                <?= partial('seg', ['idPrefix' => 'cred', 'legend' => 'Disposición', 'name' => 'arrangement', 'checked' => 'side',
                    'options' => ['side' => 'Lado a lado', 'stacked' => 'Una sobre otra']]) ?>
                <p id="arrangement-hint" class="hint" hidden>A este tamaño no caben lado a lado; se colocan una sobre otra.</p>
            </div>

            <?= partial('seg', ['idPrefix' => 'cred', 'legend' => 'Posición en la hoja', 'name' => 'position', 'checked' => 'top',
                'options' => ['top' => 'Arriba', 'center' => 'Centrada']]) ?>

            <?= partial('seg', ['idPrefix' => 'cred', 'legend' => 'Contorno de la tarjeta', 'name' => 'edge', 'checked' => 'shadow',
                'options' => ['shadow' => 'Sombra', 'line' => 'Línea', 'none' => 'Sin contorno']]) ?>

            <?= partial('output', ['prefix' => 'cred', 'cleanLabel' => 'Corregir color e iluminación',
                'cleanHelp' => 'Equilibra los blancos y el contraste de la foto.']) ?>
        </form>
    </aside>
</div>
