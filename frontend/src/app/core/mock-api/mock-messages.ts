export type MockMessageKey = 'invalidCredentials' | 'otpRequired' | 'otpInvalid' | 'locked' | 'csrf' | 'unauthenticated' | 'notFound' | 'required' | 'forbidden' | 'invalidTransition' | 'digitsOnly' | 'invalidDecimal' | 'invalidChoice' | 'invalidDate' | 'invalidNumber' | 'invalidEmail';

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
    forbidden: 'You do not have permission to do this.',
    invalidTransition: 'This status change is not allowed.',
    digitsOnly: 'Enter digits only.',
    invalidDecimal: 'Enter a decimal amount such as 1500.00.',
    invalidChoice: 'Choose a valid option.',
    invalidDate: 'Enter a valid date (YYYY-MM-DD).',
    invalidNumber: 'Enter a valid number.',
    invalidEmail: 'Enter a valid email address.',
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
    forbidden: 'ليست لديك صلاحية للقيام بذلك.',
    invalidTransition: 'تغيير الحالة هذا غير مسموح.',
    digitsOnly: 'أدخل أرقامًا فقط.',
    invalidDecimal: 'أدخل مبلغًا عشريًا مثل 1500.00.',
    invalidChoice: 'اختر خيارًا صحيحًا.',
    invalidDate: 'أدخل تاريخًا صحيحًا (YYYY-MM-DD).',
    invalidNumber: 'أدخل رقمًا صحيحًا.',
    invalidEmail: 'أدخل بريدًا إلكترونيًا صحيحًا.',
  },
};

export function mockMessage(lang: string | null, key: MockMessageKey): string {
  return MESSAGES[lang === 'en' ? 'en' : 'ar'][key];
}
