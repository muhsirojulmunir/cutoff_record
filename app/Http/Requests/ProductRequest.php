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
            'sku'  => ['required', 'string', 'max:100', 'unique:products,sku,' . $id],
            'name' => ['required', 'string', 'max:255'],
            // photo: divalidasi manual di controller (hindari finfo yang tidak tersedia di hosting)
        ];
    }
}
