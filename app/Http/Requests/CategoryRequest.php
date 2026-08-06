<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = $this->route('category') ? $this->route('category')->id : null;

        return [
            // Kategori yang sudah diarsipkan tidak menghalangi pemakaian
            // nama yang sama untuk kategori baru.
            'name'        => [
                'required', 'string', 'max:255',
                Rule::unique('categories', 'name')->ignore($id)->whereNull('deleted_at'),
            ],
            'description' => ['nullable', 'string'],
            'status'      => ['required', 'string', 'in:active,inactive'],
        ];
    }
}
