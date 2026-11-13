<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Models\TiktokAccount;
use App\Services\CustomerServiceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class CustomerServiceController extends Controller
{
    public function __construct(
        private readonly CustomerServiceManager $csManager,
        private readonly \App\Services\ShopeeChatService $shopeeChatService,
        private readonly \App\Services\TiktokChatService $tiktokChatService,
    ) {}

    /**
     * Diagnostik live koneksi API Shopee Seller Chat dan TikTok Partner CS.
     */
    public function diagnose(): JsonResponse
    {
        $shopeeAccount = ShopeeAccount::where('status', 'active')->first() ?: ShopeeAccount::first();
        $tiktokAccount = TiktokAccount::first();

        $shopeeDiag = null;
        if ($shopeeAccount && ! empty($shopeeAccount->access_token)) {
            $shopeeDiag = $this->shopeeChatService->getConversationList($shopeeAccount, 'all', 5);
        }

        $tiktokDiag = null;
        if ($tiktokAccount && ! empty($tiktokAccount->access_token)) {
            $tiktokDiag = $this->tiktokChatService->getConversationList($tiktokAccount, 5);
        }

        return response()->json([
            'shopee' => [
                'account_name' => $shopeeAccount?->account_name ?? 'Belum ada akun Shopee',
                'shop_id'      => $shopeeAccount?->shop_id ?? '-',
                'has_token'    => ! empty($shopeeAccount?->access_token),
                'success'      => $shopeeDiag['success'] ?? false,
                'message'      => $shopeeDiag['message'] ?? ($shopeeAccount ? 'Token tersedia tapi belum dipanggil' : 'Akun Shopee belum terhubung.'),
                'error'        => $shopeeDiag['error'] ?? null,
            ],
            'tiktok' => [
                'account_name' => $tiktokAccount?->account_name ?? 'Belum ada akun TikTok',
                'shop_id'      => $tiktokAccount?->shop_id ?? '-',
                'has_token'    => ! empty($tiktokAccount?->access_token),
                'success'      => $tiktokDiag['success'] ?? false,
                'message'      => $tiktokDiag['message'] ?? ($tiktokAccount ? 'Token tersedia tapi belum dipanggil' : 'Akun TikTok belum terhubung.'),
                'error'        => $tiktokDiag['error'] ?? null,
            ],
            'timestamp' => now('Asia/Jakarta')->format('d M Y H:i:s') . ' WIB',
        ]);
    }

    /**
     * Tampilkan halaman utama Omnichannel Customer Service (Shopee + TikTok Shop).
     */
    public function index(Request $request): InertiaResponse
    {
        $this->csManager->ensureSchema();

        $shopeeAccount = ShopeeAccount::where('status', 'active')->first() ?: ShopeeAccount::first();
        $tiktokAccount = TiktokAccount::first();

        $conversations = $this->csManager->getConversationsData();

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

        $isShopeeConnected = $shopeeAccount && ! empty($shopeeAccount->access_token);
        $isTiktokConnected = $tiktokAccount && ! empty($tiktokAccount->access_token);

        return Inertia::render('CustomerService/Index', [
            'initialConversations' => $conversations,
            'quickReplies'         => $quickReplies,
            'channels'             => [
                'shopee' => [
                    'name'      => 'Shopee',
                    'shop_name' => $shopeeAccount?->account_name ?? 'Record Shoes Official Shop',
                    'status'    => $isShopeeConnected ? 'Terhubung (Shopee Seller Chat)' : 'Belum Terhubung',
                    'connected' => $isShopeeConnected,
                    'color'     => '#EE4D2D',
                ],
                'tiktok' => [
                    'name'      => 'TikTok Shop',
                    'shop_name' => $tiktokAccount?->account_name ?? 'Record Shoes Official TikTok',
                    'status'    => $isTiktokConnected ? 'Terhubung (TikTok Partner CS)' : 'Belum Terhubung',
                    'connected' => $isTiktokConnected,
                    'color'     => '#000000',
                ],
            ],
        ]);
    }

    /**
     * Polling real-time endpoint untuk update obrolan dan pesan baru.
     */
    public function poll(Request $request): JsonResponse
    {
        $channel = $request->query('channel');
        $conversations = $this->csManager->getConversationsData($channel ? ['channel' => $channel] : []);

        return response()->json([
            'status'        => 'success',
            'conversations' => $conversations,
            'polled_at'     => now('Asia/Jakarta')->format('H.i.s') . ' WIB',
        ]);
    }

    /**
     * Trigger sinkronisasi chat manual dari Shopee & TikTok API.
     */
    public function sync(Request $request): RedirectResponse
    {
        $channel = $request->input('channel', 'all');

        $shopeeRes = null;
        $tiktokRes = null;

        try {
            if ($channel === 'all' || $channel === 'shopee') {
                $shopeeRes = $this->csManager->syncShopeeChat();
            }
        } catch (\Throwable $e) {
            $shopeeRes = ['success' => false, 'message' => $e->getMessage()];
        }

        try {
            if ($channel === 'all' || $channel === 'tiktok') {
                $tiktokRes = $this->csManager->syncTiktokChat();
            }
        } catch (\Throwable $e) {
            $tiktokRes = ['success' => false, 'message' => $e->getMessage()];
        }

        $messages = [];
        if ($shopeeRes) {
            $status = ($shopeeRes['success'] ?? false) ? 'Berhasil' : 'Kendala';
            $messages[] = "Shopee [{$status}]: " . ($shopeeRes['message'] ?? 'OK');
        }
        if ($tiktokRes) {
            $status = ($tiktokRes['success'] ?? false) ? 'Berhasil' : 'Kendala';
            $messages[] = "TikTok [{$status}]: " . ($tiktokRes['message'] ?? 'OK');
        }

        $msg = implode(' | ', $messages);
        $hasError = ($shopeeRes && ! ($shopeeRes['success'] ?? false)) || ($tiktokRes && ! ($tiktokRes['success'] ?? false));

        return back()->with($hasError ? 'warning' : 'success', $msg);
    }

    /**
     * Bersihkan data chat simulasi / demo awal.
     */
    public function clearDemo(): RedirectResponse
    {
        \App\Models\CsConversation::where('external_conv_id', 'like', 'conv-%')->delete();
        \Illuminate\Support\Facades\Cache::forever('cs_demo_cleared', true);

        return back()->with('success', 'Data chat simulasi telah dibersihkan. Kotak masuk kini bersih dan siap menerima chat riil dari API.');
    }

    /**
     * Kirim pesan baru ke percakapan pembeli.
     */
    public function sendMessage(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'conversation_id' => ['required'],
            'text'            => ['required', 'string', 'max:2000'],
        ]);

        try {
            $result = $this->csManager->sendMessage($validated['conversation_id'], $validated['text']);
            return response()->json($result);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal mengirim pesan: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Tandai percakapan sebagai terbaca.
     */
    public function markAsRead(Request $request, int|string $id): JsonResponse
    {
        $ok = $this->csManager->markAsRead($id);
        return response()->json(['success' => $ok]);
    }

    /**
     * Simpan catatan internal CS untuk percakapan ini.
     */
    public function saveNotes(Request $request, int|string $id): JsonResponse
    {
        $notes = (string) $request->input('notes', '');
        $ok = $this->csManager->saveNotes($id, $notes);

        return response()->json([
            'success' => $ok,
            'message' => 'Catatan internal berhasil disimpan.',
        ]);
    }
}
