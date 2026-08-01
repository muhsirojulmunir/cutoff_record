<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePurchaseOrderRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            'supplier_id'             => ['required', 'exists:suppliers,id'],
            'warehouse_id'            => ['nullable', 'exists:warehouses,id'],
            'order_date'              => ['required', 'date'],
            'expected_delivery_date'  => ['nullable', 'date', 'after_or_equal:order_date'],
            'source'                  => ['required', 'in:manual,other'],
            'notes'                   => ['nullable', 'string', 'max:1000'],
            'discount_amount'         => ['nullable', 'numeric', 'min:0'],
            'tax_amount'              => ['nullable', 'numeric', 'min:0'],
            'shipping_cost'           => ['nullable', 'numeric', 'min:0'],
            'items'                   => ['required', 'array', 'min:1'],
            'items.*.product_id'      => ['required', 'exists:products,id'],
            'items.*.quantity'        => ['required', 'integer', 'min:1'],
            'items.*.price'           => ['required', 'numeric', 'min:0'],
            'items.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'items.*.tax_amount'      => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /**
     * Get customized attributes names for validation errors.
     */
    public function attributes(): array
    {
        return [
            'supplier_id'             => 'Supplier',
            'warehouse_id'            => 'Gudang',
            'order_date'              => 'Tanggal Order',
            'expected_delivery_date'  => 'Tanggal Estimasi Pengiriman',
            'source'                  => 'Sumber',
            'notes'                   => 'Catatan',
            'discount_amount'         => 'Diskon',
            'tax_amount'              => 'Pajak',
            'shipping_cost'           => 'Biaya Pengiriman',
            'items'                   => 'Daftar Item',
            'items.*.product_id'      => 'Produk',
            'items.*.quantity'        => 'Jumlah Kuantitas',
            'items.*.price'           => 'Harga Satuan',
            'items.*.discount_amount' => 'Diskon Item',
            'items.*.tax_amount'      => 'Pajak Item',
        ];
    }
}
