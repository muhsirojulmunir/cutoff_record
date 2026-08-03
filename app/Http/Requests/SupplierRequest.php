<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Baris rekening yang benar-benar kosong tidak perlu divalidasi maupun
     * disimpan — form selalu menyisakan minimal satu baris.
     */
    protected function prepareForValidation(): void
    {
        $accounts = collect($this->input('bank_accounts', []))
            ->filter(fn ($account) => filled($account['bank_name'] ?? null)
                || filled($account['account_number'] ?? null)
                || filled($account['account_holder'] ?? null))
            ->values()
            ->all();

        $this->merge(['bank_accounts' => $accounts]);
    }

    public function rules(): array
    {
        return [
            'name'                           => ['required', 'string', 'max:255'],
            'contact_person'                 => ['nullable', 'string', 'max:255'],
            'phone'                          => ['nullable', 'string', 'max:50'],
            'email'                          => ['nullable', 'email', 'max:255'],
            'address'                        => ['nullable', 'string'],
            'payment_terms'                  => ['required', 'string', 'max:255'],
            'bank_accounts'                  => ['array'],
            'bank_accounts.*.bank_name'      => ['required', 'string', 'max:100'],
            'bank_accounts.*.account_number' => ['nullable', 'string', 'max:100'],
            'bank_accounts.*.account_holder' => ['nullable', 'string', 'max:255'],
            'status'                         => ['required', 'string', 'in:active,inactive'],
            'notes'                          => ['nullable', 'string'],
        ];
    }

    public function attributes(): array
    {
        return [
            'payment_terms'                  => 'Termin pembayaran',
            'bank_accounts.*.bank_name'      => 'Nama bank',
            'bank_accounts.*.account_number' => 'Nomor rekening',
            'bank_accounts.*.account_holder' => 'Atas nama',
        ];
    }
}
