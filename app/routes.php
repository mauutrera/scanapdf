<?php
declare(strict_types=1);

/** @var App\Router $router */

// Los navegadores piden /favicon.ico por su cuenta; se envía al ícono real.
$router->get('/favicon.ico', fn () => redirect(asset('img/icon.svg'), 301));

// ---------- PWA ----------

// Manifiesto de la app instalable (nombre, íconos, colores, accesos directos).
$router->get('/manifest.webmanifest', function (): void {
    $base = base_url();
    $icon = fn (string $file, string $size, string $purpose = 'any') => [
        'src' => "$base/assets/img/$file", 'sizes' => $size, 'type' => 'image/png', 'purpose' => $purpose,
    ];
    $shortcut = fn (string $name, string $route, string $description) => [
        'name' => $name, 'url' => route($route), 'description' => $description,
        'icons' => [['src' => "$base/assets/img/icon-192.png", 'sizes' => '192x192', 'type' => 'image/png']],
    ];
    header('Content-Type: application/manifest+json; charset=utf-8');
    header('Cache-Control: no-cache');
    echo json_encode([
        'id'               => "$base/",
        'name'             => 'ScanaPDF — fotos y PDFs a escaneos',
        'short_name'       => config('app_name'),
        'description'      => 'Convierte fotos de documentos, credenciales y PDFs en escaneos y documentos digitales. Todo se procesa en tu dispositivo.',
        'lang'             => 'es-MX',
        'dir'              => 'ltr',
        'start_url'        => "$base/",
        'scope'            => "$base/",
        'display'          => 'standalone',
        'orientation'      => 'any',
        'background_color' => '#0d1216',
        'theme_color'      => '#151c21',
        'categories'       => ['productivity', 'utilities'],
        'icons'            => [
            $icon('icon-192.png', '192x192'),
            $icon('icon-512.png', '512x512'),
            $icon('icon-maskable-512.png', '512x512', 'maskable'),
        ],
        'shortcuts'        => [
            $shortcut('Escanear documento', 'scan.document', 'Fotos de hojas a PDF'),
            $shortcut('Escanear credencial', 'scan.credential', 'Frente y reverso a tamaño real'),
            $shortcut('PDF con estilo escaneado', 'scan.pdf', 'Un PDF digital como si fuera escaneado'),
            $shortcut('Digitalizar documento', 'scan.digitize', 'Foto a documento digital limpio'),
        ],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}, 'pwa.manifest');

// Service worker: debe servirse desde la raíz de la app para controlarla completa. Su versión se deriva de las
// fechas de modificación de los archivos, así que cualquier cambio publica una versión nueva automáticamente.
$router->get('/sw.js', function (): void {
    $base = base_url();
    $files = [];
    $dir = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(BASE_PATH . '/assets', FilesystemIterator::SKIP_DOTS));
    foreach ($dir as $file) {
        if (!preg_match('/\.(js|css|png|svg)$/', $file->getFilename())) continue;
        $rel = str_replace('\\', '/', substr($file->getPathname(), strlen(BASE_PATH)));
        $files[$rel] = $file->getMTime();
    }
    ksort($files);
    $views = array_merge(glob(BASE_PATH . '/views/*.php') ?: [], glob(BASE_PATH . '/views/*/*.php') ?: []);
    $version = substr(md5(json_encode($files) . implode(',', array_map('filemtime', $views))), 0, 10);
    $precache = array_merge(
        array_map(fn ($r) => route($r), ['home', 'scan.document', 'scan.credential', 'scan.pdf', 'scan.digitize']),
        array_map(fn ($rel) => $base . $rel, array_keys($files)),
    );

    header_remove('Content-Security-Policy'); // el SW descarga librerías de CDN; su propia CSP no debe impedirlo
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-cache');
    header('Service-Worker-Allowed: ' . $base . '/');
    echo 'self.PWA = ' . json_encode(['version' => $version, 'base' => $base, 'precache' => $precache], JSON_UNESCAPED_SLASHES) . ";\n";
    readfile(BASE_PATH . '/app/pwa/sw.js');
}, 'pwa.sw');

$router->get('/', fn () => print view('home', [
    'title' => 'Inicio',
]), 'home');

$router->get('/documento', fn () => print view('scan/document', [
    'title'   => 'Escanear documento',
    'scripts' => ['js/pages/document.js'],
]), 'scan.document');

$router->get('/credencial', fn () => print view('scan/credential', [
    'title'   => 'Escanear credencial',
    'scripts' => ['js/pages/credential.js'],
]), 'scan.credential');

$router->get('/digitalizar', fn () => print view('scan/digitize', [
    'title'   => 'Digitalizar documento',
    'scripts' => ['js/pages/digitize.js'],
]), 'scan.digitize');

$router->get('/pdf', fn () => print view('scan/pdf', [
    'title'   => 'PDF con estilo escaneado',
    'scripts' => ['js/pages/digital.js'],
]), 'scan.pdf');
