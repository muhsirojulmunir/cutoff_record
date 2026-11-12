<?php

namespace App\Http\Controllers;

use App\Models\CutOffOrder;
use App\Models\ShopeeAccount;
use App\Services\ShopeeSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class CutOffOrderController extends Controller
{
    /**
     * Tampilkan data tabel Cut Off Orders dengan filter dan metrik.
     */
    public function index(Request $request): Response
    {
        $filters = $request->only([
            'search',
            'channel',
            'info_gudang',
            'order_status',
            'dpp_status',
            'shipping_courier',
            'shipping_tier',
            'date_from',
            'date_to',
            'per_page',
        ]);

        $perPage = (int) ($filters['per_page'] ?? 25);
        if (!in_array($perPage, [15, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $orders = CutOffOrder::query()
            ->onlyProcessed()
            ->filter($filters)
            ->orderBy('order_date', 'desc')
            ->orderBy('id', 'desc')
            ->paginate($perPage)
            ->withQueryString();

        // Metrik Ringkasan Utama (1 query agregasi efisien di DB, khusus pesanan Diproses ke atas)
        $todayWib = \Carbon\Carbon::now('Asia/Jakarta');
        $todayStart = $todayWib->toDateString();
        $tomorrowStart = $todayWib->copy()->addDay()->toDateString();
        $dailyDateLabel = $todayWib->copy()->locale('id')->translatedFormat('d M Y');

        $rawSummary = CutOffOrder::query()
            ->onlyProcessed()
            ->selectRaw(
                "COUNT(*) as total_orders,
                COALESCE(SUM(CASE WHEN order_date >= ? AND order_date < ? THEN (CASE WHEN qty IS NULL OR qty < 1 THEN 1 ELSE qty END) ELSE 0 END), 0) as daily_products,
                COUNT(CASE WHEN order_date >= ? AND order_date < ? THEN 1 END) as daily_orders,
                COUNT(CASE WHEN order_status LIKE '%RJ%' OR order_status LIKE '%Retur%' THEN 1 END) as total_rj,
                COUNT(CASE WHEN dpp_number IS NOT NULL AND dpp_number != '' THEN 1 END) as total_has_dpp,
                COALESCE(SUM(est_net_income), 0) as total_est_income,
                COALESCE(SUM(marketplace_net_payout), 0) as total_net_payout",
                [$todayStart, $tomorrowStart, $todayStart, $tomorrowStart]
            )
            ->first();

        $summary = [
            'total_orders'      => (int) ($rawSummary->total_orders ?? 0),
            'daily_products'    => (int) ($rawSummary->daily_products ?? 0),
            'daily_orders'      => (int) ($rawSummary->daily_orders ?? 0),
            'daily_date_label'  => $dailyDateLabel,
            'total_rj'          => (int) ($rawSummary->total_rj ?? 0),
            'total_has_dpp'     => (int) ($rawSummary->total_has_dpp ?? 0),
            'total_est_income'  => (float) ($rawSummary->total_est_income ?? 0),
            'total_net_payout'  => (float) ($rawSummary->total_net_payout ?? 0),
        ];

        // Daftar Toko / Channel dengan jumlah pesanan masing-masing
        $channels = CutOffOrder::query()
            ->onlyProcessed()
            ->select('channel', DB::raw('count(*) as count'))
            ->groupBy('channel')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($item) => [
                'name'  => $item->channel,
                'count' => $item->count,
            ]);

        // Daftar Jasa Pengiriman / Ekspedisi dengan jumlahnya
        $couriers = CutOffOrder::query()
            ->onlyProcessed()
            ->whereNotNull('shipping_courier')
            ->where('shipping_courier', '!=', '')
            ->select('shipping_courier', DB::raw('count(*) as count'))
            ->groupBy('shipping_courier')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($item) => [
                'name'  => $item->shipping_courier,
                'count' => $item->count,
            ]);

        return Inertia::render('CutOff/Index', [
            'orders'   => $orders,
            'filters'  => $filters,
            'summary'  => $summary,
            'channels' => $channels,
            'couriers' => $couriers,
        ]);
    }

    /**
     * Tambah data pesanan Cut Off baru secara manual.
     */
    public function store(Request $request): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'order_date'             => ['nullable', 'date'],
            'channel'                => ['required', 'string', 'max:50'],
            'order_number'           => ['required', 'string', 'max:100'],
            'jl_number'              => ['nullable', 'string', 'max:100'],
            'buyer_username'         => ['nullable', 'string', 'max:150'],
            'shipping_courier'       => ['nullable', 'string', 'max:100'],
            'sku_utama'              => ['nullable', 'string', 'max:150'],
            'sku_pengganti'          => ['nullable', 'string', 'max:150'],
            'product_name'           => ['nullable', 'string', 'max:255'],
            'variation_name'         => ['nullable', 'string', 'max:255'],
            'qty'                    => ['required', 'integer', 'min:1'],
            'recheck_qty'            => ['nullable', 'integer'],
            'package_count'          => ['nullable', 'string', 'max:50'],
            'info_gudang'            => ['nullable', 'string', 'max:100'],
            'order_status'           => ['nullable', 'string', 'max:100'],
            'keterangan_solutif'     => ['nullable', 'string'],
            'est_net_income'         => ['nullable', 'numeric'],
            'marketplace_net_payout' => ['nullable', 'numeric'],
            'sheet_dpp'              => ['nullable', 'string', 'max:100'],
            'dpp_number'             => ['nullable', 'string', 'max:100'],
        ]);

        if (empty($validated['order_date'])) {
            $validated['order_date'] = now()->toDateString();
        }

        $order = CutOffOrder::create($validated);

        return back()->with('success', "Pesanan #{$order->order_number} ({$order->channel}) berhasil ditambahkan.");
    }

    /**
     * Import batch data pesanan dari hasil pembacaan Spreadsheet Excel.
     */
    public function importBatch(Request $request): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $request->validate([
            'rows'   => ['required', 'array', 'min:1'],
            'rows.*' => ['array'],
        ]);

        $rows = $request->input('rows');
        $shopeeService = app(ShopeeSyncService::class);
        $shopeeService->ensureSchema();
        $hasFinancialBreakdown = Schema::hasColumn('cut_off_orders', 'financial_breakdown');

        $inserted = 0;
        $batch = [];
        $now = now();

        foreach ($rows as $r) {
            if (empty($r['order_number'])) {
                continue;
            }

            $rowPayload = [
                'order_date'             => !empty($r['order_date']) ? $r['order_date'] : $now->toDateString(),
                'channel'                => !empty($r['channel']) ? $r['channel'] : 'MANUAL',
                'order_number'           => $r['order_number'],
                'jl_number'              => $r['jl_number'] ?? null,
                'buyer_username'         => $r['buyer_username'] ?? null,
                'shipping_courier'       => $r['shipping_courier'] ?? null,
                'sku_utama'              => $r['sku_utama'] ?? null,
                'sku_pengganti'          => $r['sku_pengganti'] ?? null,
                'product_name'           => $r['product_name'] ?? null,
                'variation_name'         => $r['variation_name'] ?? null,
                'qty'                    => (int) ($r['qty'] ?? 1),
                'recheck_qty'            => isset($r['recheck_qty']) && $r['recheck_qty'] !== '' ? (int) $r['recheck_qty'] : null,
                'package_count'          => $r['package_count'] ?? null,
                'info_gudang'            => $r['info_gudang'] ?? null,
                'order_status'           => $r['order_status'] ?? null,
                'keterangan_solutif'     => $r['keterangan_solutif'] ?? null,
                'est_net_income'         => self::parseCleanNumber($r['est_net_income'] ?? $r['est_bersih'] ?? null),
                'marketplace_net_payout' => self::parseCleanNumber($r['marketplace_net_payout'] ?? $r['est_net_income'] ?? $r['est_bersih'] ?? null),
                'sheet_dpp'              => $r['sheet_dpp'] ?? null,
                'dpp_number'             => $r['dpp_number'] ?? null,
                'created_at'             => $now,
                'updated_at'             => $now,
            ];

            if ($hasFinancialBreakdown) {
                $rowPayload['financial_breakdown'] = !empty($r['financial_breakdown'])
                    ? json_encode($r['financial_breakdown'], JSON_UNESCAPED_UNICODE)
                    : null;
            }

            $batch[] = $rowPayload;

            if (count($batch) >= 500) {
                CutOffOrder::insert($batch);
                $inserted += count($batch);
                $batch = [];
            }
        }

        if (!empty($batch)) {
            CutOffOrder::insert($batch);
            $inserted += count($batch);
        }

        return back()->with('success', "Berhasil mengimpor {$inserted} data pesanan ke dalam database.");
    }

    /**
     * Preview import nomor JL dari Excel.
     * Mencocokkan nomor pesanan dari Excel dengan pesanan yang sudah ada di database ERP.
     */
    public function previewImportJl(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items'                => ['required', 'array', 'min:1'],
            'items.*.order_number' => ['required', 'string'],
            'items.*.jl_number'    => ['required', 'string'],
        ]);

        $items = $validated['items'];
        $orderNumbers = array_values(array_unique(array_filter(array_map(fn ($i) => trim($i['order_number']), $items))));

        // Ambil data pesanan yang cocok dari DB
        $dbOrders = CutOffOrder::query()
            ->whereIn('order_number', $orderNumbers)
            ->get(['id', 'order_number', 'channel', 'buyer_username', 'sku_utama', 'jl_number', 'order_status'])
            ->keyBy('order_number');

        $matched = [];
        $unmatched = [];
        $totalChanged = 0;

        foreach ($items as $item) {
            $orderNo = trim($item['order_number']);
            $newJl   = trim($item['jl_number']);

            if (isset($dbOrders[$orderNo])) {
                $db = $dbOrders[$orderNo];
                $currentJl = $db->jl_number;
                $isChanged = ($currentJl !== $newJl);
                if ($isChanged) {
                    $totalChanged++;
                }

                $matched[] = [
                    'id'             => $db->id,
                    'order_number'   => $orderNo,
                    'channel'        => $db->channel,
                    'buyer_username' => $db->buyer_username,
                    'sku_utama'      => $db->sku_utama,
                    'current_jl'     => $currentJl,
                    'new_jl'         => $newJl,
                    'order_status'   => $db->order_status,
                    'is_changed'     => $isChanged,
                ];
            } else {
                $unmatched[] = [
                    'order_number' => $orderNo,
                    'jl_number'    => $newJl,
                    'reason'       => 'Nomor pesanan belum ada di database ERP',
                ];
            }
        }

        return response()->json([
            'success'         => true,
            'total_excel'     => count($items),
            'total_matched'   => count($matched),
            'total_unmatched' => count($unmatched),
            'total_changed'   => $totalChanged,
            'matched'         => $matched,
            'unmatched'       => $unmatched,
        ]);
    }

    /**
     * Terapkan dan simpan pembaruan nomor JL dari Excel ke database.
     */
    public function importJl(Request $request): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'items'                => ['required', 'array', 'min:1'],
            'items.*.order_number' => ['required', 'string'],
            'items.*.jl_number'    => ['required', 'string'],
        ]);

        $items = $validated['items'];
        $updatedCount = 0;

        DB::transaction(function () use ($items, &$updatedCount) {
            foreach ($items as $item) {
                $orderNumber = trim($item['order_number']);
                $jlNumber    = trim($item['jl_number']);

                $affected = CutOffOrder::where('order_number', $orderNumber)
                    ->update([
                        'jl_number' => $jlNumber,
                    ]);

                $updatedCount += $affected;
            }
        });

        return back()->with('success', "Berhasil memperbarui Nomor JL untuk {$updatedCount} pesanan.");
    }

    /**
     * Update data pesanan (solusi gudang, SKU pengganti, status, DPP).
     */
    public function update(Request $request, CutOffOrder $cutOffOrder): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        // Status Pesanan dan Ekspedisi dikunci (hanya sinkron dari marketplace / data awal, tidak bisa diubah lewat edit)
        $validated = $request->validate([
            'info_gudang'            => ['nullable', 'string', 'max:100'],
            'sku_pengganti'          => ['nullable', 'string', 'max:150'],
            'variation_name'         => ['nullable', 'string', 'max:255'],
            'keterangan_solutif'     => ['nullable', 'string'],
            'dpp_number'             => ['nullable', 'string', 'max:100'],
            'marketplace_net_payout' => ['nullable', 'numeric'],
            'recheck_qty'            => ['nullable', 'integer'],
        ]);

        $cutOffOrder->update($validated);

        return back()->with('success', "Pesanan #{$cutOffOrder->order_number} berhasil diperbarui.");
    }

    /**
     * Hapus data pesanan (soft delete).
     */
    public function destroy(Request $request, CutOffOrder $cutOffOrder): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $cutOffOrder->delete();

        return back()->with('success', "Pesanan #{$cutOffOrder->order_number} berhasil dihapus.");
    }

    /**
     * Webhook penerima data dari Google Apps Script.
     * Otomatis Insert jika baru, atau Update kolom yang diedit di spreadsheet.
     */
    public function syncFromSheet(Request $request): \Illuminate\Http\JsonResponse
    {
        $items = $request->input('rows');
        if (empty($items)) {
            // Jika dikirim satu baris langsung
            $single = $request->except(['secret_token']);
            if (!empty($single['order_number'])) {
                $items = [$single];
            }
        }

        if (empty($items)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Tidak ada data pesanan yang valid.',
            ], 422);
        }

        $synced = 0;
        foreach ($items as $r) {
            if (empty($r['order_number'])) {
                continue;
            }

            $orderNumber = trim((string) $r['order_number']);
            $orderDate = !empty($r['order_date']) ? (string) $r['order_date'] : now()->toDateString();
            if (str_contains($orderDate, 'T')) {
                $orderDate = explode('T', $orderDate)[0];
            }

            CutOffOrder::updateOrCreate(
                ['order_number' => $orderNumber],
                [
                    'order_date'             => $orderDate,
                    'channel'                => !empty($r['channel']) ? trim((string) $r['channel']) : 'MANUAL',
                    'jl_number'              => !empty($r['jl_number']) ? trim((string) $r['jl_number']) : null,
                    'buyer_username'         => !empty($r['buyer_username']) ? trim((string) $r['buyer_username']) : null,
                    'shipping_courier'       => !empty($r['shipping_courier']) ? trim((string) $r['shipping_courier']) : null,
                    'sku_utama'              => !empty($r['sku_utama']) ? trim((string) $r['sku_utama']) : null,
                    'sku_pengganti'          => !empty($r['sku_pengganti']) ? trim((string) $r['sku_pengganti']) : null,
                    'product_name'           => !empty($r['product_name']) ? trim((string) $r['product_name']) : null,
                    'variation_name'         => !empty($r['variation_name']) ? trim((string) $r['variation_name']) : null,
                    'qty'                    => (int) ($r['qty'] ?? 1),
                    'recheck_qty'            => isset($r['recheck_qty']) && $r['recheck_qty'] !== '' ? (int) $r['recheck_qty'] : null,
                    'package_count'          => !empty($r['package_count']) ? trim((string) $r['package_count']) : null,
                    'info_gudang'            => !empty($r['info_gudang']) ? trim((string) $r['info_gudang']) : null,
                    'order_status'           => !empty($r['order_status']) ? trim((string) $r['order_status']) : null,
                    'keterangan_solutif'     => !empty($r['keterangan_solutif']) ? trim((string) $r['keterangan_solutif']) : null,
                    'est_net_income'         => self::parseCleanNumber($r['est_net_income'] ?? $r['est_bersih'] ?? null),
                    'marketplace_net_payout' => self::parseCleanNumber($r['marketplace_net_payout'] ?? $r['est_net_income'] ?? $r['est_bersih'] ?? null),
                    'sheet_dpp'              => !empty($r['sheet_dpp']) ? trim((string) $r['sheet_dpp']) : null,
                    'dpp_number'             => !empty($r['dpp_number']) ? trim((string) $r['dpp_number']) : null,
                ]
            );

            $synced++;
        }

        return response()->json([
            'status'  => 'success',
            'message' => "Berhasil mensinkronkan {$synced} data pesanan dari Google Sheets.",
            'synced'  => $synced,
        ]);
    }

    /**
     * Export data pesanan hari ini / tanggal tertentu dalam format terstruktur
     * khusus untuk Google Sheets (CUT OFF 2026).
     * Memuat 11 kolom: TGL, NO, TOKO, NO.PESANAN, NAMA BARANG, SKU UTAMA, QTY, PAKET/RESI, USERPEMBELI, EST BERSIH, PENGIRIMAN.
     * Mengelompokkan SH duluan, 1 baris kosong jeda, lalu TT.
     */
    public function exportForSheet(Request $request): JsonResponse
    {
        $token = $request->query('token') ?? $request->header('X-Sync-Token');
        $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');
        if ($token && $token !== $expectedToken) {
            return response()->json(['status' => 'error', 'message' => 'Token keamanan tidak valid.'], 403);
        }

        $dateInput = $request->query('date', now('Asia/Jakarta')->toDateString());
        $sortOrder = strtolower($request->query('sort', 'asc')) === 'desc' ? 'desc' : 'asc';

        // Ambil semua pesanan pada tanggal tersebut
        $orders = CutOffOrder::query()
            ->onlyProcessed()
            ->whereDate('order_date', $dateInput)
            ->whereNull('deleted_at')
            ->orderBy('order_date', $sortOrder)
            ->orderBy('id', $sortOrder)
            ->get();

        $shOrders = $orders->filter(fn ($o) => strtoupper($o->channel) === 'SH' || str_contains(strtoupper($o->channel), 'SH'));
        $ttOrders = $orders->filter(fn ($o) => strtoupper($o->channel) === 'TT' || str_contains(strtoupper($o->channel), 'TT'));
        $otherOrders = $orders->filter(fn ($o) => ! $shOrders->contains('id', $o->id) && ! $ttOrders->contains('id', $o->id));

        $formattedDate = \Carbon\Carbon::parse($dateInput)->format('d-m-y');
        $rows = [];
        $no = 1;

        // 1. Blok Pesanan Shopee (SH)
        foreach ($shOrders as $order) {
            $rows[] = [
                'tgl'          => $formattedDate,
                'no'           => $no++,
                'toko'         => 'SH',
                'no_pesanan'   => (string) $order->order_number,
                'nama_barang'  => (string) ($order->product_name ?? ''),
                'sku_utama'    => (string) ($order->sku_utama ?? ''),
                'qty'          => (int) ($order->qty ?? 1),
                'paket_resi'   => (string) ($order->package_count ?: '1'),
                'userpembeli'  => (string) ($order->buyer_username ?? ''),
                'est_bersih'   => (float) ($order->est_net_income ?? 0),
                'pengiriman'   => (string) ($order->shipping_courier ?? ''),
                'is_separator' => false,
            ];
        }

        // 2. Baris Jeda Kosong antara SH dan TT (jika ada pesanan TT atau SH)
        if ($shOrders->isNotEmpty() && ($ttOrders->isNotEmpty() || $otherOrders->isNotEmpty())) {
            $rows[] = [
                'tgl'          => '',
                'no'           => '',
                'toko'         => '',
                'no_pesanan'   => '',
                'nama_barang'  => '',
                'sku_utama'    => '',
                'qty'          => '',
                'paket_resi'   => '',
                'userpembeli'  => '',
                'est_bersih'   => '',
                'pengiriman'   => '',
                'is_separator' => true,
            ];
        }

        // 3. Blok Pesanan TikTok (TT)
        foreach ($ttOrders as $order) {
            $rows[] = [
                'tgl'          => $formattedDate,
                'no'           => $no++,
                'toko'         => 'TT',
                'no_pesanan'   => (string) $order->order_number,
                'nama_barang'  => (string) ($order->product_name ?? ''),
                'sku_utama'    => (string) ($order->sku_utama ?? ''),
                'qty'          => (int) ($order->qty ?? 1),
                'paket_resi'   => (string) ($order->package_count ?: '1'),
                'userpembeli'  => (string) ($order->buyer_username ?? ''),
                'est_bersih'   => (float) ($order->est_net_income ?? 0),
                'pengiriman'   => (string) ($order->shipping_courier ?? ''),
                'is_separator' => false,
            ];
        }

        // 4. Saluran Lain jika ada (Lazada, Manual, dll)
        foreach ($otherOrders as $order) {
            $rows[] = [
                'tgl'          => $formattedDate,
                'no'           => $no++,
                'toko'         => (string) $order->channel,
                'no_pesanan'   => (string) $order->order_number,
                'nama_barang'  => (string) ($order->product_name ?? ''),
                'sku_utama'    => (string) ($order->sku_utama ?? ''),
                'qty'          => (int) ($order->qty ?? 1),
                'paket_resi'   => (string) ($order->package_count ?: '1'),
                'userpembeli'  => (string) ($order->buyer_username ?? ''),
                'est_bersih'   => (float) ($order->est_net_income ?? 0),
                'pengiriman'   => (string) ($order->shipping_courier ?? ''),
                'is_separator' => false,
            ];
        }

        return response()->json([
            'status'         => 'success',
            'date'           => $dateInput,
            'date_formatted' => $formattedDate,
            'total_orders'   => $orders->count(),
            'total_sh'       => $shOrders->count(),
            'total_tt'       => $ttOrders->count(),
            'columns'        => [
                'TGL', 'NO', 'TOKO', 'NO.PESANAN', 'NAMA BARANG',
                'SKU UTAMA', 'QTY', 'PAKET/RESI', 'USERPEMBELI',
                'EST BERSIH', 'PENGIRIMAN'
            ],
            'rows'           => $rows,
        ]);
    }

    /**
     * Sanitasi dan parsing angka format desimal / ribuan Indonesia (misal: "134.299", "134,299", "Rp 134.299").
     */
    public static function parseCleanNumber(mixed $val): ?float
    {
        if ($val === null || $val === '') {
            return null;
        }
        if (is_numeric($val)) {
            return (float) $val;
        }
        $str = trim((string) $val);
        $str = str_ireplace(['rp', 'idr', ' '], '', $str);

        if (str_contains($str, '.') && str_contains($str, ',')) {
            if (strpos($str, '.') < strpos($str, ',')) {
                $str = str_replace('.', '', $str);
                $str = str_replace(',', '.', $str);
            } else {
                $str = str_replace(',', '', $str);
            }
        } elseif (str_contains($str, '.')) {
            $parts = explode('.', $str);
            if (count($parts) > 1 && strlen(end($parts)) === 3) {
                $str = str_replace('.', '', $str);
            }
        } elseif (str_contains($str, ',')) {
            $parts = explode(',', $str);
            if (count($parts) > 1 && strlen(end($parts)) === 3) {
                $str = str_replace(',', '', $str);
            } else {
                $str = str_replace(',', '.', $str);
            }
        }

        $filtered = preg_replace('/[^0-9.-]/', '', $str);
        return is_numeric($filtered) ? (float) $filtered : null;
    }

    /**
     * Sinkronisasi ulang pesanan Shopee 7 hari terakhir beserta rincian escrow/voucher penjual (Super Admin only).
     */
    public function syncShopeeRecent(Request $request, ShopeeSyncService $shopeeService): RedirectResponse
    {
        $user = $request->user();
        $isSuperAdmin = $user && (
            (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) ||
            $user->role?->name === 'Super Admin' ||
            $user->roles->contains('name', 'Super Admin')
        );

        if (! $isSuperAdmin) {
            abort(403, 'Hanya Super Admin yang diizinkan menyinkronkan ulang pesanan Shopee.');
        }

        $accounts = ShopeeAccount::where('status', 'active')
            ->whereNotNull('access_token')
            ->get();

        if ($accounts->isEmpty()) {
            return redirect()->route('cut-off-orders.index')->with('error', 'Tidak ada akun Shopee aktif yang terhubung.');
        }

        $days = max(1, min(14, (int) $request->input('days', 7)));
        $timeTo = time();
        $timeFrom = $timeTo - ($days * 86400);

        $totalCreated = 0;
        $totalUpdated = 0;
        $errors = [];

        foreach ($accounts as $account) {
            try {
                $res = $shopeeService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
                $totalCreated += (int) ($res['created'] ?? 0);
                $totalUpdated += (int) ($res['updated'] ?? 0);
            } catch (\Throwable $e) {
                $errors[] = ($account->shop_name ?? ('Toko #' . $account->shop_id)) . ': ' . $e->getMessage();
            }
        }

        if (! empty($errors) && $totalCreated === 0 && $totalUpdated === 0) {
            return redirect()->route('cut-off-orders.index')->with('error', 'Gagal menyinkronkan Shopee: ' . implode(' | ', $errors));
        }

        $msg = "Sinkron & hitung ulang Shopee ({$days} hari terakhir) selesai: {$totalUpdated} diperbarui, {$totalCreated} baru.";
        if (! empty($errors)) {
            $msg .= ' Catatan: ' . implode(' | ', $errors);
        }

        return redirect()->route('cut-off-orders.index')->with('success', $msg);
    }

    /**
     * Kosongkan seluruh data tabel Cut Off Orders (Super Admin only).
     */
    public function truncate(Request $request): RedirectResponse
    {
        $user = $request->user();
        $isSuperAdmin = $user && (
            (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) ||
            $user->role?->name === 'Super Admin' ||
            $user->roles->contains('name', 'Super Admin')
        );

        if (! $isSuperAdmin) {
            abort(403, 'Hanya Super Admin yang diizinkan mengosongkan seluruh data pesanan.');
        }

        DB::table('cut_off_orders')->truncate();

        return redirect()->route('cut-off-orders.index')->with('success', 'Semua data Pesanan Cut Off berhasil dikosongkan. Tabel kini bersih dan siap diisi data murni dari API.');
    }
}
