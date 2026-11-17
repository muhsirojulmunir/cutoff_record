<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

class CsConversation extends Model
{
    use HasFactory;

    protected $table = 'cs_conversations';

    protected $fillable = [
        'external_conv_id',
        'channel',
        'shop_id',
        'shop_name',
        'buyer_id',
        'buyer_username',
        'buyer_name',
        'buyer_avatar',
        'unread_count',
        'last_message',
        'last_message_time',
        'last_message_sender',
        'status',
        'group',
        'order_sn',
        'notes',
        'api_synced_at',
        'extra_data',
    ];

    protected $casts = [
        'unread_count'      => 'integer',
        'last_message_time' => 'datetime',
        'api_synced_at'     => 'datetime',
        'extra_data'        => 'array',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(CsMessage::class, 'conversation_id')
            ->orderBy('sent_at', 'asc')
            ->orderBy('id', 'asc');
    }

    public function scopeByChannel(Builder $query, ?string $channel): Builder
    {
        if (! empty($channel) && in_array($channel, ['shopee', 'tiktok'], true)) {
            return $query->where('channel', $channel);
        }
        return $query;
    }

    public function scopeByStatus(Builder $query, ?string $status): Builder
    {
        if (! empty($status) && in_array($status, ['unread', 'read', 'resolved'], true)) {
            return $query->where('status', $status);
        }
        return $query;
    }

    /**
     * Cari pesanan terkait pembeli dari database lokal (shopee_orders, tiktok_orders, cut_off_orders).
     */
    public function resolveOrderContext(): array
    {
        if (! empty($this->order_sn)) {
            if ($this->channel === 'shopee') {
                $order = ShopeeOrder::where('order_sn', $this->order_sn)->first();
                if ($order) {
                    $item = $order->items_json[0] ?? [];
                    $imageUrl = $item['image_url'] ?? $item['item_image'] ?? null;
                    if (! $imageUrl && ! empty($item['item_id'])) {
                        $shopeeProd = ShopeeProduct::where('item_id', $item['item_id'])->first();
                        $imageUrl = $shopeeProd?->raw_data['image']['image_url_list'][0] ?? null;
                    }
                    if (! $imageUrl && ! empty($item['model_sku'])) {
                        $localProd = Product::where('sku', $item['model_sku'])->first();
                        $imageUrl = $localProd?->photo_url;
                    }

                    return [
                        'order_sn'        => $order->order_sn,
                        'product_name'    => $item['item_name'] ?? 'Produk Shopee',
                        'variation'       => $item['model_name'] ?? '',
                        'sku'             => $item['model_sku'] ?? '',
                        'price'           => (float) $order->total_amount,
                        'status'          => $order->order_status_label,
                        'status_detail'   => $order->logistics_status_label ?? 'Pesanan Shopee',
                        'carrier'         => $order->shipping_carrier ?? 'SPX Standard',
                        'tracking_number' => $order->tracking_number,
                        'image_url'       => $imageUrl,
                    ];
                }
            } elseif ($this->channel === 'tiktok') {
                $order = TiktokOrder::where('order_sn', $this->order_sn)->first();

                // Jika belum ada di tabel lokal, coba ambil langsung dari TikTok API
                if (! $order && ! empty($this->order_sn) && $this->order_sn !== '-') {
                    try {
                        $account = TiktokAccount::first();
                        if ($account && ! empty($account->access_token)) {
                            $order = app(\App\Services\TiktokSyncService::class)->fetchSingleOrder($account, $this->order_sn);
                        }
                    } catch (\Throwable $e) {
                        \Illuminate\Support\Facades\Log::warning('CsConversation resolveOrderContext fetchSingleOrder error: ' . $e->getMessage());
                    }
                }

                if ($order) {
                    $item = $order->items_json[0] ?? [];
                    $imageUrl = $item['image_url'] ?? $item['sku_image'] ?? $item['product_image'] ?? $item['sku_image_url'] ?? null;

                    if (! $imageUrl && ! empty($order->raw_payload)) {
                        $raw = is_array($order->raw_payload) ? $order->raw_payload : json_decode((string) $order->raw_payload, true);
                        if (is_array($raw)) {
                            $rawLi = $raw['line_items'][0] ?? [];
                            $imageUrl = $rawLi['sku_image'] ?? $rawLi['product_image'] ?? $rawLi['sku_image_url'] ?? null;
                        }
                    }

                    if (! $imageUrl && ! empty($item['item_id'])) {
                        $ttProd = TiktokProduct::where('item_id', $item['item_id'])->first();
                        $imageUrl = $ttProd?->raw_data['main_images'][0]['url_list'][0]
                            ?? $ttProd?->raw_data['main_images'][0]['urls'][0]
                            ?? $ttProd?->raw_data['sku_image']
                            ?? null;
                    }

                    if (! $imageUrl && ! empty($item['model_sku'])) {
                        $localProd = Product::where('sku', $item['model_sku'])->first();
                        $imageUrl = $localProd?->photo_url;
                    }

                    return [
                        'order_sn'        => $order->order_sn,
                        'product_name'    => $item['item_name'] ?? 'Produk TikTok Shop',
                        'variation'       => $item['model_name'] ?? '',
                        'sku'             => $item['model_sku'] ?? '',
                        'price'           => (float) $order->total_amount,
                        'status'          => $order->order_status_label,
                        'status_detail'   => $order->logistics_status_label ?? 'Pesanan TikTok Shop',
                        'carrier'         => $order->shipping_carrier ?? 'J&T Express',
                        'tracking_number' => $order->tracking_number,
                        'image_url'       => $imageUrl,
                    ];
                }
            }

            // Fallback ke CutOffOrder
            $cutoff = CutOffOrder::where('order_number', $this->order_sn)->first();
            if ($cutoff) {
                $imageUrl = null;
                if (! empty($cutoff->sku_utama)) {
                    $localProd = Product::where('sku', $cutoff->sku_utama)->first();
                    $imageUrl = $localProd?->photo_url;
                }

                return [
                    'order_sn'        => $cutoff->order_number,
                    'product_name'    => $cutoff->product_name ?? 'Produk Toko',
                    'variation'       => $cutoff->variation_name ?? '',
                    'sku'             => $cutoff->sku_utama ?? '',
                    'price'           => (float) ($cutoff->marketplace_net_payout ?? 0),
                    'status'          => $cutoff->order_status ?? 'Diproses',
                    'status_detail'   => 'Pesanan Cut Off (' . $cutoff->channel . ')',
                    'carrier'         => $cutoff->shipping_courier ?? 'Reguler',
                    'tracking_number' => $cutoff->tracking_number,
                    'image_url'       => $imageUrl,
                ];
            }

            // Jika order_sn terdeteksi tapi belum tersinkron ke tabel lokal
            return [
                'order_sn'        => $this->order_sn,
                'product_name'    => 'Pesanan ' . ($this->channel === 'tiktok' ? 'TikTok Shop' : 'Shopee') . ' #' . $this->order_sn,
                'variation'       => 'Inquiry Pesanan Pembeli',
                'sku'             => '-',
                'price'           => 0,
                'status'          => 'Inquiry Pesanan',
                'status_detail'   => 'Pembeli Menanyakan Pesanan Ini',
                'carrier'         => $this->channel === 'tiktok' ? 'TikTok Shipping' : 'Shopee Express',
                'tracking_number' => null,
                'image_url'       => null,
            ];
        }

        // Jika order_sn kosong, coba cari dari order terbaru dengan nama pembeli yang sama
        if ($this->channel === 'shopee') {
            $matched = ShopeeOrder::where('buyer_username', $this->buyer_username)
                ->orWhere('recipient_data->name', 'like', '%' . $this->buyer_name . '%')
                ->latest('id')
                ->first();
            if ($matched) {
                $this->update(['order_sn' => $matched->order_sn]);
                return $this->resolveOrderContext();
            }
        } elseif ($this->channel === 'tiktok') {
            $matched = TiktokOrder::where('buyer_username', $this->buyer_username)
                ->orWhere('recipient_data->name', 'like', '%' . $this->buyer_name . '%')
                ->latest('id')
                ->first();
            if ($matched) {
                $this->update(['order_sn' => $matched->order_sn]);
                return $this->resolveOrderContext();
            }
        }

        return [
            'order_sn'        => $this->order_sn ?: '-',
            'product_name'    => 'Belum ada pesanan aktif terkait',
            'variation'       => '-',
            'sku'             => '-',
            'price'           => 0,
            'status'          => 'Inquiry Chat',
            'status_detail'   => 'Calon Pembeli / Tanya Produk',
            'carrier'         => '-',
            'tracking_number' => null,
            'image_url'       => null,
        ];
    }
}

