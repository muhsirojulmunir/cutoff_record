<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Catatan folder Google Drive per minggu — dipakai agar folder yang sama
 * tidak dibuat berulang kali saat unggah bukti pembayaran.
 */
class DriveWeekFolder extends Model
{
    protected $fillable = [
        'period_start',
        'period_end',
        'folder_name',
        'folder_id',
        'folder_link',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end'   => 'date',
    ];
}
