<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CutOffReturn extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'cut_off_returns';

    protected $fillable = [
        'no_urut',
        'marketplace',
        'tgl_input_mp',
        'nama_barang_mp',
        'jml_produk_mp',
        'no_invoice_mp',
        'no_invoice_baru',
        'no_retur',
        'tgl_rj',
        'tgl_terima_brg',
        'nama_barang_fisik',
        'jml_brg_fisik',
        'keterangan',
        'barcode',
        'tgl_banding',
        'no_pengajuan',
        'no_pesanan_baru',
    ];

    protected $casts = [
        'tgl_input_mp'    => 'date',
        'tgl_rj'          => 'date',
        'tgl_terima_brg'  => 'date',
        'no_urut'         => 'integer',
        'jml_produk_mp'   => 'integer',
        'jml_brg_fisik'   => 'integer',
    ];

    /**
     * Scope filter pencarian & marketplace.
     */
    public function scopeFilter($query, array $filters)
    {
        $query->when($filters['search'] ?? null, function ($q, $search) {
            $term = trim((string) $search);
            if ($term === '') {
                return;
            }

            $q->where(function ($sub) use ($term) {
                $sub->where('no_invoice_baru', 'like', "%{$term}%")
                    ->orWhere('no_pesanan_baru', 'like', "%{$term}%")
                    ->orWhere('no_invoice_mp', 'like', "%{$term}%")
                    ->orWhere('no_retur', 'like', "%{$term}%")
                    ->orWhere('no_pengajuan', 'like', "%{$term}%")
                    ->orWhere('nama_barang_mp', 'like', "%{$term}%")
                    ->orWhere('nama_barang_fisik', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhere('keterangan', 'like', "%{$term}%")
                    ->orWhere('tgl_banding', 'like', "%{$term}%");

                if (is_numeric($term)) {
                    $sub->orWhere('no_urut', (int) $term);
                }
            });
        });

        $query->when($filters['marketplace'] ?? null, function ($q, $mp) {
            if ($mp !== 'all' && $mp !== '') {
                $q->where('marketplace', $mp);
            }
        });

        $query->when($filters['date_from'] ?? null, function ($q, $date) {
            $q->where('tgl_terima_brg', '>=', $date);
        });

        $query->when($filters['date_to'] ?? null, function ($q, $date) {
            $q->where('tgl_terima_brg', '<=', $date);
        });

        return $query;
    }
}

