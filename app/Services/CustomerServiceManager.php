<?php

namespace App\Services;

use App\Models\CsConversation;
use App\Models\CsMessage;
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
            $messages = $conv->messages->map(function (CsMessage $m) {
                return [
                    'id'        => (string) $m->id,
                    'sender'    => $m->sender,
                    'text'      => $m->text,
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
                'buyer_username'    => $conv->buyer_username,
                'buyer_name'        => $conv->buyer_name ?: $conv->buyer_username,
                'unread_count'      => (int) $conv->unread_count,
                'last_message'      => $conv->last_message ?: '',
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

                $buyer = $apiConv['participant'] ?? $apiConv['buyer'] ?? [];
                $buyerUid = (string) ($buyer['id'] ?? $buyer['user_id'] ?? '');
                $buyerUsername = $buyer['nickname'] ?? $buyer['username'] ?? ('tt_buyer_' . substr($buyerUid, -4));
                $unread = (int) ($apiConv['unread_count'] ?? 0);
                $lastMsg = $apiConv['latest_message'] ?? [];
                $lastMsgText = $lastMsg['content'] ?? '';
                if (is_array($lastMsgText)) {
                    $lastMsgText = $lastMsgText['text'] ?? '';
                }
                $lastMsgTs = ! empty($lastMsg['create_time'])
                    ? Carbon::createFromTimestamp($lastMsg['create_time'], 'Asia/Jakarta')
                    : now('Asia/Jakarta');

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
                        'buyer_name'          => $buyerUsername,
                        'unread_count'        => $unread,
                        'last_message'        => $lastMsgText,
                        'last_message_time'   => $lastMsgTs,
                        'last_message_sender' => ($lastMsg['sender_role'] ?? 'BUYER') === 'BUYER' ? 'buyer' : 'seller',
                        'status'              => $unread > 0 ? 'unread' : 'read',
                        'api_synced_at'       => now(),
                    ]
                );

                // Tarik pesan-pesan di dalamnya
                $msgRes = $this->tiktokChatService->getMessages($account, $convId, 25);
                if ($msgRes['success'] && ! empty($msgRes['messages'])) {
                    foreach ($msgRes['messages'] as $apiMsg) {
                        $msgId = (string) ($apiMsg['id'] ?? $apiMsg['message_id'] ?? '');
                        $msgText = $apiMsg['content'] ?? '';
                        if (is_array($msgText)) {
                            $msgText = $msgText['text'] ?? '';
                        }
                        $msgSender = ($apiMsg['sender_role'] ?? 'BUYER') === 'BUYER' ? 'buyer' : 'seller';
                        $msgTs = ! empty($apiMsg['create_time'])
                            ? Carbon::createFromTimestamp($apiMsg['create_time'], 'Asia/Jakarta')
                            : now('Asia/Jakarta');

                        CsMessage::updateOrCreate(
                            [
                                'conversation_id'     => $conv->id,
                                'external_message_id' => $msgId ?: ('gen_tt_' . md5($msgText . $msgTs->timestamp)),
                            ],
                            [
                                'sender'       => $msgSender,
                                'message_type' => $apiMsg['type'] ?? 'text',
                                'text'         => (string) $msgText,
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

