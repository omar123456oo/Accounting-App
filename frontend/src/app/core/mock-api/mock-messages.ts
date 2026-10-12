import { COMPLIANCE_MESSAGES, ComplianceKey } from './mock-messages-compliance';

type BaseKey = 'invalidCredentials' | 'otpRequired' | 'otpInvalid' | 'locked' | 'csrf' | 'unauthenticated' | 'notFound' | 'required' | 'forbidden' | 'invalidTransition' | 'digitsOnly' | 'invalidDecimal' | 'invalidChoice' | 'invalidDate' | 'invalidNumber' | 'invalidEmail'
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
  | 'startDayInvalid'
  | 'amountInvalid'
  | 'mappingInvalid'
  | 'taxRateUnknown'
  | 'taxRateNotEffective'
  | 'taxRateRetired'
  | 'taxRateNotApproved'
  | 'taxRateInvalid'
  | 'docImmutable'
  | 'approvalRequired'
  | 'fourEyesDoc'
  | 'approvalLimit'
  | 'overAllocatedDoc'
  | 'overAllocatedPayment'
  | 'allocationInvalid'
  | 'creditExceedsBalance'
  | 'creditAfterRecognition'
  | 'notOverdue'
  | 'bearerInvalid'
  | 'sourceManaged'
  | 'noLines'
  | 'lineIncomplete'
  | 'servicePeriodRequired'
  | 'paymentAccountInvalid'
  | 'refundExceedsCredit'
  | 'alreadyRebilled'
  | 'rebillInvalid'
  | 'receiptInvalid'
  | 'partyArchived'
  | 'docNotOpen'
  | `mappingMissing:${string}`;

export type MockMessageKey = BaseKey | ComplianceKey;

type StaticKey = Exclude<BaseKey, `mappingMissing:${string}`>;

const MESSAGES: Record<'ar' | 'en', Record<StaticKey, string>> = {
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
    amountInvalid: "Enter an amount greater than zero with at most four decimals.",
    mappingInvalid: "Choose an active account of this ledger that accepts postings.",
    taxRateUnknown: "The tax rate does not exist.",
    taxRateNotEffective: "The tax rate is not in effect on the document date.",
    taxRateRetired: "The tax rate is retired and cannot be used.",
    taxRateNotApproved: "Draft tax rates are not allowed in this ledger. Use a professionally verified rate.",
    taxRateInvalid: "Enter a percentage from 0 to 100 with at most four decimals.",
    docImmutable: "Issued documents cannot be changed. Correct them with a credit note.",
    approvalRequired: "This amount needs approval by a second person before it can be issued.",
    fourEyesDoc: "You cannot approve a document you created.",
    approvalLimit: "The amount is above your approval limit.",
    overAllocatedDoc: "An allocation is larger than the open balance of the document.",
    overAllocatedPayment: "The allocations are larger than the payment amount.",
    allocationInvalid: "Each allocation needs an open document of the same party and an amount greater than zero.",
    creditExceedsBalance: "The credit is larger than the open balance of the document.",
    creditAfterRecognition: "Revenue was already recognized from this invoice, so it cannot be credited here.",
    notOverdue: "Only an open document past its due date can get a reminder.",
    bearerInvalid: "Client-reimbursable expenses belong to the firm ledger and need a client.",
    sourceManaged: "This entry belongs to a commercial document. Correct it from the document, for example with a credit note.",
    noLines: "Add at least one line.",
    lineIncomplete: "Each line needs a description, a quantity, a price, a service or category and a valid discount.",
    servicePeriodRequired: "Deferred revenue needs a service period start and a number of months.",
    paymentAccountInvalid: "Choose a bank or cash account configured in the mappings.",
    refundExceedsCredit: "The refund is larger than the unapplied credit.",
    alreadyRebilled: "This expense was already added to a client invoice.",
    rebillInvalid: "Only an approved client-reimbursable bill of a customer linked to that client can be re-billed.",
    receiptInvalid: "Attach a receipt reference (a PDF, image, CSV or XLSX file name and size).",
    partyArchived: "This party is archived.",
    docNotOpen: "The document is not open for this action.",
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
    amountInvalid: "أدخل مبلغًا أكبر من صفر بحد أقصى أربع خانات عشرية.",
    mappingInvalid: "اختر حسابًا نشطًا من هذا الدفتر يقبل الترحيل.",
    taxRateUnknown: "معدل الضريبة غير موجود.",
    taxRateNotEffective: "معدل الضريبة غير ساري في تاريخ المستند.",
    taxRateRetired: "معدل الضريبة ملغى ولا يمكن استخدامه.",
    taxRateNotApproved: "معدلات الضريبة المسودة غير مسموح بها في هذا الدفتر. استخدم معدلًا موثقًا مهنيًا.",
    taxRateInvalid: "أدخل نسبة من 0 إلى 100 بحد أقصى أربع خانات عشرية.",
    docImmutable: "لا يمكن تعديل المستندات الصادرة. صحّحها بإشعار دائن.",
    approvalRequired: "هذا المبلغ يحتاج إلى اعتماد شخص ثانٍ قبل إصداره.",
    fourEyesDoc: "لا يجوز لك اعتماد مستند أنشأته بنفسك.",
    approvalLimit: "المبلغ أعلى من حد الاعتماد المسموح لك.",
    overAllocatedDoc: "أحد التخصيصات أكبر من الرصيد المفتوح للمستند.",
    overAllocatedPayment: "التخصيصات أكبر من مبلغ الدفعة.",
    allocationInvalid: "يحتاج كل تخصيص إلى مستند مفتوح لنفس الطرف ومبلغ أكبر من صفر.",
    creditExceedsBalance: "الإشعار أكبر من الرصيد المفتوح للمستند.",
    creditAfterRecognition: "تم الاعتراف بإيراد من هذه الفاتورة، لذلك لا يمكن إشعارها دائنًا هنا.",
    notOverdue: "لا يُرسل التذكير إلا لمستند مفتوح تجاوز تاريخ استحقاقه.",
    bearerInvalid: "المصروفات القابلة للاسترداد من العميل تخص دفتر المكتب وتحتاج إلى عميل.",
    sourceManaged: "هذا القيد يخص مستندًا تجاريًا. صحّحه من المستند، مثلًا بإشعار دائن.",
    noLines: "أضف بندًا واحدًا على الأقل.",
    lineIncomplete: "يحتاج كل بند إلى وصف وكمية وسعر وخدمة أو فئة وخصم صحيح.",
    servicePeriodRequired: "الإيراد المؤجل يحتاج إلى بداية فترة الخدمة وعدد الأشهر.",
    paymentAccountInvalid: "اختر حساب بنك أو خزينة مضبوطًا في الربط.",
    refundExceedsCredit: "المبلغ المردود أكبر من الرصيد غير المخصص.",
    alreadyRebilled: "أُضيف هذا المصروف إلى فاتورة عميل مسبقًا.",
    rebillInvalid: "لا يُعاد تحميل إلا فاتورة مورد معتمدة قابلة للاسترداد لعميل مرتبط بعميل.",
    receiptInvalid: "أرفق مرجع الإيصال (اسم ملف PDF أو صورة أو CSV أو XLSX وحجمه).",
    partyArchived: "هذا الطرف مؤرشف.",
    docNotOpen: "المستند غير مفتوح لهذا الإجراء.",
  },
};

const MAPPING_LABELS: Record<'ar' | 'en', Record<string, string>> = {
  en: {
    arControl: 'receivables control account',
    apControl: 'payables control account',
    vatOutput: 'VAT output account',
    vatInput: 'VAT input account',
    deferredRevenue: 'deferred revenue account',
    customerCredit: 'customer credit account',
    supplierPrepayment: 'supplier prepayment account',
    receivableFromClient: 'receivable-from-client account',
    employeePayable: 'employee payable account',
    revenue: 'revenue account for this service type',
    expense: 'expense account for this category',
    reimbursement: 'reimbursement service type with a revenue account',
  },
  ar: {
    arControl: 'حساب مراقبة العملاء',
    apControl: 'حساب مراقبة الموردين',
    vatOutput: 'حساب ضريبة المخرجات',
    vatInput: 'حساب ضريبة المدخلات',
    deferredRevenue: 'حساب الإيراد المؤجل',
    customerCredit: 'حساب أرصدة العملاء الدائنة',
    supplierPrepayment: 'حساب دفعات الموردين المقدمة',
    receivableFromClient: 'حساب المستحق على العميل',
    employeePayable: 'حساب مستحقات العاملين',
    revenue: 'حساب الإيراد لنوع الخدمة هذا',
    expense: 'حساب المصروف لهذه الفئة',
    reimbursement: 'نوع خدمة استرداد له حساب إيراد',
  },
};

export function mockMessage(lang: string | null, key: MockMessageKey): string {
  const l = lang === 'en' ? 'en' : 'ar';
  if (key.startsWith('mappingMissing:')) {
    const name = MAPPING_LABELS[l][key.slice('mappingMissing:'.length)] ?? key.slice('mappingMissing:'.length);
    return l === 'en' ? `The account mapping is missing: ${name}. Configure it in the account mappings first.` : `ربط الحساب غير مضبوط: ${name}. اضبطه في شاشة ربط الحسابات أولًا.`;
  }
  return (COMPLIANCE_MESSAGES[l] as Record<string, string>)[key] ?? MESSAGES[l][key as StaticKey];
}
