<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        try {
            Schema::table('sales_orders', function (Blueprint $table) {
                $table->index('order_date', 'so_ord_dt_idx');
                $table->index('sales_channel', 'so_sls_chn_idx');
                $table->index('status', 'so_sts_idx');
            });
        } catch (\Exception $e) {}

        try {
            Schema::table('purchase_orders', function (Blueprint $table) {
                $table->index('order_date', 'po_ord_dt_idx');
                $table->index('status', 'po_sts_idx');
            });
        } catch (\Exception $e) {}

        try {
            Schema::table('invoices', function (Blueprint $table) {
                $table->index('invoice_date', 'inv_dt_idx');
                $table->index('due_date', 'inv_due_idx');
                $table->index('status', 'inv_sts_idx');
            });
        } catch (\Exception $e) {}

        try {
            Schema::table('payments', function (Blueprint $table) {
                $table->index('payment_date', 'pay_dt_idx');
                $table->index('status', 'pay_sts_idx');
            });
        } catch (\Exception $e) {}

        if (Schema::hasTable('petty_cash_transactions')) {
            try {
                Schema::table('petty_cash_transactions', function (Blueprint $table) {
                    $table->index('transaction_date', 'pct_dt_idx');
                    $table->index('status', 'pct_sts_idx');
                });
            } catch (\Exception $e) {}
        }

        try {
            Schema::table('marketplace_orders', function (Blueprint $table) {
                $table->index('marketplace', 'mo_mp_idx');
                $table->index('order_date', 'mo_ord_dt_idx');
                $table->index('workflow_status', 'mo_wf_sts_idx');
            });
        } catch (\Exception $e) {}
    }

    public function down(): void
    {
        // Safe down
    }
};
