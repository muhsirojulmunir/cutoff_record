<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
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
            'email'    => ['required', 'email', 'max:150', "unique:users,email,{$userId}"],
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
