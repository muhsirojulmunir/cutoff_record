<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class SalesOrder extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'so_number',
        'tracking_number',
        'account_name',
        'customer_id',
        'recipient_name',
        'customer_phone',
        'shipping_address',
        'city',
        'province',
        'marketplace_order_id',
        'marketplace_account_id',
        'external_order_id',
        'marketplace_platform',
        'warehouse_id',
        'order_date',
        'payment_date',
        'payment_terms',
        'due_date',
        'source',
        'sales_channel',
        'status',
        'payment_status',
        'subtotal',
        'discount_amount',
        'tax_amount',
        'shipping_cost',
        'grand_total',
        'total_weight',
        'dp_amount',
        'notes',
        'created_by',
        'submitted_by',
        'submitted_at',
        'approved_by',
        'approved_at',
        'completed_by',
        'completed_at',
        'stock_deducted_at',
        'resi_scanned_at',
        'resi_scanned_by',
    ];

    protected $casts = [
        'order_date'      => 'date',
        'due_date'        => 'date',
        'payment_date'    => 'datetime',
        'submitted_at'      => 'datetime',
        'approved_at'       => 'datetime',
        'completed_at'      => 'datetime',
        'stock_deducted_at' => 'datetime',
        'resi_scanned_at'   => 'datetime',
        'subtotal'        => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount'      => 'decimal:2',
        'shipping_cost'   => 'decimal:2',
        'grand_total'     => 'decimal:2',
        'total_weight'    => 'decimal:2',
        'dp_amount'       => 'decimal:2',
    ];


    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function marketplaceOrder(): BelongsTo
    {
        return $this->belongsTo(MarketplaceOrder::class);
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')->withTrashed();
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by')->withTrashed();
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by')->withTrashed();
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by')->withTrashed();
    }

    /** Petugas gudang yang memvalidasi scan resi. */
    public function resiScanner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resi_scanned_by')->withTrashed();
    }

    public function items(): HasMany
    {
        return $this->hasMany(SalesOrderItem::class);
    }

    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class);
    }
}
