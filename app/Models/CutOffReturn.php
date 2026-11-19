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
        'due_date',
        'return_status',
        'needs_action',
        'refund_amount',
        'seller_solution',
    ];

    protected $appends = [
        'seller_center_url',
    ];

    protected $casts = [
        'tgl_input_mp'    => 'date',
        'tgl_rj'          => 'date',
        'tgl_terima_brg'  => 'date',
        'due_date'        => 'datetime',
        'needs_action'    => 'boolean',
        'refund_amount'   => 'float',
        'no_urut'         => 'integer',
        'jml_produk_mp'   => 'integer',
        'jml_brg_fisik'   => 'integer',
    ];

    /**
     * Link langsung ke kasus retur/sengketa di Shopee atau TikTok Seller Center.
     */
    public function getSellerCenterUrlAttribute(): ?string
    {
        $mp = strtoupper(trim((string) ($this->attributes['marketplace'] ?? $this->marketplace ?? '')));
        $noRetur = trim((string) ($this->attributes['no_retur'] ?? $this->no_retur ?? ''));
        $noInv   = trim((string) ($this->attributes['no_invoice_mp'] ?? $this->no_invoice_mp ?? ''));
        $keyword = $noRetur ?: $noInv;
        if (! $keyword) {
            return null;
        }

        if ($mp === 'SH' || str_contains($mp, 'SHOPEE')) {
            return 'https://seller.shopee.co.id/portal/sale/return?keyword=' . urlencode($keyword);
        }

        if ($mp === 'TT' || str_contains($mp, 'TIKTOK')) {
            return 'https://seller-id.tiktok.com/order/reverse-order?search=' . urlencode($keyword);
        }

        return null;
    }

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

        $query->when($filters['needs_action'] ?? null, function ($q, $needsAction) {
            if ($needsAction === '1' || $needsAction === true || $needsAction === 'true') {
                try {
                    if (\Illuminate\Support\Facades\Schema::hasColumn('cut_off_returns', 'needs_action')) {
                        $q->where('needs_action', true);
                    }
                } catch (\Throwable) {
                    // Abaikan jika tabel atau kolom belum tersedia
                }
            }
        });

        return $query;
    }
}

