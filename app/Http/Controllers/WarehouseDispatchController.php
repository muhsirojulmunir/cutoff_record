<?php

namespace App\Http\Controllers;

use App\Models\SalesOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Gudang — Cetak Resi & Validasi Serah Terima Kurir.
 *
 * Menampilkan pesanan yang siap dikirim, baik offline maupun marketplace,
 * untuk dicetak resinya. Setelah resi discan, paket ditandai siap diserahkan
 * ke kurir lengkap dengan waktu dan nama petugasnya.
 */
class WarehouseDispatchController extends Controller
{
    /** Status pesanan yang barangnya sedang disiapkan untuk dikirim. */
    private const DISPATCHABLE_STATUSES = ['approved', 'processing', 'completed'];

    public function index(Request $request): Response
    {
        Gate::authorize('stock.view');

        $scanFilter = $request->input('scan_status');

        $orders = SalesOrder::with(['customer:id,name', 'resiScanner:id,name'])
            ->whereIn('status', self::DISPATCHABLE_STATUSES)
            ->when($request->input('search'), function ($query, $search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('so_number', 'like', "%{$search}%")
                        ->orWhere('tracking_number', 'like', "%{$search}%")
                        ->orWhere('recipient_name', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$search}%"));
                });
            })
            ->when($request->input('channel') === 'offline', fn ($q) => $q->whereIn('sales_channel', ['manual', 'grosir']))
            ->when($request->input('channel') === 'marketplace', fn ($q) => $q->whereNotIn('sales_channel', ['manual', 'grosir']))
            ->when($scanFilter === 'scanned', fn ($q) => $q->whereNotNull('resi_scanned_at'))
            ->when($scanFilter === 'unscanned', fn ($q) => $q->whereNull('resi_scanned_at'))
            // Yang belum discan didahulukan — itu antrian kerja gudang.
            ->orderByRaw('CASE WHEN resi_scanned_at IS NULL THEN 0 ELSE 1 END')
            ->orderByDesc('id')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Warehouse/Dispatch', [
            'orders'  => $orders,
            'filters' => $request->only(['search', 'channel', 'scan_status']),
            'canScan' => Gate::allows('dispatch.scan'),
            'summary' => [
                'unscanned' => SalesOrder::whereIn('status', self::DISPATCHABLE_STATUSES)
                    ->whereNotNull('tracking_number')
                    ->whereNull('resi_scanned_at')
                    ->count(),
                'scanned_today' => SalesOrder::whereDate('resi_scanned_at', now()->toDateString())->count(),
            ],
        ]);
    }

    /**
     * Validasi resi hasil scan. Nomor resi boleh diketik manual atau
     * dimasukkan lewat alat pemindai barcode.
     */
    public function scan(Request $request): RedirectResponse
    {
        Gate::authorize('dispatch.scan');

        $validated = $request->validate([
            'tracking_number' => ['required', 'string', 'max:100'],
        ], [], ['tracking_number' => 'Nomor resi']);

        $tracking = trim($validated['tracking_number']);

        $order = SalesOrder::whereIn('status', self::DISPATCHABLE_STATUSES)
            ->where('tracking_number', $tracking)
            ->first();

        if (!$order) {
            return back()->with('error', "Resi {$tracking} tidak ditemukan pada pesanan yang siap dikirim.");
        }

        if ($order->resi_scanned_at) {
            return back()->with(
                'error',
                "Resi {$tracking} sudah divalidasi pada " . $order->resi_scanned_at->format('d/m/Y H:i') . '.'
            );
        }

        $order->update([
            'resi_scanned_at' => now(),
            'resi_scanned_by' => auth()->id(),
        ]);

        return back()->with('success', "Resi {$tracking} ({$order->so_number}) siap diserahkan ke kurir.");
    }

    /** Batalkan validasi bila resi tervalidasi karena salah scan. */
    public function unscan(SalesOrder $salesOrder): RedirectResponse
    {
        Gate::authorize('dispatch.scan');

        if (!$salesOrder->resi_scanned_at) {
            return back()->with('error', 'Pesanan ini memang belum divalidasi.');
        }

        $salesOrder->update([
            'resi_scanned_at' => null,
            'resi_scanned_by' => null,
        ]);

        return back()->with('success', "Validasi {$salesOrder->so_number} dibatalkan.");
    }
}
