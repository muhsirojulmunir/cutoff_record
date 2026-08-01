<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreFactoryReceivablePaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('payment.create');
    }

    public function rules(): array
    {
        return [
            'payment_date'     => ['required', 'date'],
            'payment_method'   => ['required', 'in:cash,bank_transfer,credit_card,debit_card,e_wallet,other'],
            'amount'               => ['required', 'numeric', 'min:0.01'],
            'reference_number'     => ['nullable', 'string', 'max:255'],
            'bank_account'         => ['nullable', 'string', 'max:255'],
            'notes'                => ['nullable', 'string'],
            'cash_bank_account_id' => ['nullable', 'exists:cash_bank_accounts,id'],
        ];
    }
}
