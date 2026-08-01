<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

DB::statement('SET FOREIGN_KEY_CHECKS = 0');
DB::statement('DROP TABLE IF EXISTS cash_bank_transactions');
DB::statement('DROP TABLE IF EXISTS cash_bank_accounts');
try { Schema::table('payments', function($t) { $t->dropForeign(['cash_bank_account_id']); $t->dropColumn('cash_bank_account_id'); }); } catch(\Exception $e){}
try { Schema::table('petty_cash_transactions', function($t) { $t->dropForeign(['cash_bank_account_id']); $t->dropColumn('cash_bank_account_id'); }); } catch(\Exception $e){}
DB::statement('SET FOREIGN_KEY_CHECKS = 1');
echo "Done!\n";
