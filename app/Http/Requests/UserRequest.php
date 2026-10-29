<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $userId = $this->route('user')?->id;

        return [
            'name'     => ['required', 'string', 'max:150'],
            // User yang sudah dihapus tidak ikut dihitung supaya emailnya
            // bisa didaftarkan lagi; controller memulihkan akun lamanya.
            'email'    => [
                'required', 'string', 'max:150',
                Rule::unique('users', 'email')->ignore($userId)->whereNull('deleted_at'),
            ],
            'password' => $userId
                ? ['nullable', 'string', Password::min(8)]
                : ['required', 'string', Password::min(8)],
            'role_id'  => ['required', 'exists:roles,id'],
            'status'   => ['required', 'in:active,inactive'],
        ];
    }

    public function attributes(): array
    {
        return [
            'name'    => 'Nama',
            'email'   => 'Email',
            'password'=> 'Password',
            'role_id' => 'Role',
            'status'  => 'Status',
        ];
    }
}
