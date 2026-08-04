<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductHpp;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Impor HPP massal dari template Excel yang diisi Finance / Leader.
 * Produk dicocokkan lewat SKU; HPP yang sudah ada akan diperbarui.
 */
class ProductHppImportService
{
    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array{created: int, updated: int, failed: int, errors: array<int, array{row: int, sku: string, message: string}>}
     */
    public function import(array $rows, int $userId): array
    {
        $created = 0;
        $updated = 0;
        $errors  = [];

        DB::transaction(function () use ($rows, $userId, &$created, &$updated, &$errors) {
            foreach ($rows as $index => $row) {
                // Baris 1 pada Excel adalah judul kolom.
                $rowNumber  = $index + 2;
                $normalised = $this->normalise($row);

                // Baris tanpa nilai HPP dilewati diam-diam: template memuat
                // seluruh produk, wajar bila sebagian belum diisi.
                if ($normalised['hpp'] === null) {
                    continue;
                }

                $validator = Validator::make($normalised, [
                    'sku'            => ['required', 'string', 'max:100'],
                    'hpp'            => ['required', 'numeric', 'min:0', 'max:999999999999'],
                    'effective_date' => ['required', 'date'],
                    'notes'          => ['nullable', 'string', 'max:500'],
                ], [], [
                    'sku'            => 'SKU',
                    'hpp'            => 'HPP',
                    'effective_date' => 'Tanggal berlaku',
                ]);

                if ($validator->fails()) {
                    $errors[] = [
                        'row'     => $rowNumber,
                        'sku'     => (string) ($normalised['sku'] ?? '—'),
                        'message' => $validator->errors()->first(),
                    ];
                    continue;
                }

                $data    = $validator->validated();
                $product = Product::where('sku', $data['sku'])->first();

                if (! $product) {
                    $errors[] = [
                        'row'     => $rowNumber,
                        'sku'     => $data['sku'],
                        'message' => 'SKU tidak ditemukan di master produk.',
                    ];
                    continue;
                }

                $existing = ProductHpp::where('product_id', $product->id)->first();

                ProductHpp::updateOrCreate(
                    ['product_id' => $product->id],
                    [
                        'hpp'            => $data['hpp'],
                        'effective_date' => $data['effective_date'],
                        'notes'          => $data['notes'] ?? null,
                        'updated_by'     => $userId,
                    ],
                );

                $existing ? $updated++ : $created++;
            }
        });

        return [
            'created' => $created,
            'updated' => $updated,
            'failed'  => count($errors),
            'errors'  => array_slice($errors, 0, 50),
        ];
    }

    /**
     * Judul kolom boleh ditulis bebas huruf besar/kecil maupun bertanda baca.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function normalise(array $row): array
    {
        $get = function (array $keys) use ($row) {
            foreach ($row as $header => $value) {
                if (in_array(Str::slug((string) $header, '_'), $keys, true)) {
                    $value = is_string($value) ? trim($value) : $value;
                    return $value === '' ? null : $value;
                }
            }

            return null;
        };

        $date = $get(['tanggal_berlaku', 'berlaku_sejak', 'effective_date', 'tanggal']);

        return [
            'sku'            => $get(['sku', 'kode_sku', 'kode']),
            'hpp'            => $this->toNumber($get(['hpp', 'hpp_per_unit', 'harga_pokok', 'modal'])),
            'effective_date' => $this->toDate($date),
            'notes'          => $get(['catatan', 'keterangan', 'notes']),
        ];
    }

    /** Angka bergaya Indonesia: "12.500" ribuan, "30,5" desimal. */
    private function toNumber(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        $clean = str_replace([' ', 'Rp', 'rp'], '', (string) $value);

        if (preg_match('/^-?\d{1,3}(\.\d{3})+$/', $clean)) {
            $clean = str_replace('.', '', $clean);
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})+$/', $clean)) {
            $clean = str_replace(',', '', $clean);
        } else {
            $clean = str_replace(',', '.', $clean);
        }

        return is_numeric($clean) ? (float) $clean : null;
    }

    /**
     * Tanggal boleh kosong (dianggap hari ini) dan boleh berupa angka serial
     * bawaan Excel maupun teks biasa.
     */
    private function toDate(mixed $value): string
    {
        if ($value === null || $value === '') {
            return now()->format('Y-m-d');
        }

        if (is_numeric($value)) {
            // Serial Excel dihitung dari 30 Desember 1899.
            return \Carbon\CarbonImmutable::create(1899, 12, 30)->addDays((int) $value)->format('Y-m-d');
        }

        try {
            return \Carbon\CarbonImmutable::parse((string) $value)->format('Y-m-d');
        } catch (\Throwable) {
            return (string) $value; // Biar ditolak validator dengan pesan yang jelas.
        }
    }
}
