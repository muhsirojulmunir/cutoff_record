<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CsMessage extends Model
{
    use HasFactory;

    protected $table = 'cs_messages';

    protected $fillable = [
        'conversation_id',
        'external_message_id',
        'sender',
        'message_type',
        'text',
        'media_url',
        'status',
        'error_message',
        'sent_at',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(CsConversation::class, 'conversation_id');
    }
}

