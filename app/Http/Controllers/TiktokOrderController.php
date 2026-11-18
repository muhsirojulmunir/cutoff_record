<?php

namespace App\Http\Controllers;

use App\Models\TiktokAccount;
use App\Models\TiktokOrder;
use App\Services\TiktokOrderService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class TiktokOrderController extends Controller
{
    private const VALID_TABS = [
        TiktokOrder::TAB_ALL,
        TiktokOrder::TAB_UNPAID,
        TiktokOrder::TAB_TO_SHIP,
        TiktokOrder::TAB_SHIPPED,
        TiktokOrder::TAB_COMPLETED,
        TiktokOrder::TAB_CANCELLED,
    ];

    private const VALID_SUBTABS = [
        TiktokOrder::SUBTAB_ALL,
        TiktokOrder::SUBTAB_UNPROCESSED,
        TiktokOrder::SUBTAB_PROCESSED,
    ];

    private const VALID_PRINT_STATUSES = ['all', 'unprinted', 'printed'];
    private const VALID_SORTS = ['ship_by_asc', 'newest', 'oldest'];

    public function __construct(
        private readonly TiktokOrderService $orderService,
    ) {}

    /**
     * Halaman utama "Pesanan Saya TikTok" (khusus Super Admin & User yang berhak).
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorizeAccess($request);
        $this->orderService->ensureSchema();

        $account = $this->resolveTiktokAccount();

        $rawTab = strtolower(trim((string) $request->input('tab', TiktokOrder::TAB_TO_SHIP)));
        $tab = in_array($rawTab, self::VALID_TABS, true) ? $rawTab : TiktokOrder::TAB_TO_SHIP;

        $hasExplicitSubTab = $request->has('sub_tab') && trim((string) $request->input('sub_tab')) !== '';
        $rawSubTab = $hasExplicitSubTab
            ? strtolower(trim((string) $request->input('sub_tab')))
            : TiktokOrder::SUBTAB_UNPROCESSED;
        $subTab = ($tab === TiktokOrder::TAB_TO_SHIP && in_array($rawSubTab, self::VALID_SUBTABS, true))
            ? $rawSubTab
            : TiktokOrder::SUBTAB_ALL;

        $rawOrderType = strtolower(trim((string) $request->input('order_type', TiktokOrder::ORDERTYPE_ALL)));
        $orderType = in_array($rawOrderType, TiktokOrder::VALID_ORDER_TYPES, true)
            ? $rawOrderType
            : TiktokOrder::ORDERTYPE_ALL;

        $rawPrintStatus = strtolower(trim((string) $request->input('print_status', 'all')));
        $printStatus = in_array($rawPrintStatus, self::VALID_PRINT_STATUSES, true) ? $rawPrintStatus : 'all';

        $rawLogisticsStatus = strtolower(trim((string) $request->input('logistics_status', TiktokOrder::LOGISTICS_FILTER_ALL)));
        $logisticsStatus = in_array($rawLogisticsStatus, TiktokOrder::VALID_LOGISTICS_FILTERS, true)
            ? $rawLogisticsStatus
            : TiktokOrder::LOGISTICS_FILTER_ALL;

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

        $tabCounts = $this->fetchTabCounts($account?->id ?? 1);
        $orderTypeCounts = $this->computeOrderTypeCounts($account?->id ?? 1, $tab);

        $carriers = TiktokOrder::query()
            ->whereNotNull('shipping_carrier')
            ->whereRaw("TRIM(shipping_carrier) != ''")
            ->distinct()
            ->orderBy('shipping_carrier', 'asc')
            ->pluck('shipping_carrier')
            ->values()
            ->all();

        $query = TiktokOrder::query()
            ->forTab($tab, $subTab)
            ->forOrderType($orderType)
            ->forPrintStatus($printStatus)
            ->forLogisticsStatus($logisticsStatus);

        if ($account) {
            $query->where('tiktok_account_id', $account->id);
        }

        if ($search !== '') {
            $likePattern = '%' . addcslashes($search, '%_') . '%';
            $query->where(function (Builder $q) use ($likePattern): void {
                $q->where('order_sn', 'like', $likePattern)
                  ->orWhere('tracking_number', 'like', $likePattern)
                  ->orWhere('buyer_username', 'like', $likePattern)
                  ->orWhere('items_json', 'like', $likePattern);
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
        $allMatchingOrders = [];
        if ($orders->total() <= 200) {
            $allMatchingOrders = (clone $query)->limit(200)->get()->each->makeHidden(['raw_payload'])->values()->all();
        }

        return Inertia::render('Tiktok/Orders', [
            'account'             => $account?->toSafeArray(),
            'orders'              => $orders,
            'allMatchingOrderSns' => $allMatchingOrderSns,
            'allMatchingOrders'   => $allMatchingOrders,
            'tabCounts'           => $tabCounts,
            'orderTypeCounts'     => $orderTypeCounts,
            'carriers'            => $carriers,
            'hasDummyData'    => TiktokOrder::whereIn('order_sn', TiktokOrderService::DUMMY_ORDER_SNS)->exists(),
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

    public function clearSample(Request $request): RedirectResponse
    {
        $this->authorizeAccess($request);
        $deleted = $this->orderService->clearSampleOrders();

        return back()->with('success', "Data contoh berhasil dibersihkan ({$deleted} order contoh dihapus). Menunggu pesanan real dari TikTok Shop.");
    }

    public function resetSample(Request $request): RedirectResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();
        $this->orderService->reseedSampleOrders($account);

        return back()->with('success', 'Data contoh (dummy) TikTok berhasil dimuat ulang.');
    }

    public function sync(Request $request): RedirectResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();

        $validated = $request->validate([
            'days'       => ['nullable', 'integer', 'min:1', 'max:90'],
            'start_date' => ['nullable', 'date', 'required_with:end_date'],
            'end_date'   => ['nullable', 'date', 'required_with:start_date'],
        ]);

        if (! empty($validated['start_date']) && ! empty($validated['end_date'])) {
            $startDate = Carbon::parse($validated['start_date'], 'Asia/Jakarta');
            $endDate = Carbon::parse($validated['end_date'], 'Asia/Jakarta');
            if ($startDate->gt($endDate)) {
                [$startDate, $endDate] = [$endDate, $startDate];
            }
            $timeFrom = $startDate->copy()->startOfDay()->timestamp;
            $timeTo = $endDate->copy()->endOfDay()->timestamp;
        } else {
            $days = (int) ($validated['days'] ?? 14);
            $timeTo = time();
            $timeFrom = $timeTo - ($days * 86400);
        }

        try {
            $result = $this->orderService->syncOrders($account, $timeFrom, $timeTo);
            return back()->with('success', $result['message']);
        } catch (\Throwable $e) {
            return back()->with('error', 'Gagal sinkronisasi pesanan TikTok: ' . $e->getMessage());
        }
    }

    public function autoSync(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();
        $result = $this->orderService->autoSync($account);

        return response()->json($result);
    }

    public function syncChunk(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();
        $date = (string) $request->input('date', now()->format('Y-m-d'));
        $chunkIndex = (int) $request->input('chunk_index', 0);
        $totalChunks = (int) $request->input('total_chunks', 1);

        $result = $this->orderService->syncChunk($account, $date, $chunkIndex, $totalChunks);

        return response()->json($result);
    }

    public function massShip(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();

        $validated = $request->validate([
            'order_sns'        => ['required', 'array', 'min:1'],
            'order_sns.*'      => ['required', 'string'],
            'preferred_method' => ['nullable', 'string', 'in:auto,pickup,dropoff'],
        ]);

        $result = $this->orderService->massShip(
            $account,
            $validated['order_sns'],
            $validated['preferred_method'] ?? 'auto'
        );

        return response()->json($result);
    }

    public function shippingParameters(string $orderSn): JsonResponse
    {
        $account = $this->resolveTiktokAccount();
        $result = $this->orderService->getShippingParameters($account, $orderSn);

        return response()->json($result);
    }

    public function ship(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();

        $validated = $request->validate([
            'method'             => ['nullable', 'string', 'in:pickup,dropoff,non_integrated'],
            'fulfillment_method' => ['nullable', 'string', 'in:pickup,dropoff,non_integrated'],
            'address_id'         => ['nullable'],
            'pickup_time_id'     => ['nullable', 'string'],
            'branch_id'          => ['nullable', 'string'],
            'tracking_number'    => ['nullable', 'string', 'max:100'],
            'sender_real_name'   => ['nullable', 'string', 'max:120'],
        ]);

        $validated['fulfillment_method'] = $validated['method'] ?? $validated['fulfillment_method'] ?? 'pickup';

        $result = $this->orderService->ship($account, $orderSn, $validated);

        return response()->json($result);
    }

    public function refreshDetail(string $orderSn): JsonResponse
    {
        $account = $this->resolveTiktokAccount();
        $order = $this->orderService->refreshSingleOrder($account, $orderSn);

        return response()->json([
            'status'   => 'success',
            'order_sn' => $order->order_sn,
            'order'    => $order->makeHidden(['raw_payload']),
            'message'  => "Detail pesanan TikTok {$orderSn} berhasil diperbarui.",
        ]);
    }

    public function escrowDetail(string $orderSn): JsonResponse
    {
        $account = $this->resolveTiktokAccount();
        $result = $this->orderService->getEscrowDetail($account, $orderSn);

        return response()->json($result);
    }

    public function trackingInfo(string $orderSn): JsonResponse
    {
        $account = $this->resolveTiktokAccount();
        $result = $this->orderService->getTrackingInfo($account, $orderSn);

        return response()->json($result);
    }

    public function handleCancellation(Request $request, string $orderSn): JsonResponse
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();

        $validated = $request->validate([
            'operation' => ['required', 'string', 'in:ACCEPT,REJECT'],
        ]);

        $result = $this->orderService->handleBuyerCancellation($account, $orderSn, $validated['operation']);

        return response()->json($result);
    }

    public function printWaybill(string $orderSn): Response
    {
        $account = $this->resolveTiktokAccount();
        $pdfBinary = $this->orderService->generateWaybillPdf($account, [$orderSn]);

        return response($pdfBinary, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => "inline; filename=\"waybill-tiktok-{$orderSn}.pdf\"",
            'x-shopee-orders-count' => 1,
        ]);
    }

    public function massPrintWaybill(Request $request): Response
    {
        $this->authorizeAccess($request);
        $account = $this->resolveTiktokAccount();

        $validated = $request->validate([
            'order_sns'   => ['required', 'array', 'min:1'],
            'order_sns.*' => ['required', 'string'],
        ]);

        $pdfBinary = $this->orderService->generateWaybillPdf($account, $validated['order_sns']);

        return response($pdfBinary, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'inline; filename="mass-waybill-tiktok.pdf"',
            'x-shopee-orders-count' => count($validated['order_sns']),
        ]);
    }

    private function resolveTiktokAccount(): TiktokAccount
    {
        return TiktokAccount::firstOrCreate(
            ['id' => 1],
            [
                'account_name'      => 'RecordShoesOfficial',
                'app_key'           => '6lpakhma3ecn8',
                'service_id'        => '7702820460932712212',
                'shop_id'           => '7494083438199277309',
                'connection_status' => 'connected',
                'status'            => 'active',
            ]
        );
    }

    private function authorizeAccess(Request $request): void
    {
        $user = $request->user();
        if ($user && ($user->isSuperAdmin() || (method_exists($user, 'roles') && $user->roles->contains('name', 'Super Admin')))) {
            return;
        }

        if (Gate::allows('user.view')) {
            return;
        }

        abort(403, 'Akses terbatas untuk Super Admin.');
    }

    private function fetchTabCounts(int $accountId): array
    {
        $base = TiktokOrder::query()->where('tiktok_account_id', $accountId);

        return [
            TiktokOrder::TAB_ALL       => (clone $base)->count(),
            TiktokOrder::TAB_UNPAID    => (clone $base)->forTab(TiktokOrder::TAB_UNPAID)->count(),
            TiktokOrder::TAB_TO_SHIP   => (clone $base)->forTab(TiktokOrder::TAB_TO_SHIP)->count(),
            'to_ship_unprocessed'      => (clone $base)->forTab(TiktokOrder::TAB_TO_SHIP, TiktokOrder::SUBTAB_UNPROCESSED)->count(),
            'to_ship_processed'        => (clone $base)->forTab(TiktokOrder::TAB_TO_SHIP, TiktokOrder::SUBTAB_PROCESSED)->count(),
            TiktokOrder::TAB_SHIPPED   => (clone $base)->forTab(TiktokOrder::TAB_SHIPPED)->count(),
            TiktokOrder::TAB_COMPLETED => (clone $base)->forTab(TiktokOrder::TAB_COMPLETED)->count(),
            TiktokOrder::TAB_CANCELLED => (clone $base)->forTab(TiktokOrder::TAB_CANCELLED)->count(),
        ];
    }

    private function computeOrderTypeCounts(int $accountId, string $tab): array
    {
        $base = TiktokOrder::query()
            ->where('tiktok_account_id', $accountId)
            ->forTab($tab, 'all');

        return [
            TiktokOrder::ORDERTYPE_ALL     => (clone $base)->count(),
            TiktokOrder::ORDERTYPE_REGULAR => (clone $base)->forOrderType(TiktokOrder::ORDERTYPE_REGULAR)->count(),
            TiktokOrder::ORDERTYPE_INSTANT => (clone $base)->forOrderType(TiktokOrder::ORDERTYPE_INSTANT)->count(),
            TiktokOrder::ORDERTYPE_KILAT   => (clone $base)->forOrderType(TiktokOrder::ORDERTYPE_KILAT)->count(),
        ];
    }

    private function normalizeDateInput(mixed $value): string
    {
        if (! is_string($value)) {
            return '';
        }
        $val = trim($value);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $val) ? $val : '';
    }

    /**
     * Export data pesanan TikTok ke format 65 kolom resmi TikTok Seller Center.
     */
    public function exportData(Request $request): JsonResponse
    {
        $this->authorizeAccess($request);
        $this->orderService->ensureSchema();

        $account = $this->resolveTiktokAccount();
        if (! $account) {
            return response()->json(['error' => 'Akun TikTok tidak ditemukan.'], 404);
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

        $query = TiktokOrder::query()->where('tiktok_account_id', $account->id);

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
            $likePattern = '%' . addcslashes($search, '%_') . '%';
            $query->where(function (Builder $q) use ($likePattern): void {
                $q->where('order_sn', 'like', $likePattern)
                  ->orWhere('tracking_number', 'like', $likePattern)
                  ->orWhere('buyer_username', 'like', $likePattern)
                  ->orWhere('items_json', 'like', $likePattern);
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

        /** @var \Illuminate\Database\Eloquent\Collection<int, TiktokOrder> $orders */
        $orders = $query->limit(3000)->get();

        $headers = [
            'Order ID',
            'Order Status',
            'Order Substatus',
            'Cancelation/Return Type',
            'Normal or Pre-order',
            'SKU ID',
            'Seller SKU',
            'Product Name',
            'Variation',
            'Quantity',
            'Sku Quantity of return',
            'SKU Unit Original Price',
            'SKU Subtotal Before Discount',
            'SKU Platform Discount',
            'SKU Seller Discount',
            'SKU Subtotal After Discount',
            'Shipping Fee After Discount',
            'Original Shipping Fee',
            'Shipping Fee Seller Discount',
            'Shipping Fee Platform Discount',
            'Distance Shipping Fee',
            'Distance Fee',
            'Order Refund Amount',
            'Payment platform discount',
            'Buyer Service Fee',
            'Handling Fee',
            'Shipping Insurance',
            'Item Insurance',
            'Order Amount',
            'Created Time',
            'Paid Time',
            'RTS Time',
            'Shipped Time',
            'Delivered Time',
            'Cancelled Time',
            'Cancel By',
            'Cancel Reason',
            'Fulfillment Type',
            'Warehouse Name',
            'Tracking ID',
            'Delivery Option',
            'Shipping Provider Name',
            'Buyer Message',
            'Buyer Username',
            'Recipient',
            'Phone #',
            'Zipcode',
            'Country',
            'Province',
            'Regency and City',
            'Districts',
            'Villages',
            'Detail Address',
            'Additional address information',
            'Payment Method',
            'Weight(kg)',
            'Product Category',
            'Package ID',
            'Purchase Channel',
            'Seller Note',
            'Checked Status',
            'Checked Marked by',
            'Tokopedia Invoice Number',
            'Order Channel',
            'Creator Handle',
        ];

        $descriptions = [
            'Platform unique order ID.',
            'Current order status.',
            '',
            'The filed to explain the order is in cancellation or in return/refund.',
            '',
            'Platform SKU ID.',
            'Seller sku input by the seller in the product system.',
            'Platform product name.',
            'Platform SKU variation',
            'SKU sold quantity in the order.',
            'SKU returned quantity in the order.',
            '1 SKU original price.',
            'It equals to SKU Unit Original Price * Sku Quantity.',
            'Total platform discount in this SKU ID.',
            'Total seller discount in this SKU ID.',
            'It equals SKU Subtotal Before Discount - SKU Platform Discount - SKU Seller Discount.',
            'It equals to Original Shipping Fee - Shipping Fee Seller Discount - Shipping Fee Platform Discount.',
            "The order's original shipping fee.",
            "The order's  shipping fee discount from the seller.",
            "The order's  shipping fee discount from the platform.",
            'Shipping fee as a part of Horizon + Program, paid by buyer to logistic provider to fulfill order outside Java island',
            'Total distance fee for Horizon+ Program. Only applicable for ID market',
            'Order total refund amount of all returned SKUs.',
            'The discount provided by a third-party payment platform, which the buyer used to place the order.',
            '',
            '',
            '',
            '',
            'Order total amount paid by the buyer.',
            'Order created time.',
            'Order paid time.',
            "The time when the seller clicks 'arrange shipment'.",
            'The time when the order status changes to In Transit.',
            'The time when the order status changes to Delivered.',
            'The time when the order status changes to Cancelled.',
            'The order is cancelled by whom.',
            'The order cancel reason.',
            '',
            '',
            "The order's tracking number.",
            "The order's delivery option.",
            "The order's shipping provider name.",
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            "The order's payment method.",
            '',
            "SKU's product category.",
            "The order's Package ID",
            '',
            '',
            '',
            '',
            '',
            '',
            '',
        ];

        $rows = [];
        foreach ($orders as $order) {
            $items = is_array($order->items_json) ? $order->items_json : [];
            if (empty($items)) {
                $items = [[
                    'item_name'                => 'Pesanan TikTok #' . $order->order_sn,
                    'item_id'                  => '',
                    'model_name'               => '',
                    'model_sku'                => '',
                    'model_original_price'     => (float) $order->total_amount,
                    'model_discounted_price'   => (float) $order->total_amount,
                    'model_quantity_purchased' => 1,
                ]];
            }

            $rawPayload = is_array($order->raw_payload)
                ? $order->raw_payload
                : (is_string($order->raw_payload) ? json_decode($order->raw_payload, true) : []);
            if (! is_array($rawPayload)) {
                $rawPayload = [];
            }

            $statusUpper = strtoupper((string) $order->order_status);
            $statusLabel = match ($statusUpper) {
                'UNPAID'                                                             => 'Belum dibayar',
                'READY_TO_SHIP', 'AWAITING_SHIPMENT', 'AWAITING_COLLECTION', 'PROCESSED', 'RETRY_SHIP' => 'Perlu dikirim',
                'SHIPPED', 'IN_TRANSIT'                                              => 'Telah dikirim',
                'TO_CONFIRM_RECEIVE', 'DELIVERED', 'COMPLETED'                       => 'Selesai',
                'IN_CANCEL', 'CANCELLED', 'TO_RETURN', 'REFUNDED'                    => 'Dibatalkan',
                default                                                              => (string) $order->order_status,
            };

            $substatusLabel = '';
            if (in_array($statusUpper, ['PROCESSED', 'AWAITING_COLLECTION'], true) || ! empty($order->tracking_number)) {
                $substatusLabel = 'Menunggu pengambilan';
            } elseif (in_array($statusUpper, ['READY_TO_SHIP', 'AWAITING_SHIPMENT', 'RETRY_SHIP'], true)) {
                $substatusLabel = 'Menunggu pengiriman';
            }

            $recipient = is_array($order->recipient_data) ? $order->recipient_data : [];
            $recipientName = (string) ($recipient['name'] ?? '');
            $recipientPhone = (string) ($recipient['phone'] ?? '');
            $recipientAddress = (string) ($recipient['full_address'] ?? $recipient['address_detail'] ?? '');
            $recipientCity = (string) ($recipient['city'] ?? '');
            $recipientProvince = (string) ($recipient['province'] ?? $recipient['state'] ?? $recipient['region'] ?? '');
            $recipientZipcode = (string) ($recipient['zipcode'] ?? $recipient['postal_code'] ?? '');
            $recipientDistrict = (string) ($recipient['district'] ?? '');
            $recipientVillage = (string) ($recipient['village'] ?? '');

            if (empty($recipientName) && isset($rawPayload['recipient_address']['name'])) {
                $recipientName = (string) $rawPayload['recipient_address']['name'];
            }
            if (empty($recipientPhone) && isset($rawPayload['recipient_address']['phone'])) {
                $recipientPhone = (string) $rawPayload['recipient_address']['phone'];
            }
            if (empty($recipientAddress) && isset($rawPayload['recipient_address']['full_address'])) {
                $recipientAddress = (string) $rawPayload['recipient_address']['full_address'];
            }
            if (empty($recipientCity) && isset($rawPayload['recipient_address']['city'])) {
                $recipientCity = (string) $rawPayload['recipient_address']['city'];
            }
            if (empty($recipientProvince) && isset($rawPayload['recipient_address']['region'])) {
                $recipientProvince = (string) $rawPayload['recipient_address']['region'];
            }

            $fmtTime = static function ($time): string {
                if (! $time) {
                    return '';
                }
                if ($time instanceof Carbon) {
                    return $time->format('d/m/Y H:i:s');
                }
                if (is_numeric($time)) {
                    return Carbon::createFromTimestamp((int) $time, 'Asia/Jakarta')->format('d/m/Y H:i:s');
                }
                try {
                    return Carbon::parse($time, 'Asia/Jakarta')->format('d/m/Y H:i:s');
                } catch (\Throwable) {
                    return '';
                }
            };

            $createdAtStr = $fmtTime($order->order_created_at);
            $rtsAtStr = $fmtTime($order->shipping_arranged_at ?: ($rawPayload['rts_time'] ?? null));
            $paidAtStr = $fmtTime($rawPayload['paid_time'] ?? (! $order->is_cod ? $order->order_created_at : null));
            $shippedAtStr = $fmtTime($rawPayload['shipped_time'] ?? null);
            $deliveredAtStr = $fmtTime($rawPayload['delivered_time'] ?? null);
            $cancelledAtStr = $fmtTime($rawPayload['cancel_time'] ?? null);

            $paymentMethod = $order->is_cod
                ? 'Bayar di tempat'
                : ($order->payment_method ?: ($rawPayload['payment_method_name'] ?? 'Online Payment'));

            $shippingFee = (string) round((float) ($order->estimated_shipping_fee ?: ($rawPayload['shipping_fee'] ?? 9000)));
            $orderAmount = (string) round((float) $order->total_amount);
            $packageId = (string) ($order->package_number ?: ($rawPayload['package_list'][0]['id'] ?? ('PKG-' . $order->order_sn)));
            $carrierName = (string) ($order->shipping_carrier ?: ($rawPayload['shipping_provider'] ?? 'J&T Express'));
            $deliveryOption = (string) ($rawPayload['delivery_option_name'] ?? 'Pengiriman besok sampai');
            $buyerUsername = (string) ($order->buyer_username ?: ($rawPayload['buyer_email'] ?? ''));

            foreach ($items as $item) {
                $qty = (int) ($item['model_quantity_purchased'] ?? $item['quantity'] ?? 1);
                $origPrice = (float) ($item['model_original_price'] ?? $item['original_price'] ?? $item['unit_price'] ?? 0);
                $discPrice = (float) ($item['model_discounted_price'] ?? $item['sale_price'] ?? $origPrice);
                $subtotalBefore = $origPrice * $qty;
                $sellerDiscount = max(0, ($origPrice - $discPrice) * $qty);
                $subtotalAfter = $discPrice * $qty;

                $weightKg = isset($item['weight']) ? (float) $item['weight'] : 0.45;
                if ($weightKg > 10) {
                    $weightKg /= 1000;
                }

                $rows[] = [
                    (string) $order->order_sn,
                    $statusLabel,
                    $substatusLabel,
                    '',
                    'Normal',
                    (string) ($item['model_id'] ?? $item['sku_id'] ?? ''),
                    (string) ($item['model_sku'] ?? $item['seller_sku'] ?? ''),
                    (string) ($item['item_name'] ?? $item['product_name'] ?? ''),
                    (string) ($item['model_name'] ?? $item['variation'] ?? ''),
                    (string) $qty,
                    '0',
                    (string) round($origPrice),
                    (string) round($subtotalBefore),
                    '0',
                    (string) round($sellerDiscount),
                    (string) round($subtotalAfter),
                    $shippingFee,
                    $shippingFee,
                    '0',
                    '0',
                    '0',
                    '0',
                    '',
                    '',
                    '0',
                    '',
                    '0',
                    '0',
                    $orderAmount,
                    $createdAtStr,
                    $paidAtStr,
                    $rtsAtStr,
                    $shippedAtStr,
                    $deliveredAtStr,
                    $cancelledAtStr,
                    (string) ($order->cancel_by ?? ''),
                    (string) ($order->cancel_reason ?? $order->buyer_cancel_reason ?? ''),
                    'Fulfillment by seller',
                    'RecordShoes',
                    (string) ($order->tracking_number ?? ''),
                    $deliveryOption,
                    $carrierName,
                    (string) ($order->buyer_note ?? ''),
                    $buyerUsername,
                    $recipientName,
                    $recipientPhone,
                    $recipientZipcode,
                    'Indonesia',
                    $recipientProvince,
                    $recipientCity,
                    $recipientDistrict,
                    $recipientVillage,
                    $recipientAddress,
                    '',
                    $paymentMethod,
                    (string) round($weightKg, 2),
                    (string) ($item['category'] ?? 'Trainer'),
                    $packageId,
                    'Aplikasi TikTok',
                    '',
                    'Unchecked',
                    '',
                    '',
                    'Product cards',
                    '',
                ];
            }
        }

        $statusPrefix = match ($tab) {
            'to_ship'   => 'Untuk Dikirim',
            'shipped'   => 'Telah Dikirim',
            'completed' => 'Selesai',
            'cancelled' => 'Dibatalkan',
            'unpaid'    => 'Belum Dibayar',
            default     => 'Semua',
        };
        $nowStr = now('Asia/Jakarta')->format('Y-m-d-H_i');
        $fileName = "{$statusPrefix} pesanan-{$nowStr}.xlsx";

        return response()->json([
            'file_name'    => $fileName,
            'sheet_name'   => 'OrderSKUList',
            'headers'      => $headers,
            'descriptions' => $descriptions,
            'rows'         => $rows,
            'total_rows'   => count($rows),
            'total_orders' => count($orders),
        ]);
    }
}

