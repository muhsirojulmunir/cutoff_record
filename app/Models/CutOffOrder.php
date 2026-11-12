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
        'processed_at',
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
        'financial_breakdown',
    ];

    protected function casts(): array
    {
        return [
            'order_date'             => 'datetime:Y-m-d H:i:s',
            'processed_at'           => 'datetime:Y-m-d H:i:s',
            'ship_by_date'           => 'datetime:Y-m-d H:i:s',
            'qty'                    => 'integer',
            'recheck_qty'            => 'integer',
            'est_net_income'         => 'decimal:2',
            'marketplace_net_payout' => 'decimal:2',
            'financial_breakdown'    => 'array',
        ];
    }

    /**
     * Susun rincian perhitungan Est. Bersih pesanan (multi-produk maupun tunggal).
     * Voucher ditanggung penjual dibagi rata per produk: (Subtotal - Voucher/N) x 79%.
     */
    public static function buildFinancialBreakdown(
        array $rawItems,
        float $sellerVoucher = 0.0,
        float $feeRate = 0.79,
        ?float $overrideSubtotal = null,
        bool $isCancelled = false
    ): array {
        $items = [];
        foreach ($rawItems as $raw) {
            $name = trim((string) ($raw['name'] ?? $raw['product_name'] ?? $raw['item_name'] ?? ''));
            $variation = trim((string) ($raw['variation'] ?? $raw['model_name'] ?? ''));
            $sku = trim((string) ($raw['sku'] ?? $raw['model_sku'] ?? $raw['item_sku'] ?? ''));
            if ($sku !== '' && strlen($sku) > 6 && ! str_contains($sku, ' ')) {
                $sku = strtoupper($sku);
            }
            $qty = max(1, (int) ($raw['qty'] ?? $raw['model_quantity_purchased'] ?? 1));
            $subtotal = round((float) ($raw['subtotal'] ?? 0), 2);

            $items[] = [
                'name'      => $name !== '' ? $name : 'Produk',
                'variation' => $variation !== '' ? $variation : null,
                'sku'       => $sku !== '' ? $sku : null,
                'qty'       => $qty,
                'subtotal'  => $subtotal,
            ];
        }

        $itemsSubtotal = array_reduce($items, static fn (float $sum, array $i): float => $sum + $i['subtotal'], 0.0);
        $subtotalOrder = ($overrideSubtotal !== null && $overrideSubtotal > 0)
            ? round($overrideSubtotal, 2)
            : round($itemsSubtotal, 2);

        if (count($items) === 1 && $items[0]['subtotal'] <= 0 && $subtotalOrder > 0) {
            $items[0]['subtotal'] = $subtotalOrder;
        }

        $voucherTotal = max(0.0, round($sellerVoucher, 2));
        $itemCount = max(1, count($items));
        $exactVoucherPerItem = $voucherTotal / $itemCount;
        $voucherPerItem = round($voucherTotal / $itemCount, 2);

        $mappedItems = [];
        foreach ($items as $item) {
            $netBeforeFee = max(0.0, $item['subtotal'] - $exactVoucherPerItem);
            $itemEstNet = $isCancelled ? 0.0 : round($netBeforeFee * $feeRate);
            $mappedItems[] = [
                'name'           => $item['name'],
                'variation'      => $item['variation'],
                'sku'            => $item['sku'],
                'qty'            => $item['qty'],
                'subtotal'       => round($item['subtotal'], 2),
                'voucher_share'  => $voucherPerItem,
                'net_before_fee' => round($netBeforeFee, 2),
                'est_net_income' => $itemEstNet,
            ];
        }

        $netBase = max(0.0, $subtotalOrder - $voucherTotal);
        $orderEstNet = $isCancelled ? 0.0 : round($netBase * $feeRate);

        return [
            'subtotal_order'   => round($subtotalOrder, 2),
            'seller_voucher'   => $voucherTotal,
            'voucher_per_item' => $voucherPerItem,
            'item_count'       => count($mappedItems),
            'net_base'         => round($netBase, 2),
            'fee_rate'         => $feeRate,
            'is_cancelled'     => $isCancelled,
            'est_net_income'   => $orderEstNet,
            'items'            => $mappedItems,
        ];
    }

    /**
     * Tentukan apakah status pesanan belum diproses / dibatalkan sehingga
     * tidak boleh masuk ke daftar Pesanan Cut Off.
     * Pesanan Cut Off hanya menampung status "Diproses" dan seterusnya.
     */
    public static function isExcludedStatus(?string $statusText, ?string $rawStatus = null): bool
    {
        $raw = strtoupper(trim((string) $rawStatus));
        if ($raw !== '' && in_array($raw, [
            'UNPAID',
            'READY_TO_SHIP',
            'IN_CANCEL',
            'CANCELLED',
            'ON_HOLD',
            'AWAITING_SHIPMENT',
        ], true)) {
            return true;
        }

        $text = mb_strtolower(trim((string) $statusText));
        if ($text === '') {
            return false;
        }

        foreach ([
            'batal',
            'cancel',
            'belum bayar',
            'perlu dikirim',
            'tertahan',
            'unpaid',
            'awaiting shipment',
            'awaiting_shipment',
            'ready_to_ship',
            'on_hold',
        ] as $needle) {
            if (str_contains($text, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Batasi query agar hanya menyertakan pesanan Cut Off yang sudah diproses dan seterusnya.
     */
    public static function applyProcessedOnlyConstraint($query): void
    {
        $query->where(function ($sub) {
            $sub->whereNull('order_status')
                ->orWhere(function ($s) {
                    $s->where('order_status', 'not like', '%Batal%')
                        ->where('order_status', 'not like', '%Cancel%')
                        ->where('order_status', 'not like', '%Belum Bayar%')
                        ->where('order_status', 'not like', '%Perlu Dikirim%')
                        ->where('order_status', 'not like', '%Tertahan%');
                });
        });
    }

    /**
     * Scope query untuk hanya menampilkan pesanan yang telah diproses dan seterusnya.
     */
    public function scopeOnlyProcessed(Builder $query): Builder
    {
        self::applyProcessedOnlyConstraint($query);

        return $query;
    }

    /**
     * Isi awal kolom processed_at dan bersihkan baris lama yang belum diproses/dibatalkan.
     * Dipanggil sekali saat kolom processed_at baru dibuat oleh migrasi atau ensureSchema().
     */
    public static function backfillProcessedAt(): void
    {
        $patterns = [
            '%batal%',
            '%cancel%',
            '%belum bayar%',
            '%perlu dikirim%',
            '%tertahan%',
            '%unpaid%',
            '%ready_to_ship%',
            '%in_cancel%',
            '%cancelled%',
            '%on_hold%',
            '%awaiting_shipment%',
        ];

        \Illuminate\Support\Facades\DB::table('cut_off_orders')
            ->whereNull('deleted_at')
            ->whereNotNull('order_status')
            ->where(function ($q) use ($patterns) {
                foreach ($patterns as $pattern) {
                    $q->orWhereRaw('LOWER(order_status) LIKE ?', [$pattern]);
                }
            })
            ->update(['deleted_at' => now()]);

        if (\Illuminate\Support\Facades\Schema::hasTable('shopee_orders')) {
            $driver = \Illuminate\Support\Facades\DB::getDriverName();
            if ($driver === 'mysql') {
                \Illuminate\Support\Facades\DB::statement("
                    UPDATE cut_off_orders co
                    INNER JOIN shopee_orders so ON co.order_number = so.order_sn
                    SET co.processed_at = so.shipping_arranged_at
                    WHERE co.deleted_at IS NULL
                      AND (co.channel = 'SH' OR co.channel LIKE 'SH%')
                      AND co.processed_at IS NULL
                      AND so.shipping_arranged_at IS NOT NULL
                ");
            } else {
                self::query()
                    ->onlyProcessed()
                    ->whereNull('processed_at')
                    ->where(function ($q) {
                        $q->where('channel', 'SH')->orWhere('channel', 'like', 'SH%');
                    })
                    ->whereExists(function ($q) {
                        $q->select(\Illuminate\Support\Facades\DB::raw(1))
                            ->from('shopee_orders')
                            ->whereColumn('shopee_orders.order_sn', 'cut_off_orders.order_number')
                            ->whereNotNull('shopee_orders.shipping_arranged_at');
                    })
                    ->update([
                        'processed_at' => \Illuminate\Support\Facades\DB::raw('(SELECT shipping_arranged_at FROM shopee_orders WHERE shopee_orders.order_sn = cut_off_orders.order_number AND shipping_arranged_at IS NOT NULL LIMIT 1)'),
                    ]);
            }
        }

        self::query()
            ->onlyProcessed()
            ->whereNull('processed_at')
            ->whereNotNull('order_date')
            ->update([
                'processed_at' => \Illuminate\Support\Facades\DB::raw('order_date'),
            ]);
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
            } elseif ($status === 'diproses') {
                $q->where(function ($sub) {
                    $sub->where('order_status', 'like', '%Diproses%')
                        ->orWhere('order_status', 'like', '%Kirim Ulang%')
                        ->orWhere('order_status', 'like', '%Menunggu Pickup%');
                });
            } elseif ($status === 'dikirim') {
                $q->where(function ($sub) {
                    $sub->where('order_status', 'like', '%Dikirim%')
                        ->orWhere('order_status', 'like', '%Pengiriman%')
                        ->orWhere('order_status', 'like', '%Menunggu Konfirmasi%')
                        ->orWhere('order_status', 'like', '%Tiba di Tujuan%');
                })->where('order_status', 'not like', '%Perlu Dikirim%');
            } elseif ($status === 'batal') {
                $q->where(function ($sub) {
                    $sub->where('order_status', 'like', '%Batal%')
                        ->orWhere('order_status', 'like', '%Cancel%');
                });
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
