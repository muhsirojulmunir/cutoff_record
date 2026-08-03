<?php

namespace App\Http\Requests;

use App\Models\FundAllocation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFundAllocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'fund_type'            => ['required', Rule::in(array_keys(FundAllocation::TYPES))],
            'period_start'         => ['required', 'date'],
            'amount'               => ['required', 'numeric', 'min:1'],
            'cash_bank_account_id' => ['nullable', 'exists:cash_bank_accounts,id'],
            'notes'                => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function attributes(): array
    {
        return [
            'fund_type'            => 'Jenis dana',
            'period_start'         => 'Minggu periode',
            'amount'               => 'Nominal dana',
            'cash_bank_account_id' => 'Sumber dana',
            'notes'                => 'Catatan',
        ];
    }
}
