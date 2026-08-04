<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Tinggi hanya relevan untuk kardus — buang nilainya agar tidak tersimpan
     * pada produk biasa yang sempat dicentang lalu dibatalkan.
     */
    protected function prepareForValidation(): void
    {
        if (! $this->boolean('is_box')) {
            $this->merge(['height' => null]);
        }
    }

    public function attributes(): array
    {
        return [
            'is_box' => 'Produk kardus',
            'length' => 'Panjang',
            'width'  => 'Lebar',
            'height' => 'Tinggi',
        ];
    }

    public function rules(): array
    {
        $id = $this->route('product') ? $this->route('product')->id : null;

        return [
            'sku'            => ['required', 'string', 'max:100', 'unique:products,sku,' . $id],
            'name'           => ['required', 'string', 'max:255'],
            'category_id'    => ['required', 'exists:categories,id'],
            'brand'          => ['nullable', 'string', 'max:255'],
            'color'          => ['nullable', 'string', 'max:100'],
            'is_box'         => ['required', 'boolean'],
            'length'         => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'width'          => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'height'         => [$this->boolean('is_box') ? 'required' : 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'photo'          => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'status'         => ['nullable', 'string', 'in:active,inactive'],
            'description'    => ['nullable', 'string'],
        ];
    }
}
