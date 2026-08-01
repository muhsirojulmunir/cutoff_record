<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreFactoryReceivableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('factory_receivable.create');
    }

    public function rules(): array
    {
        return [
            'purchase_order_id' => ['required', 'exists:purchase_orders,id', 'unique:factory_receivables,purchase_order_id'],
            'due_date'          => ['nullable', 'date'],
            'notes'             => ['nullable', 'string'],
        ];
    }
}
