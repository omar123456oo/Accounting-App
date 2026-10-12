/** Server messages of the Phase 5 compliance modules (statements, tax, e-invoicing, closing, audit). */
export type ComplianceKey =
  | 'etaNotConfigured'
  | 'officialStateForbidden'
  | 'fourEyesReview'
  | 'fourEyesLock'
  | 'unpostedJournals'
  | 'returnLocked'
  | 'returnState'
  | 'evidenceRequired'
  | 'referenceRequired'
  | 'recorderRequired'
  | 'docHasErrors'
  | 'periodHasReturn'
  | 'noRule'
  | 'ruleInvalid'
  | 'notRejected'
  | 'outcomeInvalid'
  | 'bankDifference'
  | 'bankUnmatchedLines'
  | 'reconciliationOpen'
  | 'closingEntriesExist'
  | 'closingMappingMissing'
  | 'matchAmountMismatch'
  | 'alreadyMatched'
  | 'csvInvalid'
  | 'mappingLineInvalid'
  | 'alreadyPrepared'
  | 'sourceNotIssued'
  | 'periodNotEnded'
  | 'periodLockedClosing'
  | 'simulationState'
  | 'wrongKind'
  | 'amountMismatch';

export const COMPLIANCE_MESSAGES: Record<'ar' | 'en', Record<ComplianceKey, string>> = {
  en: {
    etaNotConfigured: 'ETA integration is not configured, so nothing can be submitted from this system.',
    officialStateForbidden: 'Official states (submitted, accepted) can only be set by the ETA adapter from a real response record. This action cannot do it.',
    fourEyesReview: 'The reviewer must be a different person than the preparer.',
    fourEyesLock: 'You reviewed this period, so a different person must lock it.',
    unpostedJournals: 'Post or reject the pending and approved journals of this period first.',
    returnLocked: 'This return is approved and its calculation is locked. Create an amendment instead.',
    returnState: 'The return is not in a state that allows this action.',
    evidenceRequired: 'Attach the evidence document (a PDF, image, CSV or XLSX file).',
    referenceRequired: 'Enter the reference number shown by the portal.',
    recorderRequired: 'Enter the name of the person recording the outcome.',
    docHasErrors: 'The document has validation errors. Fix them and prepare it again.',
    periodHasReturn: 'A current return already exists for this period. Create an amendment instead.',
    noRule: 'No rule is configured for this date. Add a versioned rule in the tax settings first.',
    ruleInvalid: 'Check the rule values and the effective dates.',
    notRejected: 'Only a document with a recorded rejection can be prepared again.',
    outcomeInvalid: 'Choose a valid outcome.',
    bankDifference: 'The reconciled balance differs from the statement balance, so the statement cannot be marked reconciled.',
    bankUnmatchedLines: 'Every statement line must be matched before the statement is reconciled.',
    reconciliationOpen: 'A bank statement of this period is not reconciled yet.',
    closingEntriesExist: 'Closing entries already exist for this fiscal year.',
    closingMappingMissing: 'Choose the retained earnings account for closing entries first.',
    matchAmountMismatch: 'The amounts of the statement line and the ledger line must be equal to match them.',
    alreadyMatched: 'One of the lines is already matched.',
    csvInvalid: 'The statement file has errors. Fix them and import it again.',
    mappingLineInvalid: 'A statement line does not suit the category of the account.',
    alreadyPrepared: 'A document for this source already exists.',
    sourceNotIssued: 'Only an issued invoice or a credit note can be prepared.',
    periodNotEnded: 'The period has not ended yet.',
    periodLockedClosing: 'The period is already locked.',
    simulationState: 'Only a reviewed document can be simulated.',
    wrongKind: 'This action does not apply to this kind of return.',
    amountMismatch: 'The amount is not valid for this action.',
  },
  ar: {
    etaNotConfigured: 'تكامل مصلحة الضرائب (ETA) غير مضبوط، لذلك لا يمكن إرسال أي شيء من هذا النظام.',
    officialStateForbidden: 'الحالات الرسمية (مُرسل، مقبول) لا يضبطها إلا محوّل ETA من سجل استجابة حقيقي. لا يمكن لهذا الإجراء ضبطها.',
    fourEyesReview: 'يجب أن يكون المراجع شخصًا مختلفًا عن معدّ الإقرار.',
    fourEyesLock: 'لقد راجعت هذه الفترة، لذلك يجب أن يقفلها شخص آخر.',
    unpostedJournals: 'رحّل أو ارفض القيود المعلّقة والمعتمدة في هذه الفترة أولًا.',
    returnLocked: 'هذا الإقرار معتمد وحسابه مقفل. أنشئ تعديلًا بدلًا من ذلك.',
    returnState: 'حالة الإقرار لا تسمح بهذا الإجراء.',
    evidenceRequired: 'أرفق مستند الإثبات (ملف PDF أو صورة أو CSV أو XLSX).',
    referenceRequired: 'أدخل الرقم المرجعي الظاهر في البوابة.',
    recorderRequired: 'أدخل اسم الشخص الذي يسجّل النتيجة.',
    docHasErrors: 'في المستند أخطاء تحقق. صحّحها ثم أعد التجهيز.',
    periodHasReturn: 'يوجد إقرار حالي لهذه الفترة. أنشئ تعديلًا بدلًا من ذلك.',
    noRule: 'لا توجد قاعدة مضبوطة لهذا التاريخ. أضف قاعدة بإصدار في إعدادات الضرائب أولًا.',
    ruleInvalid: 'راجع قيم القاعدة وتواريخ السريان.',
    notRejected: 'لا يُعاد تجهيز إلا مستند سُجّل رفضه.',
    outcomeInvalid: 'اختر نتيجة صحيحة.',
    bankDifference: 'الرصيد المطابق يختلف عن رصيد كشف الحساب، لذلك لا يمكن اعتماد المطابقة.',
    bankUnmatchedLines: 'يجب مطابقة كل أسطر الكشف قبل اعتماد المطابقة.',
    reconciliationOpen: 'هناك كشف بنكي في هذه الفترة لم تتم مطابقته بعد.',
    closingEntriesExist: 'توجد قيود إقفال لهذه السنة المالية بالفعل.',
    closingMappingMissing: 'اختر حساب الأرباح المحتجزة لقيود الإقفال أولًا.',
    matchAmountMismatch: 'يجب أن يتساوى مبلغ سطر الكشف مع مبلغ سطر الدفتر لمطابقتهما.',
    alreadyMatched: 'أحد السطرين مطابَق بالفعل.',
    csvInvalid: 'في ملف الكشف أخطاء. صحّحها ثم استورده مرة أخرى.',
    mappingLineInvalid: 'بند القائمة لا يناسب فئة الحساب.',
    alreadyPrepared: 'يوجد مستند لهذا المصدر بالفعل.',
    sourceNotIssued: 'لا يُجهَّز إلا فاتورة صادرة أو إشعار دائن.',
    periodNotEnded: 'لم تنتهِ الفترة بعد.',
    periodLockedClosing: 'الفترة مقفلة بالفعل.',
    simulationState: 'لا تُحاكى إلا مستندات تمت مراجعتها.',
    wrongKind: 'هذا الإجراء لا ينطبق على هذا النوع من الإقرارات.',
    amountMismatch: 'المبلغ غير صالح لهذا الإجراء.',
  },
};
