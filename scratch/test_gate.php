<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\Gate;

$superAdmin = User::where('email', 'superadmin@company.com')->first();
$sales = User::where('email', 'sales@company.com')->first();

echo "Super Admin: {$superAdmin->name} | isSuperAdmin: " . ($superAdmin->isSuperAdmin() ? 'YES' : 'NO') . "\n";
echo "Can sales_order.view: " . (Gate::forUser($superAdmin)->allows('sales_order.view') ? 'YES' : 'NO') . "\n";
echo "Can sales_order.create: " . (Gate::forUser($superAdmin)->allows('sales_order.create') ? 'YES' : 'NO') . "\n";

echo "\nSales: {$sales->name} | isSuperAdmin: " . ($sales->isSuperAdmin() ? 'YES' : 'NO') . "\n";
echo "Can sales_order.view: " . (Gate::forUser($sales)->allows('sales_order.view') ? 'YES' : 'NO') . "\n";
echo "Can sales_order.create: " . (Gate::forUser($sales)->allows('sales_order.create') ? 'YES' : 'NO') . "\n";
echo "Can user.view: " . (Gate::forUser($sales)->allows('user.view') ? 'YES' : 'NO') . "\n";
