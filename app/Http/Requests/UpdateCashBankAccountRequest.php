<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCashBankAccountRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'account_name'   => ['required', 'string', 'max:255'],
            'account_type'   => ['required', 'in:cash,bank,e_wallet'],
            'account_number' => ['nullable', 'string', 'max:100'],
            'bank_name'      => ['nullable', 'string', 'max:255'],
            'account_holder' => ['nullable', 'string', 'max:255'],
            'notes'          => ['nullable', 'string', 'max:2000'],
        ];
    }
}
