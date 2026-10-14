<!doctype html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<body style="font-family: Arial, sans-serif; line-height: 1.6">
@if (app()->getLocale() === 'ar')
  <p>مرحبًا {{ $recipientName }}،</p>
  <p>شكرًا لتسجيل مكتبك. اضغط على الرابط التالي لتأكيد بريدك الإلكتروني ثم سجّل الدخول:</p>
  <p><a href="{{ $url }}">تأكيد البريد الإلكتروني</a></p>
  <p>ينتهي الرابط بعد {{ config('accounting.verification_link_hours') }} ساعة. إذا لم تنشئ هذا الحساب فتجاهل الرسالة.</p>
@else
  <p>Hello {{ $recipientName }},</p>
  <p>Thank you for registering your office. Open the link below to confirm your e-mail address, then sign in:</p>
  <p><a href="{{ $url }}">Confirm e-mail address</a></p>
  <p>The link expires in {{ config('accounting.verification_link_hours') }} hours. If you did not create this account, ignore this message.</p>
@endif
</body>
</html>
