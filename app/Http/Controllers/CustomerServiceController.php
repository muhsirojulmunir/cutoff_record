<?php

namespace App\Http\Controllers;

use App\Models\CutOffOrder;
use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Models\TiktokAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class CustomerServiceController extends Controller
{
    /**
     * Tampilkan halaman utama Omnichannel Customer Service (Shopee + TikTok Shop).
     */
    public function index(Request $request): InertiaResponse
    {
        $shopeeAccount = ShopeeAccount::where('status', 'active')->first();
        $tiktokAccount = TiktokAccount::first();

        // Ambil contoh pesanan riil dari database lokal jika ada untuk melengkapi konteks pembeli
        $realShopeeOrder = ShopeeOrder::latest('id')->first();
        $realCutOffOrder = CutOffOrder::latest('id')->first();

        $shopeeOrderSn = $realShopeeOrder?->order_sn ?? '2611136UB88J62';
        $shopeeProdName = $realShopeeOrder?->items_json[0]['item_name'] ?? 'RECORD IONIQ SEPATU SNEAKER SEKOLAH ANAK TK SD SMP UNISEX BLACK HITAM PUTIH PEREKAT 30-37';
        $shopeeVariation = $realShopeeOrder?->items_json[0]['model_name'] ?? 'CONFERO-TUCSON P/H,37 (23CM)';
        $shopeeSku = $realShopeeOrder?->items_json[0]['model_sku'] ?? 'RECORD-TUCSON-PH-37_01240237';
        $shopeeTotal = (float) ($realShopeeOrder?->total_amount ?? 159299);
        $shopeeCarrier = $realShopeeOrder?->shipping_carrier ?? 'SPX Standard';
        $shopeeTracking = $realShopeeOrder?->tracking_number ?? null;

        $conversations = [
            [
                'id'                 => 'conv-sh-01',
                'channel'            => 'shopee',
                'channel_label'      => 'Shopee',
                'shop_name'          => $shopeeAccount?->account_name ?? 'Record Shoes Official Shop',
                'buyer_username'     => 'risaluthfia',
                'buyer_name'         => 'Risa Luthfia',
                'unread_count'       => 1,
                'last_message'       => 'Kak, untuk ukuran 37 warna putih ini ready stok gak ya?',
                'last_message_time'  => '10:18 WIB',
                'status'             => 'unread',
                'order'              => [
                    'order_sn'        => $shopeeOrderSn,
                    'product_name'    => $shopeeProdName,
                    'variation'       => $shopeeVariation,
                    'sku'             => $shopeeSku,
                    'price'           => $shopeeTotal,
                    'status'          => 'Perlu Dikirim',
                    'status_detail'   => 'Menunggu Pengemasan Gudang',
                    'carrier'         => $shopeeCarrier,
                    'tracking_number' => $shopeeTracking,
                ],
                'notes'              => 'Pembeli minta double box pelindung.',
                'messages'           => [
                    [
                        'id'        => 'msg-1',
                        'sender'    => 'buyer',
                        'text'      => 'Halo admin record shoes official',
                        'timestamp' => '10:15 WIB',
                        'status'    => 'read',
                    ],
                    [
                        'id'        => 'msg-2',
                        'sender'    => 'seller',
                        'text'      => 'Halo kak Risa! Selamat datang di Record Shoes Official. Ada yang bisa kami bantu kak? 😊',
                        'timestamp' => '10:16 WIB',
                        'status'    => 'read',
                    ],
                    [
                        'id'        => 'msg-3',
                        'sender'    => 'buyer',
                        'text'      => 'Kak, untuk ukuran 37 warna putih ini ready stok gak ya?',
                        'timestamp' => '10:18 WIB',
                        'status'    => 'received',
                    ],
                ],
            ],
            [
                'id'                 => 'conv-tt-01',
                'channel'            => 'tiktok',
                'channel_label'      => 'TikTok Shop',
                'shop_name'          => $tiktokAccount?->shop_name ?? 'Record Shoes Official TikTok',
                'buyer_username'     => 'dewi_kartika99',
                'buyer_name'         => 'Dewi Kartika',
                'unread_count'       => 0,
                'last_message'       => 'Baik min, sudah saya checkout ya. Mohon segera diproses.',
                'last_message_time'  => '09:42 WIB',
                'status'             => 'read',
                'order'              => [
                    'order_sn'        => '5798234719082341',
                    'product_name'    => 'RECORD KYLIE SEPATU SNEAKERS SEKOLAH ANAK SMP SMA CEWE BLACK HITAM/PUTIH 12 TH KEATAS TALI 33-40',
                    'variation'       => 'Putih, 38 (24cm)',
                    'sku'             => 'RECORD-KYLIE-P-38_01224638',
                    'price'           => 141599,
                    'status'          => 'Dikirim',
                    'status_detail'   => 'Paket Diserahkan ke Kurir',
                    'carrier'         => 'J&T Express',
                    'tracking_number' => 'JT9928172901',
                ],
                'notes'              => 'Pengiriman reguler J&T, prioritas kirim hari ini.',
                'messages'           => [
                    [
                        'id'        => 'msg-4',
                        'sender'    => 'buyer',
                        'text'      => 'Min kalau order sekarang dikirim hari apa ya?',
                        'timestamp' => '09:30 WIB',
                        'status'    => 'read',
                    ],
                    [
                        'id'        => 'msg-5',
                        'sender'    => 'seller',
                        'text'      => 'Halo kak Dewi! Pesanan yang masuk sebelum jam 15.00 WIB langsung kami kirim hari ini ya kak ✨',
                        'timestamp' => '09:35 WIB',
                        'status'    => 'read',
                    ],
                    [
                        'id'        => 'msg-6',
                        'sender'    => 'buyer',
                        'text'      => 'Baik min, sudah saya checkout ya. Mohon segera diproses.',
                        'timestamp' => '09:42 WIB',
                        'status'    => 'read',
                    ],
                ],
            ],
            [
                'id'                 => 'conv-sh-02',
                'channel'            => 'shopee',
                'channel_label'      => 'Shopee',
                'shop_name'          => $shopeeAccount?->account_name ?? 'Record Shoes Official Shop',
                'buyer_username'     => 'newblackelucidator',
                'buyer_name'         => 'Ahmad Pratama',
                'unread_count'       => 0,
                'last_message'       => 'Terima kasih min infonya, paket sudah sampai tadi siang 👍',
                'last_message_time'  => 'Kemarin',
                'status'             => 'resolved',
                'order'              => [
                    'order_sn'        => '26111259X07YEX',
                    'product_name'    => 'RECORD KYLIE SEPATU SNEAKERS SEKOLAH ANAK SMP SMA CEWE BLACK HITAM/PUTIH',
                    'variation'       => 'Putih, 34 (22 cm)',
                    'sku'             => 'RECORD-KYLIE-P-34',
                    'price'           => 154199,
                    'status'          => 'Selesai',
                    'status_detail'   => 'Pesanan Diterima Pembeli',
                    'carrier'         => 'SPX Instant',
                    'tracking_number' => 'SPXID0299281',
                ],
                'notes'              => 'Pengiriman kurir instan berhasil.',
                'messages'           => [
                    [
                        'id'        => 'msg-7',
                        'sender'    => 'buyer',
                        'text'      => 'Min kurir instan nya estimasi jam berapa ya sampai ke alamat?',
                        'timestamp' => 'Kemarin 14:10',
                        'status'    => 'read',
                    ],
                    [
                        'id'        => 'msg-8',
                        'sender'    => 'seller',
                        'text'      => 'Halo kak Ahmad, kurir SPX Instant sudah pickup dari gudang dan sedang meluncur ke alamat tujuan ya kak.',
                        'timestamp' => 'Kemarin 14:15',
                        'status'    => 'read',
                    ],
                    [
                        'id'        => 'msg-9',
                        'sender'    => 'buyer',
                        'text'      => 'Terima kasih min infonya, paket sudah sampai tadi siang 👍',
                        'timestamp' => 'Kemarin 15:02',
                        'status'    => 'read',
                    ],
                ],
            ],
            [
                'id'                 => 'conv-tt-02',
                'channel'            => 'tiktok',
                'channel_label'      => 'TikTok Shop',
                'shop_name'          => $tiktokAccount?->shop_name ?? 'Record Shoes Official TikTok',
                'buyer_username'     => 'budi_santoso_sub',
                'buyer_name'         => 'Budi Santoso',
                'unread_count'       => 2,
                'last_message'       => 'Min, kalau ukuran sepatu kurang pas bisa tukar size kan ya?',
                'last_message_time'  => '08:15 WIB',
                'status'             => 'unread',
                'order'              => [
                    'order_sn'        => '5791823901823904',
                    'product_name'    => 'RECORD CONFERO TUCSON SNEAKER SEKOLAH PRIA WANITA',
                    'variation'       => 'Hitam Putih, 40 (25.5cm)',
                    'sku'             => 'RECORD-TUCSON-HP-40',
                    'price'           => 169000,
                    'status'          => 'Perlu Dikirim',
                    'status_detail'   => 'Siap Diproses',
                    'carrier'         => 'Ninja Xpress',
                    'tracking_number' => null,
                ],
                'notes'              => 'Tanya garansi retur tukar size.',
                'messages'           => [
                    [
                        'id'        => 'msg-10',
                        'sender'    => 'buyer',
                        'text'      => 'Pagi min mau tanya dulu sebelum checkout',
                        'timestamp' => '08:14 WIB',
                        'status'    => 'received',
                    ],
                    [
                        'id'        => 'msg-11',
                        'sender'    => 'buyer',
                        'text'      => 'Min, kalau ukuran sepatu kurang pas bisa tukar size kan ya?',
                        'timestamp' => '08:15 WIB',
                        'status'    => 'received',
                    ],
                ],
            ],
        ];

        $quickReplies = [
            [
                'id'       => 1,
                'title'    => 'Stok Ready Siap Kirim',
                'category' => 'Produk & Stok',
                'text'     => 'Halo kak! Untuk variasi dan ukuran ini ready stok siap dikirim dari gudang kami kak. Silakan langsung di-checkout sebelum kehabisan ya 🙏✨',
            ],
            [
                'id'       => 2,
                'title'    => 'Jadwal Kirim Hari Ini',
                'category' => 'Pengiriman',
                'text'     => 'Pesanan yang masuk sebelum jam 15:00 WIB akan dikemas dan diserahkan ke pihak ekspedisi pada hari yang sama. Estimasi sampai menyesuaikan dengan kurir yang dipilih ya kak.',
            ],
            [
                'id'       => 3,
                'title'    => 'Panduan Size Chart Sepatu',
                'category' => 'Ukuran',
                'text'     => 'Panduan Ukuran Sepatu Record Shoes: Size 36 (22.5 cm), Size 37 (23 cm), Size 38 (24 cm), Size 39 (24.5 cm), Size 40 (25.5 cm). Disarankan mengukur panjang telapak kaki dari ujung tumit hingga jempol ya kak.',
            ],
            [
                'id'       => 4,
                'title'    => 'Garansi Tukar Ukuran',
                'category' => 'Retur & Komplain',
                'text'     => 'Bisa tukar ukuran kak jika kebesaran atau kekecilan! Syaratnya label tag masih utuh, kotak sepatu lengkap, dan sepatu belum dipakai di luar ruangan. Silakan infokan nomor pesanan untuk dibantu prosesnya ya.',
            ],
            [
                'id'       => 5,
                'title'    => 'Pesanan Sedang Dipacking',
                'category' => 'Status Pesanan',
                'text'     => 'Pesanan kakak sudah kami terima dan saat ini sedang dalam proses quality control serta packing rapi oleh tim gudang kami. Resi pengiriman akan update otomatis setelah paket di-scan pihak ekspedisi.',
            ],
        ];

        return Inertia::render('CustomerService/Index', [
            'initialConversations' => $conversations,
            'quickReplies'         => $quickReplies,
            'channels'             => [
                'shopee' => [
                    'name'      => 'Shopee',
                    'shop_name' => $shopeeAccount?->account_name ?? 'Record Shoes Official Shop',
                    'status'    => $shopeeAccount ? 'Terhubung' : 'Terhubung (API V2)',
                    'color'     => '#EE4D2D',
                ],
                'tiktok' => [
                    'name'      => 'TikTok Shop',
                    'shop_name' => $tiktokAccount?->shop_name ?? 'Record Shoes Official TikTok',
                    'status'    => 'Siap Integrasi (Pengajuan CS)',
                    'color'     => '#000000',
                ],
            ],
        ]);
    }
}

