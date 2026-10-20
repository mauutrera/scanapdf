<?php
declare(strict_types=1);

/** Carpeta pública en la que vive la app ('' en la raíz del dominio, '/scanner' en un subdirectorio). */
function base_url(): string
{
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return rtrim($dir, '/');
}

function config(string $key, mixed $default = null): mixed
{
    return $GLOBALS['config'][$key] ?? $default;
}

/** Escapa texto para HTML. */
function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** URL de una ruta con nombre. */
function route(string $name, array $params = []): string
{
    return App\Router::instance()->url($name, $params);
}

/** URL de un archivo estático con versión según su fecha de modificación (evita caché vieja). */
function asset(string $path): string
{
    $path = ltrim($path, '/');
    $file = BASE_PATH . '/assets/' . $path;
    $version = is_file($file) ? '?v=' . filemtime($file) : '';
    return base_url() . '/assets/' . $path . $version;
}

/** Ruta pública de la petición actual, normalizada como la usa el router (sin barra final; "/" en la raíz). */
function current_path(): string
{
    $path = '/' . trim(rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'), '/');
    $base = base_url();
    if ($base !== '' && str_starts_with($path, $base)) {
        $path = '/' . trim(substr($path, strlen($base)), '/');
    }
    return $base . $path;
}

/** ¿La petición actual corresponde a esta ruta con nombre? (para marcar el menú activo) */
function is_route(string $name): bool
{
    return current_path() === route($name);
}

/**
 * Renderiza una vista de /views dentro de un layout.
 * Las vistas son archivos PHP; los datos llegan como variables.
 */
function view(string $template, array $data = [], ?string $layout = 'layouts/main'): string
{
    $render = static function (string $__file, array $__data): string {
        extract($__data, EXTR_SKIP);
        ob_start();
        require $__file;
        return (string) ob_get_clean();
    };

    $file = BASE_PATH . '/views/' . $template . '.php';
    if (!is_file($file)) {
        throw new RuntimeException("Vista no encontrada: $template");
    }
    $content = $render($file, $data);

    if ($layout === null) {
        return $content;
    }
    return $render(BASE_PATH . '/views/' . $layout . '.php', $data + ['content' => $content]);
}

/**
 * Envía la Content-Security-Policy (la misma para toda la app, ver 'csp' en config.php).
 * Solo se aplica con el CSS compilado: el respaldo por CDN de Tailwind necesita scripts en línea.
 */
function send_csp(): void
{
    if (headers_sent() || !is_file(BASE_PATH . '/assets/css/app.css')) {
        return;
    }
    $base = config('csp', []);
    $src = static fn (string $key): string => implode(' ', array_unique(["'self'", ...($base[$key] ?? [])]));

    header('Content-Security-Policy: ' . implode('; ', [
        "default-src 'self'",
        'script-src ' . $src('script'),
        'worker-src ' . $src('worker'),
        'style-src ' . $src('style'),
        'font-src ' . $src('font'),
        "img-src 'self' blob: data:",
        'connect-src ' . $src('connect'),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
    ]), true);
}

/** Incluye un fragmento de /views/partials con sus propias variables. */
function partial(string $name, array $data = []): string
{
    return view('partials/' . $name, $data, null);
}

function redirect(string $to, int $status = 302): never
{
    header('Location: ' . $to, true, $status);
    exit;
}
