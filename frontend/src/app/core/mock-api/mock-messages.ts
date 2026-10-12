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
  | 'fileEmpty'
  | 'unbalanced'
  | 'lineInvalid'
  | 'tooFewLines'
  | 'accountNotPostable'
  | 'periodNotOpen'
  | 'postedImmutable'
  | 'fourEyesJournal'
  | 'highValueApproval'
  | 'duplicateCode'
  | 'accountHasPostings'
  | 'accountHasChildren'
  | 'invalidParent'
  | 'periodOverlap'
  | 'idempotencyConflict'
  | 'alreadyReversed'
  | 'startDayInvalid';

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
    unbalanced: 'The entry is out of balance: total debits must equal total credits.',
    lineInvalid: 'Each line needs an existing account and exactly one of debit or credit greater than zero.',
    tooFewLines: 'An entry needs at least two lines.',
    accountNotPostable: 'Every line must use an active account that accepts postings.',
    periodNotOpen: 'The posting date is not in an open accounting period.',
    postedImmutable: 'Posted entries cannot be changed. Reverse the entry instead.',
    fourEyesJournal: 'You cannot approve an entry you created.',
    highValueApproval: 'Entries of 50,000 EGP or more need approval by a chief accountant.',
    duplicateCode: 'This account code is already used in this ledger.',
    accountHasPostings: 'This account has posted lines, so this change is not allowed.',
    accountHasChildren: 'Deactivate or move the active child accounts first.',
    invalidParent: 'The parent must be a group account of the same category in this ledger.',
    periodOverlap: 'The fiscal year overlaps an existing fiscal year.',
    idempotencyConflict: 'This Idempotency-Key was already used with different data.',
    alreadyReversed: 'This entry has already been reversed.',
    startDayInvalid: 'A fiscal year must start on the first day of a month.',
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
    unbalanced: 'القيد غير متوازن: يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.',
    lineInvalid: 'يحتاج كل سطر إلى حساب موجود ومبلغ واحد فقط أكبر من صفر، مدين أو دائن.',
    tooFewLines: 'يحتاج القيد إلى سطرين على الأقل.',
    accountNotPostable: 'يجب أن يستخدم كل سطر حسابًا نشطًا يقبل الترحيل.',
    periodNotOpen: 'تاريخ الترحيل ليس ضمن فترة محاسبية مفتوحة.',
    postedImmutable: 'لا يمكن تعديل القيود المرحّلة. اعكس القيد بدلًا من ذلك.',
    fourEyesJournal: 'لا يجوز لك اعتماد قيد أنشأته بنفسك.',
    highValueApproval: 'القيود التي تبلغ 50,000 جنيه أو أكثر تحتاج إلى اعتماد رئيس الحسابات.',
    duplicateCode: 'رمز الحساب مستخدم بالفعل في هذا الدفتر.',
    accountHasPostings: 'لهذا الحساب أسطر مرحّلة، لذلك لا يُسمح بهذا التغيير.',
    accountHasChildren: 'عطّل الحسابات الفرعية النشطة أو انقلها أولًا.',
    invalidParent: 'يجب أن يكون الحساب الأب حساب تجميع من الفئة نفسها في هذا الدفتر.',
    periodOverlap: 'السنة المالية تتداخل مع سنة مالية قائمة.',
    idempotencyConflict: 'سبق استخدام مفتاح عدم التكرار هذا مع بيانات مختلفة.',
    alreadyReversed: 'تم عكس هذا القيد مسبقًا.',
    startDayInvalid: 'يجب أن تبدأ السنة المالية في أول يوم من الشهر.',
  },
};

export function mockMessage(lang: string | null, key: MockMessageKey): string {
  return MESSAGES[lang === 'en' ? 'en' : 'ar'][key];
}
