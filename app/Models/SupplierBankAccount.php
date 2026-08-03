<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierBankAccount extends Model
{
    protected $fillable = [
        'supplier_id',
        'bank_name',
        'account_number',
        'account_holder',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }
}
