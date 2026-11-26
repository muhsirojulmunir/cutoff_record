<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CutOffReturn extends Model
{
    use HasFactory, SoftDeletes;

    private static bool $stageSchemaChecked = false;

    public const CLOSED_STATUSES = [
        'ACCEPTED',
        'CANCELLED',
        'CLOSED',
        'REFUND_PAID',
        'COMPLETED',
        'REJECTED',
    ];

    public const API_DISPUTED_STATUSES = [
        'SELLER_DISPUTE',
        'DISPUTING',
        'DISPUTE_ONGOING',
        'SELLER_DISPUTED',
    ];

    public const ARRIVED_LOGISTICS_STATUSES = [
        'LOGISTICS_DELIVERY_DONE',
        'DELIVERED',
        'DELIVERY_DONE',
        'ARRIVED',
    ];

    public const IN_TRANSIT_LOGISTICS_STATUSES = [
        'LOGISTICS_REQUEST_CREATED',
        'LOGISTICS_PICKUP_DONE',
        'LOGISTICS_IN_TRANSIT',
        'LOGISTICS_READY',
        'WAIT_FOR_PICKUP',
        'IN_TRANSIT',
        'PICKUP_DONE',
        'SHIPPED',
        'AWAITING_BUYER_SHIP',
        'BUYER_SHIPPED_ITEM',
        'SELLER_RECEIVING',
    ];

    public const IN_TRANSIT_RETURN_STATUSES = [
        'AWAITING_BUYER_SHIP',
        'BUYER_SHIPPED_ITEM',
        'SELLER_RECEIVING',
    ];

    public const AWAITING_VALIDATION_STATUSES = [
        'SELLER_DISPUTE_PENDING',
        'AWAITING_SELLER_REVIEW',
        'AWAITING_SELLER_APPROVAL',
        'AWAITING_SELLER_CONFIRMATION',
        'PENDING_SELLER_CONFIRMATION',
        'PENDING_SELLER_RESPONSE',
        'JUDGING',
    ];

    public const PLATFORM_REVIEW_STATUSES = [
        'REQUESTED',
        'RETURN_OR_REFUND_REQUEST_PENDING',
    ];

    protected $table = 'cut_off_returns';

    protected $fillable = [
        'no_urut',
        'marketplace',
        'tgl_input_mp',
        'nama_barang_mp',
        'jml_produk_mp',
        'no_invoice_mp',
        'no_invoice_baru',
        'no_retur',
        'no_rj',
        'tgl_rj',
        'tgl_terima_brg',
        'nama_barang_fisik',
        'jml_brg_fisik',
        'keterangan',
        'barcode',
        'tgl_banding',
        'no_pengajuan',
        'no_pesanan_baru',
        'due_date',
        'return_status',
        'return_logistics_status',
        'return_shipped_at',
        'estimated_arrival_at',
        'arrival_eta_source',
        'needs_action',
        'dispute_action',
        'dispute_action_at',
        'dispute_action_by',
        'dispute_action_note',
        'refund_amount',
        'seller_solution',
    ];

    protected $appends = [
        'seller_center_url',
        'workflow_stage',
    ];

    protected $casts = [
        'tgl_input_mp'         => 'date',
        'tgl_rj'               => 'date',
        'tgl_terima_brg'       => 'date',
        'due_date'             => 'datetime',
        'return_shipped_at'    => 'datetime',
        'estimated_arrival_at' => 'datetime',
        'dispute_action_at'    => 'datetime',
        'needs_action'         => 'boolean',
        'refund_amount'        => 'float',
        'no_urut'              => 'integer',
        'jml_produk_mp'        => 'integer',
        'jml_brg_fisik'        => 'integer',
    ];

    /**
     * Pastikan kolom lifecycle retur tersedia agar tetap aman jika deploy tanpa shell migrate.
     */
    public static function ensureReturnStageSchema(): void
    {
        if (self::$stageSchemaChecked) {
            return;
        }

        try {
            if (! Schema::hasTable('cut_off_returns')) {
                return;
            }

            if (! Schema::hasColumn('cut_off_returns', 'dispute_action')) {
                Schema::table('cut_off_returns', function (Blueprint $table) {
                    if (! Schema::hasColumn('cut_off_returns', 'return_logistics_status')) {
                        $table->string('return_logistics_status', 80)->nullable()->index()->after('return_status');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'return_shipped_at')) {
                        $table->timestamp('return_shipped_at')->nullable()->after('return_logistics_status');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'estimated_arrival_at')) {
                        $table->timestamp('estimated_arrival_at')->nullable()->after('return_shipped_at');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'arrival_eta_source')) {
                        $table->string('arrival_eta_source', 30)->nullable()->after('estimated_arrival_at');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'dispute_action')) {
                        $table->string('dispute_action', 40)->nullable()->index()->after('needs_action');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'dispute_action_at')) {
                        $table->timestamp('dispute_action_at')->nullable()->after('dispute_action');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'dispute_action_by')) {
                        $table->string('dispute_action_by', 120)->nullable()->after('dispute_action_at');
                    }
                    if (! Schema::hasColumn('cut_off_returns', 'dispute_action_note')) {
                        $table->string('dispute_action_note', 255)->nullable()->after('dispute_action_by');
                    }
                });
            }

            self::$stageSchemaChecked = true;
        } catch (\Throwable) {
            // Abaikan bila schema check tidak dapat dijalankan
        }
    }

    /**
     * Tentukan tahap lifecycle retur secara otomatis & deterministik.
     */
    public function getWorkflowStageAttribute(): string
    {
        $statusUpper    = strtoupper(trim((string) ($this->attributes['return_status'] ?? '')));
        $logisticsUpper = strtoupper(trim((string) ($this->attributes['return_logistics_status'] ?? '')));
        $disputeAction  = strtolower(trim((string) ($this->attributes['dispute_action'] ?? '')));
        $tglBanding     = strtolower(trim((string) ($this->attributes['tgl_banding'] ?? '')));
        $hasArrivedWarehouse = ! empty($this->attributes['tgl_terima_brg']);
        $needsAction    = (bool) ($this->attributes['needs_action'] ?? false);

        if ($disputeAction === 'no_appeal_needed' || str_contains($tglBanding, 'tidak perlu')) {
            return 'no_appeal_needed';
        }

        if (in_array($statusUpper, self::CLOSED_STATUSES, true)) {
            return 'resolved';
        }

        if (
            $disputeAction === 'appeal_submitted'
            || in_array($statusUpper, self::API_DISPUTED_STATUSES, true)
            || str_contains($tglBanding, 'sudah')
        ) {
            return 'appeal_submitted';
        }

        $arrivedByLogistics   = in_array($logisticsUpper, self::ARRIVED_LOGISTICS_STATUSES, true);
        $awaitingValidation   = in_array($statusUpper, self::AWAITING_VALIDATION_STATUSES, true);
        $inTransitByLogistics = in_array($logisticsUpper, self::IN_TRANSIT_LOGISTICS_STATUSES, true);
        $inTransitByStatus    = in_array($statusUpper, self::IN_TRANSIT_RETURN_STATUSES, true);
        $isPlatformReview     = in_array($statusUpper, self::PLATFORM_REVIEW_STATUSES, true);

        if (! $hasArrivedWarehouse && ! $arrivedByLogistics && ! $awaitingValidation && ($inTransitByLogistics || $inTransitByStatus)) {
            return 'otw_office';
        }

        if (! $hasArrivedWarehouse && ! $arrivedByLogistics && ! $awaitingValidation && $isPlatformReview) {
            return 'platform_review';
        }

        if (
            $arrivedByLogistics
            || $awaitingValidation
            || ($hasArrivedWarehouse && in_array($statusUpper, ['PROCESSING', 'REQUESTED'], true))
            || ($needsAction && ! $isPlatformReview)
        ) {
            return 'awaiting_appeal';
        }

        return 'resolved';
    }

    /**
     * Link langsung ke kasus retur/sengketa di Shopee atau TikTok Seller Center.
     */
    public function getSellerCenterUrlAttribute(): ?string
    {
        $mp = strtoupper(trim((string) ($this->attributes['marketplace'] ?? $this->marketplace ?? '')));
        $noRetur = trim((string) ($this->attributes['no_retur'] ?? $this->no_retur ?? ''));
        $noInv   = trim((string) ($this->attributes['no_invoice_mp'] ?? $this->no_invoice_mp ?? ''));
        $keyword = $noRetur ?: $noInv;
        if (! $keyword) {
            return null;
        }

        if ($mp === 'SH' || str_contains($mp, 'SHOPEE')) {
            return 'https://seller.shopee.co.id/portal/sale/return?keyword=' . urlencode($keyword);
        }

        if ($mp === 'TT' || str_contains($mp, 'TIKTOK')) {
            return 'https://seller-id.tiktok.com/order/reverse-order?search=' . urlencode($keyword);
        }

        return null;
    }

    /**
     * Scope filter pencarian & marketplace.
     */
    public function scopeFilter($query, array $filters)
    {
        $query->when($filters['search'] ?? null, function ($q, $search) {
            $term = trim((string) $search);
            if ($term === '') {
                return;
            }

            $q->where(function ($sub) use ($term) {
                $sub->where('no_invoice_baru', 'like', "%{$term}%")
                    ->orWhere('no_pesanan_baru', 'like', "%{$term}%")
                    ->orWhere('no_invoice_mp', 'like', "%{$term}%")
                    ->orWhere('no_retur', 'like', "%{$term}%")
                    ->orWhere('no_rj', 'like', "%{$term}%")
                    ->orWhere('no_pengajuan', 'like', "%{$term}%")
                    ->orWhere('nama_barang_mp', 'like', "%{$term}%")
                    ->orWhere('nama_barang_fisik', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhere('keterangan', 'like', "%{$term}%")
                    ->orWhere('tgl_banding', 'like', "%{$term}%");

                if (is_numeric($term)) {
                    $sub->orWhere('no_urut', (int) $term);
                }
            });
        });

        $query->when($filters['marketplace'] ?? null, function ($q, $mp) {
            if ($mp !== 'all' && $mp !== '') {
                $q->where('marketplace', $mp);
            }
        });

        $query->when($filters['date_from'] ?? null, function ($q, $date) {
            $q->where('tgl_terima_brg', '>=', $date);
        });

        $query->when($filters['date_to'] ?? null, function ($q, $date) {
            $q->where('tgl_terima_brg', '<=', $date);
        });

        $query->when($filters['needs_action'] ?? null, function ($q, $needsAction) {
            if ($needsAction === '1' || $needsAction === true || $needsAction === 'true') {
                $q->forStage('awaiting_appeal');
            }
        });

        $query->when($filters['stage'] ?? null, function ($q, $stage) {
            if ($stage !== 'all' && $stage !== '') {
                $q->forStage((string) $stage);
            }
        });

        return $query;
    }

    /**
     * Scope query untuk memfilter data berdasarkan workflow_stage.
     */
    public function scopeForStage($query, string $stage)
    {
        $closedStatuses = self::CLOSED_STATUSES;
        $disputedStatuses = self::API_DISPUTED_STATUSES;
        $arrivedLogistics = self::ARRIVED_LOGISTICS_STATUSES;
        $transitLogistics = self::IN_TRANSIT_LOGISTICS_STATUSES;
        $transitStatuses = self::IN_TRANSIT_RETURN_STATUSES;
        $validationStatuses = self::AWAITING_VALIDATION_STATUSES;
        $platformReviewStatuses = self::PLATFORM_REVIEW_STATUSES;

        $applyNotManualOverride = function ($sub) {
            $sub->where(function ($w) {
                $w->whereNull('dispute_action')
                  ->orWhereNotIn('dispute_action', ['no_appeal_needed', 'appeal_submitted']);
            })
            ->where(function ($w) {
                $w->whereNull('tgl_banding')
                  ->orWhere(function ($b) {
                      $b->whereRaw("LOWER(tgl_banding) NOT LIKE '%tidak perlu%'")
                        ->whereRaw("LOWER(tgl_banding) NOT LIKE '%sudah%'");
                  });
            });
        };

        if ($stage === 'no_appeal_needed') {
            return $query->where(function ($q) {
                $q->where('dispute_action', 'no_appeal_needed')
                  ->orWhereRaw("LOWER(COALESCE(tgl_banding, '')) LIKE '%tidak perlu%'");
            });
        }

        if ($stage === 'appeal_submitted') {
            return $query->where(function ($q) {
                $q->whereNull('dispute_action')
                  ->orWhere('dispute_action', '!=', 'no_appeal_needed');
            })
            ->whereRaw("LOWER(COALESCE(tgl_banding, '')) NOT LIKE '%tidak perlu%'")
            ->where(function ($q) use ($closedStatuses) {
                $q->whereNull('return_status')
                  ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_status)'), $closedStatuses);
            })
            ->where(function ($q) use ($disputedStatuses) {
                $q->where('dispute_action', 'appeal_submitted')
                  ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $disputedStatuses)
                  ->orWhereRaw("LOWER(COALESCE(tgl_banding, '')) LIKE '%sudah%'");
            });
        }

        if ($stage === 'otw_office') {
            return $query
                ->tap($applyNotManualOverride)
                ->where(function ($q) use ($closedStatuses, $disputedStatuses) {
                    $q->whereNull('return_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_status)'), array_merge($closedStatuses, $disputedStatuses));
                })
                ->whereNull('tgl_terima_brg')
                ->where(function ($q) use ($arrivedLogistics) {
                    $q->whereNull('return_logistics_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_logistics_status)'), $arrivedLogistics);
                })
                ->where(function ($q) use ($validationStatuses) {
                    $q->whereNull('return_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_status)'), $validationStatuses);
                })
                ->where(function ($q) use ($transitLogistics, $transitStatuses) {
                    $q->whereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_logistics_status, ''))"), $transitLogistics)
                      ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $transitStatuses);
                });
        }

        if ($stage === 'platform_review') {
            return $query
                ->tap($applyNotManualOverride)
                ->where(function ($q) use ($closedStatuses, $disputedStatuses) {
                    $q->whereNull('return_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_status)'), array_merge($closedStatuses, $disputedStatuses));
                })
                ->whereNull('tgl_terima_brg')
                ->where(function ($q) use ($arrivedLogistics) {
                    $q->whereNull('return_logistics_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_logistics_status)'), $arrivedLogistics);
                })
                ->where(function ($q) use ($transitLogistics) {
                    $q->whereNull('return_logistics_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_logistics_status)'), $transitLogistics);
                })
                ->whereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $platformReviewStatuses);
        }

        if ($stage === 'awaiting_appeal') {
            return $query
                ->tap($applyNotManualOverride)
                ->where(function ($q) use ($closedStatuses, $disputedStatuses) {
                    $q->whereNull('return_status')
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw('UPPER(return_status)'), array_merge($closedStatuses, $disputedStatuses));
                })
                ->where(function ($q) use ($arrivedLogistics, $validationStatuses, $transitLogistics, $transitStatuses) {
                    // Kecualikan yang jelas-jelas sedang OTW (belum tiba di gudang/logistik)
                    $q->whereNotNull('tgl_terima_brg')
                      ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_logistics_status, ''))"), $arrivedLogistics)
                      ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $validationStatuses)
                      ->orWhere(function ($sub) use ($transitLogistics, $transitStatuses) {
                          $sub->whereNotIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_logistics_status, ''))"), $transitLogistics)
                              ->whereNotIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $transitStatuses);
                      });
                })
                ->where(function ($q) use ($arrivedLogistics, $platformReviewStatuses) {
                    // Status REQUESTED (Peninjauan Tim Marketplace) tidak masuk antrean Segera Ajukan Banding kecuali barang fisik sudah tiba
                    $q->whereNotNull('tgl_terima_brg')
                      ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_logistics_status, ''))"), $arrivedLogistics)
                      ->orWhereNotIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $platformReviewStatuses);
                })
                ->where(function ($q) use ($arrivedLogistics, $validationStatuses) {
                    $q->where('needs_action', true)
                      ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_logistics_status, ''))"), $arrivedLogistics)
                      ->orWhereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), $validationStatuses)
                      ->orWhere(function ($sub) {
                          $sub->whereNotNull('tgl_terima_brg')
                              ->whereIn(\Illuminate\Support\Facades\DB::raw("UPPER(COALESCE(return_status, ''))"), ['PROCESSING', 'REQUESTED']);
                      });
                });
        }

        return $query;
    }

    /**
     * Hitung field lifecycle (logistics status, shipped_at, ETA, needs_action, dispute_action)
     * secara seragam untuk sinkronisasi Shopee maupun TikTok tanpa menghapus keputusan Admin.
     */
    public static function resolveSyncStagePayload(array $params): array
    {
        $statusUpper    = strtoupper(trim((string) ($params['return_status'] ?? '')));
        $logisticsUpper = strtoupper(trim((string) ($params['return_logistics_status'] ?? '')));
        $dueDateEpoch   = $params['due_date_epoch'] ?? null;
        $shippedEpoch   = $params['shipped_epoch'] ?? null;
        $apiEtaEpoch    = $params['api_eta_epoch'] ?? null;
        $courierName    = strtoupper(trim((string) ($params['courier'] ?? '')));
        /** @var self|null $existing */
        $existing       = $params['existing'] ?? null;

        $tz = 'Asia/Jakarta';
        $normalizeEpoch = static function ($raw): ?int {
            if (empty($raw) || ! is_numeric($raw)) {
                return null;
            }
            $val = (int) $raw;
            return $val > 9999999999 ? (int) ($val / 1000) : $val;
        };

        $shippedTs = $normalizeEpoch($shippedEpoch);
        $apiEtaTs  = $normalizeEpoch($apiEtaEpoch);
        $dueTs     = $normalizeEpoch($dueDateEpoch);

        $returnShippedAt = $shippedTs
            ? \Carbon\Carbon::createFromTimestamp($shippedTs, $tz)
            : ($existing?->return_shipped_at);

        $isClosed        = in_array($statusUpper, self::CLOSED_STATUSES, true);
        $isApiDisputed   = in_array($statusUpper, self::API_DISPUTED_STATUSES, true);
        $hasArrivedGudang = ! empty($existing?->tgl_terima_brg);
        $arrivedLogistics = in_array($logisticsUpper, self::ARRIVED_LOGISTICS_STATUSES, true);
        $awaitingVal      = in_array($statusUpper, self::AWAITING_VALIDATION_STATUSES, true);
        $inTransit        = ! $isClosed
            && ! $isApiDisputed
            && ! $hasArrivedGudang
            && ! $arrivedLogistics
            && ! $awaitingVal
            && (in_array($logisticsUpper, self::IN_TRANSIT_LOGISTICS_STATUSES, true)
                || in_array($statusUpper, self::IN_TRANSIT_RETURN_STATUSES, true));

        $estimatedArrivalAt = null;
        $arrivalEtaSource   = null;

        if ($apiEtaTs) {
            $estimatedArrivalAt = \Carbon\Carbon::createFromTimestamp($apiEtaTs, $tz);
            $arrivalEtaSource   = 'api';
        } elseif ($inTransit && $returnShippedAt) {
            $isExpress = str_contains($courierName, 'INSTANT')
                || str_contains($courierName, 'SAMEDAY')
                || str_contains($courierName, 'SAME DAY')
                || str_contains($courierName, 'GOSEND')
                || str_contains($courierName, 'GRAB');
            $estimatedArrivalAt = $returnShippedAt->copy()->addDays($isExpress ? 1 : 3);
            $arrivalEtaSource   = 'estimated_sla';
        } elseif ($existing?->estimated_arrival_at) {
            $estimatedArrivalAt = $existing->estimated_arrival_at;
            $arrivalEtaSource   = $existing->arrival_eta_source;
        }

        $existingAction = strtolower(trim((string) ($existing?->dispute_action ?? '')));
        $existingTglBanding = strtolower(trim((string) ($existing?->tgl_banding ?? '')));

        $disputeAction     = $existing?->dispute_action;
        $disputeActionAt   = $existing?->dispute_action_at;
        $disputeActionBy   = $existing?->dispute_action_by;
        $disputeActionNote = $existing?->dispute_action_note;
        $tglBanding        = $existing?->tgl_banding;

        if ($isClosed) {
            $needsAction = false;
        } elseif ($existingAction === 'no_appeal_needed' || str_contains($existingTglBanding, 'tidak perlu')) {
            $needsAction = false;
            $disputeAction = 'no_appeal_needed';
        } elseif ($existingAction === 'appeal_submitted' || str_contains($existingTglBanding, 'sudah') || $isApiDisputed) {
            $needsAction = false;
            $disputeAction = 'appeal_submitted';
            if ($isApiDisputed && ! $disputeActionAt) {
                $disputeActionAt = now();
                $disputeActionBy = 'Marketplace API';
            }
            if (empty($tglBanding)) {
                $tglBanding = 'Sudah Banding (' . now($tz)->format('d M Y') . ')';
            }
        } elseif ($inTransit) {
            $needsAction = false;
        } elseif (! $hasArrivedGudang && ! $arrivedLogistics && ! $awaitingVal && in_array($statusUpper, self::PLATFORM_REVIEW_STATUSES, true)) {
            $needsAction = false;
        } else {
            $activePendingStatuses = array_merge(
                ['PROCESSING'],
                self::AWAITING_VALIDATION_STATUSES
            );
            $needsAction = in_array($statusUpper, $activePendingStatuses, true)
                || $arrivedLogistics
                || ($dueTs && $dueTs > time());
        }

        return [
            'return_logistics_status' => $logisticsUpper ?: ($existing?->return_logistics_status),
            'return_shipped_at'       => $returnShippedAt,
            'estimated_arrival_at'    => $estimatedArrivalAt,
            'arrival_eta_source'      => $arrivalEtaSource,
            'needs_action'            => $needsAction,
            'dispute_action'          => $disputeAction,
            'dispute_action_at'       => $disputeActionAt,
            'dispute_action_by'       => $disputeActionBy,
            'dispute_action_note'     => $disputeActionNote,
            'tgl_banding'             => $tglBanding,
        ];
    }
}

