<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCashBankAccountRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'account_name'           => ['required', 'string', 'max:255'],
            'account_type'           => ['required', 'in:cash,bank,e_wallet'],
            'account_number'         => ['nullable', 'string', 'max:100'],
            'bank_name'              => ['nullable', 'string', 'max:255'],
            'account_holder'         => ['nullable', 'string', 'max:255'],
            'opening_balance'        => ['required', 'numeric', 'min:0'],
            'allow_negative_balance' => ['boolean'],
            'notes'                  => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'account_name.required'    => 'Nama rekening wajib diisi.',
            'account_type.required'    => 'Jenis rekening wajib dipilih.',
            'account_type.in'          => 'Jenis rekening tidak valid.',
            'opening_balance.required' => 'Saldo awal wajib diisi.',
            'opening_balance.min'      => 'Saldo awal tidak boleh negatif.',
        ];
    }
}
