<?php

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use App\Models\User;
use Illuminate\Database\Seeder;

class ExpenseCategorySeeder extends Seeder
{
    public function run(): void
    {
        $superAdmin = User::where('email', 'superadmin@company.com')->first();
        $userId = $superAdmin ? $superAdmin->id : 1;

        $categories = [
            ['code' => 'ATK', 'name' => 'ATK / Alat Tulis Kantor', 'description' => 'Pembelian ATK dan keperluan kantor lainnya'],
            ['code' => 'TRN', 'name' => 'Transportasi', 'description' => 'Biaya bahan bakar, tol, parkir, dan perjalanan dinas'],
            ['code' => 'KRR', 'name' => 'Kurir & Logistik', 'description' => 'Biaya pengiriman barang, kurir instan, ekspedisi'],
            ['code' => 'KNS', 'name' => 'Konsumsi', 'description' => 'Biaya makan, minum, rapat, dan konsumsi kantor'],
            ['code' => 'OPR', 'name' => 'Operasional', 'description' => 'Biaya utilitas, listrik, air, internet, dan operasional lainnya'],
            ['code' => 'MNT', 'name' => 'Maintenance / Perawatan', 'description' => 'Biaya service AC, perbaikan gedung, perawatan aset'],
            ['code' => 'MKT', 'name' => 'Marketing / Pemasaran', 'description' => 'Biaya iklan, event, brosur, promosi'],
            ['code' => 'OTH', 'name' => 'Lainnya', 'description' => 'Biaya pengeluaran tak terduga lainnya'],
        ];

        foreach ($categories as $cat) {
            ExpenseCategory::firstOrCreate(
                ['code' => $cat['code']],
                [
                    'name' => $cat['name'],
                    'description' => $cat['description'],
                    'status' => 'active',
                    'created_by' => $userId,
                ]
            );
        }
    }
}
