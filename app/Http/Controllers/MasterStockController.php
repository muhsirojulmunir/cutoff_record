<?php

namespace App\Http\Controllers;

use App\Models\MasterStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MasterStockController extends Controller
{
    /**
     * Display list of Master Stock (Gudang A & Gudang G).
     */
    public function index(Request $request): \Inertia\Response
    {
        $warehouse   = strtoupper(trim((string) $request->input('warehouse', 'all')));
        $search      = trim((string) $request->input('search', ''));
        $stockStatus = (string) $request->input('stock_status', 'all');
        $sort        = (string) $request->input('sort', 'code_asc');

        $query = MasterStock::query();

        if (in_array($warehouse, ['A', 'G'])) {
            $query->where('warehouse', $warehouse);
        }

        if (! empty($search)) {
            $query->search($search);
        }

        if ($stockStatus === 'in_stock') {
            $query->where('qty_pcs', '>', 0);
        } elseif ($stockStatus === 'out_of_stock') {
            $query->where('qty_pcs', '<=', 0);
        }

        switch ($sort) {
            case 'stock_desc':
                $query->orderBy('qty_pcs', 'desc')->orderBy('item_code', 'asc');
                break;
            case 'stock_asc':
                $query->orderBy('qty_pcs', 'asc')->orderBy('item_code', 'asc');
                break;
            case 'name_asc':
                $query->orderBy('item_name', 'asc');
                break;
            case 'updated_desc':
                $query->orderBy('last_imported_at', 'desc')->orderBy('id', 'desc');
                break;
            case 'code_asc':
            default:
                $query->orderBy('item_code', 'asc');
                break;
        }

        // Summary KPI
        $summary = [
            'total_items_g'    => MasterStock::where('warehouse', 'G')->count(),
            'total_pcs_g'      => (int) MasterStock::where('warehouse', 'G')->sum('qty_pcs'),
            'last_imported_g'  => MasterStock::where('warehouse', 'G')->max('last_imported_at'),

            'total_items_a'    => MasterStock::where('warehouse', 'A')->count(),
            'total_pcs_a'      => (int) MasterStock::where('warehouse', 'A')->sum('qty_pcs'),
            'last_imported_a'  => MasterStock::where('warehouse', 'A')->max('last_imported_at'),

            'total_pcs_all'    => (int) MasterStock::sum('qty_pcs'),
            'total_rows_all'   => MasterStock::count(),
        ];

        $stocks = $query->paginate(50)->withQueryString();

        return Inertia::render('MasterStock/Index', [
            'stocks'   => $stocks,
            'summary'  => $summary,
            'filters'  => [
                'warehouse'    => $warehouse,
                'search'       => $search,
                'stock_status' => $stockStatus,
                'sort'         => $sort,
            ],
        ]);
    }

    /**
     * Import / replace stock snapshot for Gudang G or Gudang A.
     */
    public function import(Request $request): JsonResponse
    {
        $warehouse = strtoupper(trim((string) $request->input('warehouse', '')));
        if (! in_array($warehouse, ['A', 'G'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Gudang harus dipilih: Gudang G (Eceran) atau Gudang A (Lusin).',
            ], 422);
        }

        $items = $request->input('items', []);
        if (empty($items) || ! is_array($items)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Data baris Excel tidak ditemukan atau kosong.',
            ], 422);
        }

        $now = now();
        $records = [];
        $seenCodes = [];

        foreach ($items as $row) {
            $code = trim((string) ($row['sku'] ?? $row['code'] ?? ''));
            if ($code === '' || isset($seenCodes[$code])) {
                continue;
            }
            $seenCodes[$code] = true;

            $name    = trim((string) ($row['name'] ?? ''));
            $unit    = strtoupper(trim((string) ($row['unit'] ?? ($warehouse === 'A' ? 'LSN' : 'PSG'))));
            $rawQty  = (float) ($row['raw_qty'] ?? $row['stock'] ?? 0);
            $qtyPcs  = (int) ($row['stock'] ?? 0);

            // Jika Gudang A dan unit lusin, pastikan qty_pcs dikalikan 12
            if ($warehouse === 'A' && $unit === 'LSN') {
                $qtyPcs = (int) round($rawQty * 12);
            }

            $records[] = [
                'warehouse'        => $warehouse,
                'item_code'        => $code,
                'item_name'        => $name ?: null,
                'unit'             => $unit,
                'raw_qty'          => $rawQty,
                'qty_pcs'          => max(0, $qtyPcs),
                'last_imported_at' => $now,
                'created_at'       => $now,
                'updated_at'       => $now,
            ];
        }

        if (empty($records)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Tidak ada item valid yang dapat disimpan.',
            ], 422);
        }

        DB::transaction(function () use ($warehouse, $records) {
            // Hapus snapshot stok lama untuk gudang ini agar data selalu sinkron dengan laporan fisik terbaru
            MasterStock::where('warehouse', $warehouse)->delete();

            // Insert chunk 500 baris
            foreach (array_chunk($records, 500) as $chunk) {
                MasterStock::insert($chunk);
            }
        });

        $whLabel = $warehouse === 'G' ? 'Gudang G (Eceran / Pcs)' : 'Gudang A (Grosir / Lusin)';

        return response()->json([
            'status'         => 'success',
            'warehouse'      => $warehouse,
            'imported_count' => count($records),
            'message'        => "Berhasil memperbarui Master Stok {$whLabel} sebanyak " . count($records) . " item.",
            'timestamp'      => $now->toIso8601String(),
        ]);
    }

    /**
     * Clear / reset stock of a specific warehouse.
     */
    public function clear(Request $request): JsonResponse
    {
        $warehouse = strtoupper(trim((string) $request->input('warehouse', '')));
        if (! in_array($warehouse, ['A', 'G', 'ALL'])) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Pilihan gudang tidak valid.',
            ], 422);
        }

        if ($warehouse === 'ALL') {
            MasterStock::truncate();
            $msg = 'Seluruh data Master Stok (Gudang G dan Gudang A) berhasil dikosongkan.';
        } else {
            MasterStock::where('warehouse', $warehouse)->delete();
            $whLabel = $warehouse === 'G' ? 'Gudang G' : 'Gudang A';
            $msg = "Seluruh data Master Stok {$whLabel} berhasil dikosongkan.";
        }

        return response()->json([
            'status'  => 'success',
            'message' => $msg,
        ]);
    }

    /**
     * Export Master Stock to CSV.
     */
    public function export(Request $request): StreamedResponse
    {
        $warehouse = strtoupper(trim((string) $request->input('warehouse', 'all')));

        $query = MasterStock::query();
        if (in_array($warehouse, ['A', 'G'])) {
            $query->where('warehouse', $warehouse);
        }
        $query->orderBy('warehouse', 'asc')->orderBy('item_code', 'asc');

        $filename = 'master_stok_gudang_' . strtolower($warehouse) . '_' . date('Y-m-d_His') . '.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fprintf($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'NO',
                'GUDANG',
                'KODE BARANG',
                'NAMA BARANG',
                'SATUAN ASLI',
                'QTY ASLI',
                'QTY EFEKTIF (PCS)',
                'TERAKHIR IMPORT',
            ]);

            $no = 1;
            $query->chunk(500, function ($stocks) use ($handle, &$no) {
                foreach ($stocks as $s) {
                    fputcsv($handle, [
                        $no++,
                        $s->warehouse === 'G' ? 'GUDANG G' : 'GUDANG A',
                        $s->item_code,
                        $s->item_name ?: '—',
                        $s->unit,
                        $s->raw_qty,
                        $s->qty_pcs,
                        $s->last_imported_at ? $s->last_imported_at->format('Y-m-d H:i:s') : '—',
                    ]);
                }
            });

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
