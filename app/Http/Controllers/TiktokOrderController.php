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

        return Inertia::render('Tiktok/Orders', [
            'account'         => $account?->toSafeArray(),
            'orders'          => $orders,
            'tabCounts'       => $tabCounts,
            'orderTypeCounts' => $orderTypeCounts,
            'carriers'        => $carriers,
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
            'fulfillment_method' => ['required', 'string', 'in:pickup,dropoff'],
            'address_id'         => ['nullable'],
            'pickup_time_id'     => ['nullable', 'string'],
            'branch_id'          => ['nullable', 'string'],
        ]);

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
        if ($user && method_exists($user, 'roles') && $user->roles->contains('name', 'Super Admin')) {
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
}

