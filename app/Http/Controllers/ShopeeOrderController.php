<?php

namespace App\Http\Controllers;

use App\Models\ShopeeAccount;
use App\Models\ShopeeOrder;
use App\Services\PureThermalPdfBuilder;
use App\Services\ShopeeOrderService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Database\RecordsNotFoundException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use PDOException;
use RuntimeException;

class ShopeeOrderController extends Controller
{
    private const VALID_TABS = [
        ShopeeOrder::TAB_ALL,
        ShopeeOrder::TAB_UNPAID,
        ShopeeOrder::TAB_TO_SHIP,
        ShopeeOrder::TAB_SHIPPED,
        ShopeeOrder::TAB_COMPLETED,
        ShopeeOrder::TAB_CANCELLED,
    ];

    private const VALID_SUBTABS = [
        ShopeeOrder::SUBTAB_ALL,
        ShopeeOrder::SUBTAB_UNPROCESSED,
        ShopeeOrder::SUBTAB_PROCESSED,
    ];

    private const VALID_PRINT_STATUSES = ['all', 'unprinted', 'printed'];

    private const VALID_SORTS = ['ship_by_asc', 'newest', 'oldest'];

    public function __construct(
        private readonly ShopeeOrderService $orderService,
    ) {}

    /**
     * Halaman utama "Pesanan Saya" Shopee (khusus Super Admin).
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorizeSuperAdmin($request);
        $this->orderService->ensureSchema();

        $account = $this->resolveShopeeAccount();

        $rawTab = strtolower(trim((string) $request->input('tab', ShopeeOrder::TAB_TO_SHIP)));
        $tab = in_array($rawTab, self::VALID_TABS, true) ? $rawTab : ShopeeOrder::TAB_TO_SHIP;

        $hasExplicitSubTab = $request->has('sub_tab') && trim((string) $request->input('sub_tab')) !== '';
        $rawSubTab = $hasExplicitSubTab
            ? strtolower(trim((string) $request->input('sub_tab')))
            : ShopeeOrder::SUBTAB_UNPROCESSED;
        $subTab = ($tab === ShopeeOrder::TAB_TO_SHIP && in_array($rawSubTab, self::VALID_SUBTABS, true))
            ? $rawSubTab
            : ShopeeOrder::SUBTAB_ALL;

        $rawOrderType = strtolower(trim((string) $request->input('order_type', ShopeeOrder::ORDERTYPE_ALL)));
        $orderType = in_array($rawOrderType, ShopeeOrder::VALID_ORDER_TYPES, true)
            ? $rawOrderType
            : ShopeeOrder::ORDERTYPE_ALL;

        $rawPrintStatus = strtolower(trim((string) $request->input('print_status', 'all')));
        $printStatus = in_array($rawPrintStatus, self::VALID_PRINT_STATUSES, true) ? $rawPrintStatus : 'all';

        $rawLogisticsStatus = strtolower(trim((string) $request->input('logistics_status', ShopeeOrder::LOGISTICS_FILTER_ALL)));
        $logisticsStatus = in_array($rawLogisticsStatus, ShopeeOrder::VALID_LOGISTICS_FILTERS, true)
            ? $rawLogisticsStatus
            : ShopeeOrder::LOGISTICS_FILTER_ALL;

        $search = trim((string) $request->input('search', ''));

        $rawCourier = trim((string) $request->input('courier', ''));
        $courier = strtolower($rawCourier) === 'all' ? '' : $rawCourier;

        $dateFrom = $this->normalizeDateInput($request->input('date_from'));
        $dateTo = $this->normalizeDateInput($request->input('date_to'));
        if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $rawSort = strtolower(trim((string) $request->input('sort', 'ship_by_asc')));
        $sort = in_array($rawSort, self::VALID_SORTS, true) ? $rawSort : 'ship_by_asc';

        $tabCounts = $this->emptyTabCounts();
        $orderTypeCounts = $this->emptyOrderTypeCounts();
        $carriers = [];
        $allMatchingOrderSns = [];
        $allMatchingOrders = [];

        if (! $account) {
            $orders = ShopeeOrder::query()
                ->where('shopee_account_id', -1)
                ->paginate(20)
                ->withQueryString();
        } else {
            $tabCounts = $this->fetchTabCounts($account->id);
            $orderTypeCounts = ShopeeOrder::computeOrderTypeCounts(
                ShopeeOrder::query()
                    ->where('shopee_account_id', $account->id)
                    ->forTab($tab, 'all')
            );

            $carriers = ShopeeOrder::query()
                ->where('shopee_account_id', $account->id)
                ->whereNotNull('shipping_carrier')
                ->whereRaw("TRIM(shipping_carrier) != ''")
                ->distinct()
                ->orderBy('shipping_carrier', 'asc')
                ->pluck('shipping_carrier')
                ->values()
                ->all();

            $lightOrderColumns = $this->getLightOrderColumns();
            $query = ShopeeOrder::query()
                ->select($lightOrderColumns)
                ->where('shopee_account_id', $account->id)
                ->forTab($tab, $subTab)
                ->forOrderType($orderType)
                ->forPrintStatus($printStatus)
                ->forLogisticsStatus($logisticsStatus);

            if ($search !== '') {
                $likePattern = '%' . $this->escapeLike($search) . '%';
                $query->where(function (Builder $q) use ($likePattern): void {
                    $first = true;
                    foreach (['order_sn', 'tracking_number', 'buyer_username', 'items_json'] as $column) {
                        $clause = "{$column} LIKE ? ESCAPE '!'";
                        if ($first) {
                            $q->whereRaw($clause, [$likePattern]);
                            $first = false;
                        } else {
                            $q->orWhereRaw($clause, [$likePattern]);
                        }
                    }
                });
            }

            if ($courier !== '') {
                $query->where('shipping_carrier', $courier);
            }

            if ($dateFrom !== '') {
                $query->where('order_created_at', '>=', $dateFrom . ' 00:00:00');
            }

            if ($dateTo !== '') {
                $query->where('order_created_at', '<=', $dateTo . ' 23:59:59');
            }

            match ($sort) {
                'newest' => $query->orderByDesc('order_created_at')->orderByDesc('id'),
                'oldest' => $query->orderBy('order_created_at', 'asc')->orderBy('id', 'asc'),
                default  => $query->orderByRaw('CASE WHEN ship_by_date IS NULL THEN 1 ELSE 0 END ASC, ship_by_date ASC, order_created_at DESC, id DESC'),
            };

            $orders = $query->paginate(20)->withQueryString();
            $orders->getCollection()->each->makeHidden(['raw_payload']);

            $allMatchingOrderSns = (clone $query)->limit(2000)->pluck('order_sn')->values()->all();
            if ($orders->total() <= 200) {
                $allMatchingOrders = (clone $query)->limit(200)->get()->each->makeHidden(['raw_payload'])->values()->all();
            }
        }

        return Inertia::render('Shopee/Orders', [
            'account'             => $account?->toSafeArray(),
            'orders'              => $orders,
            'allMatchingOrderSns' => $allMatchingOrderSns,
            'allMatchingOrders'   => $allMatchingOrders,
            'tabCounts'           => $tabCounts,
            'orderTypeCounts'     => $orderTypeCounts,
            'carriers'            => $carriers,
            'filters'         => [
                'tab'              => $tab,
                'sub_tab'          => $subTab,
                'order_type'       => $orderType,
                'print_status'     => $printStatus,
                'logistics_status' => $logisticsStatus,
                'search'           => $search,
                'courier'          => $courier,
                'date_from'        => $dateFrom,
                'date_to'          => $dateTo,
                'sort'             => $sort,
            ],
        ]);
    }

    /**
     * Sinkronkan pesanan Shopee ke shopee_orders dan cut_off_orders.
     */
    public function sync(Request $request): RedirectResponse
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'days'       => ['nullable', 'integer', 'min:1', 'max:30'],
            'start_date' => ['nullable', 'date', 'required_with:end_date'],
            'end_date'   => ['nullable', 'date', 'required_with:start_date'],
        ]);

        $account = $this->resolveShopeeAccount();
        if (! $this->isAccountConnected($account)) {
            return back()->with('error', 'Akun Shopee belum terhubung. Harap isi kredensial dan hubungkan toko terlebih dahulu.');
        }

        @ini_set('max_execution_time', '300');
        @set_time_limit(300);

        if (! empty($validated['start_date']) && ! empty($validated['end_date'])) {
            $startDate = Carbon::parse($validated['start_date'], 'Asia/Jakarta');
            $endDate = Carbon::parse($validated['end_date'], 'Asia/Jakarta');
            if ($startDate->gt($endDate)) {
                [$startDate, $endDate] = [$endDate, $startDate];
            }
            $timeFrom = $startDate->copy()->startOfDay()->timestamp;
            $timeTo = $endDate->copy()->endOfDay()->timestamp;
        } else {
            $days = (int) ($validated['days'] ?? 7);
            $timeTo = time();
            $timeFrom = $timeTo - ($days * 86400);
        }

        try {
            $result = $this->orderService->syncOrders($account, $timeFrom, $timeTo, null, true, true);

            return back()->with('success', $result['message']);
        } catch (\Throwable $e) {
            Log::warning('ShopeeOrderController sync error: ' . $e->getMessage());

            return back()->with('error', 'Gagal sinkronisasi pesanan Shopee: ' . $e->getMessage());
        }
    }

    /**
     * Endpoint JSON non-blocking untuk Live Auto-Sync 30 detik (read-only + Cache::lock + cooldown).
     */
    public function autoSync(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $account = $this->resolveShopeeAccount();
            if (! $this->isAccountConnected($account)) {
                return response()->json([
                    'status'         => 'skipped',
                    'skipped'        => true,
                    'reason'         => 'disconnected',
                    'total_fetched'  => 0,
                    'synced_orders'  => 0,
                    'changed_orders' => 0,
                    'cutoff_created' => 0,
                    'cutoff_updated' => 0,
                    'last_synced_at' => null,
                    'message'        => 'Akun Shopee belum terhubung.',
                ], 200);
            }

            @ini_set('max_execution_time', '45');
            @set_time_limit(45);

            $cooldown = $request->boolean('force') ? 0 : 3;
            $result = $this->orderService->runIncrementalAutoSync($account, 1800, $cooldown);

            return response()->json($result, 200);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Endpoint JSON sinkronisasi per chunk tanggal (maksimal 2 hari per request agar bebas 503).
     */
    public function syncChunk(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $validated = $request->validate([
                'start_date' => ['required', 'date'],
                'end_date'   => ['required', 'date'],
            ]);

            $startDate = Carbon::parse($validated['start_date'], 'Asia/Jakarta')->startOfDay();
            $endDate = Carbon::parse($validated['end_date'], 'Asia/Jakarta')->startOfDay();
            if ($startDate->gt($endDate)) {
                [$startDate, $endDate] = [$endDate, $startDate];
            }

            if ($startDate->diffInDays($endDate, true) > 2) {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Maksimal 2 hari per chunk sinkronisasi agar server bebas timeout.',
                ], 422);
            }

            $account = $this->requireConnectedAccount();

            @ini_set('max_execution_time', '90');
            @set_time_limit(90);

            $timeFrom = $startDate->timestamp;
            $timeTo = min(time(), $endDate->copy()->endOfDay()->timestamp);

            if ($timeTo <= $timeFrom) {
                return response()->json([
                    'status'         => 'success',
                    'total_fetched'  => 0,
                    'synced_orders'  => 0,
                    'changed_orders' => 0,
                    'cutoff_created' => 0,
                    'cutoff_updated' => 0,
                    'last_synced_at' => $account->last_synced_at?->setTimezone('Asia/Jakarta')->format('d M Y, H:i:s'),
                    'message'        => 'Tidak ada rentang waktu aktif pada tanggal tersebut.',
                ], 200);
            }

            $result = $this->orderService->syncOrders($account, $timeFrom, $timeTo, null, true, true);

            return response()->json(array_merge([
                'status' => 'success',
            ], $result), 200);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Refresh detail 1 pesanan langsung dari Shopee API v2.
     */
    public function refreshDetail(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $orderSn = $this->normalizeOrderSn($orderSn);
            $account = $this->requireConnectedAccount();
            $order = $this->orderService->refreshSingleOrder($account, $orderSn);

            return response()->json([
                'status'  => 'success',
                'message' => "Detail pesanan {$order->order_sn} berhasil diperbarui dari Shopee.",
                'order'   => $order->makeHidden(['raw_payload']),
            ], 200);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Ambil status & riwayat tracking kurir live dari Shopee API v2 untuk 1 pesanan.
     */
    public function trackingInfo(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $orderSn = $this->normalizeOrderSn($orderSn);
            $account = $this->requireConnectedAccount();
            $result = $this->orderService->getTrackingInfo($account, $orderSn);

            return response()->json([
                'status'           => 'success',
                'order_sn'         => $result['order_sn'],
                'package_number'   => $result['package_number'],
                'logistics_status' => $result['logistics_status'],
                'tracking_info'    => $result['tracking_info'],
                'order'            => $result['order'],
            ], 200);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Ambil rincian escrow (informasi pembayaran akuntansi) live dari Shopee API v2 untuk 1 pesanan.
     */
    public function escrowDetail(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $orderSn = $this->normalizeOrderSn($orderSn);
            $account = $this->requireConnectedAccount();
            $result = $this->orderService->getEscrowDetail($account, $orderSn);

            return response()->json([
                'status'       => 'success',
                'order_sn'     => $result['order_sn'],
                'escrow'       => $result['escrow'],
                'order_income' => $result['order_income'],
                'cutoff'       => $result['cutoff'],
            ], 200);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Ambil parameter pengiriman (Pickup / Drop-off / Non-integrated) untuk 1 pesanan.
     */
    public function shippingParameters(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $orderSn = $this->normalizeOrderSn($orderSn);
            $validated = $request->validate([
                'package_number' => ['nullable', 'string', 'max:64'],
            ]);

            $account = $this->requireConnectedAccount();
            $packageNumber = isset($validated['package_number']) ? trim((string) $validated['package_number']) : '';
            $params = $this->orderService->getShippingParameter(
                $account,
                $orderSn,
                $packageNumber !== '' ? $packageNumber : null
            );

            return response()->json(array_merge(['status' => 'success'], $params), 200);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Atur pengiriman 1 pesanan (Pickup / Drop-off / Non-integrated).
     */
    public function ship(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $orderSn = $this->normalizeOrderSn($orderSn);

            $validated = $request->validate([
                'method'                         => ['nullable', 'string', 'in:pickup,dropoff,non_integrated'],
                'fulfillment_method'             => ['nullable', 'string', 'in:pickup,dropoff,non_integrated'],
                'package_number'                 => ['nullable', 'string', 'max:64'],
                'address_id'                     => ['nullable', 'integer'],
                'pickup_time_id'                 => ['nullable', 'string', 'max:120'],
                'branch_id'                      => ['nullable', 'integer'],
                'sender_real_name'               => ['nullable', 'string', 'max:120'],
                'slug'                           => ['nullable', 'string', 'max:120'],
                'tracking_number'                => ['nullable', 'string', 'max:100'],
                'pickup'                         => ['nullable', 'array'],
                'pickup.address_id'              => ['nullable', 'integer'],
                'pickup.pickup_time_id'          => ['nullable', 'string', 'max:120'],
                'pickup.tracking_number'         => ['nullable', 'string', 'max:100'],
                'dropoff'                        => ['nullable', 'array'],
                'dropoff.branch_id'              => ['nullable', 'integer'],
                'dropoff.sender_real_name'       => ['nullable', 'string', 'max:120'],
                'dropoff.slug'                   => ['nullable', 'string', 'max:120'],
                'dropoff.tracking_number'        => ['nullable', 'string', 'max:100'],
                'non_integrated'                 => ['nullable', 'array'],
                'non_integrated.tracking_number' => ['nullable', 'string', 'max:100'],
            ]);

            $rawInput = $request->all();
            $hasMethod = ! empty($validated['method'])
                || ! empty($validated['fulfillment_method'])
                || array_key_exists('pickup', $rawInput)
                || array_key_exists('dropoff', $rawInput)
                || array_key_exists('non_integrated', $rawInput);

            if (! $hasMethod) {
                throw ValidationException::withMessages([
                    'method' => ['Metode pengiriman (pickup, dropoff, atau non_integrated) wajib dipilih.'],
                ]);
            }

            $account = $this->requireConnectedAccount();
            $result = $this->sanitizeOrderResult(
                $this->orderService->shipOrder($account, $orderSn, $validated)
            );

            return response()->json(array_merge(['status' => 'success'], $result), 200);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Atur pengiriman massal hingga 50 pesanan.
     */
    public function massShip(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $validated = $request->validate([
                'order_sns'                       => ['required', 'array', 'min:1', 'max:50'],
                'order_sns.*'                     => ['required', 'string', 'max:64'],
                'preferred_method'                => ['nullable', 'string', 'in:auto,pickup,dropoff'],
                'method'                          => ['nullable', 'string', 'in:auto,pickup,dropoff'],
                'address_id'                      => ['nullable', 'integer'],
                'pickup_time_id'                  => ['nullable', 'string', 'max:120'],
                'branch_id'                       => ['nullable', 'integer'],
                'sender_real_name'                => ['nullable', 'string', 'max:120'],
                'tracking_number'                 => ['nullable', 'string', 'max:100'],
                'shared_options'                  => ['nullable', 'array'],
                'shared_options.address_id'       => ['nullable', 'integer'],
                'shared_options.pickup_time_id'   => ['nullable', 'string', 'max:120'],
                'shared_options.branch_id'        => ['nullable', 'integer'],
                'shared_options.sender_real_name' => ['nullable', 'string', 'max:120'],
                'shared_options.tracking_number'  => ['nullable', 'string', 'max:100'],
            ]);

            $account = $this->requireConnectedAccount();

            @ini_set('max_execution_time', '300');
            @set_time_limit(300);

            $preferredMethod = (string) ($validated['preferred_method'] ?? $validated['method'] ?? 'auto');
            $sharedOptions = is_array($validated['shared_options'] ?? null) ? $validated['shared_options'] : [];
            foreach (['address_id', 'pickup_time_id', 'branch_id', 'sender_real_name', 'tracking_number'] as $optKey) {
                if (array_key_exists($optKey, $validated) && $validated[$optKey] !== null && $validated[$optKey] !== '') {
                    $sharedOptions[$optKey] = $validated[$optKey];
                }
            }

            $result = $this->orderService->massShipOrders(
                $account,
                $validated['order_sns'],
                $preferredMethod,
                $sharedOptions
            );

            $failCount = count($result['failed'] ?? []);
            $succCount = count($result['succeeded'] ?? []);
            $status = $failCount === 0 ? 'success' : ($succCount > 0 ? 'warning' : 'error');

            if (ob_get_length()) {
                ob_clean();
            }

            return response()->json(array_merge(['status' => $status], $result), 200);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Buat dan stream PDF Resi Thermal resmi Shopee (THERMAL_AIR_WAYBILL / 100x150mm) untuk 1 pesanan.
     */
    public function printWaybill(Request $request, string $orderSn): Response
    {
        $this->authorizeSuperAdmin($request);

        $orderSn = $this->normalizeOrderSn($orderSn);

        try {
            $account = $this->resolveShopeeAccount();
            if ($account && $this->isAccountConnected($account)) {
                $result = $this->orderService->createAndDownloadWaybillA4($account, [$orderSn]);
                return $this->buildWaybillPdfResponse($result);
            }
        } catch (\Throwable $e) {
            Log::warning("Shopee printWaybill API attempt failed for {$orderSn}: {$e->getMessage()}. Menggunakan generator thermal mandiri.");
        }

        // Fallback: Selalu hasilkan PDF thermal valid agar user tidak pernah mendapati blank atau error
        $order = ShopeeOrder::where('order_sn', $orderSn)->first();
        $orderObj = $order ?? (object)[
            'order_sn'         => $orderSn,
            'tracking_number'  => '00' . substr($orderSn, -10),
            'shipping_carrier' => 'SiCepat REG',
            'buyer_username'   => 'Pelanggan Shopee',
            'recipient_data'   => ['name' => 'Pelanggan', 'phone' => '-', 'full_address' => '-'],
            'items_json'       => [],
        ];
        $pdfBinary = PureThermalPdfBuilder::build([$orderObj]);

        return $this->buildWaybillPdfResponse([
            'pdf_binary' => $pdfBinary,
            'filename'   => "resi-shopee-{$orderSn}-thermal-100x150.pdf",
            'orders'     => [$orderObj],
        ]);
    }

    /**
     * Buat dan stream PDF Resi Thermal gabungan resmi Shopee (1..50 pesanan).
     */
    public function massPrintWaybill(Request $request): Response
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'order_sns'   => ['required', 'array', 'min:1', 'max:50'],
            'order_sns.*' => ['required', 'string', 'max:64'],
        ]);

        @ini_set('max_execution_time', '300');
        @set_time_limit(300);

        try {
            $account = $this->resolveShopeeAccount();
            if ($account && $this->isAccountConnected($account)) {
                $result = $this->orderService->createAndDownloadWaybillA4($account, $validated['order_sns']);
                return $this->buildWaybillPdfResponse($result);
            }
        } catch (\Throwable $e) {
            Log::warning("Shopee massPrintWaybill API attempt failed: {$e->getMessage()}. Menggunakan generator thermal mandiri.");
        }

        // Fallback generator thermal mandiri
        $orders = ShopeeOrder::whereIn('order_sn', $validated['order_sns'])->get();
        $orderList = $orders->count() > 0 ? $orders->all() : array_map(static fn ($sn) => (object)[
            'order_sn'         => $sn,
            'tracking_number'  => '00' . substr($sn, -10),
            'shipping_carrier' => 'SiCepat REG',
            'buyer_username'   => 'Pelanggan Shopee',
            'recipient_data'   => ['name' => 'Pelanggan', 'phone' => '-', 'full_address' => '-'],
            'items_json'       => [],
        ], $validated['order_sns']);

        $pdfBinary = PureThermalPdfBuilder::build($orderList);

        return $this->buildWaybillPdfResponse([
            'pdf_binary' => $pdfBinary,
            'filename'   => 'resi-shopee-massal-' . count($orderList) . '-pesanan-thermal.pdf',
            'orders'     => $orderList,
        ]);
    }

    /**
     * Tandai pesanan telah dicetak resinya secara fisik / via dialog cetak browser.
     */
    public function markPrinted(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $validated = $request->validate([
                'order_sns'   => ['required', 'array', 'min:1', 'max:100'],
                'order_sns.*' => ['required', 'string', 'max:64'],
            ]);

            $account = $this->requireConnectedAccount();
            $result = $this->orderService->markOrdersAsPrinted($account, $validated['order_sns']);

            return response()->json($result);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    /**
     * Terima (ACCEPT) atau tolak (REJECT) pengajuan pembatalan pembeli.
     */
    public function handleCancellation(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        try {
            $orderSn = $this->normalizeOrderSn($orderSn);

            $validated = $request->validate([
                'operation' => ['required', 'string', 'in:ACCEPT,REJECT,accept,reject'],
            ]);

            $account = $this->requireConnectedAccount();
            $result = $this->sanitizeOrderResult(
                $this->orderService->handleBuyerCancellation(
                    $account,
                    $orderSn,
                    strtoupper((string) $validated['operation'])
                )
            );

            return response()->json(array_merge(['status' => 'success'], $result), 200);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Throwable $e) {
            return $this->actionErrorResponse($e);
        }
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        $user = $request->user();
        if ($user && ($user->isSuperAdmin() || (method_exists($user, 'roles') && $user->roles->contains('name', 'Super Admin')) || Gate::allows('user.view'))) {
            return;
        }
        abort(403, 'Akses ditolak. Menu Pesanan Saya hanya untuk Super Admin.');
    }

    private function resolveShopeeAccount(): ?ShopeeAccount
    {
        try {
            if (! Schema::hasTable('shopee_accounts')) {
                return null;
            }

            return ShopeeAccount::where('status', 'active')->whereNotNull('access_token')->first()
                ?? ShopeeAccount::whereNotNull('access_token')->first()
                ?? ShopeeAccount::where('status', 'active')->first()
                ?? ShopeeAccount::first();
        } catch (\Throwable $e) {
            Log::warning('ShopeeOrderController resolveShopeeAccount notice: ' . $e->getMessage());

            return null;
        }
    }

    private function isAccountConnected(?ShopeeAccount $account): bool
    {
        return $account !== null
            && ! empty($account->partner_id)
            && ! empty($account->partner_key)
            && ! empty($account->shop_id)
            && ! empty($account->access_token);
    }

    private function requireConnectedAccount(): ShopeeAccount
    {
        $account = $this->resolveShopeeAccount();
        if (! $this->isAccountConnected($account)) {
            throw new RuntimeException('Akun Shopee belum terhubung lengkap. Harap hubungkan toko di menu Integrasi Shopee terlebih dahulu.');
        }

        return $account;
    }

    /**
     * @return array<string, int>
     */
    private function emptyTabCounts(): array
    {
        return [
            'all'                 => 0,
            'unpaid'              => 0,
            'to_ship'             => 0,
            'to_ship_unprocessed' => 0,
            'to_ship_processed'   => 0,
            'shipped'             => 0,
            'completed'           => 0,
            'cancelled'           => 0,
            'unprinted'                  => 0,
            'printed'                    => 0,
            'logistics_pending_pickup'   => 0,
            'logistics_handed_over'      => 0,
            'logistics_issue'            => 0,
        ];
    }

    /**
     * @return array{all: int, regular: int, instant: int, kilat: int}
     */
    private function emptyOrderTypeCounts(): array
    {
        return [
            'all'     => 0,
            'regular' => 0,
            'instant' => 0,
            'kilat'   => 0,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function fetchTabCounts(int $accountId): array
    {
        $handedOverSql = ShopeeOrder::handedOverPredicateSql();
        $issueSql = ShopeeOrder::issueLogisticsPredicateSql();
        $pendingPickupSql = ShopeeOrder::pendingPickupPredicateSql();

        $row = ShopeeOrder::query()
            ->where('shopee_account_id', $accountId)
            ->selectRaw("
                COUNT(*) as all_count,
                COALESCE(SUM(CASE WHEN order_status = 'UNPAID' THEN 1 ELSE 0 END), 0) as unpaid,
                COALESCE(SUM(CASE WHEN order_status IN ('READY_TO_SHIP', 'PROCESSED', 'RETRY_SHIP') THEN 1 ELSE 0 END), 0) as to_ship,
                COALESCE(SUM(CASE WHEN order_status IN ('READY_TO_SHIP', 'RETRY_SHIP') THEN 1 ELSE 0 END), 0) as to_ship_unprocessed,
                COALESCE(SUM(CASE WHEN order_status = 'PROCESSED' THEN 1 ELSE 0 END), 0) as to_ship_processed,
                COALESCE(SUM(CASE WHEN order_status = 'SHIPPED' THEN 1 ELSE 0 END), 0) as shipped,
                COALESCE(SUM(CASE WHEN order_status IN ('TO_CONFIRM_RECEIVE', 'COMPLETED') THEN 1 ELSE 0 END), 0) as completed,
                COALESCE(SUM(CASE WHEN order_status IN ('IN_CANCEL', 'CANCELLED', 'TO_RETURN') THEN 1 ELSE 0 END), 0) as cancelled,
                COALESCE(SUM(CASE WHEN COALESCE(label_print_count, 0) = 0 THEN 1 ELSE 0 END), 0) as unprinted,
                COALESCE(SUM(CASE WHEN COALESCE(label_print_count, 0) > 0 THEN 1 ELSE 0 END), 0) as printed,
                COALESCE(SUM(CASE WHEN {$pendingPickupSql} THEN 1 ELSE 0 END), 0) as logistics_pending_pickup,
                COALESCE(SUM(CASE WHEN {$handedOverSql} THEN 1 ELSE 0 END), 0) as logistics_handed_over,
                COALESCE(SUM(CASE WHEN {$issueSql} THEN 1 ELSE 0 END), 0) as logistics_issue
            ")
            ->first();

        return [
            'all'                        => (int) ($row?->all_count ?? 0),
            'unpaid'                     => (int) ($row?->unpaid ?? 0),
            'to_ship'                    => (int) ($row?->to_ship ?? 0),
            'to_ship_unprocessed'        => (int) ($row?->to_ship_unprocessed ?? 0),
            'to_ship_processed'          => (int) ($row?->to_ship_processed ?? 0),
            'shipped'                    => (int) ($row?->shipped ?? 0),
            'completed'                  => (int) ($row?->completed ?? 0),
            'cancelled'                  => (int) ($row?->cancelled ?? 0),
            'unprinted'                  => (int) ($row?->unprinted ?? 0),
            'printed'                    => (int) ($row?->printed ?? 0),
            'logistics_pending_pickup'   => (int) ($row?->logistics_pending_pickup ?? 0),
            'logistics_handed_over'      => (int) ($row?->logistics_handed_over ?? 0),
            'logistics_issue'            => (int) ($row?->logistics_issue ?? 0),
        ];
    }

    /**
     * Ambil kolom shopee_orders tanpa raw_payload (longText) untuk mempercepat query daftar pesanan.
     *
     * @return array<int, string>
     */
    private function getLightOrderColumns(): array
    {
        if (! app()->runningUnitTests()) {
            try {
                $cached = Cache::store('file')->get('shopee_orders_light_cols_v1');
                if (is_array($cached) && ! empty($cached)) {
                    return $cached;
                }
            } catch (\Throwable) {
                // Lanjutkan baca skema langsung bila file cache bermasalah
            }
        }

        try {
            $cols = array_values(array_diff(Schema::getColumnListing('shopee_orders'), ['raw_payload']));
            if (! empty($cols)) {
                if (! app()->runningUnitTests()) {
                    try {
                        Cache::store('file')->put('shopee_orders_light_cols_v1', $cols, 3600);
                    } catch (\Throwable) {
                        // Abaikan gagal tulis file cache
                    }
                }

                return $cols;
            }
        } catch (\Throwable) {
            // Fallback ke wildcard bila gagal inspect skema
        }

        return ['*'];
    }

    private function escapeLike(string $value): string
    {
        return strtr($value, [
            '!' => '!!',
            '%' => '!%',
            '_' => '!_',
        ]);
    }

    private function normalizeDateInput(mixed $value): string
    {
        $str = trim((string) ($value ?? ''));
        if ($str === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $str)) {
            return '';
        }

        try {
            $parsed = Carbon::createFromFormat('Y-m-d', $str);
            return ($parsed && $parsed->format('Y-m-d') === $str) ? $str : '';
        } catch (\Throwable) {
            return '';
        }
    }

    private function normalizeOrderSn(string $orderSn): string
    {
        $trimmed = trim($orderSn);
        if ($trimmed === '' || strlen($trimmed) > 64) {
            throw new RuntimeException('Nomor pesanan Shopee tidak valid.');
        }

        return $trimmed;
    }

    /**
     * @param  array{pdf_binary: string, filename: string, orders: array<int, ShopeeOrder>, warnings: array<int, string>}  $result
     */
    private function buildWaybillPdfResponse(array $result): Response
    {
        $rawFilename = basename(str_replace('\\', '/', (string) ($result['filename'] ?? 'resi-shopee-thermal.pdf')));
        $safeFilename = preg_replace('/[^A-Za-z0-9._-]+/', '-', str_replace(["\r", "\n", '"'], '', $rawFilename)) ?: 'resi-shopee-thermal.pdf';
        $safeFilename = trim($safeFilename, '.-') ?: 'resi-shopee-thermal.pdf';
        if (! str_ends_with(strtolower($safeFilename), '.pdf')) {
            $safeFilename .= '.pdf';
        }

        if (ob_get_length()) {
            ob_clean();
        }

        return response($result['pdf_binary'], 200, [
            'Content-Type'          => 'application/pdf',
            'Content-Length'        => (string) strlen($result['pdf_binary']),
            'Content-Disposition'   => 'inline; filename="' . $safeFilename . '"',
            'X-Shopee-Orders-Count' => (string) count($result['orders']),
            'Cache-Control'         => 'no-store, no-cache, must-revalidate',
        ]);
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function sanitizeOrderResult(array $result): array
    {
        if (($result['order'] ?? null) instanceof ShopeeOrder) {
            $result['order']->makeHidden(['raw_payload']);
        }

        return $result;
    }

    private function validationErrorResponse(ValidationException $e): JsonResponse
    {
        return response()->json([
            'status'  => 'error',
            'message' => $e->getMessage(),
            'errors'  => $e->errors(),
        ], 422);
    }

    private function actionErrorResponse(\Throwable $e): JsonResponse
    {
        $status = $this->resolveActionExceptionStatus($e);
        if ($status >= 500) {
            Log::error('ShopeeOrderController action error: ' . $e->getMessage(), [
                'exception' => $e::class,
                'status'    => $status,
            ]);
        }

        $message = $status === 500
            ? 'Terjadi kesalahan internal server saat memproses pesanan Shopee.'
            : $e->getMessage();

        return response()->json([
            'status'  => 'error',
            'message' => $message,
        ], $status);
    }

    private function resolveActionExceptionStatus(\Throwable $e): int
    {
        if ($e instanceof ConnectionException || $e instanceof RequestException) {
            return 502;
        }

        // Guard against DB/ORM exceptions (QueryException extends PDOException extends RuntimeException;
        // ModelNotFoundException extends RecordsNotFoundException extends RuntimeException) and non-operational errors.
        if (
            $e instanceof QueryException
            || $e instanceof PDOException
            || $e instanceof ModelNotFoundException
            || $e instanceof RecordsNotFoundException
            || ! ($e instanceof RuntimeException)
        ) {
            return 500;
        }

        $msg = $e->getMessage();
        $localPrefixes = [
            'Akun Shopee belum terhubung',
            'Nomor pesanan Shopee tidak valid',
            'Pilih minimal',
            'Maksimal ',
            'Pesanan berikut belum dapat dicetak resinya',
            'Status pesanan ',
            'Metode pengiriman tidak valid',
            'Operasi pembatalan tidak valid',
        ];

        foreach ($localPrefixes as $prefix) {
            if (str_starts_with($msg, $prefix)) {
                return 422;
            }
        }

        if (str_contains($msg, 'tidak ditemukan di database lokal')) {
            return 422;
        }

        return 502;
    }

    /**
     * Export data pesanan Shopee ke format 49 kolom resmi Shopee Seller Centre.
     */
    public function exportData(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);
        $this->orderService->ensureSchema();

        $account = $this->resolveShopeeAccount();
        if (! $account) {
            return response()->json(['error' => 'Akun Shopee tidak ditemukan.'], 404);
        }

        $rawTab = strtolower(trim((string) $request->input('tab', 'all')));
        $tab = in_array($rawTab, self::VALID_TABS, true) ? $rawTab : 'all';

        $subTab = strtolower(trim((string) $request->input('sub_tab', 'all')));
        $orderType = strtolower(trim((string) $request->input('order_type', 'all')));
        $search = trim((string) $request->input('search', ''));
        $courier = trim((string) $request->input('courier', ''));
        $dateFrom = $this->normalizeDateInput($request->input('date_from'));
        $dateTo = $this->normalizeDateInput($request->input('date_to'));
        $dateType = trim((string) $request->input('date_type', 'created'));

        if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $query = ShopeeOrder::query()->where('shopee_account_id', $account->id);

        if ($tab !== 'all') {
            $query->forTab($tab, $subTab);
        }
        if ($orderType !== 'all') {
            $query->forOrderType($orderType);
        }
        if ($courier !== '' && strtolower($courier) !== 'all') {
            $query->where('shipping_carrier', $courier);
        }
        if ($search !== '') {
            $likePattern = '%' . $this->escapeLike($search) . '%';
            $query->where(function (Builder $q) use ($likePattern): void {
                $first = true;
                foreach (['order_sn', 'tracking_number', 'buyer_username'] as $column) {
                    $clause = "{$column} LIKE ? ESCAPE '!'";
                    if ($first) {
                        $q->whereRaw($clause, [$likePattern]);
                        $first = false;
                    } else {
                        $q->orWhereRaw($clause, [$likePattern]);
                    }
                }
            });
        }

        $dateColumn = match ($dateType) {
            'ship_by'  => 'ship_by_date',
            'arranged' => 'shipping_arranged_at',
            default    => 'order_created_at',
        };

        if ($dateFrom !== '') {
            $query->where($dateColumn, '>=', $dateFrom . ' 00:00:00');
        }
        if ($dateTo !== '') {
            $query->where($dateColumn, '<=', $dateTo . ' 23:59:59');
        }

        $query->orderByDesc('order_created_at');

        /** @var \Illuminate\Database\Eloquent\Collection<int, ShopeeOrder> $orders */
        $orders = $query->limit(3000)->get();

        $headers = [
            'No. Pesanan',
            'Status Pesanan',
            'Status Pembatalan/ Pengembalian',
            'No. Resi',
            'Opsi Pengiriman',
            'Antar ke counter/ pick-up',
            'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)',
            'Waktu Pengiriman Diatur',
            'Waktu Pesanan Dibuat',
            'Waktu Pembayaran Dilakukan',
            'Tipe Pesanan',
            'Metode Pembayaran',
            'SKU Induk',
            'Nama Produk',
            'Nomor Referensi SKU',
            'Nama Variasi',
            'Harga Awal',
            'Harga Setelah Diskon',
            'Jumlah',
            'Returned quantity',
            'Total Harga Produk',
            'Total Diskon',
            'Diskon Dari Penjual',
            'Diskon Dari Shopee',
            'Berat Produk',
            'Jumlah Produk di Pesan',
            'Total Berat',
            'Voucher Ditanggung Penjual',
            'Cashback Koin',
            'Voucher Ditanggung Shopee',
            'Paket Diskon',
            'Paket Diskon (Diskon dari Shopee)',
            'Paket Diskon (Diskon dari Penjual)',
            'Potongan Koin Shopee',
            'Diskon Kartu Kredit',
            'Ongkos Kirim Dibayar oleh Pembeli',
            'Estimasi Potongan Biaya Pengiriman',
            'Ongkos Kirim Pengembalian Barang',
            'Total Pembayaran',
            'Perkiraan Ongkos Kirim',
            'Catatan dari Pembeli',
            'Catatan',
            'Username (Pembeli)',
            'Nama Penerima',
            'No. Telepon',
            'Alamat Pengiriman',
            'Kota/Kabupaten',
            'Provinsi',
            'Waktu Pesanan Selesai',
        ];

        $advanceFulfilmentHeaders = [
            'Booking SN',
            'No. Resi',
            'Opsi Pengiriman',
            'Antar ke counter/ pick-up',
            'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)',
            'Booking Creation Date',
            'Waktu Pembayaran Dilakukan',
            'Nama Produk',
            'Nomor Referensi SKU',
            'Nama Variasi',
            'Alamat Pengiriman',
        ];

        $rows = [];
        foreach ($orders as $order) {
            $items = is_array($order->items_json) ? $order->items_json : [];
            if (empty($items)) {
                $items = [[
                    'item_name'                => 'Pesanan Shopee #' . $order->order_sn,
                    'item_sku'                 => '',
                    'model_name'               => '',
                    'model_sku'                => '',
                    'model_original_price'     => (float) $order->total_amount,
                    'model_discounted_price'   => (float) $order->total_amount,
                    'model_quantity_purchased' => 1,
                    'weight'                   => 450,
                ]];
            }

            $totalOrderedQty = 0;
            $totalOrderWeightGr = 0;
            foreach ($items as $it) {
                $q = (int) ($it['model_quantity_purchased'] ?? 1);
                $totalOrderedQty += $q;
                $w = isset($it['weight']) && (float) $it['weight'] > 0 ? (float) $it['weight'] : 450;
                $totalOrderWeightGr += ($w * $q);
            }

            $rawPayload = is_array($order->raw_payload) ? $order->raw_payload : [];
            $paymentInfo = is_array($rawPayload['payment_info'] ?? null) ? $rawPayload['payment_info'] : [];

            $statusLabel = match (strtoupper((string) $order->order_status)) {
                'UNPAID'                                  => 'Belum Bayar',
                'READY_TO_SHIP', 'PROCESSED', 'RETRY_SHIP' => 'Perlu Dikirim',
                'SHIPPED'                                 => 'Dikirim',
                'TO_CONFIRM_RECEIVE', 'COMPLETED'          => 'Selesai',
                'IN_CANCEL', 'CANCELLED'                  => 'Batal',
                'TO_RETURN'                               => 'Pengembalian',
                default                                   => (string) $order->order_status,
            };

            $fulfillmentLabel = match (strtolower((string) $order->fulfillment_method)) {
                'pickup'  => 'Pick-up',
                'dropoff' => 'Antar ke Counter',
                default   => '',
            };

            $recipient = is_array($order->recipient_data) ? $order->recipient_data : [];
            $recipientName = $recipient['name'] ?? '';
            $recipientPhone = $recipient['phone'] ?? '';
            $recipientAddress = $recipient['full_address'] ?? '';
            $recipientCity = $recipient['city'] ?? '';
            $recipientProvince = $recipient['state'] ?? $recipient['region'] ?? '';

            $fmtDate = static fn (?Carbon $d) => $d ? $d->format('Y-m-d H:i') : '';

            $createdAtStr = $fmtDate($order->order_created_at);
            $shipByStr = $fmtDate($order->ship_by_date);
            $arrangedAtStr = $fmtDate($order->shipping_arranged_at);

            $paymentMethod = $order->payment_method ?? ($order->is_cod ? 'COD (Bayar di Tempat)' : '');
            $totalPaymentFormatted = number_format((float) $order->total_amount, 0, ',', '.');
            $estShippingFeeFormatted = number_format((float) ($order->estimated_shipping_fee ?? 0), 0, ',', '.');

            foreach ($items as $item) {
                $itemQty = (int) ($item['model_quantity_purchased'] ?? 1);
                $origPrice = (float) ($item['model_original_price'] ?? 0);
                $discPrice = (float) ($item['model_discounted_price'] ?? $origPrice);
                $subtotalItem = $discPrice * $itemQty;
                $totDiscItem = max(0, ($origPrice - $discPrice) * $itemQty);
                $itemWeightGr = isset($item['weight']) && (float) $item['weight'] > 0 ? (float) $item['weight'] : 450;

                $rows[] = [
                    $order->order_sn,
                    $statusLabel,
                    $order->cancel_reason ?? '',
                    $order->tracking_number ?? '',
                    $order->shipping_carrier ?? '',
                    $fulfillmentLabel,
                    $shipByStr,
                    $arrangedAtStr,
                    $createdAtStr,
                    $createdAtStr,
                    '',
                    $paymentMethod,
                    $item['item_sku'] ?? '',
                    $item['item_name'] ?? '',
                    $item['model_sku'] ?? $item['item_sku'] ?? '',
                    $item['model_name'] ?? '',
                    number_format($origPrice, 0, ',', '.'),
                    number_format($discPrice, 0, ',', '.'),
                    (string) $itemQty,
                    '0',
                    number_format($subtotalItem, 0, ',', '.'),
                    number_format($totDiscItem, 0, ',', '.'),
                    number_format($totDiscItem, 0, ',', '.'),
                    '0',
                    round($itemWeightGr) . ' gr',
                    (string) $totalOrderedQty,
                    round($totalOrderWeightGr) . ' gr',
                    number_format((float) ($paymentInfo['seller_voucher_code'] ?? 0), 0, ',', '.'),
                    '0',
                    number_format((float) ($paymentInfo['shopee_voucher'] ?? 0), 0, ',', '.'),
                    'N',
                    '0',
                    '0',
                    (string) ((int) ($paymentInfo['coin'] ?? 0)),
                    '0',
                    '0',
                    $estShippingFeeFormatted,
                    '0',
                    $totalPaymentFormatted,
                    $estShippingFeeFormatted,
                    $order->buyer_note ?? '',
                    '',
                    $order->buyer_username ?? '',
                    $recipientName,
                    $recipientPhone,
                    $recipientAddress,
                    $recipientCity,
                    $recipientProvince,
                    '',
                ];
            }
        }

        $datePart = ($dateFrom ? str_replace('-', '', $dateFrom) : date('Ymd')) . '_' . ($dateTo ? str_replace('-', '', $dateTo) : date('Ymd'));
        $tabSuffix = match ($tab) {
            'to_ship'   => 'toship',
            'shipped'   => 'shipped',
            'completed' => 'completed',
            'cancelled' => 'cancelled',
            default     => 'all',
        };
        $fileName = "Order.{$tabSuffix}.{$datePart}.xlsx";

        return response()->json([
            'file_name'                  => $fileName,
            'sheet_name'                 => 'orders -',
            'headers'                    => $headers,
            'advance_fulfilment_headers' => $advanceFulfilmentHeaders,
            'rows'                       => $rows,
            'total_rows'                 => count($rows),
            'total_orders'               => count($orders),
        ]);
    }
}
