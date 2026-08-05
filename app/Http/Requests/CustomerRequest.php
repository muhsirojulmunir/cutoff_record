<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'       => ['required', 'string', 'max:255'],
            'phone'      => ['nullable', 'string', 'max:50'],
            'address'    => ['nullable', 'string'],
            'tax_number' => ['nullable', 'string', 'max:50'],
            'status'     => ['required', 'string', 'in:active,inactive'],
            'notes'      => ['nullable', 'string'],
        ];
    }
}
