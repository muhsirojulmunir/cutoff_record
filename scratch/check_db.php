<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

echo "=== USERS ===\n";
foreach (App\Models\User::with('role')->get() as $user) {
    echo "ID: {$user->id} | Name: {$user->name} | Email: {$user->email} | Role: " . ($user->role?->name ?? 'None') . " | Status: {$user->status}\n";
}

echo "\n=== ROLES ===\n";
foreach (App\Models\Role::with('permissions')->get() as $role) {
    echo "Role: {$role->name} | Permissions Count: " . $role->permissions->count() . "\n";
}
