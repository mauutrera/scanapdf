<?php
declare(strict_types=1);

namespace App;

/**
 * Router mínimo: rutas por método, parámetros `{nombre}` y rutas con nombre.
 * Las URLs nunca muestran extensiones ni la estructura de carpetas del servidor.
 */
final class Router
{
    /** @var array<string, array<int, array{pattern:string, handler:callable, params:string[]}>> */
    private array $routes = [];
    /** @var array<string, string> nombre => ruta */
    private array $names = [];
    private static ?Router $instance = null;

    public function __construct(private string $basePath = '')
    {
        $this->basePath = rtrim($basePath, '/');
        self::$instance = $this;
    }

    public static function instance(): Router
    {
        return self::$instance ?? throw new \RuntimeException('Router no inicializado');
    }

    public function get(string $path, callable $handler, ?string $name = null): void
    {
        $this->add('GET', $path, $handler, $name);
    }

    private function add(string $method, string $path, callable $handler, ?string $name): void
    {
        $path = '/' . trim($path, '/');
        preg_match_all('#\{(\w+)\}#', $path, $m);
        $pattern = '#^' . preg_replace('#\{\w+\}#', '([^/]+)', $path) . '$#u';
        $this->routes[$method][] = ['pattern' => $pattern, 'handler' => $handler, 'params' => $m[1]];
        if ($name !== null) {
            $this->names[$name] = $path;
        }
    }

    /** Genera la URL pública de una ruta con nombre. */
    public function url(string $name, array $params = []): string
    {
        $path = $this->names[$name] ?? throw new \InvalidArgumentException("Ruta desconocida: $name");
        foreach ($params as $key => $value) {
            $path = str_replace('{' . $key . '}', rawurlencode((string) $value), $path);
        }
        return $this->basePath . $path;
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = rawurldecode(parse_url($uri, PHP_URL_PATH) ?: '/');
        if ($this->basePath !== '' && str_starts_with($path, $this->basePath)) {
            $path = substr($path, strlen($this->basePath));
        }
        $path = '/' . trim($path, '/');

        // Una sola URL por página: /index.php, /ruta/ y similares redirigen a su forma limpia.
        if ($path === '/index.php') {
            $path = '/';
        }
        $canonical = $this->basePath . $path;
        if ($method === 'GET' && rawurldecode(parse_url($uri, PHP_URL_PATH) ?: '/') !== $canonical) {
            $query = parse_url($uri, PHP_URL_QUERY);
            redirect($canonical . ($query ? '?' . $query : ''), 301);
        }

        $method = $method === 'HEAD' ? 'GET' : $method;
        $allowed = [];
        foreach ($this->routes as $routeMethod => $routes) {
            foreach ($routes as $route) {
                if (!preg_match($route['pattern'], $path, $matches)) {
                    continue;
                }
                if ($routeMethod !== $method) {
                    $allowed[] = $routeMethod;
                    continue;
                }
                $args = array_combine($route['params'], array_slice($matches, 1)) ?: [];
                ($route['handler'])(...$args);
                return;
            }
        }

        if ($allowed) {
            http_response_code(405);
            header('Allow: ' . implode(', ', array_unique($allowed)));
            echo view('errors/405', ['title' => 'Método no permitido']);
            return;
        }

        http_response_code(404);
        echo view('errors/404', ['title' => 'Página no encontrada']);
    }
}
