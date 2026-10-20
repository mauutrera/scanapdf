<?php
declare(strict_types=1);

return [
    'app_name' => 'ScanaPDF',
    // Errores visibles solo con la variable de entorno APP_DEBUG=1 (desarrollo). En producción, apagado.
    'debug'    => getenv('APP_DEBUG') === '1',
    'timezone' => 'America/Mexico_City',

    // Orígenes externos permitidos por la política de seguridad de contenido (CSP).
    // La navegación es sin recarga (un solo documento para todas las secciones), así que la política es la misma
    // en toda la app: incluye lo que necesitan pdf.js (pantalla PDF) y Tesseract (Digitalizar), ambos desde jsDelivr.
    // Sin 'unsafe-inline' ni 'unsafe-eval'; 'wasm-unsafe-eval' solo permite compilar WebAssembly.
    'csp' => [
        'script'  => ['https://cdn.jsdelivr.net', "'wasm-unsafe-eval'"],
        'worker'  => ['blob:'],                                   // workers de pdf.js y Tesseract
        'connect' => ['https://cdn.jsdelivr.net', 'data:'],      // datos de idioma, fuentes de PDF, WebAssembly incrustado
        'style'   => ['https://fonts.googleapis.com'],
        'font'    => ['https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
    ],
];
