<?php

namespace App\Models;

use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Schema\Blueprint;

class ShopeeOrder extends Model
{
    use HasFactory;

    protected $table = 'shopee_orders';

    public const TAB_ALL = 'all';
    public const TAB_UNPAID = 'unpaid';
    public const TAB_TO_SHIP = 'to_ship';
    public const TAB_SHIPPED = 'shipped';
    public const TAB_COMPLETED = 'completed';
    public const TAB_CANCELLED = 'cancelled';

    public const SUBTAB_ALL = 'all';
    public const SUBTAB_UNPROCESSED = 'unprocessed';
    public const SUBTAB_PROCESSED = 'processed';

    /** @var array<string, array<int, string>> */
    public const TAB_STATUS_GROUPS = [
        self::TAB_UNPAID    => ['UNPAID'],
        self::TAB_TO_SHIP   => ['READY_TO_SHIP', 'PROCESSED', 'RETRY_SHIP'],
        self::TAB_SHIPPED   => ['SHIPPED'],
        self::TAB_COMPLETED => ['TO_CONFIRM_RECEIVE', 'COMPLETED'],
        self::TAB_CANCELLED => ['IN_CANCEL', 'CANCELLED', 'TO_RETURN'],
    ];

    /** @var array<string, array<int, string>> */
    public const TAB_ORDER_STATUSES = self::TAB_STATUS_GROUPS;

    protected $fillable = [
        'shopee_account_id',
        'order_sn',
        'package_number',
        'order_status',
        'logistics_status',
        'shipping_carrier',
        'tracking_number',
        'fulfillment_method',
        'buyer_user_id',
        'buyer_username',
        'buyer_note',
        'recipient_data',
        'items_json',
        'package_list_json',
        'payment_method',
        'is_cod',
        'total_amount',
        'estimated_shipping_fee',
        'cancel_by',
        'cancel_reason',
        'buyer_cancel_reason',
        'order_created_at',
        'ship_by_date',
        'shipping_arranged_at',
        'label_document_status',
        'label_printed_at',
        'label_print_count',
        'raw_payload',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'recipient_data'         => 'array',
            'items_json'             => 'array',
            'package_list_json'      => 'array',
            'is_cod'                 => 'boolean',
            'total_amount'           => 'decimal:2',
            'estimated_shipping_fee' => 'decimal:2',
            'order_created_at'       => 'datetime:Y-m-d H:i:s',
            'ship_by_date'           => 'datetime:Y-m-d H:i:s',
            'shipping_arranged_at'   => 'datetime:Y-m-d H:i:s',
            'label_printed_at'       => 'datetime:Y-m-d H:i:s',
            'label_print_count'      => 'integer',
            'last_synced_at'         => 'datetime:Y-m-d H:i:s',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ShopeeAccount::class, 'shopee_account_id');
    }

    public function scopeForTab(Builder $query, string $tab, ?string $subTab = null): Builder
    {
        if ($tab === self::TAB_TO_SHIP) {
            if ($subTab === self::SUBTAB_UNPROCESSED) {
                return $query->whereIn('order_status', ['READY_TO_SHIP', 'RETRY_SHIP']);
            }
            if ($subTab === self::SUBTAB_PROCESSED) {
                return $query->where('order_status', 'PROCESSED');
            }
            return $query->whereIn('order_status', self::TAB_STATUS_GROUPS[self::TAB_TO_SHIP]);
        }

        if (isset(self::TAB_STATUS_GROUPS[$tab])) {
            return $query->whereIn('order_status', self::TAB_STATUS_GROUPS[$tab]);
        }

        return $query;
    }

    public function scopeForMainTab(Builder $query, string $tab, ?string $subTab = null): Builder
    {
        return $this->scopeForTab($query, $tab, $subTab);
    }

    public function scopeForPrintStatus(Builder $query, ?string $printStatus): Builder
    {
        if ($printStatus === 'unprinted') {
            return $query->where('label_print_count', 0);
        }
        if ($printStatus === 'printed') {
            return $query->where('label_print_count', '>', 0);
        }
        return $query;
    }

    public static function statusLabel(string $rawStatus): string
    {
        return match (strtoupper($rawStatus)) {
            'UNPAID'             => 'Belum Bayar',
            'READY_TO_SHIP'      => 'Perlu Dikirim (Belum Diproses)',
            'RETRY_SHIP'         => 'Perlu Atur Ulang Pengiriman',
            'PROCESSED'          => 'Telah Diproses (Siap Cetak Resi)',
            'SHIPPED'            => 'Dikirim',
            'TO_CONFIRM_RECEIVE' => 'Pesanan Tiba',
            'COMPLETED'          => 'Selesai',
            'IN_CANCEL'          => 'Pengajuan Pembatalan',
            'CANCELLED'          => 'Dibatalkan',
            'TO_RETURN'          => 'Pengembalian',
            default              => $rawStatus,
        };
    }

    public static function buildSchemaCallback(): Closure
    {
        return function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('shopee_account_id')->index();
            $table->string('order_sn', 64);
            $table->string('package_number', 64)->nullable()->index();
            $table->string('order_status', 40)->default('READY_TO_SHIP')->index();
            $table->string('logistics_status', 64)->nullable();
            $table->string('shipping_carrier', 120)->nullable()->index();
            $table->string('tracking_number', 100)->nullable()->index();
            $table->string('fulfillment_method', 30)->nullable();
            $table->unsignedBigInteger('buyer_user_id')->nullable();
            $table->string('buyer_username', 120)->nullable()->index();
            $table->text('buyer_note')->nullable();
            $table->text('recipient_data')->nullable();
            $table->longText('items_json')->nullable();
            $table->longText('package_list_json')->nullable();
            $table->string('payment_method', 100)->nullable();
            $table->boolean('is_cod')->default(false);
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->decimal('estimated_shipping_fee', 15, 2)->default(0);
            $table->string('cancel_by', 50)->nullable();
            $table->text('cancel_reason')->nullable();
            $table->text('buyer_cancel_reason')->nullable();
            $table->dateTime('order_created_at')->nullable()->index();
            $table->dateTime('ship_by_date')->nullable()->index();
            $table->dateTime('shipping_arranged_at')->nullable();
            $table->string('label_document_status', 30)->default('NONE');
            $table->dateTime('label_printed_at')->nullable();
            $table->unsignedInteger('label_print_count')->default(0);
            $table->longText('raw_payload')->nullable();
            $table->dateTime('last_synced_at')->nullable()->index();
            $table->timestamps();

            $table->unique(['shopee_account_id', 'order_sn'], 'shopee_orders_account_sn_unique');
        };
    }
}
