<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('product') ? $this->route('product')->id : null;

        return [
            'sku'            => ['required', 'string', 'max:100', 'unique:products,sku,' . $id],
            'name'           => ['required', 'string', 'max:255'],
            'category_id'    => ['required', 'exists:categories,id'],
            'brand'          => ['nullable', 'string', 'max:255'],
            'size'           => ['nullable', 'string', 'max:100'],
            'color'          => ['nullable', 'string', 'max:100'],
            'unit'           => ['required', 'string', 'max:50'],
            'purchase_price' => ['required', 'numeric', 'min:0'],
            'selling_price'  => ['required', 'numeric', 'min:0'],
            'minimum_stock'  => ['required', 'integer', 'min:0'],
            'status'         => ['required', 'string', 'in:active,inactive'],
            'description'    => ['nullable', 'string'],
        ];
    }
}
