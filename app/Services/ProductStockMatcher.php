<?php

namespace App\Services;

use App\Models\MasterStock;

class ProductStockMatcher
{
    /**
     * Kamus singkatan seri model / artikel pabrik.
     */
    public const ARTICLE_ALIASES = [
        'SPK' => ['SUPER KIDS', 'SUPERKIDS', 'SPK'],
        'SMK' => ['SMART KIDS', 'SMARTKIDS', 'SMK'],
    ];

    /**
     * Kamus kode warna ke teks nama warna di Master Stock.
     */
    public const COLOR_ALIASES = [
        'MH'  => ['MERAH/HITAM', 'MERAH-HITAM', 'MERAH HITAM', 'HTM/MRH', 'HITAM/MERAH'],
        'HM'  => ['HITAM/MERAH', 'HITAM-MERAH', 'HITAM MERAH'],
        'HP'  => ['HITAM/PUTIH', 'HITAM-PUTIH', 'HITAM PUTIH', 'HTM/PTH'],
        'HH'  => ['HITAM/HITAM', 'HITAM-HITAM', 'HITAM HITAM', 'FULL BLACK', 'HITAM'],
        'PH'  => ['PUTIH/HITAM', 'PUTIH-HITAM', 'PUTIH HITAM'],
        'BH'  => ['BIRU/HITAM', 'BIRU-HITAM', 'BIRU HITAM'],
        'BM'  => ['BIRU/MERAH', 'BIRU-MERAH', 'BIRU MERAH'],
        'BA'  => ['BR TUA/ABU', 'BIRU/ABU', 'BIRU ABU', 'BIRU-ABU'],
        'HA'  => ['HITAM/ABU', 'HITAM-ABU', 'HITAM ABU'],
        'BO'  => ['BR TUA/ORANYE', 'BIRU/ORANYE', 'BIRU ORANYE', 'BIRU-ORANYE'],
        'MO'  => ['MERAH/ORANYE', 'MERAH-ORANYE', 'MERAH ORANYE'],
        'SB'  => ['SITRUN/BIRU', 'SPIDER/BIRU', 'SILVER/BIRU', 'SITRUN BIRU'],
        'AB'  => ['ABU', 'ABU-ABU', 'ABU ABU'],
        'HU'  => ['HITAM/UNGU', 'HITAM-UNGU', 'HITAM UNGU'],
        'PA'  => ['PUTIH/ABU', 'PUTIH-ABU', 'PUTIH ABU'],
        'PB'  => ['PUTIH/BIRU', 'PUTIH-BIRU', 'PUTIH BIRU'],
        'FP'  => ['FUCHSIA/PUTIH', 'PINK/PUTIH', 'FUCHSIA PUTIH', 'PINK PUTIH'],
        'HPM' => ['HITAM/PUTIH/MERAH', 'HITAM-PUTIH-MERAH'],
        'HHA' => ['HITAM/HITAM/ABU', 'HITAM-HITAM-ABU'],
        'H'   => ['HITAM'],
        'P'   => ['PUTIH'],
        'M'   => ['MERAH'],
        'B'   => ['BIRU'],
        'K'   => ['APRICOT', 'KREM', 'KUNING', 'KHAKI', 'CREAM'],
        'C'   => ['COKLAT', 'BROWN'],
        'HJ'  => ['HIJAU', 'GREEN'],
    ];

    /**
     * Parsing komponen SKU menjadi Artikel, Warna, dan Ukuran.
     * Format umum: [PREFIX-]<ARTIKEL>-<WARNA>-<UKURAN>[_KODE8DIGIT]
     */
    public static function parseSku(string $sku, ?string $modelName = null, ?string $itemName = null): array
    {
        $normSku = strtoupper(trim($sku));
        // Buang awalan merk seperti RECORD-
        $clean = preg_replace('/^(RECORD|SPT|SEPATU|R\.)[-_ ]+/i', '', $normSku);
        // Buang akhiran kode internal angka misal _01239840
        $clean = preg_replace('/_0*\d{6,8}$/i', '', $clean);

        // Ekstrak ukuran 2 digit (rentang 20 s/d 49)
        $size = null;
        if (preg_match('/[-_ ](2[0-9]|3[0-9]|4[0-9])$/', $clean, $m)) {
            $size = $m[1];
            $cleanWithoutSize = preg_replace('/[-_ ]' . $size . '$/', '', $clean);
        } else {
            $cleanWithoutSize = $clean;
        }

        // Jika ukuran belum ketemu di SKU, cari di model_name (misal "Hitam Putih, 40 (25.0cm)")
        if (! $size && $modelName && preg_match('/(2[0-9]|3[0-9]|4[0-9])/', $modelName, $m)) {
            $size = $m[1];
        }

        $tokens = preg_split('/[-_ ]+/', $cleanWithoutSize);
        $colorCode = null;
        $articleToken = null;

        if (count($tokens) >= 2) {
            $lastToken = end($tokens);
            if (isset(self::COLOR_ALIASES[$lastToken])) {
                $colorCode = $lastToken;
                array_pop($tokens);
                $articleToken = implode('-', $tokens);
            }
        }

        if (! $colorCode && $modelName) {
            $mUpper = strtoupper($modelName);
            $patterns = [
                'HP'  => ['HITAM', 'PUTIH'],
                'HH'  => ['HITAM', 'HITAM'],
                'MH'  => ['MERAH', 'HITAM'],
                'HM'  => ['HITAM', 'MERAH'],
                'PH'  => ['PUTIH', 'HITAM'],
                'BO'  => ['ORANYE'],
                'BA'  => ['ABU'],
                'FP'  => ['FUCHSIA'],
                'K'   => ['APRICOT'],
                'C'   => ['COKLAT'],
            ];
            foreach ($patterns as $cCode => $words) {
                $allMatch = true;
                foreach ($words as $w) {
                    if (! str_contains($mUpper, $w)) {
                        $allMatch = false;
                        break;
                    }
                }
                if ($allMatch) {
                    $colorCode = $cCode;
                    break;
                }
            }
        }

        if (! $articleToken) {
            $articleToken = $tokens[0] ?? '';
        }

        $rawArticle = strtoupper(trim($articleToken));
        $expandedArticles = [];

        if (preg_match('/^(?:SUPER[\s\-_]*KIDS|SPK)\s*(\d+[A-Z]?)/i', $rawArticle, $am)) {
            $num = $am[1];
            $numClean = ltrim($num, '0');
            $expandedArticles = [
                "SUPER KIDS {$num}",
                "SUPER KIDS {$numClean}",
                "SUPERKIDS {$num}",
                "SUPER KIDS{$num}",
                "SPK {$num}",
                "SPK{$num}",
            ];
        } elseif (preg_match('/^(?:SMART[\s\-_]*KIDS|SMK)\s*(\d+[A-Z]?)/i', $rawArticle, $am)) {
            $num = $am[1];
            $numClean = ltrim($num, '0');
            $expandedArticles = [
                "SMART KIDS {$num}",
                "SMART KIDS {$numClean}",
                "SMARTKIDS {$num}",
                "SMART KIDS{$num}",
                "SMK {$num}",
                "SMK{$num}",
            ];
        } else {
            $expandedArticles = [$rawArticle];
        }

        return [
            'raw_sku'           => $sku,
            'article_raw'       => $rawArticle,
            'expanded_articles' => $expandedArticles,
            'color_code'        => $colorCode,
            'color_keywords'    => $colorCode ? (self::COLOR_ALIASES[$colorCode] ?? []) : [],
            'size'              => $size,
        ];
    }

    /**
     * Bersihkan kata noise dari nama barang di Master Stock agar mudah dicocokkan.
     */
    public static function cleanMasterItemName(string $name): string
    {
        $n = strtoupper(trim($name));
        $n = preg_replace('/\b(SPT|SEPATU|R\.|RECORD|SHOES|SANDAL)\b/i', ' ', $n);
        $n = str_replace(['(', ')', '[', ']', '{', '}'], ' ', $n);
        $n = preg_replace('/\s+/', ' ', $n);
        return trim($n);
    }

    /**
     * Cek apakah parsed SKU cocok dengan serian barang di Gudang A.
     */
    public static function matchMasterStockSerian(array $parsedSku, string $masterName): bool
    {
        $cleanMaster = self::cleanMasterItemName($masterName);

        // 1. Cek kecocokan artikel
        $articleMatched = false;
        foreach ($parsedSku['expanded_articles'] as $art) {
            if ($art !== '' && stripos($cleanMaster, $art) !== false) {
                $articleMatched = true;
                break;
            }
        }
        if (! $articleMatched) {
            return false;
        }

        // 2. Cek kecocokan warna (jika ada kode warna)
        if (! empty($parsedSku['color_keywords'])) {
            $colorMatched = false;
            foreach ($parsedSku['color_keywords'] as $kw) {
                if (stripos($cleanMaster, $kw) !== false) {
                    $colorMatched = true;
                    break;
                }
            }
            if (! $colorMatched) {
                return false;
            }
        }

        return true;
    }

    /**
     * Hitung jumlah varian ukuran unik per parent item_id dari daftar produk.
     * Mengembalikan array associative: [item_id => int count_sizes].
     */
    public static function countDistinctSizesPerItem(iterable $products): array
    {
        $sizesByItem = [];
        $totalByItem = [];

        foreach ($products as $p) {
            $itemId = (string) $p->item_id;
            $totalByItem[$itemId] = ($totalByItem[$itemId] ?? 0) + 1;

            $sku = (string) ($p->sku ?? '');
            $model = (string) ($p->model_name ?? '');

            $size = null;
            if (preg_match('/[-_ ](2[0-9]|3[0-9]|4[0-9])(?:_\d+)?$/', $sku, $m)) {
                $size = $m[1];
            } elseif (preg_match('/(2[0-9]|3[0-9]|4[0-9])/', $model, $m)) {
                $size = $m[1];
            }

            if ($size !== null) {
                $sizesByItem[$itemId][$size] = true;
            }
        }

        $result = [];
        foreach ($totalByItem as $itemId => $total) {
            $distinctSizeCount = isset($sizesByItem[$itemId]) ? count($sizesByItem[$itemId]) : 0;
            // Jika terdeteksi ukuran unik >= 2, gunakan ukuran unik. Jika tidak, gunakan total varian (default 6)
            $result[$itemId] = ($distinctSizeCount >= 2) ? $distinctSizeCount : max(4, min(12, $total ?: 6));
        }

        return $result;
    }

    /**
     * Membangun indexed lookup maps dari MasterStock untuk pencocokan O(1).
     */
    public static function buildMasterStockMaps(iterable $masterStocks): array
    {
        $gMap = [];
        $aMap = [];
        $aPrefixMap = [];
        $masterByCode = [];
        $smartIndex = [];
        $aSerianItems = [];

        foreach ($masterStocks as $ms) {
            $code = strtoupper(trim((string) $ms->item_code));
            if ($code === '') {
                continue;
            }

            $unpadded = ltrim($code, '0');
            $padded8  = str_pad($unpadded !== '' ? $unpadded : $code, 8, '0', STR_PAD_LEFT);

            if (! isset($masterByCode[$code])) {
                $masterByCode[$code] = $ms;
            }
            if ($unpadded !== '' && ! isset($masterByCode[$unpadded])) {
                $masterByCode[$unpadded] = $ms;
            }
            if (! isset($masterByCode[$padded8])) {
                $masterByCode[$padded8] = $ms;
            }

            $qtyPcs = (int) $ms->qty_pcs;

            if ($ms->warehouse === 'G') {
                $gMap[$code] = ($gMap[$code] ?? 0) + $qtyPcs;
                if ($unpadded !== '') {
                    $gMap[$unpadded] = ($gMap[$unpadded] ?? 0) + $qtyPcs;
                }
                $gMap[$padded8] = ($gMap[$padded8] ?? 0) + $qtyPcs;
            } elseif ($ms->warehouse === 'A') {
                $aMap[$code] = ($aMap[$code] ?? 0) + $qtyPcs;
                if ($unpadded !== '') {
                    $aMap[$unpadded] = ($aMap[$unpadded] ?? 0) + $qtyPcs;
                }
                $aMap[$padded8] = ($aMap[$padded8] ?? 0) + $qtyPcs;

                // Index prefix 6 digit (kode artikel)
                if (strlen($padded8) >= 6) {
                    $prefix = substr($padded8, 0, 6);
                    $aPrefixMap[$prefix] = ($aPrefixMap[$prefix] ?? 0) + $qtyPcs;
                }
                if (strlen($code) >= 6) {
                    $prefix = substr($code, 0, 6);
                    $aPrefixMap[$prefix] = ($aPrefixMap[$prefix] ?? 0) + $qtyPcs;
                }

                // Simpan serian item Gudang A untuk pencocokan cerdas lusinan
                $aSerianItems[] = [
                    'item_code'  => $ms->item_code,
                    'item_name'  => (string) $ms->item_name,
                    'clean_name' => self::cleanMasterItemName((string) $ms->item_name),
                    'raw_qty'    => (float) $ms->raw_qty,
                    'qty_pcs'    => $qtyPcs,
                    'unit'       => strtoupper((string) $ms->unit),
                ];
            }

            // Index untuk Smart Candidate Eceran (Gudang G) berbasis Article_Size
            $nameUpper = strtoupper(trim((string) $ms->item_name));
            if (preg_match('/[\s\-_](2[0-9]|3[0-9]|4[0-9])$/', $nameUpper, $sm)) {
                $size = $sm[1];
                $parts = preg_split('/[\s\-]+/', self::cleanMasterItemName($nameUpper));
                $article = $parts[0] ?? null;
                if ($article && strlen($article) >= 3) {
                    $key = $article . '_' . $size;
                    $smartIndex[$key][] = $ms;
                }
            }
        }

        return [
            'masterByCode' => $masterByCode,
            'gMap'         => $gMap,
            'aMap'         => $aMap,
            'aPrefixMap'   => $aPrefixMap,
            'smartIndex'   => $smartIndex,
            'aSerianItems' => $aSerianItems,
        ];
    }

    /**
     * Resolusi cepat stok produk marketplace (Shopee / TikTok) dengan logika lusinan Gudang A.
     *
     * @param object $p Model produk (ShopeeProduct / TiktokProduct)
     * @param array $maps Hasil dari buildMasterStockMaps()
     * @param string $warehouse Pilihan gudang ('ALL', 'G', atau 'A')
     * @param int|null $variantCount Jumlah varian ukuran dari produk ini (misal 6 atau 4)
     */
    public static function resolveStockInfo(
        object $p,
        array $maps,
        string $warehouse = 'ALL',
        ?int $variantCount = null
    ): array {
        $masterByCode = $maps['masterByCode'] ?? [];
        $gMap         = $maps['gMap'] ?? [];
        $aMap         = $maps['aMap'] ?? [];
        $aPrefixMap   = $maps['aPrefixMap'] ?? [];
        $smartIndex   = $maps['smartIndex'] ?? [];
        $aSerianItems = $maps['aSerianItems'] ?? [];

        $normSku = strtoupper(trim((string) $p->sku));
        $manualCode = strtoupper(trim((string) ($p->manual_item_code ?? '')));
        $internalCode = null;
        $matchType = 'CODE_NOT_FOUND';
        $warningMessage = null;
        $suggestedCode = null;
        $suggestedName = null;
        $isSafeToZero = true;

        // 1. Ekstrak kode internal angka jika ada
        if (! empty($manualCode)) {
            $internalCode = $manualCode;
            $matchType = 'MANUAL_MAPPED';
        } elseif (preg_match('/_(\d{6,8})(?:\D|$)/i', $normSku, $m)) {
            $internalCode = $m[1];
        } elseif (preg_match('/(?:\D|^)(\d{8})(?:\D|$)/', $normSku, $m)) {
            $internalCode = $m[1];
        } elseif (preg_match('/(?:\D|^)(\d{7})(?:\D|$)/', $normSku, $m)) {
            $internalCode = $m[1];
        }

        $paddedCode = $internalCode ? str_pad($internalCode, 8, '0', STR_PAD_LEFT) : null;
        $unpaddedCode = $internalCode ? ltrim($internalCode, '0') : null;

        $exactItem = $internalCode
            ? ($masterByCode[$internalCode] ?? $masterByCode[$paddedCode] ?? ($unpaddedCode !== '' ? ($masterByCode[$unpaddedCode] ?? null) : null))
            : null;

        $stockG = 0;
        $stockA = 0;
        $matchedCode = null;

        if (! empty($exactItem)) {
            if ($matchType !== 'MANUAL_MAPPED') {
                $matchType = 'EXACT_CODE';
            }
            $matchedCode = $exactItem->item_code;
            $stockG = $gMap[$internalCode] ?? $gMap[$paddedCode] ?? ($unpaddedCode !== '' ? ($gMap[$unpaddedCode] ?? 0) : 0);
            $stockA = $aMap[$internalCode] ?? $aMap[$paddedCode] ?? ($unpaddedCode !== '' ? ($aMap[$unpaddedCode] ?? 0) : 0);
        }

        // Tentukan jumlah varian ukuran untuk pembagian lusinan (default 6, atau sesuai hitungan parent)
        $numVariants = ($variantCount && $variantCount >= 2) ? $variantCount : 6;

        // 2. Jika Gudang A masih 0, terapkan Logika Lusinan Serian Gudang A ($12 / N)
        if ($stockA === 0) {
            $prefixMatched = false;

            // Coba lewat 6 digit prefix (kode artikel)
            if ($internalCode && strlen($internalCode) >= 6) {
                $prefix = substr($paddedCode, 0, 6);
                $stockAFromPrefix = $aMap[$prefix . '00'] ?? ($aPrefixMap[$prefix] ?? 0);
                if ($stockAFromPrefix > 0) {
                    // Bagi total pcs serian dengan jumlah varian ukuran
                    $allocated = (int) round($stockAFromPrefix / $numVariants);
                    $stockA = max(1, $allocated);
                    $lsnQty = round($stockAFromPrefix / 12, 1);
                    $matchedCode = $matchedCode ?: ($prefix . " (A Lusin: {$lsnQty} Lsn / {$numVariants} Size)");
                    $matchType = ($matchType === 'EXACT_CODE') ? 'EXACT_CODE' : 'SMART_MATCH';
                    $prefixMatched = true;
                }
            }

            // Jika belum ketemu lewat prefix, gunakan Pendeteksi Cerdas Nama & Warna
            if (! $prefixMatched && ! empty($aSerianItems)) {
                $parsedSku = self::parseSku($normSku, (string) ($p->model_name ?? ''), (string) ($p->item_name ?? ''));
                foreach ($aSerianItems as $serian) {
                    if (self::matchMasterStockSerian($parsedSku, $serian['item_name'])) {
                        $totalPcs = $serian['qty_pcs'];
                        $lsnQty = $serian['raw_qty'] > 0 ? $serian['raw_qty'] : round($totalPcs / 12, 1);
                        // Hitung pasang per varian ukuran: 40 lusin / 6 ukuran = 80 pasang
                        $allocated = (int) round($totalPcs / $numVariants);
                        $stockA = max(0, $allocated);

                        $matchedCode = $serian['item_code'] . " (A Lusin: {$lsnQty} Lsn / {$numVariants} Size)";
                        $matchType = 'SMART_MATCH';
                        $suggestedCode = $serian['item_code'];
                        $suggestedName = $serian['item_name'];
                        $warningMessage = "Cocok Cerdas Gudang A: {$lsnQty} Lsn dibagi ke {$numVariants} varian ukuran ({$stockA} pasang)";
                        break;
                    }
                }
            }
        }

        // 3. Fallback jika Gudang G belum terdeteksi (pencocokan nama eceran)
        if ($stockG === 0 && ! $matchedCode) {
            $parsedSku = self::parseSku($normSku, (string) ($p->model_name ?? ''), (string) ($p->item_name ?? ''));
            if ($parsedSku['size'] && ! empty($parsedSku['expanded_articles'])) {
                foreach ($parsedSku['expanded_articles'] as $art) {
                    $key = $art . '_' . $parsedSku['size'];
                    if (! empty($smartIndex[$key])) {
                        $cand = $smartIndex[$key][0];
                        $stockG = $gMap[$cand->item_code] ?? 0;
                        $matchedCode = $cand->item_code;
                        $matchType = 'SMART_MATCH';
                        $suggestedCode = $cand->item_code;
                        $suggestedName = $cand->item_name;
                        break;
                    }
                }
            }
        }

        // 4. Hitung Total Stok Gudang Fisik Sesuai Filter
        $whStock = match ($warehouse) {
            'G'     => $stockG,
            'A'     => $stockA,
            default => $stockG + $stockA,
        };

        $currentStock = (int) ($p->stock ?? 0);
        $reservedStock = (int) ($p->reserved_stock ?? 0);
        $diff = $whStock - $currentStock;
        $wasCampaignLocked = (bool) ($p->was_campaign_locked ?? false);

        $isCriticalOos = ($whStock <= 0 && $currentStock > 0);
        $isCampaignLocked = $wasCampaignLocked && ((int) ($p->locked_campaign_qty ?? 0) > 0);
        $isCampaignUnlocked = $isCriticalOos && ! $isCampaignLocked;

        $status = 'UNMATCHED';
        if ($matchedCode) {
            if ($diff === 0) {
                $status = 'MATCHED';
            } elseif ($whStock <= 0 && $currentStock > 0) {
                $status = 'CRITICAL';
            } elseif ($whStock < $currentStock) {
                $status = 'LOW_STOCK';
            } else {
                $status = 'DISCREPANCY';
            }
        }

        return [
            'warehouse_stock'      => $whStock,
            'stock_g'              => $stockG,
            'stock_a'              => $stockA,
            'marketplace_stock'    => $currentStock,
            'shopee_stock'         => $currentStock,
            'tiktok_stock'         => $currentStock,
            'reserved_stock'       => $reservedStock,
            'diff'                 => $diff,
            'status'               => $status,
            'matched_code'         => $matchedCode,
            'match_type'           => $matchType,
            'is_critical_oos'      => $isCriticalOos,
            'is_campaign_locked'   => $isCampaignLocked,
            'is_campaign_unlocked' => $isCampaignUnlocked,
            'suggested_code'       => $suggestedCode,
            'suggested_name'       => $suggestedName,
            'warning_message'      => $warningMessage ?? ($isCriticalOos ? 'Stok fisik gudang 0 pcs tetapi produk masih dijual di marketplace!' : null),
            'is_safe_to_zero'      => $isCriticalOos && empty($stockA),
        ];
    }
}
