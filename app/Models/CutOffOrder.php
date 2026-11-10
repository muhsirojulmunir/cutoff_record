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
        'ship_by_date',
        'channel',
        'order_number',
        'jl_number',
        'buyer_username',
        'shipping_courier',
        'payment_method',
        'sku_utama',
        'sku_pengganti',
        'product_name',
        'variation_name',
        'qty',
        'recheck_qty',
        'package_count',
        'info_gudang',
        'order_status',
        'keterangan_solutif',
        'cancel_by',
        'cancel_reason',
        'est_net_income',
        'marketplace_net_payout',
        'sheet_dpp',
        'dpp_number',
    ];

    protected function casts(): array
    {
        return [
            'order_date'             => 'datetime:Y-m-d H:i:s',
            'ship_by_date'           => 'datetime:Y-m-d H:i:s',
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
                    ->orWhere('variation_name', 'like', "%{$search}%")
                    ->orWhere('product_name', 'like', "%{$search}%")
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

        $query->when($filters['shipping_tier'] ?? null, function ($q, $tier) {
            if ($tier === 'instant') {
                $q->where(function ($sub) {
                    $sub->where('shipping_courier', 'like', '%instant%')
                        ->orWhere('shipping_courier', 'like', '%instan%');
                });
            } elseif ($tier === 'sameday') {
                $q->where(function ($sub) {
                    $sub->where('shipping_courier', 'like', '%sameday%')
                        ->orWhere('shipping_courier', 'like', '%same day%');
                });
            } elseif ($tier === 'hemat') {
                $q->where(function ($sub) {
                    $sub->where('shipping_courier', 'like', '%hemat%')
                        ->orWhere('shipping_courier', 'like', '%economy%')
                        ->orWhere('shipping_courier', 'like', '%halu%');
                });
            } elseif ($tier === 'kargo') {
                $q->where(function ($sub) {
                    $sub->where('shipping_courier', 'like', '%kargo%')
                        ->orWhere('shipping_courier', 'like', '%cargo%')
                        ->orWhere('shipping_courier', 'like', '%trucking%')
                        ->orWhere('shipping_courier', 'like', '%jtr%')
                        ->orWhere('shipping_courier', 'like', '%gokil%');
                });
            } elseif ($tier === 'reguler') {
                $q->where(function ($sub) {
                    $sub->where('shipping_courier', 'like', '%standard%')
                        ->orWhere('shipping_courier', 'like', '%reguler%')
                        ->orWhere('shipping_courier', 'like', '%reg%');
                });
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
