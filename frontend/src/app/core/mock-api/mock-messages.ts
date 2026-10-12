export type MockMessageKey = 'invalidCredentials' | 'otpRequired' | 'otpInvalid' | 'locked' | 'csrf' | 'unauthenticated' | 'notFound' | 'required' | 'forbidden' | 'invalidTransition' | 'digitsOnly' | 'invalidDecimal' | 'invalidChoice' | 'invalidDate' | 'invalidNumber' | 'invalidEmail'
  | 'conflict'
  | 'stageOrder'
  | 'checklistNotReceived'
  | 'checklistNotApproved'
  | 'identityRequired'
  | 'engagementRequired'
  | 'fourEyes'
  | 'dependencyOpen'
  | 'dependencyInvalid'
  | 'alreadyDecided'
  | 'fileTooLarge'
  | 'fileType'
  | 'fileMime'
  | 'fileSignature'
  | 'fileEmpty';

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
    conflict: 'This action conflicts with the current state.',
    stageOrder: 'Stages must be completed in order.',
    checklistNotReceived: 'Every required checklist item must be received first.',
    checklistNotApproved: 'Every required checklist item must be approved first.',
    identityRequired: 'The identity must be verified first.',
    engagementRequired: 'The engagement must be accepted first.',
    fourEyes: 'The person who submitted the verification cannot also approve it.',
    dependencyOpen: 'Finish the tasks this task depends on first.',
    dependencyInvalid: 'A task cannot depend on itself or create a dependency cycle.',
    alreadyDecided: 'This item has already been decided.',
    fileTooLarge: 'The file is larger than 10 MB.',
    fileType: 'Only PDF, XLSX, CSV, PNG and JPG files are allowed.',
    fileMime: 'The file type declared by the browser does not match its extension.',
    fileSignature: 'The file content does not match its extension.',
    fileEmpty: 'The file is empty.',
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
    conflict: 'هذا الإجراء يتعارض مع الحالة الحالية.',
    stageOrder: 'يجب إكمال المراحل بالترتيب.',
    checklistNotReceived: 'يجب استلام كل بنود القائمة المطلوبة أولًا.',
    checklistNotApproved: 'يجب اعتماد كل بنود القائمة المطلوبة أولًا.',
    identityRequired: 'يجب التحقق من الهوية أولًا.',
    engagementRequired: 'يجب قبول التعاقد أولًا.',
    fourEyes: 'لا يجوز لمن قدّم التحقق أن يعتمده بنفسه.',
    dependencyOpen: 'أنهِ المهام التي تعتمد عليها هذه المهمة أولًا.',
    dependencyInvalid: 'لا يمكن أن تعتمد المهمة على نفسها أو تُكوّن حلقة اعتماد.',
    alreadyDecided: 'تم البت في هذا العنصر مسبقًا.',
    fileTooLarge: 'حجم الملف أكبر من 10 ميغابايت.',
    fileType: 'المسموح فقط بملفات PDF وXLSX وCSV وPNG وJPG.',
    fileMime: 'نوع الملف المعلن لا يطابق امتداده.',
    fileSignature: 'محتوى الملف لا يطابق امتداده.',
    fileEmpty: 'الملف فارغ.',
  },
};

export function mockMessage(lang: string | null, key: MockMessageKey): string {
  return MESSAGES[lang === 'en' ? 'en' : 'ar'][key];
}
