<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePettyCashRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'transaction_date'    => ['required', 'date'],
            'fund_type'           => ['required', 'in:petty_cash,dana_kelola'],
            'expense_category_id' => ['required', 'integer', 'exists:expense_categories,id'],
            'coa_code'            => ['required', 'string', 'max:50'],
            'payment_method'      => ['required', 'string', 'in:cash,bank_transfer,debit_card,credit_card,e_wallet,other'],
            'amount'              => ['required', 'numeric', 'gt:0'],
            'vendor_name'         => ['nullable', 'string', 'max:255'],
            'reference_number'    => ['nullable', 'string', 'max:255'],
            'description'         => ['required', 'string', 'max:1000'],
            'attachment'          => ['nullable', 'string', 'max:500'],
            'attachment_file'     => ['nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
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
            'fund_type.required'           => 'Jenis dana wajib dipilih.',
            'fund_type.in'                 => 'Jenis dana tidak valid.',
            'coa_code.required'            => 'Kode COA wajib diisi.',
            'attachment_file.mimes'        => 'Bukti pembayaran harus berupa JPG, PNG, atau PDF.',
            'attachment_file.max'          => 'Ukuran bukti pembayaran maksimal 5 MB.',
        ];
    }
}
