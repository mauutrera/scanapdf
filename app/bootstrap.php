<?php
declare(strict_types=1);

$config = require BASE_PATH . '/app/config.php';

error_reporting(E_ALL);
ini_set('display_errors', $config['debug'] ? '1' : '0');
date_default_timezone_set($config['timezone']);

require BASE_PATH . '/app/helpers.php';
require BASE_PATH . '/app/Router.php';

$GLOBALS['config'] = $config;

// Encabezados de seguridad para todas las respuestas.
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
header('Permissions-Policy: camera=(self), microphone=(), geolocation=()');
header_remove('X-Powered-By');

// La CSP es la misma para toda la app (navegación sin recarga: un solo documento). Ver 'csp' en config.php.
send_csp();

// En producción, cualquier error inesperado muestra una página 500 en lugar de detalles internos.
set_exception_handler(static function (Throwable $e) use ($config): void {
    error_log((string) $e);
    if (!headers_sent()) {
        http_response_code(500);
    }
    if ($config['debug']) {
        echo '<pre>' . e((string) $e) . '</pre>';
        return;
    }
    try {
        echo view('errors/500', ['title' => 'Error']);
    } catch (Throwable) {
        echo 'Ocurrió un error. Intenta de nuevo.';
    }
});
