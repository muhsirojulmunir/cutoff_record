<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateFactoryReceivableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('factory_receivable.edit');
    }

    public function rules(): array
    {
        return [
            'due_date' => ['nullable', 'date'],
            'notes'    => ['nullable', 'string'],
        ];
    }
}
