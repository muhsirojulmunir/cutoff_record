<?php

namespace App\Http\Controllers;

use App\Models\CutOffOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'date_from',
            'date_to',
            'per_page',
        ]);

        $perPage = (int) ($filters['per_page'] ?? 25);
        if (!in_array($perPage, [15, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $orders = CutOffOrder::query()
            ->filter($filters)
            ->orderBy('id', 'desc')
            ->paginate($perPage)
            ->withQueryString();

        // Metrik Ringkasan Utama (dihitung efisien langsung di DB)
        $summary = [
            'total_orders'      => CutOffOrder::count(),
            'total_oos'         => CutOffOrder::where('info_gudang', 'like', '%OOS%')->count(),
            'total_rj'          => CutOffOrder::where(function ($q) {
                $q->where('order_status', 'like', '%RJ%')
                  ->orWhere('order_status', 'like', '%Retur%');
            })->count(),
            'total_has_dpp'     => CutOffOrder::whereNotNull('dpp_number')->where('dpp_number', '!=', '')->count(),
            'total_est_income'  => (float) CutOffOrder::sum('est_net_income'),
            'total_net_payout'  => (float) CutOffOrder::sum('marketplace_net_payout'),
        ];

        // Daftar Toko / Channel dengan jumlah pesanan masing-masing
        $channels = CutOffOrder::query()
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
        $inserted = 0;
        $batch = [];
        $now = now();

        foreach ($rows as $r) {
            if (empty($r['order_number'])) {
                continue;
            }

            $batch[] = [
                'order_date'             => !empty($r['order_date']) ? $r['order_date'] : $now->toDateString(),
                'channel'                => !empty($r['channel']) ? $r['channel'] : 'MANUAL',
                'order_number'           => $r['order_number'],
                'jl_number'              => $r['jl_number'] ?? null,
                'buyer_username'         => $r['buyer_username'] ?? null,
                'shipping_courier'       => $r['shipping_courier'] ?? null,
                'sku_utama'              => $r['sku_utama'] ?? null,
                'sku_pengganti'          => $r['sku_pengganti'] ?? null,
                'product_name'           => $r['product_name'] ?? null,
                'qty'                    => (int) ($r['qty'] ?? 1),
                'recheck_qty'            => isset($r['recheck_qty']) && $r['recheck_qty'] !== '' ? (int) $r['recheck_qty'] : null,
                'package_count'          => $r['package_count'] ?? null,
                'info_gudang'            => $r['info_gudang'] ?? null,
                'order_status'           => $r['order_status'] ?? null,
                'keterangan_solutif'     => $r['keterangan_solutif'] ?? null,
                'est_net_income'         => isset($r['est_net_income']) && is_numeric($r['est_net_income']) ? $r['est_net_income'] : null,
                'marketplace_net_payout' => isset($r['marketplace_net_payout']) && is_numeric($r['marketplace_net_payout']) ? $r['marketplace_net_payout'] : null,
                'sheet_dpp'              => $r['sheet_dpp'] ?? null,
                'dpp_number'             => $r['dpp_number'] ?? null,
                'created_at'             => $now,
                'updated_at'             => $now,
            ];

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
     * Update data pesanan (solusi gudang, SKU pengganti, status, DPP).
     */
    public function update(Request $request, CutOffOrder $cutOffOrder): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'info_gudang'            => ['nullable', 'string', 'max:100'],
            'sku_pengganti'          => ['nullable', 'string', 'max:150'],
            'shipping_courier'       => ['nullable', 'string', 'max:100'],
            'keterangan_solutif'     => ['nullable', 'string'],
            'order_status'           => ['nullable', 'string', 'max:100'],
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
                    'qty'                    => (int) ($r['qty'] ?? 1),
                    'recheck_qty'            => isset($r['recheck_qty']) && $r['recheck_qty'] !== '' ? (int) $r['recheck_qty'] : null,
                    'package_count'          => !empty($r['package_count']) ? trim((string) $r['package_count']) : null,
                    'info_gudang'            => !empty($r['info_gudang']) ? trim((string) $r['info_gudang']) : null,
                    'order_status'           => !empty($r['order_status']) ? trim((string) $r['order_status']) : null,
                    'keterangan_solutif'     => !empty($r['keterangan_solutif']) ? trim((string) $r['keterangan_solutif']) : null,
                    'est_net_income'         => isset($r['est_net_income']) && is_numeric($r['est_net_income']) ? (float) $r['est_net_income'] : null,
                    'marketplace_net_payout' => isset($r['marketplace_net_payout']) && is_numeric($r['marketplace_net_payout']) ? (float) $r['marketplace_net_payout'] : null,
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
}
