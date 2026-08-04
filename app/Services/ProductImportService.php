<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Impor produk massal dari file Excel yang sudah diisi admin
 * memakai template unduhan di halaman daftar produk.
 *
 * SKU dipakai sebagai penanda: SKU baru dibuat, SKU yang sudah ada diperbarui,
 * sehingga file yang sama boleh diunggah ulang tanpa menggandakan data.
 */
class ProductImportService
{
    /**
     * @param  array<int, array<string, mixed>>  $rows  Baris dari sheet Excel.
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
            $rowNumber  = $index + 2; // Baris Excel (baris 1 adalah header)
            $normalised = $this->normalise($row);

            // Lewati baris contoh dari template
            $namaCek = strtolower((string) ($normalised['name'] ?? ''));
            $skuCek  = strtolower((string) ($normalised['sku'] ?? ''));
            if (str_contains($namaCek, '[contoh') || str_starts_with($skuCek, '⚠')) {
                continue;
            }

            // Fallback nama produk & kategori bila kosong
            if (empty($normalised['name']) && !empty($normalised['sku'])) {
                $normalised['name'] = strtoupper((string) $normalised['sku']);
            }
            if (empty($normalised['category'])) {
                $normalised['category'] = 'Umum';
            }

            $validator = Validator::make($normalised, [
                'sku'            => ['required', 'string', 'max:100'],
                'name'           => ['required', 'string', 'max:255'],
                'category'       => ['required', 'string', 'max:255'],
                'brand'          => ['nullable', 'string', 'max:255'],
                'color'          => ['nullable', 'string', 'max:100'],
                'is_box'         => ['boolean'],
                'length'         => ['nullable', 'numeric', 'min:0'],
                'width'          => ['nullable', 'numeric', 'min:0'],
                'height'         => ['nullable', 'numeric', 'min:0'],
                'stock'          => ['nullable', 'integer', 'min:0'],
                'status'         => ['required', 'in:active,inactive'],
                'description'    => ['nullable', 'string'],
            ], [
                'sku.required'      => 'Kolom SKU wajib diisi.',
                'sku.max'           => 'SKU terlalu panjang (maks 100 karakter).',
                'name.required'     => 'Nama Produk wajib diisi.',
                'name.max'          => 'Nama Produk terlalu panjang (maks 255 karakter).',
                'category.required' => 'Kolom Kategori wajib diisi.',
                'length.numeric'    => 'Panjang (cm) harus berupa angka.',
                'width.numeric'     => 'Lebar (cm) harus berupa angka.',
                'height.numeric'    => 'Tinggi (cm) harus berupa angka.',
                'stock.integer'     => 'Stok Awal harus berupa bilangan bulat.',
                'stock.min'         => 'Stok Awal tidak boleh negatif.',
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
            $skuUpper = strtoupper($data['sku']);

            // Cek duplikasi SKU di dalam file Excel yang sama
            if (isset($seenSkus[$skuUpper])) {
                $errors[] = [
                    'row'     => $rowNumber,
                    'sku'     => $data['sku'],
                    'message' => "SKU '{$data['sku']}' ganda di dalam file Excel (sudah ada di Baris {$seenSkus[$skuUpper]}).",
                ];
                continue;
            }
            $seenSkus[$skuUpper] = $rowNumber;

            $validatedRows[] = $data;
        }

        // FASE 2: Jika ada 1 SAJA baris bermasalah, TOLAK SEMUA (All-or-Nothing / Rollback Total)
        if (count($errors) > 0) {
            return [
                'created' => 0,
                'updated' => 0,
                'failed'  => count($errors),
                'errors'  => array_slice($errors, 0, 50),
            ];
        }

        // FASE 3: Jika seluruh baris valid, baru eksekusi ke database secara aman
        DB::transaction(function () use ($validatedRows, $userId, &$created, &$updated) {
            foreach ($validatedRows as $data) {
                $category = $this->resolveCategory($data['category']);

                $payload = [
                    'name'           => $data['name'],
                    'category_id'    => $category->id,
                    'brand'          => $data['brand'] ?? null,
                    'color'          => $data['color'] ?? null,
                    'is_box'         => $data['is_box'] ?? false,
                    'length'         => $data['length'] ?? null,
                    'width'          => $data['width'] ?? null,
                    'height'         => ($data['is_box'] ?? false) ? ($data['height'] ?? null) : null,
                    'status'         => $data['status'],
                    'description'    => $data['description'] ?? null,
                ];

                // Gunakan withTrashed() agar produk yang pernah di-soft-delete terdeteksi dan di-restore
                $existing = Product::withTrashed()->where('sku', $data['sku'])->first();

                if ($existing) {
                    if ($existing->trashed()) {
                        $existing->restore();
                    }

                    if (array_key_exists('stock', $data) && $data['stock'] !== null) {
                        $payload['stock'] = $data['stock'];
                    }

                    $existing->update($payload);
                    $updated++;
                } else {
                    Product::create($payload + [
                        'sku'        => $data['sku'],
                        'stock'      => $data['stock'] ?? 0,
                        'created_by' => $userId,
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
     * Samakan isi kolom Excel ke bentuk yang dipahami sistem — judul kolom
     * boleh ditulis bebas huruf besar/kecil dan bertanda baca.
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

        $boxRaw = $get(['kardus', 'produk_kardus', 'is_box']);
        $isBox = in_array(Str::lower((string) $boxRaw), ['ya', 'y', 'yes', 'true', '1'], true);

        $statusRaw = Str::lower((string) $get(['status']) ?: 'aktif');
        $status = in_array($statusRaw, ['nonaktif', 'inactive', 'tidak aktif', '0'], true) ? 'inactive' : 'active';

        return [
            'sku'            => $get(['sku', 'kode_sku', 'kode']),
            'name'           => $get(['nama_produk', 'nama', 'name', 'produk']),
            'category'       => $get(['kategori', 'category']),
            'brand'          => $get(['brand', 'merek', 'brand_merek']),
            'color'          => $get(['warna', 'color']),
            'is_box'         => $isBox,
            'length'         => $this->toNumber($get(['panjang_cm', 'panjang', 'length'])),
            'width'          => $this->toNumber($get(['lebar_cm', 'lebar', 'width'])),
            'height'         => $this->toNumber($get(['tinggi_cm', 'tinggi', 'height'])),
            'stock'          => $this->toNumber($get(['stok_awal', 'stok', 'stock'])),
            'status'         => $status,
            'description'    => $get(['deskripsi', 'keterangan', 'description']),
        ];
    }

    /**
     * Angka dari Excel bisa berupa angka asli maupun teks bergaya Indonesia:
     * "12.500" (ribuan) dan "30,5" (desimal) harus sama-sama terbaca benar.
     */
    private function toNumber(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        $clean = str_replace(' ', '', (string) $value);

        // Pemisah ribuan: dikenali dari kelompok tiga angka, mis. 12.500 / 1.250.000.
        if (preg_match('/^-?\d{1,3}(\.\d{3})+$/', $clean)) {
            $clean = str_replace('.', '', $clean);
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})+$/', $clean)) {
            $clean = str_replace(',', '', $clean);
        } else {
            // Sisanya: koma dianggap pemisah desimal.
            $clean = str_replace(',', '.', $clean);
        }

        return is_numeric($clean) ? (float) $clean : null;
    }

    /**
     * Kategori dicocokkan berdasarkan namanya; bila belum ada, dibuatkan
     * otomatis agar impor tidak gagal hanya karena kategori baru.
     */
    private function resolveCategory(string $name): Category
    {
        $existing = Category::whereRaw('LOWER(name) = ?', [Str::lower($name)])->first();

        if ($existing) {
            return $existing;
        }

        return Category::create([
            'name'   => $name,
            'status' => 'active',
        ]);
    }
}
