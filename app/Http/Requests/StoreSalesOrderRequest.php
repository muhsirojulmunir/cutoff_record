<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSalesOrderRequest extends FormRequest
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
            'customer_id'            => ['nullable', 'exists:customers,id'],
            'order_date'             => ['required', 'date'],
            'source'                 => ['required', 'in:manual,marketplace,website,other'],
            'sales_channel'          => ['required', 'in:manual,shopee,tiktok,website,other'],
            'notes'                  => ['nullable', 'string', 'max:1000'],
            'discount_amount'        => ['nullable', 'numeric', 'min:0'],
            'tax_amount'             => ['nullable', 'numeric', 'min:0'],
            'shipping_cost'          => ['nullable', 'numeric', 'min:0'],
            'dp_amount'              => ['nullable', 'numeric', 'min:0'],
            'items'                  => ['required', 'array', 'min:1'],
            'items.*.product_id'     => ['required', 'exists:products,id'],
            'items.*.quantity'       => ['required', 'integer', 'min:1'],
            'items.*.price'          => ['required', 'numeric', 'min:0'],
            'items.*.discount_amount'=> ['nullable', 'numeric', 'min:0'],
            'items.*.tax_amount'     => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /**
     * Get customized attributes names for validation errors.
     */
    public function attributes(): array
    {
        return [
            'customer_id'             => 'Customer',
            'order_date'              => 'Tanggal Order',
            'source'                  => 'Sumber Order',
            'sales_channel'           => 'Sales Channel',
            'notes'                   => 'Catatan',
            'discount_amount'         => 'Diskon',
            'tax_amount'              => 'Pajak',
            'shipping_cost'           => 'Biaya Pengiriman',
            'items'                   => 'Daftar Item',
            'items.*.product_id'      => 'Produk',
            'items.*.quantity'        => 'Jumlah Kuantitas',
            'items.*.price'           => 'Harga Item',
            'items.*.discount_amount' => 'Diskon Item',
            'items.*.tax_amount'      => 'Pajak Item',
        ];
    }
}
