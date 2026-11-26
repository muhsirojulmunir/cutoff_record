<?php

namespace App\Http\Controllers;

use App\Models\CutOffReturn;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class CutOffReturnController extends Controller
{
    /**
     * Tampilkan data retur online dengan filter dan ringkasan.
     */
    public function index(Request $request): Response
    {
        CutOffReturn::ensureReturnStageSchema();

        $filters = $request->only([
            'search',
            'marketplace',
            'needs_action',
            'stage',
            'date_from',
            'date_to',
            'per_page',
        ]);

        $perPage = (int) ($filters['per_page'] ?? 25);
        if (!in_array($perPage, [15, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $returns = CutOffReturn::query()
            ->filter($filters)
            ->orderBy('id', 'desc')
            ->paginate($perPage)
            ->withQueryString();

        $this->enrichReturnItems($returns->items());

        try {
            $rawSummary = DB::table('cut_off_returns')
                ->whereNull('deleted_at')
                ->selectRaw("
                    COUNT(*) as total_retur,
                    COALESCE(SUM(CASE WHEN marketplace = 'SH' THEN 1 ELSE 0 END), 0) as total_shopee,
                    COALESCE(SUM(CASE WHEN marketplace = 'TT' THEN 1 ELSE 0 END), 0) as total_tokopedia,
                    COALESCE(SUM(CASE WHEN no_pesanan_baru IS NOT NULL AND no_pesanan_baru != '' THEN 1 ELSE 0 END), 0) as total_pesanan_baru,
                    COALESCE(SUM(CASE WHEN marketplace IS NOT NULL AND marketplace NOT IN ('SH', 'TT') THEN 1 ELSE 0 END), 0) as total_lainnya
                ")
                ->first();

            $awaitingCount       = CutOffReturn::query()->forStage('awaiting_appeal')->count();
            $otwCount            = CutOffReturn::query()->forStage('otw_office')->count();
            $platformReviewCount = CutOffReturn::query()->forStage('platform_review')->count();
            $submittedCount      = CutOffReturn::query()->forStage('appeal_submitted')->count();
            $noAppealCount       = CutOffReturn::query()->forStage('no_appeal_needed')->count();

            $summary = [
                'total_retur'            => (int) ($rawSummary->total_retur ?? 0),
                'total_shopee'           => (int) ($rawSummary->total_shopee ?? 0),
                'total_tokopedia'        => (int) ($rawSummary->total_tokopedia ?? 0),
                'total_pesanan_baru'     => (int) ($rawSummary->total_pesanan_baru ?? 0),
                'total_needs_action'     => $awaitingCount,
                'total_awaiting_appeal'  => $awaitingCount,
                'total_otw_office'       => $otwCount,
                'total_platform_review'  => $platformReviewCount,
                'total_appeal_submitted' => $submittedCount,
                'total_no_appeal_needed' => $noAppealCount,
                'total_lainnya'          => (int) ($rawSummary->total_lainnya ?? 0),
            ];
        } catch (\Throwable $e) {
            $summary = [
                'total_retur'            => 0,
                'total_shopee'           => 0,
                'total_tokopedia'        => 0,
                'total_pesanan_baru'     => 0,
                'total_needs_action'     => 0,
                'total_awaiting_appeal'  => 0,
                'total_otw_office'       => 0,
                'total_platform_review'  => 0,
                'total_appeal_submitted' => 0,
                'total_no_appeal_needed' => 0,
                'total_lainnya'          => 0,
            ];
        }

        // Ambil daftar kasus per tahap workflow secara terpisah untuk widget monitoring
        $nowStr = now()->toDateTimeString();
        try {
            $awaitingTasks = CutOffReturn::query()
                ->forStage('awaiting_appeal')
                ->orderByRaw('CASE WHEN due_date IS NOT NULL AND due_date >= ? THEN 0 ELSE 1 END ASC', [$nowStr])
                ->orderBy('due_date', 'asc')
                ->take(30)
                ->get();

            $otwTasks = CutOffReturn::query()
                ->forStage('otw_office')
                ->orderByRaw('CASE WHEN estimated_arrival_at IS NOT NULL THEN 0 ELSE 1 END ASC')
                ->orderBy('estimated_arrival_at', 'asc')
                ->take(30)
                ->get();

            $platformReviewTasks = CutOffReturn::query()
                ->forStage('platform_review')
                ->orderByDesc('updated_at')
                ->take(30)
                ->get();

            $submittedTasks = CutOffReturn::query()
                ->forStage('appeal_submitted')
                ->orderByDesc('dispute_action_at')
                ->orderByDesc('updated_at')
                ->take(30)
                ->get();

            $this->enrichReturnItems($awaitingTasks->all());
            $this->enrichReturnItems($otwTasks->all());
            $this->enrichReturnItems($platformReviewTasks->all());
            $this->enrichReturnItems($submittedTasks->all());
        } catch (\Throwable $e) {
            $awaitingTasks       = collect();
            $otwTasks            = collect();
            $platformReviewTasks = collect();
            $submittedTasks      = collect();
        }

        $stageTasks = [
            'awaiting_appeal'  => $awaitingTasks,
            'otw_office'       => $otwTasks,
            'platform_review'  => $platformReviewTasks,
            'appeal_submitted' => $submittedTasks,
        ];

        $marketplaces = CutOffReturn::query()
            ->select('marketplace', DB::raw('count(*) as count'))
            ->whereNotNull('marketplace')
            ->where('marketplace', '!=', '')
            ->groupBy('marketplace')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($item) => [
                'name'  => (string) ($item->marketplace ?? ''),
                'count' => (int) ($item->count ?? 0),
            ])
            ->values()
            ->all();

        return Inertia::render('CutOff/Returns', [
            'returns'      => $returns,
            'filters'      => $filters,
            'summary'      => $summary,
            'disputeTasks' => $awaitingTasks,
            'stageTasks'   => $stageTasks,
            'marketplaces' => $marketplaces,
        ]);
    }

    /**
     * Tambah data retur baru secara manual.
     */
    public function store(Request $request): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'marketplace'      => ['required', 'string', 'max:50'],
            'tgl_input_mp'     => ['nullable', 'date'],
            'nama_barang_mp'   => ['required', 'string', 'max:255'],
            'jml_produk_mp'    => ['nullable', 'integer', 'min:1'],
            'no_invoice_mp'    => ['nullable', 'string', 'max:100'],
            'no_invoice_baru'  => ['nullable', 'string', 'max:100'],
            'no_retur'         => ['nullable', 'string', 'max:100'],
            'no_rj'            => ['nullable', 'string', 'max:100'],
            'tgl_rj'           => ['nullable', 'date'],
            'tgl_terima_brg'   => ['nullable', 'date'],
            'nama_barang_fisik'=> ['nullable', 'string', 'max:255'],
            'jml_brg_fisik'    => ['nullable', 'integer', 'min:0'],
            'keterangan'       => ['nullable', 'string'],
            'barcode'          => ['nullable', 'string', 'max:100'],
            'tgl_banding'      => ['nullable', 'string', 'max:100'],
            'due_date'         => ['nullable', 'date'],
            'no_pengajuan'     => ['nullable', 'string', 'max:100'],
            'no_pesanan_baru'  => ['nullable', 'string', 'max:100'],
        ]);

        $record = CutOffReturn::create($validated);

        $label = $record->no_retur ?: $record->no_invoice_mp;
        return back()->with('success', "Retur #{$label} berhasil ditambahkan.");
    }

    /**
     * Import batch data retur dari Excel (parsed di frontend via SheetJS).
     * Excel header: baris 1-3 = header/group. Data mulai baris 4.
     * Mapping: Col1=no_urut, Col2=marketplace, Col3=tgl_input_mp, Col4=nama_barang_mp,
     *          Col5=jml_produk_mp, Col6=no_invoice_mp, Col7=no_invoice_baru, Col8=no_retur,
     *          Col9=tgl_rj, Col10=tgl_terima_brg, Col11=nama_barang_fisik, Col12=jml_brg_fisik,
     *          Col13=keterangan, Col14=barcode, Col15=tgl_banding, Col16=no_pengajuan, Col17=no_pesanan_baru
     */
    public function importBatch(Request $request): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $request->validate([
            'rows'   => ['required', 'array', 'min:1'],
            'rows.*' => ['array'],
        ]);

        $rows    = $request->input('rows');
        $inserted = 0;
        $batch   = [];
        $now     = now();

        foreach ($rows as $r) {
            // Skip baris kosong (tidak ada marketplace DAN nama barang)
            if (empty($r['marketplace']) && empty($r['nama_barang_mp'])) {
                continue;
            }

            $batch[] = [
                'no_urut'           => isset($r['no_urut']) && is_numeric($r['no_urut']) ? (int) $r['no_urut'] : null,
                'marketplace'       => !empty($r['marketplace']) ? strtoupper(trim((string) $r['marketplace'])) : null,
                'tgl_input_mp'      => !empty($r['tgl_input_mp']) ? $this->parseDate($r['tgl_input_mp']) : null,
                'nama_barang_mp'    => !empty($r['nama_barang_mp']) ? trim((string) $r['nama_barang_mp']) : null,
                'jml_produk_mp'     => isset($r['jml_produk_mp']) && is_numeric($r['jml_produk_mp']) ? (int) $r['jml_produk_mp'] : 1,
                'no_invoice_mp'     => !empty($r['no_invoice_mp']) ? trim((string) $r['no_invoice_mp']) : null,
                'no_invoice_baru'   => !empty($r['no_invoice_baru']) ? trim((string) $r['no_invoice_baru']) : null,
                'no_retur'          => !empty($r['no_retur']) ? trim((string) $r['no_retur']) : null,
                'tgl_rj'            => !empty($r['tgl_rj']) ? $this->parseDate($r['tgl_rj']) : null,
                'tgl_terima_brg'    => !empty($r['tgl_terima_brg']) ? $this->parseDate($r['tgl_terima_brg']) : null,
                'nama_barang_fisik' => !empty($r['nama_barang_fisik']) ? trim((string) $r['nama_barang_fisik']) : null,
                'jml_brg_fisik'     => isset($r['jml_brg_fisik']) && is_numeric($r['jml_brg_fisik']) ? (int) $r['jml_brg_fisik'] : null,
                'keterangan'        => !empty($r['keterangan']) ? trim((string) $r['keterangan']) : null,
                'barcode'           => !empty($r['barcode']) ? trim((string) $r['barcode']) : null,
                'tgl_banding'       => !empty($r['tgl_banding']) ? trim((string) $r['tgl_banding']) : null,
                'no_pengajuan'      => !empty($r['no_pengajuan']) ? trim((string) $r['no_pengajuan']) : null,
                'no_pesanan_baru'   => !empty($r['no_pesanan_baru']) ? trim((string) $r['no_pesanan_baru']) : null,
                'created_at'        => $now,
                'updated_at'        => $now,
            ];

            if (count($batch) >= 500) {
                CutOffReturn::insert($batch);
                $inserted += count($batch);
                $batch = [];
            }
        }

        if (!empty($batch)) {
            CutOffReturn::insert($batch);
            $inserted += count($batch);
        }

        return back()->with('success', "Berhasil mengimpor {$inserted} data retur ke dalam database.");
    }

    /**
     * Update data retur (keterangan, status banding, dll).
     */
    public function update(Request $request, CutOffReturn $cutOffReturn): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        try {
            $validated = $request->validate([
                'marketplace'       => ['nullable', 'string', 'max:50'],
                'tgl_input_mp'      => ['nullable', 'date'],
                'nama_barang_mp'    => ['nullable', 'string', 'max:255'],
                'jml_produk_mp'     => ['nullable', 'integer'],
                'no_invoice_mp'     => ['nullable', 'string', 'max:100'],
                'no_invoice_baru'   => ['nullable', 'string', 'max:100'],
                'no_retur'          => ['nullable', 'string', 'max:100'],
                'no_rj'             => ['nullable', 'string', 'max:100'],
                'tgl_rj'            => ['nullable', 'date'],
                'tgl_terima_brg'    => ['nullable', 'date'],
                'nama_barang_fisik' => ['nullable', 'string', 'max:255'],
                'jml_brg_fisik'     => ['nullable', 'integer'],
                'keterangan'        => ['nullable', 'string'],
                'barcode'           => ['nullable', 'string', 'max:100'],
                'tgl_banding'       => ['nullable', 'string', 'max:100'],
                'due_date'          => ['nullable'],
                'no_pengajuan'      => ['nullable', 'string', 'max:100'],
                'no_pesanan_baru'   => ['nullable', 'string', 'max:100'],
            ]);

            // Normalisasi nilai string kosong menjadi null agar aman untuk kolom date/integer
            foreach (['tgl_input_mp', 'tgl_rj', 'tgl_terima_brg', 'due_date', 'jml_brg_fisik', 'jml_produk_mp'] as $field) {
                if (array_key_exists($field, $validated)) {
                    if ($validated[$field] === '' || $validated[$field] === null) {
                        $validated[$field] = null;
                    } elseif ($field === 'due_date' && is_string($validated[$field])) {
                        try {
                            $validated[$field] = \Carbon\Carbon::parse($validated[$field]);
                        } catch (\Throwable) {
                            $validated[$field] = null;
                        }
                    }
                }
            }

            // Sinkronkan status banding manual di modal Edit agar selaras dengan workflow stage
            if (array_key_exists('tgl_banding', $validated)) {
                $tglBandingLower = strtolower(trim((string) ($validated['tgl_banding'] ?? '')));
                $actorName = $request->user()?->name ?? 'Admin';
                if (str_contains($tglBandingLower, 'tidak perlu')) {
                    $validated['dispute_action'] = 'no_appeal_needed';
                    $validated['dispute_action_at'] = now();
                    $validated['dispute_action_by'] = $actorName;
                    $validated['needs_action'] = false;
                } elseif (str_contains($tglBandingLower, 'sudah')) {
                    $validated['dispute_action'] = 'appeal_submitted';
                    $validated['dispute_action_at'] = now();
                    $validated['dispute_action_by'] = $actorName;
                    $validated['needs_action'] = false;
                } elseif (str_contains($tglBandingLower, 'belum') || $tglBandingLower === '') {
                    $validated['dispute_action'] = null;
                    $validated['dispute_action_at'] = null;
                    $validated['dispute_action_by'] = null;
                    $validated['dispute_action_note'] = null;
                    $validated['tgl_banding'] = null;
                }
            }

            CutOffReturn::ensureReturnStageSchema();
            $cutOffReturn->update($validated);

            $label = $cutOffReturn->no_retur ?: $cutOffReturn->id;
            return back()->with('success', "Data retur #{$label} berhasil diperbarui.");
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Gagal update retur #{$cutOffReturn->id}: " . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return back()->with('error', "Gagal menyimpan perubahan: " . $e->getMessage());
        }
    }

    /**
     * Aksi cepat Admin untuk menandai status pengajuan banding atau diterima tanpa banding.
     */
    public function disputeAction(Request $request, CutOffReturn $cutOffReturn): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        CutOffReturn::ensureReturnStageSchema();

        $validated = $request->validate([
            'action' => ['required', 'in:appeal_submitted,no_appeal_needed,reopen'],
            'note'   => ['nullable', 'string', 'max:255'],
        ]);

        $actorName = $request->user()?->name ?? 'Admin';
        $note      = trim((string) ($validated['note'] ?? ''));
        $label     = $cutOffReturn->no_retur ?: $cutOffReturn->no_invoice_mp ?: $cutOffReturn->id;

        if ($validated['action'] === 'appeal_submitted') {
            $cutOffReturn->update([
                'dispute_action'      => 'appeal_submitted',
                'dispute_action_at'   => now(),
                'dispute_action_by'   => $actorName,
                'dispute_action_note' => $note !== '' ? $note : null,
                'needs_action'        => false,
                'tgl_banding'         => 'Sudah Banding (' . now('Asia/Jakarta')->format('d M Y') . ')',
            ]);

            return back()->with('success', "Retur #{$label} ditandai Sudah Diajukan Banding.");
        }

        if ($validated['action'] === 'no_appeal_needed') {
            $cutOffReturn->update([
                'dispute_action'      => 'no_appeal_needed',
                'dispute_action_at'   => now(),
                'dispute_action_by'   => $actorName,
                'dispute_action_note' => $note !== '' ? $note : 'Diterima / Tidak perlu ajukan banding',
                'needs_action'        => false,
                'tgl_banding'         => 'Tidak Perlu Banding',
            ]);

            return back()->with('success', "Retur #{$label} diterima tanpa perlu banding.");
        }

        $cutOffReturn->update([
            'dispute_action'      => null,
            'dispute_action_at'   => null,
            'dispute_action_by'   => null,
            'dispute_action_note' => null,
            'needs_action'        => true,
            'tgl_banding'         => null,
        ]);

        return back()->with('success', "Status banding retur #{$label} dibuka kembali ke antrean validasi.");
    }

    /**
     * Lengkapi nomer JL dan SKU singkat dari tabel cut_off_orders.
     */
    private function enrichReturnItems(array $items): void
    {
        if (empty($items)) {
            return;
        }

        try {
            if (! Schema::hasTable('cut_off_orders')) {
                return;
            }

            $orderNumbers = collect();
            foreach ($items as $item) {
                if (! empty($item->no_pesanan_baru)) {
                    $orderNumbers->push($item->no_pesanan_baru);
                }
                if (! empty($item->no_invoice_mp)) {
                    $orderNumbers->push($item->no_invoice_mp);
                }
            }

            if ($orderNumbers->isEmpty()) {
                return;
            }

            $matchedOrders = DB::table('cut_off_orders')
                ->whereIn('order_number', $orderNumbers->unique())
                ->select(['order_number', 'jl_number', 'sku_utama'])
                ->get()
                ->keyBy('order_number');

            foreach ($items as $item) {
                $matched = $matchedOrders[$item->no_pesanan_baru]
                    ?? $matchedOrders[$item->no_invoice_mp]
                    ?? null;

                if (empty($item->no_invoice_baru) && $matched && ! empty($matched->jl_number)) {
                    $item->no_invoice_baru = $matched->jl_number;
                }

                if ($matched && ! empty($matched->sku_utama)) {
                    if (empty($item->nama_barang_mp) || strlen($item->nama_barang_mp) > 30 || stripos($item->nama_barang_mp, 'RECORD') !== false) {
                        $item->nama_barang_mp = $matched->sku_utama;
                    }
                }
            }
        } catch (\Throwable) {
            // Abaikan jika query order tidak tersedia
        }
    }

    /**
     * Hapus data retur (soft delete).
     */
    public function destroy(Request $request, CutOffReturn $cutOffReturn): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $cutOffReturn->delete();

        $label = $cutOffReturn->no_retur ?: $cutOffReturn->id;
        return back()->with('success', "Data retur #{$label} berhasil dihapus.");
    }

    /**
     * Parse tanggal dari Excel serial number atau string biasa.
     * Excel date serial: jumlah hari sejak 1 Jan 1900.
     */
    private function parseDate($value): ?string
    {
        if (empty($value)) {
            return null;
        }

        // Excel serial number (angka seperti 45915)
        if (is_numeric($value) && (int) $value > 40000) {
            try {
                $date = \Carbon\Carbon::createFromDate(1899, 12, 30)->addDays((int) $value);
                return $date->toDateString();
            } catch (\Exception $e) {
                return null;
            }
        }

        // String tanggal biasa
        try {
            return \Carbon\Carbon::parse((string) $value)->toDateString();
        } catch (\Exception $e) {
            return null;
        }
    }
}

