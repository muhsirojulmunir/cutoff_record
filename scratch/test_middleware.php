<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$routes = Route::getRoutes();

echo "=== ROUTE MIDDLEWARE ===\n";
foreach ($routes as $route) {
    if (str_starts_with($route->uri(), 'sales-orders')) {
        echo "URI: {$route->uri()} | Method: " . implode(',', $route->methods()) . " | Middleware: " . implode(', ', $route->middleware()) . "\n";
    }
}
