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
            $arrangedMap = \Illuminate\Support\Facades\DB::table('shopee_orders')
                ->whereNotNull('shipping_arranged_at')
                ->where(function ($sub) {
                    $sub->whereNotNull('fulfillment_method')
                        ->orWhere('order_status', 'PROCESSED');
                })
                ->pluck('shipping_arranged_at', 'order_sn')
                ->all();

            if (! empty($arrangedMap)) {
                $candidates = self::query()
                    ->onlyProcessed()
                    ->whereNull('processed_at')
                    ->where(function ($q) {
                        $q->where('channel', 'SH')->orWhere('channel', 'like', 'SH%');
                    })
                    ->select(['id', 'order_number'])
                    ->get();

                $groupedByTs = [];
                foreach ($candidates as $row) {
                    $sn = trim((string) $row->order_number);
                    if ($sn !== '' && isset($arrangedMap[$sn])) {
                        $ts = (string) $arrangedMap[$sn];
                        $groupedByTs[$ts][] = (int) $row->id;
                    }
                }

                foreach ($groupedByTs as $ts => $ids) {
                    foreach (array_chunk($ids, 500) as $chunk) {
                        self::query()
                            ->whereIn('id', $chunk)
                            ->update(['processed_at' => $ts]);
                    }
                }
            }
        }

        $remainingIds = self::query()
            ->onlyProcessed()
            ->whereNull('processed_at')
            ->whereNotNull('order_date')
            ->pluck('id')
            ->all();

        foreach (array_chunk($remainingIds, 500) as $chunk) {
            self::query()
                ->whereIn('id', $chunk)
                ->update([
                    'processed_at' => \Illuminate\Support\Facades\DB::raw('order_date'),
                ]);
        }

        self::bumpCacheVersion();
    }

    /**
     * Bersihkan data historis shipping_arranged_at / processed_at pada pesanan lama yang sudah
     * berstatus Dikirim/Tiba/Selesai tanpa riwayat Atur Pengiriman di ERP (terisi update_time penyelesaian).
     */
    public static function cleanupHistoricalProcessedAt(): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('cut_off_orders')
            || ! \Illuminate\Support\Facades\Schema::hasColumn('cut_off_orders', 'processed_at')) {
            return;
        }

        $hasShopeeOrders = \Illuminate\Support\Facades\Schema::hasTable('shopee_orders');
        $arrangedSet = [];

        if ($hasShopeeOrders && \Illuminate\Support\Facades\Schema::hasColumn('shopee_orders', 'shipping_arranged_at')) {
            \Illuminate\Support\Facades\DB::table('shopee_orders')
                ->whereNotNull('shipping_arranged_at')
                ->whereNull('fulfillment_method')
                ->whereIn('order_status', ['SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'])
                ->whereNotNull('order_created_at')
                ->whereRaw('DATE(shipping_arranged_at) != DATE(order_created_at)')
                ->update(['shipping_arranged_at' => null]);

            $arrangedSns = \Illuminate\Support\Facades\DB::table('shopee_orders')
                ->whereNotNull('fulfillment_method')
                ->pluck('order_sn')
                ->all();

            foreach ($arrangedSns as $sn) {
                $cleanSn = trim((string) $sn);
                if ($cleanSn !== '') {
                    $arrangedSet[$cleanSn] = true;
                }
            }
        }

        // Hindari correlated NOT EXISTS saat UPDATE cut_off_orders yang mengunci seluruh tabel di MySQL;
        // saring kandidat di PHP lalu eksekusi UPDATE per batch 500 ID.
        $candidates = self::query()
            ->onlyProcessed()
            ->whereNotNull('processed_at')
            ->whereNotNull('order_date')
            ->whereRaw('DATE(processed_at) != DATE(order_date)')
            ->whereRaw("LOWER(COALESCE(order_status, '')) NOT LIKE '%diproses%'")
            ->whereRaw("UPPER(COALESCE(order_status, '')) != 'PROCESSED'")
            ->whereRaw("LOWER(COALESCE(order_status, '')) NOT LIKE '%menunggu pickup%'")
            ->whereRaw("UPPER(COALESCE(order_status, '')) != 'AWAITING_COLLECTION'")
            ->select(['id', 'order_number'])
            ->get();

        $targetIds = [];
        foreach ($candidates as $row) {
            $sn = trim((string) $row->order_number);
            if ($sn !== '' && isset($arrangedSet[$sn])) {
                continue;
            }
            $targetIds[] = (int) $row->id;
        }

        foreach (array_chunk($targetIds, 500) as $chunk) {
            self::query()
                ->whereIn('id', $chunk)
                ->update([
                    'processed_at' => \Illuminate\Support\Facades\DB::raw('order_date'),
                ]);
        }

        self::bumpCacheVersion();
    }

    /**
     * Catat event model agar cache statistik Cut Off, Dashboard, dan Penjualan Shopee otomatis ter-refresh.
     */
    protected static function booted(): void
    {
        $invalidate = static fn () => self::bumpCacheVersion();
        static::saved($invalidate);
        static::deleted($invalidate);
        static::restored($invalidate);
    }

    public static function getCacheVersion(): int
    {
        try {
            $ver = \Illuminate\Support\Facades\Cache::store('file')->get('cut_off_orders_cache_v1');
            return is_numeric($ver) ? (int) $ver : 1;
        } catch (\Throwable) {
            return 1;
        }
    }

    public static function bumpCacheVersion(): int
    {
        $next = self::getCacheVersion() + 1;
        try {
            \Illuminate\Support\Facades\Cache::store('file')->forever('cut_off_orders_cache_v1', $next);
        } catch (\Throwable) {
            // Abaikan kegagalan I/O cache file
        }

        return $next;
    }

    private static bool $perfIndexesChecked = false;

    /**
     * Pastikan index performa sudah dibuat sekali (aman untuk deploy FTP cPanel tanpa shell).
     */
    public static function ensurePerformanceIndexesOnce(): void
    {
        if (self::$perfIndexesChecked) {
            return;
        }

        if (! app()->runningUnitTests()) {
            try {
                $store = \Illuminate\Support\Facades\Cache::store('file');
                if ($store->get('cut_off_perf_indexes_v1') === true) {
                    self::$perfIndexesChecked = true;
                    return;
                }
                if (! $store->add('cut_off_perf_indexes_lock_v1', true, 45)) {
                    return;
                }
            } catch (\Throwable) {
                // Lanjutkan pengecekan langsung bila file cache tidak tersedia
            }
        }

        try {
            self::ensurePerformanceIndexes();
            self::$perfIndexesChecked = true;
            if (! app()->runningUnitTests()) {
                try {
                    $store = \Illuminate\Support\Facades\Cache::store('file');
                    $store->forever('cut_off_perf_indexes_v1', true);
                    $store->forget('cut_off_perf_indexes_lock_v1');
                } catch (\Throwable) {
                    // Abaikan error tulis cache file
                }
            }
        } catch (\Throwable) {
            // Biarkan percobaan berikutnya mencoba ulang bila gagal sementara
        }
    }

    /**
     * Pastikan index komposit performa tersedia di cut_off_orders & shopee_orders (idempoten, non-blocking).
     */
    public static function ensurePerformanceIndexes(): void
    {
        $indexes = [
            'cut_off_orders' => [
                'cut_off_del_date_id_idx'       => ['deleted_at', 'order_date', 'id'],
                'cut_off_del_channel_date_idx'  => ['deleted_at', 'channel', 'order_date'],
                'cut_off_del_processed_idx'     => ['deleted_at', 'processed_at'],
                'cut_off_del_sku_idx'           => ['deleted_at', 'sku_utama'],
                'cut_off_del_order_num_idx'     => ['deleted_at', 'order_number'],
            ],
            'shopee_orders' => [
                'shopee_orders_order_sn_idx'       => ['order_sn'],
                'shopee_orders_fulfill_sn_idx'     => ['fulfillment_method', 'order_sn'],
            ],
        ];

        $driver = \Illuminate\Support\Facades\DB::getDriverName();

        foreach ($indexes as $table => $tableIndexes) {
            if (! \Illuminate\Support\Facades\Schema::hasTable($table)) {
                continue;
            }

            $existing = self::listTableIndexNames($table, $driver);

            foreach ($tableIndexes as $indexName => $columns) {
                if (isset($existing[$indexName])) {
                    continue;
                }

                $allColsExist = true;
                foreach ($columns as $col) {
                    if (! \Illuminate\Support\Facades\Schema::hasColumn($table, $col)) {
                        $allColsExist = false;
                        break;
                    }
                }
                if (! $allColsExist) {
                    continue;
                }

                try {
                    if ($driver === 'mysql') {
                        $colSql = implode(', ', array_map(static fn (string $c): string => "`{$c}`", $columns));
                        try {
                            \Illuminate\Support\Facades\DB::statement(
                                "ALTER TABLE `{$table}` ADD INDEX `{$indexName}` ({$colSql}), ALGORITHM=INPLACE, LOCK=NONE"
                            );
                        } catch (\Throwable) {
                            \Illuminate\Support\Facades\Schema::table($table, function (\Illuminate\Database\Schema\Blueprint $blueprint) use ($columns, $indexName): void {
                                $blueprint->index($columns, $indexName);
                            });
                        }
                    } else {
                        \Illuminate\Support\Facades\Schema::table($table, function (\Illuminate\Database\Schema\Blueprint $blueprint) use ($columns, $indexName): void {
                            $blueprint->index($columns, $indexName);
                        });
                    }
                } catch (\Throwable) {
                    // Abaikan jika index sudah dibuat oleh proses/migrasi lain secara bersamaan
                }
            }
        }
    }

    /**
     * @return array<string, bool>
     */
    private static function listTableIndexNames(string $table, string $driver): array
    {
        $names = [];
        try {
            if ($driver === 'mysql') {
                $rows = \Illuminate\Support\Facades\DB::select(
                    'SELECT DISTINCT INDEX_NAME as idx_name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
                    [$table]
                );
                foreach ($rows as $row) {
                    $names[(string) $row->idx_name] = true;
                }
            } elseif ($driver === 'sqlite') {
                $rows = \Illuminate\Support\Facades\DB::select("PRAGMA index_list('{$table}')");
                foreach ($rows as $row) {
                    $names[(string) $row->name] = true;
                }
            }
        } catch (\Throwable) {
            // Fallback: biarkan try/catch saat pembuatan index menangani duplikasi
        }

        return $names;
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
