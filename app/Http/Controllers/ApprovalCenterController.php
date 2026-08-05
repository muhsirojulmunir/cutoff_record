<?php

namespace App\Http\Controllers;

use App\Services\WorkQueueService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Pusat Approval — satu halaman berisi seluruh dokumen yang menunggu
 * persetujuan user yang sedang login.
 *
 * Isinya diambil dari WorkQueueService, sumber yang sama dengan lonceng
 * notifikasi dan pengingat di dashboard, sehingga angkanya tidak pernah
 * berbeda antar tempat. Tiap baris hanya muncul bila user memang berwenang
 * menyetujuinya.
 */
class ApprovalCenterController extends Controller
{
    /** Jenis pengingat yang benar-benar berupa persetujuan, bukan sekadar info. */
    private const APPROVAL_KEYS = [
        'po_leader_approval',
        'po_finance_approval',
        'so_approval',
        'goods_receipt_approval',
        'stock_return_approval',
        'petty_cash_leader_approval',
        'petty_cash_finance_approval',
    ];

    public function __construct(private readonly WorkQueueService $workQueueService) {}

    public function index(Request $request): Response
    {
        $queue = $this->workQueueService->getForUser($request->user());

        // Halaman ini khusus persetujuan. Pengingat lain seperti invoice jatuh
        // tempo tetap tersedia di lonceng notifikasi dan dashboard.
        $approvals = array_values(array_filter(
            $queue['items'],
            fn (array $item) => in_array($item['key'], self::APPROVAL_KEYS, true)
        ));

        return Inertia::render('Approvals/Index', [
            'approvals' => $approvals,
            'summary'   => [
                'approval_total' => array_sum(array_column($approvals, 'count')),
            ],
        ]);
    }
}
