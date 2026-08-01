<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('invoice.edit');
    }

    public function rules(): array
    {
        return [
            'due_date' => ['nullable', 'date'],
            'notes'    => ['nullable', 'string'],
        ];
    }
}
