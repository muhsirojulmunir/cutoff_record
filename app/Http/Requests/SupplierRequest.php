<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'                => ['required', 'string', 'max:255'],
            'contact_person'      => ['nullable', 'string', 'max:255'],
            'phone'               => ['nullable', 'string', 'max:50'],
            'email'               => ['nullable', 'email', 'max:255'],
            'address'             => ['nullable', 'string'],
            'tax_number'          => ['nullable', 'string', 'max:50'],
            'bank_name'           => ['nullable', 'string', 'max:100'],
            'bank_account_number' => ['nullable', 'string', 'max:100'],
            'payment_terms'       => ['required', 'string', 'in:COD,7 Hari,14 Hari,30 Hari,60 Hari'],
            'status'              => ['required', 'string', 'in:active,inactive'],
            'notes'               => ['nullable', 'string'],
        ];
    }
}
