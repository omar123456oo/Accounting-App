export type MockMessageKey = 'invalidCredentials' | 'otpRequired' | 'otpInvalid' | 'locked' | 'csrf' | 'unauthenticated' | 'notFound' | 'required';

const MESSAGES: Record<'ar' | 'en', Record<MockMessageKey, string>> = {
  en: {
    invalidCredentials: 'These credentials do not match our records.',
    otpRequired: 'The verification code is required.',
    otpInvalid: 'The verification code is invalid.',
    locked: 'Too many failed attempts. The account is locked for 15 minutes.',
    csrf: 'CSRF token mismatch.',
    unauthenticated: 'Unauthenticated.',
    notFound: 'Not found.',
    required: 'This field is required.',
  },
  ar: {
    invalidCredentials: 'بيانات الدخول غير صحيحة.',
    otpRequired: 'رمز التحقق مطلوب.',
    otpInvalid: 'رمز التحقق غير صحيح.',
    locked: 'محاولات فاشلة كثيرة. تم قفل الحساب لمدة 15 دقيقة.',
    csrf: 'رمز CSRF غير مطابق.',
    unauthenticated: 'غير مصرح.',
    notFound: 'غير موجود.',
    required: 'هذا الحقل مطلوب.',
  },
};

export function mockMessage(lang: string | null, key: MockMessageKey): string {
  return MESSAGES[lang === 'en' ? 'en' : 'ar'][key];
}
