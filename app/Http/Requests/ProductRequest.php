<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            // Produk yang sudah dihapus tidak ikut dihitung: SKU-nya boleh
            // dipakai lagi, dan controller akan memulihkan produk lamanya.
            'sku'  => [
                'required',
                'string',
                'max:100',
                Rule::unique('products', 'sku')->ignore($id)->whereNull('deleted_at'),
            ],
            'name' => ['required', 'string', 'max:255'],
            // photo: divalidasi manual di controller (hindari finfo yang tidak tersedia di hosting)
        ];
    }
}
