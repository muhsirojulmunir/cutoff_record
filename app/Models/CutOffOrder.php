<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CutOffOrder extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'cut_off_orders';

    protected $fillable = [
        'row_no',
        'order_date',
        'channel',
        'order_number',
        'jl_number',
        'buyer_username',
        'shipping_courier',
        'sku_utama',
        'sku_pengganti',
        'product_name',
        'qty',
        'recheck_qty',
        'package_count',
        'info_gudang',
        'order_status',
        'keterangan_solutif',
        'est_net_income',
        'marketplace_net_payout',
        'sheet_dpp',
        'dpp_number',
    ];

    protected function casts(): array
    {
        return [
            'order_date'             => 'date:Y-m-d',
            'qty'                    => 'integer',
            'recheck_qty'            => 'integer',
            'est_net_income'         => 'decimal:2',
            'marketplace_net_payout' => 'decimal:2',
        ];
    }

    /**
     * Scope query untuk filter pencarian, toko, status gudang, dan status pesanan.
     */
    public function scopeFilter(Builder $query, array $filters): void
    {
        $query->when($filters['search'] ?? null, function ($q, $search) {
            $search = trim($search);
            $q->where(function ($sub) use ($search) {
                $sub->where('order_number', 'like', "%{$search}%")
                    ->orWhere('jl_number', 'like', "%{$search}%")
                    ->orWhere('sku_utama', 'like', "%{$search}%")
                    ->orWhere('sku_pengganti', 'like', "%{$search}%")
                    ->orWhere('buyer_username', 'like', "%{$search}%")
                    ->orWhere('shipping_courier', 'like', "%{$search}%")
                    ->orWhere('dpp_number', 'like', "%{$search}%");
            });
        });

        $query->when($filters['channel'] ?? null, function ($q, $channel) {
            if ($channel !== 'all' && $channel !== '') {
                $q->where('channel', $channel);
            }
        });

        $query->when($filters['info_gudang'] ?? null, function ($q, $info) {
            if ($info === 'oos') {
                $q->where('info_gudang', 'like', '%OOS%');
            } elseif ($info !== 'all' && $info !== '') {
                $q->where('info_gudang', $info);
            }
        });

        $query->when($filters['order_status'] ?? null, function ($q, $status) {
            if ($status === 'rj') {
                $q->where(function ($sub) {
                    $sub->where('order_status', 'like', '%RJ%')
                        ->orWhere('order_status', 'like', '%Retur%');
                });
            } elseif ($status === 'batal') {
                $q->where('order_status', 'like', '%cancel%');
            } elseif ($status === 'selesai') {
                $q->where('order_status', 'like', '%Selesai%');
            } elseif ($status !== 'all' && $status !== '') {
                $q->where('order_status', $status);
            }
        });

        $query->when($filters['dpp_status'] ?? null, function ($q, $dpp) {
            if ($dpp === 'has_dpp') {
                $q->whereNotNull('dpp_number')->where('dpp_number', '!=', '');
            } elseif ($dpp === 'no_dpp') {
                $q->where(function ($sub) {
                    $sub->whereNull('dpp_number')->orWhere('dpp_number', '');
                });
            }
        });

        $query->when($filters['shipping_courier'] ?? null, function ($q, $courier) {
            if ($courier !== 'all' && $courier !== '') {
                if ($courier === 'J&T' || $courier === 'JNT') {
                    $q->where(function ($sub) {
                        $sub->where('shipping_courier', 'like', '%J&T%')
                            ->orWhere('shipping_courier', 'like', '%JNT%');
                    });
                } else {
                    $q->where('shipping_courier', 'like', "%{$courier}%");
                }
            }
        });

        $query->when($filters['date_from'] ?? null, function ($q, $from) {
            $q->whereDate('order_date', '>=', $from);
        });

        $query->when($filters['date_to'] ?? null, function ($q, $to) {
            $q->whereDate('order_date', '<=', $to);
        });
    }
}
