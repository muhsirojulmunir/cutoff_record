<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$routes = Route::getRoutes();
foreach ($routes as $route) {
    if (str_contains($route->uri(), 'sales-orders') || str_contains($route->uri(), 'products')) {
        echo "URI: {$route->uri()} | Action: {$route->getActionName()} | Middleware: " . json_encode($route->middleware()) . "\n";
    }
}
