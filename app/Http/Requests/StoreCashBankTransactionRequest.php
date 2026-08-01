<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCashBankTransactionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'account_id'       => ['required', 'exists:cash_bank_accounts,id'],
            'transaction_date' => ['required', 'date'],
            'amount'           => ['required', 'numeric', 'min:0.01'],
            'description'      => ['required', 'string', 'min:3', 'max:500'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            // For adjustment only
            'direction'        => ['sometimes', 'in:in,out'],
        ];
    }

    public function messages(): array
    {
        return [
            'account_id.required'  => 'Rekening wajib dipilih.',
            'account_id.exists'    => 'Rekening tidak ditemukan.',
            'amount.min'           => 'Nominal harus lebih besar dari nol.',
            'description.required' => 'Deskripsi / keterangan wajib diisi.',
        ];
    }
}
