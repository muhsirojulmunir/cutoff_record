<?php

namespace App\Services;

use App\Models\CsConversation;
use App\Models\CsMessage;
use App\Models\CutOffOrder;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Models\TiktokAccount;
use App\Models\TiktokOrder;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class CustomerServiceManager
{
    public function __construct(
        private readonly ShopeeChatService $shopeeChatService,
        private readonly TiktokChatService $tiktokChatService,
    ) {}

    /**
     * Pastikan tabel cs_conversations dan cs_messages tersedia di database.
     */
    public function ensureSchema(): void
    {
        try {
            if (! Schema::hasTable('cs_conversations')) {
                Schema::create('cs_conversations', function (Blueprint $table) {
                    $table->id();
                    $table->string('external_conv_id')->unique();
                    $table->string('channel', 20)->default('shopee');
                    $table->string('shop_id')->nullable();
                    $table->string('shop_name')->nullable();
                    $table->string('buyer_id')->nullable();
                    $table->string('buyer_username');
                    $table->string('buyer_name')->nullable();
                    $table->string('buyer_avatar', 500)->nullable();
                    $table->unsignedInteger('unread_count')->default(0);
                    $table->text('last_message')->nullable();
                    $table->timestamp('last_message_time')->nullable();
                    $table->string('last_message_sender', 20)->default('buyer');
                    $table->string('status', 20)->default('unread');
                    $table->string('group', 20)->default('unread');
                    $table->string('order_sn')->nullable();
                    $table->text('notes')->nullable();
                    $table->timestamp('api_synced_at')->nullable();
                    $table->json('extra_data')->nullable();
                    $table->timestamps();

                    $table->index(['channel', 'status']);
                    $table->index('buyer_username');
                    $table->index('order_sn');
                });
            }

            if (! Schema::hasTable('cs_messages')) {
                Schema::create('cs_messages', function (Blueprint $table) {
                    $table->id();
                    $table->foreignId('conversation_id')->constrained('cs_conversations')->cascadeOnDelete();
                    $table->string('external_message_id')->nullable()->index();
                    $table->string('sender', 20)->default('buyer');
                    $table->string('message_type', 30)->default('text');
                    $table->text('text');
                    $table->string('media_url', 500)->nullable();
                    $table->string('status', 20)->default('received');
                    $table->text('error_message')->nullable();
                    $table->timestamp('sent_at')->nullable();
                    $table->timestamps();

                    $table->index(['conversation_id', 'created_at']);
                });
            }

            if (CsConversation::count() === 0 && ! \Illuminate\Support\Facades\Cache::get('cs_demo_cleared')) {
                $this->seedInitialConversations();
            }
        } catch (\Throwable $e) {
            Log::warning('CustomerServiceManager ensureSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Seed initial conversations menggunakan data toko & produk riil agar tidak kosong saat pertama dibuka.
     */
    public function seedInitialConversations(): void
    {
        $shopeeAccount = ShopeeAccount::where('status', 'active')->first() ?: ShopeeAccount::first();
        $tiktokAccount = TiktokAccount::first();

        // Cari contoh pesanan nyata dari database lokal
        $realShopeeOrder = ShopeeOrder::latest('id')->first();
        $realTiktokOrder = TiktokOrder::latest('id')->first();

        $now = now('Asia/Jakarta');

        $shopeeConv = CsConversation::create([
            'external_conv_id'    => 'conv-sh-01',
            'channel'             => 'shopee',
            'shop_id'             => $shopeeAccount?->shop_id ?? '123456789',
            'shop_name'           => $shopeeAccount?->account_name ?? 'Record Shoes Official Shop',
            'buyer_id'            => '10293847',
            'buyer_username'      => $realShopeeOrder?->buyer_username ?? 'fitria.rizal',
            'buyer_name'          => $realShopeeOrder?->recipient_data['name'] ?? 'Fitria Rizal',
            'unread_count'        => 1,
            'last_message'        => 'Kak, untuk ukuran 37 warna putih ini ready stok gak ya?',
            'last_message_time'   => $now->copy()->subMinutes(12),
            'last_message_sender' => 'buyer',
            'status'              => 'unread',
            'group'               => 'unread',
            'order_sn'            => $realShopeeOrder?->order_sn ?? '2611136UB88J62',
            'notes'               => 'Pembeli menanyakan ketersediaan stok size 37.',
            'api_synced_at'       => $now,
        ]);

        CsMessage::insert([
            [
                'conversation_id'     => $shopeeConv->id,
                'external_message_id' => 'msg-sh-1',
                'sender'              => 'buyer',
                'message_type'        => 'text',
                'text'                => 'Halo admin Record Shoes Official',
                'media_url'           => null,
                'status'              => 'read',
                'error_message'       => null,
                'sent_at'             => $now->copy()->subMinutes(18),
                'created_at'          => $now->copy()->subMinutes(18),
                'updated_at'          => $now->copy()->subMinutes(18),
            ],
            [
                'conversation_id'     => $shopeeConv->id,
                'external_message_id' => 'msg-sh-2',
                'sender'              => 'seller',
                'message_type'        => 'text',
                'text'                => 'Halo kak! Selamat datang di Record Shoes Official. Ada yang bisa kami bantu? 😊',
                'media_url'           => null,
                'status'              => 'read',
                'error_message'       => null,
                'sent_at'             => $now->copy()->subMinutes(15),
                'created_at'          => $now->copy()->subMinutes(15),
                'updated_at'          => $now->copy()->subMinutes(15),
            ],
            [
                'conversation_id'     => $shopeeConv->id,
                'external_message_id' => 'msg-sh-3',
                'sender'              => 'buyer',
                'message_type'        => 'text',
                'text'                => 'Kak, untuk ukuran 37 warna putih ini ready stok gak ya?',
                'media_url'           => null,
                'status'              => 'received',
                'error_message'       => null,
                'sent_at'             => $now->copy()->subMinutes(12),
                'created_at'          => $now->copy()->subMinutes(12),
                'updated_at'          => $now->copy()->subMinutes(12),
            ],
        ]);

        $tiktokConv = CsConversation::create([
            'external_conv_id'    => 'conv-tt-02',
            'channel'             => 'tiktok',
            'shop_id'             => $tiktokAccount?->shop_id ?? '7494083438199277309',
            'shop_name'           => $tiktokAccount?->account_name ?? 'Record Shoes Official TikTok',
            'buyer_id'            => '88129035',
            'buyer_username'      => $realTiktokOrder?->buyer_username ?? 'budi_santoso_sub',
            'buyer_name'          => $realTiktokOrder?->recipient_data['name'] ?? 'Budi Santoso',
            'unread_count'        => 1,
            'last_message'        => 'Min, kalau ukuran sepatu kurang pas bisa tukar size kan ya?',
            'last_message_time'   => $now->copy()->subHours(2),
            'last_message_sender' => 'buyer',
            'status'              => 'unread',
            'group'               => 'unread',
            'order_sn'            => $realTiktokOrder?->order_sn ?? '5791823901823904',
            'notes'               => 'Tanya kebijakan garansi tukar size sebelum checkout.',
            'api_synced_at'       => $now,
        ]);

        CsMessage::insert([
            [
                'conversation_id'     => $tiktokConv->id,
                'external_message_id' => 'msg-tt-1',
                'sender'              => 'buyer',
                'message_type'        => 'text',
                'text'                => 'Pagi min mau tanya dulu sebelum checkout',
                'media_url'           => null,
                'status'              => 'received',
                'error_message'       => null,
                'sent_at'             => $now->copy()->subHours(2)->subMinutes(5),
                'created_at'          => $now->copy()->subHours(2)->subMinutes(5),
                'updated_at'          => $now->copy()->subHours(2)->subMinutes(5),
            ],
            [
                'conversation_id'     => $tiktokConv->id,
                'external_message_id' => 'msg-tt-2',
                'sender'              => 'buyer',
                'message_type'        => 'text',
                'text'                => 'Min, kalau ukuran sepatu kurang pas bisa tukar size kan ya?',
                'media_url'           => null,
                'status'              => 'received',
                'error_message'       => null,
                'sent_at'             => $now->copy()->subHours(2),
                'created_at'          => $now->copy()->subHours(2),
                'updated_at'          => $now->copy()->subHours(2),
            ],
        ]);
    }

    /**
     * Parse dan bersihkan isi pesan chat (mendukung format JSON dari API TikTok/Shopee seperti Order Card, Product Card, Image, System Message).
     */
    public static function parseChatMessageContent(string|array $content): array
    {
        if (is_array($content)) {
            if (isset($content['text'])) {
                return [
                    'text'     => (string) $content['text'],
                    'order_sn' => null,
                    'type'     => 'text',
                ];
            }
            $content = json_encode($content);
        }

        $raw = trim((string) $content);
        $orderSn = null;
        $type = 'text';
        $displayText = $raw;

        if (str_starts_with($raw, '{') && str_ends_with($raw, '}')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                if (! empty($decoded['order_id'])) {
                    $orderSn = (string) $decoded['order_id'];
                    $displayText = "📦 Menanyakan Pesanan #{$orderSn}";
                    $type = 'order_card';
                } elseif (! empty($decoded['product_id'])) {
                    $displayText = '👟 Menanyakan Produk';
                    $type = 'product_card';
                } elseif (! empty($decoded['content'])) {
                    $sub = (string) $decoded['content'];
                    if (str_contains($sub, 'Please check this message in TikTok app') || str_contains($sub, '[Other]')) {
                        $displayText = '💬 Pesan Khusus Aplikasi TikTok';
                    } else {
                        $displayText = $sub;
                    }
                    $type = 'system';
                } elseif (! empty($decoded['text'])) {
                    $displayText = (string) $decoded['text'];
                } elseif (! empty($decoded['url'])) {
                    $displayText = '📷 [Lampiran Gambar]';
                    $type = 'image';
                }
            }
        }

        return [
            'text'     => $displayText,
            'order_sn' => $orderSn,
            'type'     => $type,
        ];
    }

    /**
     * Ambil daftar percakapan lengkap untuk response Inertia/JSON.
     */
    public function getConversationsData(array $filters = []): array
    {
        $this->ensureSchema();

        $query = CsConversation::with(['messages'])
            ->orderByDesc('last_message_time')
            ->orderByDesc('id');

        if (! empty($filters['channel']) && $filters['channel'] !== 'all') {
            $query->byChannel($filters['channel']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->byStatus($filters['status']);
        }

        $records = $query->get();

        return $records->map(function (CsConversation $conv) {
            $parsedLast = self::parseChatMessageContent($conv->last_message ?: '');
            $lastMessage = $parsedLast['text'];

            // Isi order_sn otomatis jika sebelumnya belum tersimpan
            if ((empty($conv->order_sn) || $conv->order_sn === '-') && ! empty($parsedLast['order_sn'])) {
                $conv->order_sn = $parsedLast['order_sn'];
                $conv->update(['order_sn' => $parsedLast['order_sn']]);
            }

            // Normalisasi nama buyer jika masih berlabel teknis tt_buyer_
            $buyerName = $conv->buyer_name;
            $buyerUsername = $conv->buyer_username;
            if ($conv->channel === 'tiktok' && ($buyerUsername === 'tt_buyer_' || $buyerName === 'tt_buyer_' || empty($buyerUsername))) {
                $suffix = substr($conv->buyer_id ?: ($conv->order_sn ?: (string) $conv->id), -4);
                if (! empty($conv->order_sn)) {
                    $matchedOrder = TiktokOrder::where('order_sn', $conv->order_sn)->first()
                        ?: CutOffOrder::where('order_number', $conv->order_sn)->first();
                    if ($matchedOrder) {
                        $buyerName = ($matchedOrder instanceof TiktokOrder)
                            ? ($matchedOrder->recipient_data['name'] ?? $matchedOrder->buyer_username ?? ('Pembeli TikTok #' . $suffix))
                            : ($matchedOrder->buyer_name ?? ('Pembeli TikTok #' . $suffix));
                        $buyerUsername = ($matchedOrder instanceof TiktokOrder)
                            ? ($matchedOrder->buyer_username ?: ('tt_buyer_' . $suffix))
                            : ($matchedOrder->buyer_name ?: ('tt_buyer_' . $suffix));
                    } else {
                        $buyerName = 'Pembeli TikTok #' . $suffix;
                        $buyerUsername = 'tt_buyer_' . $suffix;
                    }
                } else {
                    $buyerName = 'Pembeli TikTok #' . $suffix;
                    $buyerUsername = 'tt_buyer_' . $suffix;
                }
            }

            $messages = $conv->messages->map(function (CsMessage $m) {
                $parsed = CustomerServiceManager::parseChatMessageContent($m->text);
                return [
                    'id'        => (string) $m->id,
                    'sender'    => $m->sender,
                    'text'      => $parsed['text'],
                    'timestamp' => $m->sent_at ? $m->sent_at->format('H.i') . ' WIB' : 'Baru saja',
                    'status'    => $m->status,
                ];
            })->values()->all();

            return [
                'id'                => (string) $conv->id,
                'external_conv_id'  => $conv->external_conv_id,
                'channel'           => $conv->channel,
                'channel_label'     => $conv->channel === 'shopee' ? 'Shopee' : 'TikTok Shop',
                'shop_name'         => $conv->shop_name ?: ($conv->channel === 'shopee' ? 'Record Shoes Official Shop' : 'Record Shoes Official TikTok'),
                'buyer_username'    => $buyerUsername,
                'buyer_name'        => $buyerName ?: $buyerUsername,
                'unread_count'      => (int) $conv->unread_count,
                'last_message'      => $lastMessage ?: '',
                'last_message_time' => $conv->last_message_time ? $conv->last_message_time->diffForHumans() : '-',
                'status'            => $conv->status,
                'group'             => $conv->group,
                'is_demo'           => str_starts_with($conv->external_conv_id, 'conv-'),
                'order'             => $conv->resolveOrderContext(),
                'notes'             => $conv->notes ?: '',
                'messages'          => $messages,
            ];
        })->values()->all();
    }

    /**
     * Sinkronkan pesan dan percakapan Shopee via Open Platform API.
     */
    public function syncShopeeChat(?ShopeeAccount $account = null): array
    {
        try {
            $this->ensureSchema();
            $account = $account ?: (ShopeeAccount::where('status', 'active')->first() ?: ShopeeAccount::first());

            if (! $account || empty($account->access_token) || empty($account->partner_id)) {
                return [
                    'success' => false,
                    'synced'  => 0,
                    'message' => 'Akun Shopee belum terhubung ke sistem ERP.',
                ];
            }

            $res = $this->shopeeChatService->getConversationList($account, 'all', 20);

            if (! $res['success']) {
                return [
                    'success' => false,
                    'synced'  => 0,
                    'error'   => $res['error'] ?? 'ERROR',
                    'message' => $res['message'] ?? 'Kendala saat mengakses Shopee Seller Chat API.',
                ];
            }

            $apiConversations = $res['conversations'] ?? [];
            $syncedCount = 0;

            foreach ($apiConversations as $apiConv) {
                $convId = (string) ($apiConv['conversation_id'] ?? '');
                if (empty($convId)) continue;

                $toId = $apiConv['to_id'] ?? null;
                $toName = $apiConv['to_name'] ?? ('buyer_' . $toId);
                $unread = (int) ($apiConv['unread_count'] ?? 0);
                $lastMsgContent = $apiConv['last_message_content']['text'] ?? '';
                $lastMsgTs = ! empty($apiConv['last_message_timestamp']) 
                    ? Carbon::createFromTimestamp($apiConv['last_message_timestamp'], 'Asia/Jakarta') 
                    : now('Asia/Jakarta');

                $conv = CsConversation::updateOrCreate(
                    [
                        'external_conv_id' => 'sh_' . $convId,
                    ],
                    [
                        'channel'             => 'shopee',
                        'shop_id'             => (string) $account->shop_id,
                        'shop_name'           => $account->account_name ?: 'Record Shoes Official Shop',
                        'buyer_id'            => (string) $toId,
                        'buyer_username'      => $toName,
                        'buyer_name'          => $toName,
                        'unread_count'        => $unread,
                        'last_message'        => $lastMsgContent,
                        'last_message_time'   => $lastMsgTs,
                        'last_message_sender' => ($apiConv['latest_message_from_id'] ?? 0) == $toId ? 'buyer' : 'seller',
                        'status'              => $unread > 0 ? 'unread' : 'read',
                        'api_synced_at'       => now(),
                    ]
                );

                // Tarik pesan-pesan di dalamnya
                $msgRes = $this->shopeeChatService->getMessages($account, $convId, 25);
                if ($msgRes['success'] && ! empty($msgRes['messages'])) {
                    foreach ($msgRes['messages'] as $apiMsg) {
                        $msgId = (string) ($apiMsg['message_id'] ?? '');
                        $msgText = $apiMsg['content']['text'] ?? '';
                        $msgSender = ($apiMsg['from_id'] ?? 0) == $toId ? 'buyer' : 'seller';
                        $msgTs = ! empty($apiMsg['created_timestamp'])
                            ? Carbon::createFromTimestamp($apiMsg['created_timestamp'], 'Asia/Jakarta')
                            : now('Asia/Jakarta');

                        CsMessage::updateOrCreate(
                            [
                                'conversation_id'     => $conv->id,
                                'external_message_id' => $msgId ?: ('gen_' . md5($msgText . $msgTs->timestamp)),
                            ],
                            [
                                'sender'       => $msgSender,
                                'message_type' => $apiMsg['message_type'] ?? 'text',
                                'text'         => $msgText,
                                'status'       => 'read',
                                'sent_at'      => $msgTs,
                            ]
                        );
                    }
                }

                $syncedCount++;
            }

            return [
                'success' => true,
                'synced'  => $syncedCount,
                'message' => "Berhasil menyinkronkan {$syncedCount} percakapan Shopee Chat.",
            ];
        } catch (\Throwable $e) {
            Log::error('CustomerServiceManager syncShopeeChat error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);

            return [
                'success' => false,
                'synced'  => 0,
                'message' => 'Shopee Error: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Sinkronkan pesan dan percakapan TikTok Shop via Partner API.
     */
    public function syncTiktokChat(?TiktokAccount $account = null): array
    {
        try {
            $this->ensureSchema();
            $account = $account ?: TiktokAccount::first();

            if (! $account || empty($account->access_token) || empty($account->app_key)) {
                return [
                    'success' => false,
                    'synced'  => 0,
                    'message' => 'Akun TikTok Shop belum terhubung ke sistem ERP.',
                ];
            }

            $res = $this->tiktokChatService->getConversationList($account, 20);

            if (! $res['success']) {
                return [
                    'success' => false,
                    'synced'  => 0,
                    'error'   => $res['error'] ?? 'ERROR',
                    'message' => $res['message'] ?? 'Kendala saat mengakses TikTok Customer Service API.',
                ];
            }

            $apiConversations = $res['conversations'] ?? [];
            $syncedCount = 0;

            foreach ($apiConversations as $apiConv) {
                $convId = (string) ($apiConv['id'] ?? $apiConv['conversation_id'] ?? '');
                if (empty($convId)) continue;

                // Ambil info pembeli dari array participants resmi TikTok
                $participants = $apiConv['participants'] ?? [];
                $buyer = null;
                if (is_array($participants)) {
                    foreach ($participants as $p) {
                        $role = strtoupper((string) ($p['role'] ?? ''));
                        if ($role === 'BUYER' || $role === 'USER') {
                            $buyer = $p;
                            break;
                        }
                    }
                    if (! $buyer) {
                        foreach ($participants as $p) {
                            $role = strtoupper((string) ($p['role'] ?? ''));
                            if (! in_array($role, ['SHOP', 'SELLER', 'AGENT', 'CUSTOMER_SERVICE'], true)) {
                                $buyer = $p;
                                break;
                            }
                        }
                    }
                }
                if (! $buyer) {
                    $buyer = $apiConv['participant'] ?? $apiConv['buyer'] ?? [];
                }

                $buyerUid = (string) ($buyer['im_user_id'] ?? $buyer['user_id'] ?? $buyer['id'] ?? '');
                $buyerAvatar = (string) ($buyer['avatar'] ?? $buyer['avatar_url'] ?? '');
                $buyerNickname = trim((string) ($buyer['nickname'] ?? $buyer['username'] ?? ''));

                $unread = (int) ($apiConv['unread_count'] ?? 0);
                $lastMsg = $apiConv['latest_message'] ?? [];
                $parsedLast = self::parseChatMessageContent($lastMsg['content'] ?? '');
                $lastMsgText = $parsedLast['text'];
                $detectedOrderSn = $parsedLast['order_sn'];

                $lastMsgTs = ! empty($lastMsg['create_time'])
                    ? Carbon::createFromTimestamp($lastMsg['create_time'], 'Asia/Jakarta')
                    : now('Asia/Jakarta');

                // Tarik riwayat pesan di dalamnya lebih dulu agar mendeteksi nomor pesanan jika ada
                $savedMessages = [];
                $msgRes = $this->tiktokChatService->getMessages($account, $convId, 25);
                if ($msgRes['success'] && ! empty($msgRes['messages'])) {
                    foreach ($msgRes['messages'] as $apiMsg) {
                        $msgId = (string) ($apiMsg['id'] ?? $apiMsg['message_id'] ?? '');
                        $parsedMsg = self::parseChatMessageContent($apiMsg['content'] ?? '');
                        if (empty($detectedOrderSn) && ! empty($parsedMsg['order_sn'])) {
                            $detectedOrderSn = $parsedMsg['order_sn'];
                        }
                        $savedMessages[] = [
                            'msg_id'  => $msgId,
                            'sender'  => ($apiMsg['sender_role'] ?? 'BUYER') === 'BUYER' ? 'buyer' : 'seller',
                            'type'    => $parsedMsg['type'] ?: ($apiMsg['type'] ?? 'text'),
                            'text'    => $parsedMsg['text'],
                            'sent_at' => ! empty($apiMsg['create_time'])
                                ? Carbon::createFromTimestamp($apiMsg['create_time'], 'Asia/Jakarta')
                                : now('Asia/Jakarta'),
                        ];
                    }
                }

                // Resolusi nama pembeli dari pesanan lokal jika ada
                $realOrder = null;
                if (! empty($detectedOrderSn)) {
                    $realOrder = TiktokOrder::where('order_sn', $detectedOrderSn)->first()
                        ?: CutOffOrder::where('order_number', $detectedOrderSn)->first();
                }

                $suffix = substr($buyerUid ?: ($detectedOrderSn ?: $convId), -4);
                if (! empty($buyerNickname)) {
                    $buyerName = $buyerNickname;
                    $buyerUsername = $buyerNickname;
                } elseif ($realOrder) {
                    if ($realOrder instanceof TiktokOrder) {
                        $buyerName = $realOrder->recipient_data['name'] ?? $realOrder->buyer_username ?? ('Pembeli TikTok #' . $suffix);
                        $buyerUsername = $realOrder->buyer_username ?: ('tt_buyer_' . $suffix);
                    } else {
                        $buyerName = $realOrder->buyer_name ?? ('Pembeli TikTok #' . $suffix);
                        $buyerUsername = $realOrder->buyer_name ?? ('tt_buyer_' . $suffix);
                    }
                } else {
                    $buyerName = 'Pembeli TikTok #' . $suffix;
                    $buyerUsername = 'tt_buyer_' . $suffix;
                }

                $conv = CsConversation::updateOrCreate(
                    [
                        'external_conv_id' => 'tt_' . $convId,
                    ],
                    [
                        'channel'             => 'tiktok',
                        'shop_id'             => (string) ($account->shop_id ?: ''),
                        'shop_name'           => $account->account_name ?: 'Record Shoes Official TikTok',
                        'buyer_id'            => $buyerUid,
                        'buyer_username'      => $buyerUsername,
                        'buyer_name'          => $buyerName,
                        'buyer_avatar'        => $buyerAvatar ?: null,
                        'unread_count'        => $unread,
                        'last_message'        => $lastMsgText,
                        'last_message_time'   => $lastMsgTs,
                        'last_message_sender' => ($lastMsg['sender_role'] ?? 'BUYER') === 'BUYER' ? 'buyer' : 'seller',
                        'status'              => $unread > 0 ? 'unread' : 'read',
                        'order_sn'            => $detectedOrderSn ?: null,
                        'api_synced_at'       => now(),
                    ]
                );

                // Simpan pesan-pesan yang telah diparse
                foreach ($savedMessages as $sMsg) {
                    CsMessage::updateOrCreate(
                        [
                            'conversation_id'     => $conv->id,
                            'external_message_id' => $sMsg['msg_id'] ?: ('gen_tt_' . md5($sMsg['text'] . $sMsg['sent_at']->timestamp)),
                        ],
                        [
                            'sender'       => $sMsg['sender'],
                            'message_type' => $sMsg['type'],
                            'text'         => (string) $sMsg['text'],
                            'status'       => 'read',
                            'sent_at'      => $sMsg['sent_at'],
                        ]
                    );
                }

                $syncedCount++;
            }

            return [
                'success' => true,
                'synced'  => $syncedCount,
                'message' => "Berhasil menyinkronkan {$syncedCount} percakapan TikTok Shop.",
            ];
        } catch (\Throwable $e) {
            Log::error('CustomerServiceManager syncTiktokChat error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);

            return [
                'success' => false,
                'synced'  => 0,
                'message' => 'TikTok Error: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Kirim pesan seller ke pembeli via Omnichannel API.
     */
    public function sendMessage(int|string $conversationId, string $text, string $sender = 'seller'): array
    {
        $this->ensureSchema();
        $conv = CsConversation::find($conversationId);
        if (! $conv) {
            throw new \RuntimeException('Percakapan tidak ditemukan.');
        }

        $now = now('Asia/Jakarta');

        // Simpan pesan secara instan ke database lokal
        $msg = CsMessage::create([
            'conversation_id'     => $conv->id,
            'external_message_id' => 'local_' . uniqid(),
            'sender'              => $sender,
            'message_type'        => 'text',
            'text'                => trim($text),
            'status'              => 'sent',
            'sent_at'             => $now,
        ]);

        $conv->update([
            'last_message'        => trim($text),
            'last_message_time'   => $now,
            'last_message_sender' => $sender,
            'status'              => 'read',
            'unread_count'        => 0,
        ]);

        $apiDispatched = false;
        $apiError = null;

        // Kirim ke marketplace API yang sesuai
        if ($conv->channel === 'shopee') {
            $shopeeAccount = ShopeeAccount::where('status', 'active')->first() ?: ShopeeAccount::first();
            if ($shopeeAccount && ! empty($shopeeAccount->access_token) && ! empty($conv->buyer_id)) {
                $sendRes = $this->shopeeChatService->sendMessage($shopeeAccount, $conv->buyer_id, $text);
                if ($sendRes['success']) {
                    $apiDispatched = true;
                    if (! empty($sendRes['message_id'])) {
                        $msg->update(['external_message_id' => $sendRes['message_id']]);
                    }
                } else {
                    $apiError = $sendRes['message'] ?? 'API Shopee belum mengizinkan pengiriman pesan.';
                    $msg->update(['error_message' => $apiError]);
                }
            }
        } elseif ($conv->channel === 'tiktok') {
            $tiktokAccount = TiktokAccount::first();
            if ($tiktokAccount && ! empty($tiktokAccount->access_token)) {
                $cleanConvId = str_starts_with($conv->external_conv_id, 'tt_') 
                    ? substr($conv->external_conv_id, 3) 
                    : $conv->external_conv_id;

                $sendRes = $this->tiktokChatService->sendMessage($tiktokAccount, $cleanConvId, $text);
                if ($sendRes['success']) {
                    $apiDispatched = true;
                    if (! empty($sendRes['message_id'])) {
                        $msg->update(['external_message_id' => $sendRes['message_id']]);
                    }
                } else {
                    $apiError = $sendRes['message'] ?? 'API TikTok belum mengizinkan pengiriman pesan.';
                    $msg->update(['error_message' => $apiError]);
                }
            }
        }

        return [
            'success'        => true,
            'message'        => [
                'id'        => (string) $msg->id,
                'sender'    => $msg->sender,
                'text'      => $msg->text,
                'timestamp' => $msg->sent_at->format('H.i') . ' WIB',
                'status'    => $msg->status,
            ],
            'api_dispatched' => $apiDispatched,
            'api_error'      => $apiError,
        ];
    }

    /**
     * Tandai percakapan sebagai terbaca.
     */
    public function markAsRead(int|string $conversationId): bool
    {
        $this->ensureSchema();
        $conv = CsConversation::find($conversationId);
        if (! $conv) return false;

        $conv->update(['unread_count' => 0, 'status' => 'read']);

        if ($conv->channel === 'shopee') {
            $shopeeAccount = ShopeeAccount::where('status', 'active')->first() ?: ShopeeAccount::first();
            if ($shopeeAccount && ! empty($shopeeAccount->access_token)) {
                $cleanConvId = str_starts_with($conv->external_conv_id, 'sh_') 
                    ? substr($conv->external_conv_id, 3) 
                    : $conv->external_conv_id;
                $this->shopeeChatService->readConversation($shopeeAccount, $cleanConvId);
            }
        } elseif ($conv->channel === 'tiktok') {
            $tiktokAccount = TiktokAccount::first();
            if ($tiktokAccount && ! empty($tiktokAccount->access_token)) {
                $cleanConvId = str_starts_with($conv->external_conv_id, 'tt_') 
                    ? substr($conv->external_conv_id, 3) 
                    : $conv->external_conv_id;
                $this->tiktokChatService->readConversation($tiktokAccount, $cleanConvId);
            }
        }

        return true;
    }

    /**
     * Simpan catatan internal CS.
     */
    public function saveNotes(int|string $conversationId, string $notes): bool
    {
        $this->ensureSchema();
        $conv = CsConversation::find($conversationId);
        if (! $conv) return false;

        $conv->update(['notes' => trim($notes)]);
        return true;
    }
}

