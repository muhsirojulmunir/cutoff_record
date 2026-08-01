<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class WarehouseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('warehouse') ? $this->route('warehouse')->id : null;

        return [
            'code'             => ['required', 'string', 'max:50', 'unique:warehouses,code,' . $id],
            'name'             => ['required', 'string', 'max:255'],
            'location'         => ['nullable', 'string', 'max:255'],
            'person_in_charge' => ['nullable', 'string', 'max:255'],
            'phone'            => ['nullable', 'string', 'max:50'],
            'status'           => ['required', 'string', 'in:active,inactive'],
            'notes'            => ['nullable', 'string'],
        ];
    }
}
