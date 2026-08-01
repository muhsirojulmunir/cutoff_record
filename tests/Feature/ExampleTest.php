<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * Test bahwa route '/' me-redirect ke halaman login (karena dilindungi auth middleware).
     * Ini adalah perilaku yang benar untuk aplikasi ERP yang membutuhkan autentikasi.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $response = $this->get('/');

        // Route '/' dilindungi auth — redirect 302 ke /login adalah perilaku yang benar
        $response->assertStatus(302);
        $response->assertRedirect('/login');
    }
}
