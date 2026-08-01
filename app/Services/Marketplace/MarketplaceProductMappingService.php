<?php

namespace App\Services\Marketplace;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceProductMapping;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class MarketplaceProductMappingService
{
    /**
     * Create a new product mapping.
     */
    public function create(MarketplaceAccount $account, array $data, int $userId): MarketplaceProductMapping
    {
        return DB::transaction(function () use ($account, $data, $userId) {
            $existing = MarketplaceProductMapping::where('marketplace_account_id', $account->id)
                ->where('external_sku', $data['external_sku'])
                ->lockForUpdate()
                ->first();

            if ($existing) {
                throw new InvalidArgumentException(
                    "SKU marketplace '{$data['external_sku']}' sudah memiliki mapping pada akun ini."
                );
            }

            return MarketplaceProductMapping::create([
                'marketplace_account_id' => $account->id,
                'marketplace'            => $account->marketplace,
                'external_product_id'    => $data['external_product_id'] ?? null,
                'external_sku'           => $data['external_sku'],
                'product_id'             => $data['product_id'],
                'external_product_name'  => $data['external_product_name'] ?? null,
                'status'                 => 'active',
                'created_by'             => $userId,
            ]);
        });
    }

    /**
     * Update an existing mapping.
     */
    public function update(MarketplaceProductMapping $mapping, array $data): MarketplaceProductMapping
    {
        $mapping->update([
            'external_product_id'   => $data['external_product_id'] ?? $mapping->external_product_id,
            'product_id'            => $data['product_id'],
            'external_product_name' => $data['external_product_name'] ?? $mapping->external_product_name,
            'status'                => $data['status'] ?? $mapping->status,
        ]);

        return $mapping->fresh();
    }

    /**
     * Deactivate a mapping.
     */
    public function deactivate(MarketplaceProductMapping $mapping): MarketplaceProductMapping
    {
        $mapping->update(['status' => 'inactive']);
        return $mapping->fresh();
    }

    /**
     * Hard delete a mapping (only if inactive).
     */
    public function delete(MarketplaceProductMapping $mapping): void
    {
        $mapping->delete();
    }
}
