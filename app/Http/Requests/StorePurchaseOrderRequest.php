<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseOrderRequest extends FormRequest
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
            'production_lead_time_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            # Empat opsi yang dipakai sekarang; cash_to_cash tetap diterima agar PO
            # lama masih bisa disimpan ulang tanpa dianggap tidak valid.
            'payment_terms'           => ['required', 'in:dp_50,cash,tempo_7_days,tempo_14_days,cash_to_cash'],
            'is_free_shipping'        => ['required', 'boolean'],
            'shipping_cost'           => ['nullable', 'numeric', 'min:0'],
            'payment_proof'           => ['nullable', 'file', 'mimes:jpeg,png,jpg,webp,pdf', 'max:5120'],
            'notes'                   => ['nullable', 'string', 'max:1000'],
            'items'                   => ['required', 'array', 'min:1'],
            'items.*.product_id'      => ['required', 'exists:products,id'],
            'items.*.quantity'        => ['required', 'integer', 'min:1'],
            'items.*.price'           => ['required', 'numeric', 'min:0'],
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
            'production_lead_time_days' => 'Estimasi Pengerjaan (hari)',
            'payment_terms'           => 'Pembayaran',
            'is_free_shipping'        => 'Free Ongkir',
            'notes'                   => 'Catatan',
            'items'                   => 'Daftar Item',
            'items.*.product_id'      => 'Produk',
            'items.*.quantity'        => 'Jumlah Kuantitas',
            'items.*.price'           => 'Harga Satuan',
        ];
    }
}
