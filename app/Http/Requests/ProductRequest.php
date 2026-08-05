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
            'sku'   => ['required', 'string', 'max:100', 'unique:products,sku,' . $id],
            'name'  => ['required', 'string', 'max:255'],
            'photo' => ['nullable', 'file', 'max:2048', 'extensions:jpg,jpeg,png,webp'],
        ];
    }
}
