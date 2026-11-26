<?php

namespace App\Http\Controllers;

use App\Models\CutOffOrder;
use App\Models\ShopeeAccount;
use App\Services\ShopeeSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;

class CutOffOrderController extends Controller
{
    /**
     * Tampilkan data tabel Cut Off Orders dengan filter dan metrik.
     */
    public function index(Request $request): Response
    {
        $this->ensureProcessedAtColumnReady();

        $filters = $request->only([
            'search',
            'channel',
            'info_gudang',
            'order_status',
            'dpp_status',
            'shipping_courier',
            'shipping_tier',
            'date_from',
            'date_to',
            'per_page',
        ]);

        $perPage = (int) ($filters['per_page'] ?? 25);
        if (!in_array($perPage, [15, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $orders = CutOffOrder::query()
            ->onlyProcessed()
            ->filter($filters)
            ->orderByRaw('COALESCE(processed_at, order_date) desc')
            ->orderBy('id', 'desc')
            ->paginate($perPage)
            ->withQueryString();

        // Metrik Ringkasan Utama + Dropdown Filter (di-cache 30 detik & auto-invalidate saat ada perubahan data)
        $todayWib = \Carbon\Carbon::now('Asia/Jakarta');
        $todayStart = $todayWib->toDateString();
        $cacheVer = CutOffOrder::getCacheVersion();

        $computeOverview = static function () use ($todayStart, $todayWib): array {
            $rawSummary = CutOffOrder::query()
                ->onlyProcessed()
                ->selectRaw(
                    "COUNT(*) as total_orders,
                    COALESCE(SUM(qty), 0) as total_items_qty,
                    COUNT(CASE WHEN order_status LIKE '%RJ%' OR order_status LIKE '%Retur%' THEN 1 END) as total_rj,
                    COUNT(CASE WHEN dpp_number IS NOT NULL AND dpp_number != '' THEN 1 END) as total_has_dpp,
                    COUNT(CASE WHEN info_gudang LIKE '%READY%' THEN 1 END) as total_ready,
                    COUNT(CASE WHEN info_gudang LIKE '%OOS%' OR info_gudang LIKE '%KOSONG%' THEN 1 END) as total_oos,
                    COUNT(CASE WHEN info_gudang LIKE '%SUBSTITUSI%' THEN 1 END) as total_substitusi,
                    COUNT(CASE WHEN jl_number IS NOT NULL AND jl_number != '' THEN 1 END) as total_has_resi,
                    COALESCE(SUM(est_net_income), 0) as total_est_income,
                    COALESCE(SUM(marketplace_net_payout), 0) as total_net_payout"
                )
                ->first();

            // Pesanan Harian: murni mengacu ke pesanan Cut Off (CutOffOrder) yang telah diproses
            // Menghitung berapa produk yang laku (SUM qty produk non-batal) dan berapa pesanan (COUNT DISTINCT order_number)
            $hasTodayOrders = CutOffOrder::query()
                ->onlyProcessed()
                ->whereDate(DB::raw('COALESCE(processed_at, order_date)'), $todayStart)
                ->exists();

            if ($hasTodayOrders) {
                $targetDailyDate = $todayStart;
                $dailyDateLabel  = $todayWib->copy()->locale('id')->translatedFormat('d M Y');
            } else {
                $latestDate = CutOffOrder::query()
                    ->onlyProcessed()
                    ->whereNotNull(DB::raw('COALESCE(processed_at, order_date)'))
                    ->whereDate(DB::raw('COALESCE(processed_at, order_date)'), '<=', $todayStart)
                    ->max(DB::raw('DATE(COALESCE(processed_at, order_date))'));

                $targetDailyDate = $latestDate ?: $todayStart;
                $dailyDateLabel  = \Carbon\Carbon::parse($targetDailyDate)->locale('id')->translatedFormat('d M Y');
            }

            $dailyStats = CutOffOrder::query()
                ->onlyProcessed()
                ->whereDate(DB::raw('COALESCE(processed_at, order_date)'), $targetDailyDate)
                ->where(function ($q) {
                    $q->whereNull('order_status')
                      ->orWhere(function ($s) {
                          $s->where('order_status', 'not like', '%Batal%')
                            ->where('order_status', 'not like', '%Cancel%')
                            ->where('order_status', 'not like', '%RJ%')
                            ->where('order_status', 'not like', '%Retur%');
                      });
                })
                ->selectRaw(
                    'COALESCE(SUM(qty), 0) as total_products,
                     COUNT(DISTINCT COALESCE(NULLIF(order_number, \'\'), CAST(id AS CHAR))) as total_orders'
                )
                ->first();

            $dailyProducts = (int) ($dailyStats->total_products ?? 0);
            $dailyOrders   = (int) ($dailyStats->total_orders ?? 0);

            $summary = [
                'total_orders'      => (int) ($rawSummary->total_orders ?? 0),
                'total_items_qty'   => (int) ($rawSummary->total_items_qty ?? 0),
                'daily_products'    => $dailyProducts,
                'daily_orders'      => $dailyOrders,
                'daily_date_label'  => $dailyDateLabel,
                'total_rj'          => (int) ($rawSummary->total_rj ?? 0),
                'total_has_dpp'     => (int) ($rawSummary->total_has_dpp ?? 0),
                'total_ready'       => (int) ($rawSummary->total_ready ?? 0),
                'total_oos'         => (int) ($rawSummary->total_oos ?? 0),
                'total_substitusi'  => (int) ($rawSummary->total_substitusi ?? 0),
                'total_has_resi'    => (int) ($rawSummary->total_has_resi ?? 0),
                'total_est_income'  => (float) ($rawSummary->total_est_income ?? 0),
                'total_net_payout'  => (float) ($rawSummary->total_net_payout ?? 0),
            ];

            $channels = CutOffOrder::query()
                ->onlyProcessed()
                ->select('channel', DB::raw('count(*) as count'))
                ->groupBy('channel')
                ->orderByDesc('count')
                ->get()
                ->map(fn ($item) => [
                    'name'  => (string) ($item->channel ?? ''),
                    'count' => (int) ($item->count ?? 0),
                ])
                ->values()
                ->all();

            $couriers = CutOffOrder::query()
                ->onlyProcessed()
                ->whereNotNull('shipping_courier')
                ->where('shipping_courier', '!=', '')
                ->select('shipping_courier', DB::raw('count(*) as count'))
                ->groupBy('shipping_courier')
                ->orderByDesc('count')
                ->get()
                ->map(fn ($item) => [
                    'name'  => (string) ($item->shipping_courier ?? ''),
                    'count' => (int) ($item->count ?? 0),
                ])
                ->values()
                ->all();

            return [
                'summary'  => $summary,
                'channels' => $channels,
                'couriers' => $couriers,
            ];
        };

        if (app()->runningUnitTests()) {
            $overview = $computeOverview();
        } else {
            try {
                $overview = \Illuminate\Support\Facades\Cache::store('file')->remember(
                    "cut_off_overview_v4_{$cacheVer}_{$todayStart}",
                    30,
                    $computeOverview
                );
            } catch (\Throwable) {
                $overview = $computeOverview();
            }
        }

        $sanitizeList = static function ($list): array {
            if ($list instanceof \Illuminate\Support\Collection) {
                return $list->values()->all();
            }
            if (is_array($list)) {
                return array_values($list);
            }
            return [];
        };

        return Inertia::render('CutOff/Index', [
            'orders'   => $orders,
            'filters'  => ! empty($filters) ? (object) $filters : (object) ['page' => (int) $request->input('page', 1)],
            'summary'  => (array) ($overview['summary'] ?? []),
            'channels' => $sanitizeList($overview['channels'] ?? []),
            'couriers' => $sanitizeList($overview['couriers'] ?? []),
        ]);
    }

    /**
     * Ambil data Pesanan Cut Off untuk di-export menjadi file Excel (.xlsx) di frontend.
     * Hanya mengembalikan kolom ringkas sesuai kebutuhan sheet tanpa mengubah perhitungan Est. Bersih.
     */
    public function exportData(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse|JsonResponse
    {
        $this->ensureProcessedAtColumnReady();

        $filters = $request->only([
            'search',
            'channel',
            'info_gudang',
            'order_status',
            'dpp_status',
            'shipping_courier',
            'shipping_tier',
            'date_from',
            'date_to',
        ]);

        $dateFrom = $this->normalizeExportDate($filters['date_from'] ?? null);
        $dateTo   = $this->normalizeExportDate($filters['date_to'] ?? null);
        if ($dateFrom !== null && $dateTo !== null && $dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }
        $filters['date_from'] = $dateFrom;
        $filters['date_to']   = $dateTo;

        $user = $request->user();
        $roleName = $user?->role?->name;
        $canViewFinancial = $user && (
            (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) ||
            in_array($roleName, ['Super Admin', 'Direktur', 'Management'], true) ||
            $user->roles->contains(fn ($r) => in_array($r->name, ['Super Admin', 'Direktur', 'Management'], true))
        );

        $orders = CutOffOrder::query()
            ->onlyProcessed()
            ->filter($filters)
            ->select([
                'id',
                'order_date',
                'processed_at',
                'channel',
                'order_number',
                'sku_utama',
                'product_name',
                'variation_name',
                'qty',
                'buyer_username',
                'est_net_income',
                'shipping_courier',
                'financial_breakdown',
                'order_status',
            ])
            ->orderByRaw('DATE(COALESCE(processed_at, order_date)) ASC')
            ->orderByRaw("CASE WHEN UPPER(channel) LIKE 'SH%' THEN 1 WHEN UPPER(channel) LIKE 'TT%' THEN 2 ELSE 3 END ASC")
            ->orderByRaw('COALESCE(processed_at, order_date) ASC')
            ->orderBy('id', 'asc')
            ->get();

        // Lookup nama penerima TikTok dari tiktok_orders (lebih akurat dari buyer_uid)
        $ttOrderNumbers = $orders
            ->filter(fn ($o) => str_starts_with(strtoupper(trim((string) ($o->channel ?? ''))), 'TT'))
            ->pluck('order_number')
            ->unique()
            ->values()
            ->toArray();

        $ttRecipientMap = [];
        if (!empty($ttOrderNumbers)) {
            \App\Models\TiktokOrder::whereIn('order_sn', $ttOrderNumbers)
                ->get(['order_sn', 'buyer_username', 'recipient_data'])
                ->each(function ($tto) use (&$ttRecipientMap) {
                    $recipName = '';
                    if (is_array($tto->recipient_data) && !empty($tto->recipient_data['name'])) {
                        $recipName = trim((string) $tto->recipient_data['name']);
                    }
                    if ($recipName === '' && !empty($tto->buyer_username)) {
                        $bUser = trim((string) $tto->buyer_username);
                        // Jangan tampilkan buyer_uid (string panjang tanpa spasi & karakter campuran)
                        $recipName = (strlen($bUser) < 50 && !preg_match('/^[A-Za-z0-9]{30,}$/', $bUser))
                            ? $bUser : '';
                    }
                    $ttRecipientMap[$tto->order_sn] = $recipName;
                });
        }

        $headers = ['Tanggal', 'Nomor Urut', 'Platform', 'No Pesanan', 'SKU', 'Varian', 'QTY', 'Username'];
        if ($canViewFinancial) {
            $headers[] = 'Est Bersih';
        }
        $headers[] = 'Ekspedisi';
        $headers[] = 'Status';

        $rows = [];
        $no   = 1;

        foreach ($orders as $order) {
            $rawDate = $order->processed_at ?? $order->order_date;
            $formattedDate = '';
            if ($rawDate) {
                try {
                    $formattedDate = \Carbon\Carbon::parse($rawDate)->timezone('Asia/Jakarta')->format('d-m-y');
                } catch (\Throwable) {
                    $formattedDate = (string) $rawDate;
                }
            }

            $channelRaw = strtoupper(trim((string) ($order->channel ?? '')));
            $platform = match (true) {
                $channelRaw === 'SH' || str_starts_with($channelRaw, 'SH') => 'Shopee',
                $channelRaw === 'TT' || str_starts_with($channelRaw, 'TT') => 'TikTok',
                default => trim((string) ($order->channel ?? '')),
            };

            // Username: TikTok → pakai recipient name dari tiktok_orders
            $orderNumber = (string) ($order->order_number ?? '');
            if ($platform === 'TikTok' && isset($ttRecipientMap[$orderNumber]) && $ttRecipientMap[$orderNumber] !== '') {
                $rawUsername = $ttRecipientMap[$orderNumber];
            } else {
                $rawUsername = (string) ($order->buyer_username ?? '');
                if ($platform === 'TikTok' && str_contains($rawUsername, '@')) {
                    $rawUsername = explode('@', $rawUsername)[0];
                }
                // Jika masih tampak seperti buyer_uid (panjang & tanpa spasi), tampilkan '-'
                if ($platform === 'TikTok' && strlen($rawUsername) >= 25 && preg_match('/^[A-Za-z0-9]{25,}$/', $rawUsername)) {
                    $rawUsername = '-';
                }
            }

            $courier     = (string) ($order->shipping_courier ?? '');
            $isCancelled = CutOffOrder::isCancelledStatus($order->order_status ?? null);
            $statusLabel = $isCancelled ? 'Batal' : '';

            $breakdownItems = is_array($order->financial_breakdown)
                ? ($order->financial_breakdown['items'] ?? null)
                : null;

            if (is_array($breakdownItems) && count($breakdownItems) > 1) {
                foreach ($breakdownItems as $item) {
                    $itemSku = trim((string) ($item['sku'] ?? ''));
                    if ($itemSku === '' || $itemSku === '-') {
                        $itemSku = trim((string) ($order->sku_utama ?? ''));
                    }
                    $itemVarian = $this->resolveExportVarian($order, is_array($item) ? $item : null, true);
                    $itemQty = max(1, (int) ($item['qty'] ?? 1));

                    $row = [$formattedDate, $no++, $platform, $orderNumber, $itemSku, $itemVarian, $itemQty, $rawUsername];
                    if ($canViewFinancial) {
                        $row[] = (float) ($item['est_net_income'] ?? 0);
                    }
                    $row[] = $courier;
                    $row[] = $statusLabel;
                    $rows[] = ['data' => $row, 'cancelled' => $isCancelled];
                }
            } else {
                $sku = $this->resolveExportSku($order);
                $singleItem = (is_array($breakdownItems) && count($breakdownItems) === 1) ? reset($breakdownItems) : null;
                $varian = $this->resolveExportVarian($order, is_array($singleItem) ? $singleItem : null);
                $row = [$formattedDate, $no++, $platform, $orderNumber, $sku, $varian, (int) ($order->qty ?? 0), $rawUsername];
                if ($canViewFinancial) {
                    $row[] = (float) ($order->est_net_income ?? 0);
                }
                $row[] = $courier;
                $row[] = $statusLabel;
                $rows[] = ['data' => $row, 'cancelled' => $isCancelled];
            }
        }

        $dateTag = match (true) {
            $dateFrom !== null && $dateTo !== null && $dateFrom === $dateTo => $dateFrom,
            $dateFrom !== null && $dateTo !== null                          => "{$dateFrom}_sd_{$dateTo}",
            $dateFrom !== null                                              => "mulai_{$dateFrom}",
            $dateTo !== null                                                => "sampai_{$dateTo}",
            default                                                         => now('Asia/Jakarta')->format('Y-m-d'),
        };
        $fileName = "Pesanan_Cut_Off_{$dateTag}.xlsx";

        // Jika request Accept JSON (fetch lama) → kembalikan JSON plain
        if ($request->wantsJson()) {
            return response()->json([
                'headers'        => $headers,
                'rows'           => array_map(fn ($r) => $r['data'], $rows),
                'total_orders'   => count($rows),
                'file_name'      => $fileName,
                'cancelled_rows' => array_keys(array_filter($rows, fn ($r) => $r['cancelled'])),
            ]);
        }

        // Stream binary .xlsx dengan styling warna merah di baris Batal
        $xlsxBinary = $this->buildXlsx($headers, $rows);

        return response()->streamDownload(function () use ($xlsxBinary) {
            echo $xlsxBinary;
        }, $fileName, [
            'Content-Type'        => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="' . $fileName . '"',
        ]);
    }

    /**
     * Normalisasi input tanggal Y-m-d untuk filter export.
     */
    private function normalizeExportDate(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1) {
            return $trimmed;
        }
        try {
            return \Carbon\Carbon::parse($trimmed)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Ambil SKU untuk export Excel (mendukung pesanan multi-item via financial_breakdown).
     */
    private function resolveExportSku(CutOffOrder $order): string
    {
        $breakdownItems = is_array($order->financial_breakdown) ? ($order->financial_breakdown['items'] ?? null) : null;
        if (is_array($breakdownItems) && count($breakdownItems) > 1) {
            $skus = [];
            foreach ($breakdownItems as $item) {
                $candidate = trim((string) ($item['sku'] ?? ''));
                if ($candidate !== '' && $candidate !== '-' && ! in_array($candidate, $skus, true)) {
                    $skus[] = $candidate;
                }
            }
            if (! empty($skus)) {
                return implode(', ', $skus);
            }
        }

        $mainSku = trim((string) ($order->sku_utama ?? ''));
        return ($mainSku === '-' ? '' : $mainSku);
    }

    /**
     * Ambil nama varian untuk export Excel (prioritas: variation per item -> variation_name -> name/product_name).
     *
     * @param  array<string, mixed>|null  $item
     */
    private function resolveExportVarian(CutOffOrder $order, ?array $item = null, bool $isMultiItem = false): string
    {
        $candidates = [];
        if ($item !== null) {
            $candidates[] = $item['variation'] ?? null;
            if ($isMultiItem) {
                $candidates[] = $item['name'] ?? null;
            }
        }
        $candidates[] = $order->variation_name;
        if ($item !== null && ! $isMultiItem) {
            $candidates[] = $item['name'] ?? null;
        }
        $candidates[] = $order->product_name;

        foreach ($candidates as $candidate) {
            $val = trim((string) ($candidate ?? ''));
            if ($val !== '' && $val !== '-') {
                return $val;
            }
        }

        return '';
    }

    /**
     * Build native OOXML .xlsx binary dengan support styling sel merah untuk baris BATAL.
     * Tidak membutuhkan library tambahan — menggunakan ZipArchive + string XML.
     *
     * @param  string[]  $headers
     * @param  array<array{data: array, cancelled: bool}>  $rows
     */
    private function buildXlsx(array $headers, array $rows): string
    {
        // ---- Shared strings ----
        $strings = [];
        $strIndex = function (string $s) use (&$strings): int {
            if (!isset($strings[$s])) {
                $strings[$s] = count($strings);
            }
            return $strings[$s];
        };

        $xmlEsc = fn (string $v): string => htmlspecialchars($v, ENT_XML1 | ENT_COMPAT, 'UTF-8');

        // ---- Styles ----
        // styleId 0 = normal, 1 = header (bold), 2 = red text (batal),
        // 3 = number plain, 4 = number currency, 5 = text (force string)
        $stylesXml = <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FFCC0000"/><name val="Calibri"/></font>
    <font><sz val="10"/><b/><color rgb="FFCC0000"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0"  fontId="1" fillId="0" borderId="0" xfId="0"><alignment horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0"  fontId="2" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0"  fontId="2" fillId="0" borderId="0" xfId="0"><alignment horizontal="center"/></xf>
    <xf numFmtId="3"  fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>
XML;
        // styleId map: 0=normal, 1=header, 2=redNormal, 3=redCenter, 4=currency, 5=text(force)

        // ---- Build sheet rows ----
        $sheetRows = '';
        $rowNum    = 1;

        // Header row (styleId=1)
        $sheetRows .= "<row r=\"{$rowNum}\">";
        $col = 0;
        foreach ($headers as $h) {
            $addr  = $this->xlsxCellAddr($col++, $rowNum);
            $si    = $strIndex($h);
            $sheetRows .= "<c r=\"{$addr}\" t=\"s\" s=\"1\"><v>{$si}</v></c>";
        }
        $sheetRows .= '</row>';
        $rowNum++;

        foreach ($rows as $rowMeta) {
            $data      = $rowMeta['data'];
            $cancelled = $rowMeta['cancelled'];
            // base style: 0=normal, red base=2
            $baseStyle    = $cancelled ? 2 : 0;
            $centerStyle  = $cancelled ? 3 : 0;
            $numStyle     = $cancelled ? 2 : 4;   // Est Bersih: currency or red
            $textStyle    = $cancelled ? 2 : 5;   // force string

            $sheetRows .= "<row r=\"{$rowNum}\">";
            $col = 0;
            foreach ($data as $idx => $val) {
                $addr   = $this->xlsxCellAddr($col, $rowNum);
                $header = $headers[$col] ?? '';

                if ($header === 'Nomor Urut' || $header === 'QTY') {
                    $n = (int) $val;
                    $sheetRows .= "<c r=\"{$addr}\" t=\"n\" s=\"{$baseStyle}\"><v>{$n}</v></c>";
                } elseif ($header === 'Est Bersih') {
                    $n = (float) $val;
                    $sheetRows .= "<c r=\"{$addr}\" t=\"n\" s=\"{$numStyle}\"><v>{$n}</v></c>";
                } elseif ($header === 'No Pesanan') {
                    // force text agar tidak scientific notation
                    $si = $strIndex((string) $val);
                    $sheetRows .= "<c r=\"{$addr}\" t=\"s\" s=\"{$textStyle}\"><v>{$si}</v></c>";
                } elseif ($header === 'Status') {
                    $si = $strIndex((string) $val);
                    $sheetRows .= "<c r=\"{$addr}\" t=\"s\" s=\"{$baseStyle}\"><v>{$si}</v></c>";
                } else {
                    $si = $strIndex((string) $val);
                    $sheetRows .= "<c r=\"{$addr}\" t=\"s\" s=\"{$baseStyle}\"><v>{$si}</v></c>";
                }
                $col++;
            }
            $sheetRows .= '</row>';
            $rowNum++;
        }

        // ---- Column widths ----
        $colWidths = '';
        foreach ($headers as $i => $h) {
            $maxLen = strlen($h);
            foreach ($rows as $r) {
                $v = (string) ($r['data'][$i] ?? '');
                if (strlen($v) > $maxLen) $maxLen = strlen($v);
            }
            $w        = min(45, max(10, $maxLen + 3));
            $ci       = $i + 1;
            $colWidths .= "<col min=\"{$ci}\" max=\"{$ci}\" width=\"{$w}\" customWidth=\"1\"/>";
        }
        $totalRows  = $rowNum - 1;
        $lastColLtr = $this->xlsxColLetter(count($headers) - 1);
        $dimension  = "A1:{$lastColLtr}{$totalRows}";

        $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . "<dimension ref=\"{$dimension}\"/>"
            . "<cols>{$colWidths}</cols>"
            . "<sheetData>{$sheetRows}</sheetData>"
            . '</worksheet>';

        // ---- Shared strings XML ----
        $ssItems = '';
        foreach (array_keys($strings) as $s) {
            $ssItems .= '<si><t xml:space="preserve">' . $xmlEsc($s) . '</t></si>';
        }
        $ssCount  = count($strings);
        $ssXml    = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" count=\"{$ssCount}\" uniqueCount=\"{$ssCount}\">"
            . $ssItems . '</sst>';

        // ---- Workbook & rels ----
        $workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="Pesanan Cut Off" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>';

        $wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';

        $rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';

        $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>';

        // ---- Zip assembly ----
        $tmpFile = tempnam(sys_get_temp_dir(), 'cutoff_xlsx_');
        $zip     = new \ZipArchive();
        $zip->open($tmpFile, \ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml',              $contentTypes);
        $zip->addFromString('_rels/.rels',                      $rootRels);
        $zip->addFromString('xl/workbook.xml',                  $workbookXml);
        $zip->addFromString('xl/_rels/workbook.xml.rels',       $wbRels);
        $zip->addFromString('xl/worksheets/sheet1.xml',         $sheetXml);
        $zip->addFromString('xl/sharedStrings.xml',             $ssXml);
        $zip->addFromString('xl/styles.xml',                    $stylesXml);
        $zip->close();

        $binary = file_get_contents($tmpFile);
        unlink($tmpFile);

        return $binary;
    }

    /** Konversi indeks kolom (0-based) ke huruf Excel (A, B, ..., Z, AA, ...) */
    private function xlsxColLetter(int $col): string
    {
        $letter = '';
        $col++;
        while ($col > 0) {
            $rem    = ($col - 1) % 26;
            $letter = chr(65 + $rem) . $letter;
            $col    = (int) (($col - $rem - 1) / 26);
        }
        return $letter;
    }

    /** Konversi (col 0-based, row 1-based) ke alamat sel Excel misal A1, B3 */
    private function xlsxCellAddr(int $col, int $row): string
    {
        return $this->xlsxColLetter($col) . $row;
    }

    /**
     * Tambah data pesanan Cut Off baru secara manual.
     */
    public function store(Request $request): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'order_date'             => ['nullable', 'date'],
            'channel'                => ['required', 'string', 'max:50'],
            'order_number'           => ['required', 'string', 'max:100'],
            'jl_number'              => ['nullable', 'string', 'max:100'],
            'buyer_username'         => ['nullable', 'string', 'max:150'],
            'shipping_courier'       => ['nullable', 'string', 'max:100'],
            'sku_utama'              => ['nullable', 'string', 'max:150'],
            'sku_pengganti'          => ['nullable', 'string', 'max:150'],
            'product_name'           => ['nullable', 'string', 'max:255'],
            'variation_name'         => ['nullable', 'string', 'max:255'],
            'qty'                    => ['required', 'integer', 'min:1'],
            'recheck_qty'            => ['nullable', 'integer'],
            'package_count'          => ['nullable', 'string', 'max:50'],
            'info_gudang'            => ['nullable', 'string', 'max:100'],
            'order_status'           => ['nullable', 'string', 'max:100'],
            'keterangan_solutif'     => ['nullable', 'string'],
            'est_net_income'         => ['nullable', 'numeric'],
            'marketplace_net_payout' => ['nullable', 'numeric'],
            'sheet_dpp'              => ['nullable', 'string', 'max:100'],
            'dpp_number'             => ['nullable', 'string', 'max:100'],
        ]);

        if (empty($validated['order_date'])) {
            $validated['order_date'] = now('Asia/Jakarta')->toDateString();
        }

        if (
            ! CutOffOrder::isExcludedStatus($validated['order_status'] ?? null)
            && Schema::hasColumn('cut_off_orders', 'processed_at')
        ) {
            $validated['processed_at'] = now('Asia/Jakarta')->format('Y-m-d H:i:s');
        }

        $order = CutOffOrder::create($validated);

        return back()->with('success', "Pesanan #{$order->order_number} ({$order->channel}) berhasil ditambahkan.");
    }

    /**
     * Import batch data pesanan dari hasil pembacaan Spreadsheet Excel.
     */
    public function importBatch(Request $request): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $request->validate([
            'rows'   => ['required', 'array', 'min:1'],
            'rows.*' => ['array'],
        ]);

        $rows = $request->input('rows');
        $shopeeService = app(ShopeeSyncService::class);
        $shopeeService->ensureSchema();
        $hasFinancialBreakdown = Schema::hasColumn('cut_off_orders', 'financial_breakdown');
        $hasProcessedAt        = Schema::hasColumn('cut_off_orders', 'processed_at');

        $inserted = 0;
        $batch = [];
        $now = now();

        foreach ($rows as $r) {
            if (empty($r['order_number'])) {
                continue;
            }

            $rowPayload = [
                'order_date'             => !empty($r['order_date']) ? $r['order_date'] : $now->toDateString(),
                'channel'                => !empty($r['channel']) ? $r['channel'] : 'MANUAL',
                'order_number'           => $r['order_number'],
                'jl_number'              => $r['jl_number'] ?? null,
                'buyer_username'         => $r['buyer_username'] ?? null,
                'shipping_courier'       => $r['shipping_courier'] ?? null,
                'sku_utama'              => $r['sku_utama'] ?? null,
                'sku_pengganti'          => $r['sku_pengganti'] ?? null,
                'product_name'           => $r['product_name'] ?? null,
                'variation_name'         => $r['variation_name'] ?? null,
                'qty'                    => (int) ($r['qty'] ?? 1),
                'recheck_qty'            => isset($r['recheck_qty']) && $r['recheck_qty'] !== '' ? (int) $r['recheck_qty'] : null,
                'package_count'          => $r['package_count'] ?? null,
                'info_gudang'            => $r['info_gudang'] ?? null,
                'order_status'           => $r['order_status'] ?? null,
                'keterangan_solutif'     => $r['keterangan_solutif'] ?? null,
                'est_net_income'         => self::parseCleanNumber($r['est_net_income'] ?? $r['est_bersih'] ?? null),
                'marketplace_net_payout' => self::parseCleanNumber($r['marketplace_net_payout'] ?? $r['est_net_income'] ?? $r['est_bersih'] ?? null),
                'sheet_dpp'              => $r['sheet_dpp'] ?? null,
                'dpp_number'             => $r['dpp_number'] ?? null,
                'created_at'             => $now,
                'updated_at'             => $now,
            ];

            if ($hasFinancialBreakdown) {
                $rowPayload['financial_breakdown'] = !empty($r['financial_breakdown'])
                    ? json_encode($r['financial_breakdown'], JSON_UNESCAPED_UNICODE)
                    : null;
            }
            if ($hasProcessedAt) {
                $rowPayload['processed_at'] = !empty($r['processed_at'])
                    ? $r['processed_at']
                    : $now->format('Y-m-d H:i:s');
            }

            $batch[] = $rowPayload;

            if (count($batch) >= 500) {
                CutOffOrder::insert($batch);
                $inserted += count($batch);
                $batch = [];
            }
        }

        if (!empty($batch)) {
            CutOffOrder::insert($batch);
            $inserted += count($batch);
        }

        return back()->with('success', "Berhasil mengimpor {$inserted} data pesanan ke dalam database.");
    }

    /**
     * Preview import nomor JL dari Excel.
     * Mencocokkan nomor pesanan dari Excel dengan pesanan yang sudah ada di database ERP.
     */
    public function previewImportJl(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items'                => ['required', 'array', 'min:1'],
            'items.*.order_number' => ['required', 'string'],
            'items.*.jl_number'    => ['required', 'string'],
        ]);

        $items = $validated['items'];
        $orderNumbers = array_values(array_unique(array_filter(array_map(fn ($i) => trim($i['order_number']), $items))));

        // Ambil data pesanan yang cocok dari DB
        $dbOrders = CutOffOrder::query()
            ->whereIn('order_number', $orderNumbers)
            ->get(['id', 'order_number', 'channel', 'buyer_username', 'sku_utama', 'jl_number', 'order_status'])
            ->keyBy('order_number');

        $matched = [];
        $unmatched = [];
        $totalChanged = 0;

        foreach ($items as $item) {
            $orderNo = trim($item['order_number']);
            $newJl   = trim($item['jl_number']);

            if (isset($dbOrders[$orderNo])) {
                $db = $dbOrders[$orderNo];
                $currentJl = $db->jl_number;
                $isChanged = ($currentJl !== $newJl);
                if ($isChanged) {
                    $totalChanged++;
                }

                $matched[] = [
                    'id'             => $db->id,
                    'order_number'   => $orderNo,
                    'channel'        => $db->channel,
                    'buyer_username' => $db->buyer_username,
                    'sku_utama'      => $db->sku_utama,
                    'current_jl'     => $currentJl,
                    'new_jl'         => $newJl,
                    'order_status'   => $db->order_status,
                    'is_changed'     => $isChanged,
                ];
            } else {
                $unmatched[] = [
                    'order_number' => $orderNo,
                    'jl_number'    => $newJl,
                    'reason'       => 'Nomor pesanan belum ada di database ERP',
                ];
            }
        }

        return response()->json([
            'success'         => true,
            'total_excel'     => count($items),
            'total_matched'   => count($matched),
            'total_unmatched' => count($unmatched),
            'total_changed'   => $totalChanged,
            'matched'         => $matched,
            'unmatched'       => $unmatched,
        ]);
    }

    /**
     * Terapkan dan simpan pembaruan nomor JL dari Excel ke database.
     */
    public function importJl(Request $request): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $validated = $request->validate([
            'items'                => ['required', 'array', 'min:1'],
            'items.*.order_number' => ['required', 'string'],
            'items.*.jl_number'    => ['required', 'string'],
        ]);

        $items = $validated['items'];
        $updatedCount = 0;

        DB::transaction(function () use ($items, &$updatedCount) {
            foreach ($items as $item) {
                $orderNumber = trim($item['order_number']);
                $jlNumber    = trim($item['jl_number']);

                $affected = CutOffOrder::where('order_number', $orderNumber)
                    ->update([
                        'jl_number' => $jlNumber,
                    ]);

                $updatedCount += $affected;
            }
        });

        return back()->with('success', "Berhasil memperbarui Nomor JL untuk {$updatedCount} pesanan.");
    }

    /**
     * Update data pesanan (solusi gudang, SKU pengganti, status, DPP).
     */
    public function update(Request $request, CutOffOrder $cutOffOrder): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        // Status Pesanan dan Ekspedisi dikunci (hanya sinkron dari marketplace / data awal, tidak bisa diubah lewat edit)
        $validated = $request->validate([
            'info_gudang'            => ['nullable', 'string', 'max:100'],
            'sku_pengganti'          => ['nullable', 'string', 'max:150'],
            'variation_name'         => ['nullable', 'string', 'max:255'],
            'keterangan_solutif'     => ['nullable', 'string'],
            'dpp_number'             => ['nullable', 'string', 'max:100'],
            'marketplace_net_payout' => ['nullable', 'numeric'],
            'recheck_qty'            => ['nullable', 'integer'],
        ]);

        $cutOffOrder->update($validated);

        return back()->with('success', "Pesanan #{$cutOffOrder->order_number} berhasil diperbarui.");
    }

    /**
     * Hapus data pesanan (soft delete).
     */
    public function destroy(Request $request, CutOffOrder $cutOffOrder): RedirectResponse
    {
        if ($request->user() && in_array($request->user()->role?->name, ['Management', 'Direktur'])) {
            abort(403, 'Akses ditolak. Akun Direktur / Management hanya memiliki izin melihat data (read-only).');
        }

        $cutOffOrder->delete();

        return back()->with('success', "Pesanan #{$cutOffOrder->order_number} berhasil dihapus.");
    }

    /**
     * Webhook penerima data dari Google Apps Script.
     * Otomatis Insert jika baru, atau Update kolom yang diedit di spreadsheet.
     */
    public function syncFromSheet(Request $request): \Illuminate\Http\JsonResponse
    {
        $items = $request->input('rows');
        if (empty($items)) {
            // Jika dikirim satu baris langsung
            $single = $request->except(['secret_token']);
            if (!empty($single['order_number'])) {
                $items = [$single];
            }
        }

        if (empty($items)) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Tidak ada data pesanan yang valid.',
            ], 422);
        }

        $synced = 0;
        foreach ($items as $r) {
            if (empty($r['order_number'])) {
                continue;
            }

            $orderNumber = trim((string) $r['order_number']);
            $orderDate = !empty($r['order_date']) ? (string) $r['order_date'] : now()->toDateString();
            if (str_contains($orderDate, 'T')) {
                $orderDate = explode('T', $orderDate)[0];
            }

            CutOffOrder::updateOrCreate(
                ['order_number' => $orderNumber],
                [
                    'order_date'             => $orderDate,
                    'processed_at'           => !empty($r['processed_at']) ? $r['processed_at'] : now('Asia/Jakarta')->format('Y-m-d H:i:s'),
                    'channel'                => !empty($r['channel']) ? trim((string) $r['channel']) : 'MANUAL',
                    'jl_number'              => !empty($r['jl_number']) ? trim((string) $r['jl_number']) : null,
                    'buyer_username'         => !empty($r['buyer_username']) ? trim((string) $r['buyer_username']) : null,
                    'shipping_courier'       => !empty($r['shipping_courier']) ? trim((string) $r['shipping_courier']) : null,
                    'sku_utama'              => !empty($r['sku_utama']) ? trim((string) $r['sku_utama']) : null,
                    'sku_pengganti'          => !empty($r['sku_pengganti']) ? trim((string) $r['sku_pengganti']) : null,
                    'product_name'           => !empty($r['product_name']) ? trim((string) $r['product_name']) : null,
                    'variation_name'         => !empty($r['variation_name']) ? trim((string) $r['variation_name']) : null,
                    'qty'                    => (int) ($r['qty'] ?? 1),
                    'recheck_qty'            => isset($r['recheck_qty']) && $r['recheck_qty'] !== '' ? (int) $r['recheck_qty'] : null,
                    'package_count'          => !empty($r['package_count']) ? trim((string) $r['package_count']) : null,
                    'info_gudang'            => !empty($r['info_gudang']) ? trim((string) $r['info_gudang']) : null,
                    'order_status'           => !empty($r['order_status']) ? trim((string) $r['order_status']) : null,
                    'keterangan_solutif'     => !empty($r['keterangan_solutif']) ? trim((string) $r['keterangan_solutif']) : null,
                    'est_net_income'         => self::parseCleanNumber($r['est_net_income'] ?? $r['est_bersih'] ?? null),
                    'marketplace_net_payout' => self::parseCleanNumber($r['marketplace_net_payout'] ?? $r['est_net_income'] ?? $r['est_bersih'] ?? null),
                    'sheet_dpp'              => !empty($r['sheet_dpp']) ? trim((string) $r['sheet_dpp']) : null,
                    'dpp_number'             => !empty($r['dpp_number']) ? trim((string) $r['dpp_number']) : null,
                ]
            );

            $synced++;
        }

        return response()->json([
            'status'  => 'success',
            'message' => "Berhasil mensinkronkan {$synced} data pesanan dari Google Sheets.",
            'synced'  => $synced,
        ]);
    }

    /**
     * Export data pesanan hari ini / tanggal tertentu dalam format terstruktur
     * khusus untuk Google Sheets (CUT OFF 2026).
     * Memuat 11 kolom: TGL, NO, TOKO, NO.PESANAN, NAMA BARANG, SKU UTAMA, QTY, PAKET/RESI, USERPEMBELI, EST BERSIH, PENGIRIMAN.
     * Mengelompokkan SH duluan, 1 baris kosong jeda, lalu TT.
     */
    public function exportForSheet(Request $request): JsonResponse
    {
        $token = $request->query('token') ?? $request->header('X-Sync-Token');
        $expectedToken = env('CRON_SYNC_TOKEN', 'recordsh_cutoff_sync_2026');
        if ($token && $token !== $expectedToken) {
            return response()->json(['status' => 'error', 'message' => 'Token keamanan tidak valid.'], 403);
        }

        $dateInput = $request->query('date', now('Asia/Jakarta')->toDateString());
        $sortOrder = strtolower($request->query('sort', 'asc')) === 'desc' ? 'desc' : 'asc';

        // Ambil semua pesanan pada tanggal tersebut (berdasarkan tanggal diproses)
        $orders = CutOffOrder::query()
            ->onlyProcessed()
            ->whereDate(\Illuminate\Support\Facades\DB::raw('COALESCE(processed_at, order_date)'), $dateInput)
            ->whereNull('deleted_at')
            ->orderByRaw('COALESCE(processed_at, order_date) ' . $sortOrder)
            ->orderBy('id', $sortOrder)
            ->get();

        $shOrders = $orders->filter(fn ($o) => strtoupper($o->channel) === 'SH' || str_contains(strtoupper($o->channel), 'SH'));
        $ttOrders = $orders->filter(fn ($o) => strtoupper($o->channel) === 'TT' || str_contains(strtoupper($o->channel), 'TT'));
        $otherOrders = $orders->filter(fn ($o) => ! $shOrders->contains('id', $o->id) && ! $ttOrders->contains('id', $o->id));

        $formattedDate = \Carbon\Carbon::parse($dateInput)->format('d-m-y');
        $rows = [];
        $no = 1;

        // 1. Blok Pesanan Shopee (SH)
        foreach ($shOrders as $order) {
            $rows[] = [
                'tgl'          => $formattedDate,
                'no'           => $no++,
                'toko'         => 'SH',
                'no_pesanan'   => (string) $order->order_number,
                'nama_barang'  => (string) ($order->product_name ?? ''),
                'sku_utama'    => (string) ($order->sku_utama ?? ''),
                'qty'          => (int) ($order->qty ?? 1),
                'paket_resi'   => (string) ($order->package_count ?: '1'),
                'userpembeli'  => (string) ($order->buyer_username ?? ''),
                'est_bersih'   => (float) ($order->est_net_income ?? 0),
                'pengiriman'   => (string) ($order->shipping_courier ?? ''),
                'is_separator' => false,
            ];
        }

        // 2. Baris Jeda Kosong antara SH dan TT (jika ada pesanan TT atau SH)
        if ($shOrders->isNotEmpty() && ($ttOrders->isNotEmpty() || $otherOrders->isNotEmpty())) {
            $rows[] = [
                'tgl'          => '',
                'no'           => '',
                'toko'         => '',
                'no_pesanan'   => '',
                'nama_barang'  => '',
                'sku_utama'    => '',
                'qty'          => '',
                'paket_resi'   => '',
                'userpembeli'  => '',
                'est_bersih'   => '',
                'pengiriman'   => '',
                'is_separator' => true,
            ];
        }

        // 3. Blok Pesanan TikTok (TT)
        foreach ($ttOrders as $order) {
            $rows[] = [
                'tgl'          => $formattedDate,
                'no'           => $no++,
                'toko'         => 'TT',
                'no_pesanan'   => (string) $order->order_number,
                'nama_barang'  => (string) ($order->product_name ?? ''),
                'sku_utama'    => (string) ($order->sku_utama ?? ''),
                'qty'          => (int) ($order->qty ?? 1),
                'paket_resi'   => (string) ($order->package_count ?: '1'),
                'userpembeli'  => (string) ($order->buyer_username ?? ''),
                'est_bersih'   => (float) ($order->est_net_income ?? 0),
                'pengiriman'   => (string) ($order->shipping_courier ?? ''),
                'is_separator' => false,
            ];
        }

        // 4. Saluran Lain jika ada (Lazada, Manual, dll)
        foreach ($otherOrders as $order) {
            $rows[] = [
                'tgl'          => $formattedDate,
                'no'           => $no++,
                'toko'         => (string) $order->channel,
                'no_pesanan'   => (string) $order->order_number,
                'nama_barang'  => (string) ($order->product_name ?? ''),
                'sku_utama'    => (string) ($order->sku_utama ?? ''),
                'qty'          => (int) ($order->qty ?? 1),
                'paket_resi'   => (string) ($order->package_count ?: '1'),
                'userpembeli'  => (string) ($order->buyer_username ?? ''),
                'est_bersih'   => (float) ($order->est_net_income ?? 0),
                'pengiriman'   => (string) ($order->shipping_courier ?? ''),
                'is_separator' => false,
            ];
        }

        return response()->json([
            'status'         => 'success',
            'date'           => $dateInput,
            'date_formatted' => $formattedDate,
            'total_orders'   => $orders->count(),
            'total_sh'       => $shOrders->count(),
            'total_tt'       => $ttOrders->count(),
            'columns'        => [
                'TGL', 'NO', 'TOKO', 'NO.PESANAN', 'NAMA BARANG',
                'SKU UTAMA', 'QTY', 'PAKET/RESI', 'USERPEMBELI',
                'EST BERSIH', 'PENGIRIMAN'
            ],
            'rows'           => $rows,
        ]);
    }

    /**
     * Pastikan kolom processed_at sudah ada, ter-backfill, dan bebas timestamp penyelesaian pesanan lama (deploy FTP tanpa shell).
     */
    private function ensureProcessedAtColumnReady(): void
    {
        CutOffOrder::ensurePerformanceIndexesOnce();

        $schemaCacheKey = 'cut_off_processed_at_schema_v2';
        $cleanupCacheKey = 'cut_off_processed_at_cleanup_v3';
        $hasSchemaCache = false;
        $hasCleanupCache = false;
        $store = null;

        if (! app()->runningUnitTests()) {
            try {
                $store = \Illuminate\Support\Facades\Cache::store('file');
                $hasSchemaCache = $store->get($schemaCacheKey) === true;
                $hasCleanupCache = $store->get($cleanupCacheKey) === true;
            } catch (\Throwable) {
                $store = null;
            }
        }

        if ($hasSchemaCache && $hasCleanupCache) {
            return;
        }

        // Hindari penumpukan lock DB jika beberapa request masuk bersamaan setelah deploy
        $acquiredLock = true;
        if ($store !== null) {
            try {
                $acquiredLock = $store->add('cut_off_init_running_v3', true, 45);
            } catch (\Throwable) {
                $acquiredLock = true;
            }
        }

        if (! $acquiredLock) {
            return;
        }

        try {
            if (! $hasSchemaCache && ! Schema::hasColumn('cut_off_orders', 'processed_at')) {
                app(ShopeeSyncService::class)->ensureSchema();
            }

            $hasProcessedAt = Schema::hasColumn('cut_off_orders', 'processed_at');
            if ($hasProcessedAt && ! $hasCleanupCache && ! app()->runningUnitTests()) {
                $migrationAlreadyRan = Schema::hasTable('migrations')
                    && \Illuminate\Support\Facades\DB::table('migrations')
                        ->where('migration', '2026_11_12_000004_fix_historical_processed_at_on_cut_off_orders')
                        ->exists();

                if (! $migrationAlreadyRan) {
                    CutOffOrder::cleanupHistoricalProcessedAt();
                }
            }

            if (! app()->runningUnitTests() && $hasProcessedAt && $store !== null) {
                try {
                    $store->put($schemaCacheKey, true, 86400);
                    $store->forever($cleanupCacheKey, true);
                } catch (\Throwable) {
                    // Abaikan error tulis cache file
                }
            }
        } finally {
            if ($store !== null) {
                try {
                    $store->forget('cut_off_init_running_v3');
                } catch (\Throwable) {
                    // Abaikan
                }
            }
        }
    }

    /**
     * Sanitasi dan parsing angka format desimal / ribuan Indonesia (misal: "134.299", "134,299", "Rp 134.299").
     */
    public static function parseCleanNumber(mixed $val): ?float
    {
        if ($val === null || $val === '') {
            return null;
        }
        if (is_numeric($val)) {
            return (float) $val;
        }
        $str = trim((string) $val);
        $str = str_ireplace(['rp', 'idr', ' '], '', $str);

        if (str_contains($str, '.') && str_contains($str, ',')) {
            if (strpos($str, '.') < strpos($str, ',')) {
                $str = str_replace('.', '', $str);
                $str = str_replace(',', '.', $str);
            } else {
                $str = str_replace(',', '', $str);
            }
        } elseif (str_contains($str, '.')) {
            $parts = explode('.', $str);
            if (count($parts) > 1 && strlen(end($parts)) === 3) {
                $str = str_replace('.', '', $str);
            }
        } elseif (str_contains($str, ',')) {
            $parts = explode(',', $str);
            if (count($parts) > 1 && strlen(end($parts)) === 3) {
                $str = str_replace(',', '', $str);
            } else {
                $str = str_replace(',', '.', $str);
            }
        }

        $filtered = preg_replace('/[^0-9.-]/', '', $str);
        return is_numeric($filtered) ? (float) $filtered : null;
    }

    /**
     * Sinkronisasi ulang pesanan Shopee 7 hari terakhir beserta rincian escrow/voucher penjual (Super Admin only).
     */
    public function syncShopeeRecent(Request $request, ShopeeSyncService $shopeeService): RedirectResponse
    {
        $user = $request->user();
        $isSuperAdmin = $user && (
            (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) ||
            $user->role?->name === 'Super Admin' ||
            $user->roles->contains('name', 'Super Admin')
        );

        if (! $isSuperAdmin) {
            abort(403, 'Hanya Super Admin yang diizinkan menyinkronkan ulang pesanan Shopee.');
        }

        $accounts = ShopeeAccount::where('status', 'active')
            ->whereNotNull('access_token')
            ->get();

        if ($accounts->isEmpty()) {
            return redirect()->route('cut-off-orders.index')->with('error', 'Tidak ada akun Shopee aktif yang terhubung.');
        }

        $days = max(1, min(14, (int) $request->input('days', 7)));
        $timeTo = time();
        $timeFrom = $timeTo - ($days * 86400);

        $totalCreated = 0;
        $totalUpdated = 0;
        $errors = [];

        foreach ($accounts as $account) {
            try {
                $res = $shopeeService->syncOrdersToCutOff($account, $timeFrom, $timeTo);
                $totalCreated += (int) ($res['created'] ?? 0);
                $totalUpdated += (int) ($res['updated'] ?? 0);
            } catch (\Throwable $e) {
                $errors[] = ($account->shop_name ?? ('Toko #' . $account->shop_id)) . ': ' . $e->getMessage();
            }
        }

        if (! empty($errors) && $totalCreated === 0 && $totalUpdated === 0) {
            return redirect()->route('cut-off-orders.index')->with('error', 'Gagal menyinkronkan Shopee: ' . implode(' | ', $errors));
        }

        $msg = "Sinkron & hitung ulang Shopee ({$days} hari terakhir) selesai: {$totalUpdated} diperbarui, {$totalCreated} baru.";
        if (! empty($errors)) {
            $msg .= ' Catatan: ' . implode(' | ', $errors);
        }

        return redirect()->route('cut-off-orders.index')->with('success', $msg);
    }

    /**
     * Kosongkan seluruh data tabel Cut Off Orders (Super Admin only).
     */
    public function truncate(Request $request): RedirectResponse
    {
        $user = $request->user();
        $isSuperAdmin = $user && (
            (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) ||
            $user->role?->name === 'Super Admin' ||
            $user->roles->contains('name', 'Super Admin')
        );

        if (! $isSuperAdmin) {
            abort(403, 'Hanya Super Admin yang diizinkan mengosongkan seluruh data pesanan.');
        }

        DB::table('cut_off_orders')->truncate();
        CutOffOrder::bumpCacheVersion();

        return redirect()->route('cut-off-orders.index')->with('success', 'Semua data Pesanan Cut Off berhasil dikosongkan. Tabel kini bersih dan siap diisi data murni dari API.');
    }
}
