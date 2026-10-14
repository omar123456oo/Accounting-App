<?php

namespace App\Modules\Platform\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class VerifyEmailMail extends Mailable
{
    public function __construct(public readonly string $recipientName, public readonly string $url) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: __('Confirm your e-mail address'));
    }

    public function content(): Content
    {
        return new Content(view: 'mail.verify-email');
    }
}
