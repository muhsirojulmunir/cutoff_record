<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Impor produk massal dari file Excel yang diunggah admin.
 *
 * Mengelola Master Data Produk (SKU dan Nama Produk).
 * SKU dipakai sebagai kunci unik:
 * - SKU baru akan ditambahkan sebagai produk baru.
 * - SKU yang sudah ada akan diperbarui nama produknya.
 * - SKU yang di-soft-delete akan di-restore dan diperbarui.
 */
class ProductImportService
{
    /**
     * @param  array<int, array<string, mixed>>  $rows  Baris data dari sheet Excel.
     * @return array{created: int, updated: int, failed: int, errors: array<int, array{row: int, sku: string, message: string}>}
     */
    public function import(array $rows, int $userId): array
    {
        $created       = 0;
        $updated       = 0;
        $errors        = [];
        $validatedRows = [];
        $seenSkus      = []; // Untuk melacak duplikasi SKU di dalam file Excel yang sama

        // FASE 1: Validasi seluruh baris terlebih dahulu (Pre-validation pass)
        foreach ($rows as $index => $row) {
            $rowNumber  = $index + 2; // Baris 1 di Excel adalah Header
            $normalised = $this->normalise($row);

            // Lewati baris contoh dari template
            $namaCek = strtolower((string) ($normalised['name'] ?? ''));
            $skuCek  = strtolower((string) ($normalised['sku'] ?? ''));
            if (str_contains($namaCek, '[contoh') || str_contains($skuCek, '[contoh') || str_starts_with($skuCek, '⚠')) {
                continue;
            }

            // High precision fallback jika SKU kosong tapi ada nama
            if (empty($normalised['sku']) && !empty($normalised['name'])) {
                $normalised['sku'] = Str::upper(Str::slug($normalised['name']));
            }

            // Fallback nama produk bila kosong
            if (empty($normalised['name']) && !empty($normalised['sku'])) {
                $normalised['name'] = strtoupper((string) $normalised['sku']);
            }

            // Fallback kategori bila kosong
            if (empty($normalised['category'])) {
                $normalised['category'] = 'Umum';
            }

            $validator = Validator::make($normalised, [
                'sku'      => ['required', 'string', 'max:100'],
                'name'     => ['required', 'string', 'max:255'],
                'category' => ['nullable', 'string', 'max:255'],
            ], [
                'sku.required'  => 'Kolom SKU wajib diisi.',
                'sku.max'       => 'SKU terlalu panjang (maksimal 100 karakter).',
                'name.required' => 'Nama Produk wajib diisi.',
                'name.max'      => 'Nama Produk terlalu panjang (maksimal 255 karakter).',
            ]);

            if ($validator->fails()) {
                $errors[] = [
                    'row'     => $rowNumber,
                    'sku'     => (string) ($normalised['sku'] ?? '—'),
                    'message' => $validator->errors()->first(),
                ];
                continue;
            }

            $data = $validator->validated();
            $skuUpper = strtoupper(trim($data['sku']));
            $data['sku'] = $skuUpper;

            // Cek duplikasi SKU di dalam file Excel yang sama
            if (isset($seenSkus[$skuUpper])) {
                $errors[] = [
                    'row'     => $rowNumber,
                    'sku'     => $skuUpper,
                    'message' => "SKU '{$skuUpper}' ganda di dalam file Excel (sudah ada di Baris {$seenSkus[$skuUpper]}).",
                ];
                continue;
            }
            $seenSkus[$skuUpper] = $rowNumber;

            $validatedRows[] = $data;
        }

        // FASE 2: Jika terdapat 1 SAJA baris bermasalah, TOLAK SEMUA (Atomic Rollback Total)
        if (count($errors) > 0) {
            return [
                'created' => 0,
                'updated' => 0,
                'failed'  => count($errors),
                'errors'  => array_slice($errors, 0, 50),
            ];
        }

        // FASE 3: Eksekusi transaksi database secara atomic jika 100% valid
        DB::transaction(function () use ($validatedRows, $userId, &$created, &$updated) {
            foreach ($validatedRows as $data) {
                $categoryName = !empty($data['category']) ? $data['category'] : 'Umum';
                $category = $this->resolveCategory($categoryName);

                // Gunakan withTrashed() agar produk yang pernah dihapus terdeteksi dan bisa di-restore
                $existing = Product::withTrashed()->where('sku', $data['sku'])->first();

                if ($existing) {
                    if ($existing->trashed()) {
                        $existing->restore();
                    }

                    $existing->update([
                        'name'        => $data['name'],
                        'category_id' => $category->id,
                    ]);
                    $updated++;
                } else {
                    Product::create([
                        'sku'         => $data['sku'],
                        'name'        => $data['name'],
                        'category_id' => $category->id,
                        'stock'       => 0,
                        'status'      => 'active',
                        'created_by'  => $userId,
                    ]);
                    $created++;
                }
            }
        });

        return [
            'created' => $created,
            'updated' => $updated,
            'failed'  => 0,
            'errors'  => [],
        ];
    }

    /**
     * Normalisasi nama kolom dari sheet Excel (case-insensitive & toleran penamaan kolom).
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function normalise(array $row): array
    {
        $get = function (array $keys) use ($row) {
            foreach ($row as $header => $value) {
                $slug = Str::slug((string) $header, '_');

                if (in_array($slug, $keys, true)) {
                    $value = is_string($value) ? trim($value) : $value;
                    return $value === '' ? null : $value;
                }
            }

            return null;
        };

        return [
            'sku'      => $get(['sku', 'kode_sku', 'kode', 'stock_keeping_unit']),
            'name'     => $get(['nama_produk', 'nama', 'name', 'produk', 'product_name']),
            'category' => $get(['kategori', 'category']),
        ];
    }

    /**
     * Cari kategori berdasarkan nama. Jika belum ada, buatkan otomatis
     * sehingga impor tidak pernah gagal karena kategori belum terdaftar.
     */
    private function resolveCategory(string $name): Category
    {
        $cleanName = trim($name);
        if ($cleanName === '') {
            $cleanName = 'Umum';
        }

        $existing = Category::whereRaw('LOWER(name) = ?', [Str::lower($cleanName)])->first();

        if ($existing) {
            return $existing;
        }

        return Category::create([
            'name'   => $cleanName,
            'status' => 'active',
        ]);
    }
}
