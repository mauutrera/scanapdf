<?php
// Herramientas: ruta => [título, descripción, dato técnico, ilustración SVG (viewBox 120×80)].
$tools = [
    'scan.document' => ['Escanear documento', 'Fotos de hojas a PDF: recorte automático, sin sombras y con la hoja completa o dentro de márgenes.', 'Carta · Oficio · A4',
        '<rect x="34" y="4" width="52" height="72" rx="2" class="fill-paper stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <path d="M42 18h36M42 26h36M42 34h28M42 42h36M42 50h20" class="stroke-ink-300 dark:stroke-ink-500" stroke-width="2" stroke-linecap="round"/>
         <path d="M28 38h64" class="stroke-lamp-500" stroke-width="2.5" stroke-linecap="round"/>'],
    'scan.credential' => ['Escanear credencial', 'Frente y reverso recortados al borde de la tarjeta, a tamaño real o ampliados al 150 % y 200 %.', 'ID-1 · 85.6 × 54 mm',
        '<rect x="6" y="22" width="52" height="33" rx="3" class="fill-paper stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <rect x="12" y="29" width="13" height="17" rx="1" class="fill-ink-200 dark:fill-ink-500"/>
         <path d="M30 31h22M30 37h18M30 43h20" class="stroke-ink-300 dark:stroke-ink-500" stroke-width="2" stroke-linecap="round"/>
         <rect x="62" y="22" width="52" height="33" rx="3" class="fill-paper stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <path d="M68 28h40" class="stroke-ink-400" stroke-width="5"/>
         <path d="M68 41h40M68 46h40M68 51h34" class="stroke-ink-300 dark:stroke-ink-500" stroke-width="2" stroke-linecap="round"/>
         <path d="M2 38h116" class="stroke-lamp-500" stroke-width="2.5" stroke-linecap="round"/>'],
    'scan.pdf' => ['PDF con estilo escaneado', 'Un PDF digital como si lo hubieras impreso y pasado por el escáner, conservando el tamaño de cada página.', '150 · 200 · 300 ppp',
        '<rect x="14" y="8" width="40" height="56" rx="2" class="fill-white stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <path d="M20 18h28M20 25h28M20 32h22M20 39h28M20 46h16" class="stroke-ink-600 dark:stroke-ink-400" stroke-width="2" stroke-linecap="round"/>
         <path d="M60 36h10m-4-4 4 4-4 4" class="stroke-lamp-500" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
         <g transform="rotate(-3 96 38)"><rect x="76" y="10" width="40" height="56" rx="2" class="fill-paper stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <path d="M82 20h28M82 27h28M82 34h22M82 41h28M82 48h16" class="stroke-ink-400 dark:stroke-ink-500" stroke-width="2" stroke-linecap="round"/></g>'],
    'scan.digitize' => ['Digitalizar documento', 'La foto se vuelve una página digital: renglones rectos, fondo blanco, texto nítido y seleccionable.', 'PDF · PNG · Word',
        '<g transform="rotate(-5 34 38)"><rect x="12" y="8" width="42" height="58" rx="2" fill="#e9e1cf" class="stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <path d="M18 18q12 3 30 0M18 26q12 3 30 0M18 34q12 3 22 0" fill="none" stroke="#6b6358" stroke-width="2" stroke-linecap="round"/></g>
         <path d="M60 36h10m-4-4 4 4-4 4" class="stroke-lamp-500" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
         <rect x="76" y="8" width="40" height="56" rx="1" fill="#fff" class="stroke-ink-300 dark:stroke-ink-600" stroke-width="1.5"/>
         <path d="M82 18h28M82 26h28M82 34h22" stroke="#111" stroke-width="2" stroke-linecap="round"/>
         <rect x="81" y="42" width="30" height="14" fill="none" stroke="#111" stroke-width="1.4"/><path d="M81 49h30M96 42v14" stroke="#111" stroke-width="1.2"/>'],
];
$steps = [
    ['Toma o sube la foto', 'Con la cámara del celular, desde tus archivos o arrastrándola. También un PDF.'],
    ['Revisa el recorte', 'Se detecta el borde de la hoja; ajusta las esquinas si hace falta.'],
    ['Descarga', 'PDF o imagen listos para enviar o imprimir, en carta, oficio o A4.'],
];
?>
<!-- Presentación -->
<section class="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
    <div>
        <p class="inline-flex items-center gap-2 rounded-full border border-lamp-500/30 bg-lamp-300/10 px-3 py-1 text-xs font-medium text-lamp-700 dark:text-lamp-300">
            <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>
            Todo se procesa en tu dispositivo
        </p>
        <h1 class="mt-4 text-4xl font-extrabold tracking-tight [text-wrap:balance] sm:text-5xl">
            Tu escáner, en el celular<span class="text-lamp-600 dark:text-lamp-400">.</span>
        </h1>
        <p class="mt-4 max-w-xl text-lg text-ink-500 dark:text-ink-400">
            Convierte fotos de documentos, credenciales y PDFs en escaneos limpios o en documentos digitales,
            listos para enviar o imprimir.
        </p>
        <div class="mt-7 flex flex-wrap gap-3">
            <a href="<?= e(route('scan.document')) ?>" class="btn btn-primary px-5 py-2.5 text-base">Escanear un documento</a>
            <button type="button" class="btn btn-ghost px-5 py-2.5 text-base" data-install hidden>Instalar la app</button>
        </div>
    </div>

    <!-- Ilustración: hoja con la línea del escáner -->
    <div class="hero-art" aria-hidden="true">
        <svg viewBox="0 0 320 240" class="h-auto w-full">
            <rect x="0" y="0" width="320" height="240" rx="20" class="fill-ink-100 dark:fill-ink-900"/>
            <g transform="rotate(-4 160 120)">
                <rect x="96" y="28" width="128" height="176" rx="3" class="fill-white" stroke="#d0d9df" stroke-width="1.5"/>
                <path d="M114 54h70" stroke="#151c21" stroke-width="5" stroke-linecap="round"/>
                <path d="M114 74h92M114 86h92M114 98h70" class="stroke-ink-300" stroke-width="3" stroke-linecap="round"/>
                <rect x="114" y="114" width="92" height="40" fill="none" stroke="#33414b" stroke-width="2"/>
                <rect x="114" y="114" width="92" height="12" fill="#cfe3fb"/>
                <path d="M114 140h92M152 114v40" stroke="#33414b" stroke-width="1.5"/>
                <path d="M120 180q14-16 26 0t24-4" fill="none" stroke="#1d3fbf" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="192" cy="178" r="12" fill="none" stroke="#c53030" stroke-width="2.5"/>
            </g>
            <g class="stroke-lamp-500" stroke-width="5" stroke-linecap="round" fill="none">
                <path d="M78 40V22h18M224 22h18v18M242 200v18h-18M96 218H78v-18"/>
            </g>
            <rect class="scan-line fill-lamp-400" x="70" y="40" width="180" height="3" rx="1.5"/>
        </svg>
    </div>
</section>

<!-- Herramientas -->
<section class="mt-14" aria-labelledby="herramientas">
    <h2 id="herramientas" class="label">Herramientas</h2>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <?php foreach ($tools as $route => [$name, $desc, $meta, $art]): ?>
            <a href="<?= e(route($route)) ?>" class="tool-card group">
                <div class="tool-card-art">
                    <svg viewBox="0 0 120 80" class="h-20 w-auto" aria-hidden="true"><?= $art ?></svg>
                </div>
                <div class="flex flex-1 flex-col p-5">
                    <h3 class="text-lg font-semibold"><?= e($name) ?></h3>
                    <p class="mt-1 flex-1 text-sm text-ink-500 dark:text-ink-400"><?= e($desc) ?></p>
                    <div class="mt-4 flex items-center justify-between gap-3">
                        <span class="font-mono text-xs text-ink-500 dark:text-ink-400"><?= e($meta) ?></span>
                        <span class="text-sm font-semibold text-lamp-700 transition group-hover:translate-x-0.5 dark:text-lamp-300">Abrir →</span>
                    </div>
                </div>
            </a>
        <?php endforeach; ?>
    </div>
</section>

<!-- Cómo funciona -->
<section class="mt-14" aria-labelledby="como">
    <h2 id="como" class="label">Cómo funciona</h2>
    <ol class="mt-4 grid gap-4 sm:grid-cols-3">
        <?php foreach ($steps as $i => [$title, $text]): ?>
            <li class="panel flex gap-4 p-5">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-sm font-medium text-white dark:bg-ink-100 dark:text-ink-900"><?= $i + 1 ?></span>
                <div>
                    <h3 class="font-semibold"><?= e($title) ?></h3>
                    <p class="mt-1 text-sm text-ink-500 dark:text-ink-400"><?= e($text) ?></p>
                </div>
            </li>
        <?php endforeach; ?>
    </ol>
</section>

<!-- Instalar -->
<section class="mt-14 overflow-hidden rounded-2xl bg-ink-900 text-white dark:bg-ink-900 dark:ring-1 dark:ring-ink-800" data-install-panel hidden>
    <div class="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
        <img src="<?= e(asset('img/icon-192.png')) ?>" alt="" class="h-14 w-14 rounded-2xl">
        <div class="flex-1">
            <h2 class="text-xl font-bold">Instálala como app</h2>
            <p class="mt-1 text-sm text-ink-300">Ábrela desde tu pantalla de inicio, a pantalla completa y sin conexión una vez que la hayas usado.</p>
        </div>
        <button type="button" class="btn btn-primary px-5 py-2.5 focus-visible:ring-offset-ink-900" data-install hidden>Instalar</button>
    </div>
</section>
