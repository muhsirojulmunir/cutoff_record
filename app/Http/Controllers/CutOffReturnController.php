<?php

namespace App\Http\Controllers;

use App\Models\CutOffReturn;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class CutOffReturnController extends Controller
{
    /**
     * Tampilkan data retur online dengan filter dan ringkasan.
     */
    public function index(Request $request): Response
    {
        $filters = $request->only([
            'search',
            'marketplace',
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

        $summary = [
            'total_retur'        => CutOffReturn::count(),
            'total_shopee'       => CutOffReturn::where('marketplace', 'SH')->count(),
            'total_tokopedia'    => CutOffReturn::where('marketplace', 'TT')->count(),
            'total_pesanan_baru' => CutOffReturn::whereNotNull('no_pesanan_baru')->where('no_pesanan_baru', '!=', '')->count(),
            'total_lainnya'      => CutOffReturn::whereNotIn('marketplace', ['SH', 'TT'])->count(),
        ];

        $marketplaces = CutOffReturn::query()
            ->select('marketplace', DB::raw('count(*) as count'))
            ->whereNotNull('marketplace')
            ->where('marketplace', '!=', '')
            ->groupBy('marketplace')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($item) => [
                'name'  => $item->marketplace,
                'count' => $item->count,
            ]);

        return Inertia::render('CutOff/Returns', [
            'returns'      => $returns,
            'filters'      => $filters,
            'summary'      => $summary,
            'marketplaces' => $marketplaces,
        ]);
    }

    /**
     * Tambah data retur baru secara manual.
     */
    public function store(Request $request): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'marketplace'      => ['required', 'string', 'max:50'],
            'tgl_input_mp'     => ['nullable', 'date'],
            'nama_barang_mp'   => ['required', 'string', 'max:255'],
            'jml_produk_mp'    => ['nullable', 'integer', 'min:1'],
            'no_invoice_mp'    => ['nullable', 'string', 'max:100'],
            'no_invoice_baru'  => ['nullable', 'string', 'max:100'],
            'no_retur'         => ['nullable', 'string', 'max:100'],
            'tgl_rj'           => ['nullable', 'date'],
            'tgl_terima_brg'   => ['nullable', 'date'],
            'nama_barang_fisik'=> ['nullable', 'string', 'max:255'],
            'jml_brg_fisik'    => ['nullable', 'integer', 'min:0'],
            'keterangan'       => ['nullable', 'string'],
            'barcode'          => ['nullable', 'string', 'max:100'],
            'tgl_banding'      => ['nullable', 'string', 'max:100'],
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
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
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
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'marketplace'      => ['nullable', 'string', 'max:50'],
            'tgl_input_mp'     => ['nullable', 'date'],
            'nama_barang_mp'   => ['nullable', 'string', 'max:255'],
            'jml_produk_mp'    => ['nullable', 'integer'],
            'no_invoice_mp'    => ['nullable', 'string', 'max:100'],
            'no_invoice_baru'  => ['nullable', 'string', 'max:100'],
            'no_retur'         => ['nullable', 'string', 'max:100'],
            'tgl_rj'           => ['nullable', 'date'],
            'tgl_terima_brg'   => ['nullable', 'date'],
            'nama_barang_fisik'=> ['nullable', 'string', 'max:255'],
            'jml_brg_fisik'    => ['nullable', 'integer'],
            'keterangan'       => ['nullable', 'string'],
            'barcode'          => ['nullable', 'string', 'max:100'],
            'tgl_banding'      => ['nullable', 'string', 'max:100'],
            'no_pengajuan'     => ['nullable', 'string', 'max:100'],
            'no_pesanan_baru'  => ['nullable', 'string', 'max:100'],
        ]);

        $cutOffReturn->update($validated);

        $label = $cutOffReturn->no_retur ?: $cutOffReturn->id;
        return back()->with('success', "Data retur #{$label} berhasil diperbarui.");
    }

    /**
     * Hapus data retur (soft delete).
     */
    public function destroy(Request $request, CutOffReturn $cutOffReturn): RedirectResponse
    {
        if ($request->user() && $request->user()->role?->name === 'Management') {
            abort(403, 'Akses ditolak. Akun Management hanya memiliki izin melihat data (read-only).');
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

