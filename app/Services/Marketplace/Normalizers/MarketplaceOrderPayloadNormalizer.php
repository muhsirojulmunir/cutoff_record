<?php

namespace App\Services\Marketplace\Normalizers;

use App\DTOs\Marketplace\NormalizedMarketplaceOrder;
use App\Models\MarketplaceAccount;

interface MarketplaceOrderPayloadNormalizer
{
    /**
     * Normalize a single order payload from raw marketplace API response into NormalizedMarketplaceOrder DTO.
     */
    public function normalize(MarketplaceAccount $account, array $rawOrder): NormalizedMarketplaceOrder;
}
