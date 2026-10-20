<?php
declare(strict_types=1);

/*
 * Punto de entrada único de la aplicación.
 * Toda petición (Apache, Nginx o `php -S`) llega aquí y el router decide qué responder.
 */

define('BASE_PATH', __DIR__);

// Servidor de desarrollo (`php -S localhost:8000 index.php`):
// deja que PHP sirva directamente los archivos estáticos de /assets.
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $file = realpath(BASE_PATH . $path);
    $assets = realpath(BASE_PATH . '/assets');
    if ($file && $assets && str_starts_with($file, $assets . DIRECTORY_SEPARATOR) && is_file($file)) {
        return false;
    }
}

require BASE_PATH . '/app/bootstrap.php';

$router = new App\Router(base_url());
require BASE_PATH . '/app/routes.php';

$router->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $_SERVER['REQUEST_URI'] ?? '/');
