<?php
/** @var string $content @var string $title */
// Secciones de la app: nombre de ruta => [etiqueta corta, ícono (trazos SVG de 24×24)].
$sections = [
    'home'            => ['Inicio', '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>'],
    'scan.document'   => ['Documento', '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M9.5 12h6M9.5 15h6M9.5 18h4"/>'],
    'scan.credential' => ['Credencial', '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8.5" cy="11" r="1.8"/><path d="M6 15.2c.6-1.2 1.5-1.7 2.5-1.7s1.9.5 2.5 1.7M13.5 10h4.5M13.5 13h3.5"/>'],
    'scan.pdf'        => ['PDF', '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4M4 12.5h16" stroke-dasharray="2 2"/>'],
    'scan.digitize'   => ['Digitalizar', '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2"/><path d="M8 9h8M8 12h8M8 15h5"/>'],
];
$icon = fn (string $paths, string $class = 'h-5 w-5') =>
    '<svg viewBox="0 0 24 24" class="' . $class . '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $paths . '</svg>';
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?= e($title ?? '') ?> · <?= e(config('app_name')) ?></title>
    <meta name="description" content="Convierte fotos de documentos, credenciales y PDFs en escaneos y documentos digitales. Todo se procesa en tu dispositivo.">
    <meta name="theme-color" content="#151c21">
    <meta name="color-scheme" content="light dark">
    <!-- Tema (Sistema / Claro / Oscuro) antes de pintar, para que no parpadee -->
    <script src="<?= e(asset('js/theme.js')) ?>"></script>
    <!-- App instalable (PWA) -->
    <link rel="manifest" href="<?= e(route('pwa.manifest')) ?>">
    <link rel="icon" href="<?= e(asset('img/icon.svg')) ?>" type="image/svg+xml">
    <link rel="apple-touch-icon" href="<?= e(asset('img/apple-touch-icon.png')) ?>">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="<?= e(config('app_name')) ?>">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
    <?php if (is_file(BASE_PATH . '/assets/css/app.css')): ?>
        <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
    <?php else: ?>
        <!-- Sin CSS compilado: Tailwind por CDN con el mismo tema y componentes (solo para desarrollo). -->
        <script src="https://cdn.tailwindcss.com/3.4.17"></script>
        <script>
            tailwind.config = {
                darkMode: ['selector', '[data-theme="dark"]'],
                theme: { extend: <?= file_get_contents(BASE_PATH . '/resources/tailwind.theme.json') ?> },
            };
        </script>
        <style type="text/tailwindcss">
            <?= preg_replace('/^@tailwind .*$/m', '', file_get_contents(BASE_PATH . '/resources/css/app.css')) ?>
        </style>
    <?php endif; ?>
    <script type="module" src="<?= e(asset('js/app.js')) ?>"></script>
    <?php foreach ($scripts ?? [] as $script): ?>
        <script type="module" src="<?= e(asset($script)) ?>" data-page-script></script>
    <?php endforeach; ?>
</head>
<body class="app-body" data-sw="<?= e(route('pwa.sw')) ?>" data-scope="<?= e(route('home')) ?>">
    <a href="#contenido" class="skip-link">Saltar al contenido</a>

    <header class="app-header">
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
            <a href="<?= e(route('home')) ?>" class="flex items-center gap-2.5 rounded-md font-bold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-lamp-500">
                <img src="<?= e(asset('img/icon-192.png')) ?>" alt="" class="h-8 w-8 rounded-lg">
                <span class="text-[1.05rem]"><?= e(config('app_name')) ?></span>
            </a>

            <nav class="hidden items-center gap-1 text-sm md:flex" aria-label="Secciones">
                <?php foreach ($sections as $name => [$label, $paths]): if ($name === 'home') continue; ?>
                    <a href="<?= e(route($name)) ?>" class="nav-link" <?= is_route($name) ? 'aria-current="page"' : '' ?>>
                        <?= $icon($paths, 'h-4 w-4') ?><?= e($label) ?>
                    </a>
                <?php endforeach; ?>
            </nav>

            <div class="flex items-center gap-2">
                <span class="chip-offline" data-offline hidden>Sin conexión</span>
                <div class="theme-switch" role="group" aria-label="Tema">
                    <?php foreach ([
                        'light'  => ['Claro', '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'],
                        'system' => ['Sistema', '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>'],
                        'dark'   => ['Oscuro', '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'],
                    ] as $value => [$label, $paths]): ?>
                        <button type="button" class="theme-option" data-theme-set="<?= e($value) ?>" aria-pressed="false" title="Tema: <?= e($label) ?>" aria-label="Tema <?= e(strtolower($label)) ?>"><?= $icon($paths, 'h-4 w-4') ?></button>
                    <?php endforeach; ?>
                </div>
                <button type="button" class="btn btn-primary px-3 py-1.5" data-install hidden>
                    <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v10m-4-4 4 4 4-4M4 16h12"/></svg>
                    Instalar app
                </button>
            </div>
        </div>
    </header>

    <main id="contenido" class="app-main">
        <!-- Cada sección vive en su propio contenedor: al navegar sin recargar se muestran u ocultan y conservan su estado. -->
        <div data-view="<?= e(current_path()) ?>" data-title="<?= e(($title ?? '') . ' · ' . config('app_name')) ?>">
            <?= $content ?>
        </div>
    </main>

    <footer class="app-footer">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
            <p class="flex items-center gap-2">
                <svg viewBox="0 0 20 20" class="h-4 w-4 text-lamp-600 dark:text-lamp-400" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>
                Tus fotos y documentos se procesan en tu dispositivo; no se suben a ningún servidor.
            </p>
            <p class="font-mono"><?= e(config('app_name')) ?> · Carta · Oficio · A4</p>
        </div>
    </footer>

    <!-- Navegación inferior en celular, como en una app -->
    <nav class="tab-bar md:hidden" aria-label="Secciones">
        <?php foreach ($sections as $name => [$label, $paths]): ?>
            <a href="<?= e(route($name)) ?>" class="tab-link" <?= is_route($name) ? 'aria-current="page"' : '' ?>>
                <?= $icon($paths) ?>
                <span><?= e($label) ?></span>
            </a>
        <?php endforeach; ?>
    </nav>
</body>
</html>
