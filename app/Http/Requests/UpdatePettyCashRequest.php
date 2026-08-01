<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePettyCashRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'transaction_date'    => ['required', 'date'],
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'payment_method'      => ['required', 'string', 'in:cash,bank_transfer,debit_card,credit_card,e_wallet,other'],
            'amount'              => ['required', 'numeric', 'gt:0'],
            'vendor_name'         => ['nullable', 'string', 'max:255'],
            'reference_number'    => ['nullable', 'string', 'max:255'],
            'description'         => ['required', 'string', 'max:1000'],
            'attachment'          => ['nullable', 'string', 'max:500'],
            'cash_bank_account_id'=> ['nullable', 'exists:cash_bank_accounts,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'transaction_date.required'    => 'Tanggal transaksi wajib diisi.',
            'expense_category_id.required' => 'Kategori biaya wajib dipilih.',
            'expense_category_id.exists'   => 'Kategori biaya tidak valid.',
            'payment_method.required'      => 'Metode pembayaran wajib dipilih.',
            'payment_method.in'            => 'Metode pembayaran tidak valid.',
            'amount.required'              => 'Jumlah biaya wajib diisi.',
            'amount.gt'                    => 'Jumlah biaya harus lebih dari 0.',
            'description.required'         => 'Deskripsi wajib diisi.',
        ];
    }
}
