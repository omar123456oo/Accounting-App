export type HrmKey = 'hrmDuplicate' | 'hrmCycle' | 'hrmInUse' | 'hrmUnknown' | 'hrmLeft' | 'hrmAfterStart' | 'hrmOverlap' | 'hrmInProgress';

export const HRM_MESSAGES: Record<'ar' | 'en', Record<HrmKey, string>> = {
  en: {
    hrmDuplicate: 'This code is already used.',
    hrmCycle: 'A department cannot sit under itself or one of its own sub-departments.',
    hrmInUse: 'Move or end the employees assigned here first.',
    hrmUnknown: 'Unknown reference.',
    hrmLeft: 'This employee has left.',
    hrmAfterStart: 'The end date must be after the start date.',
    hrmOverlap: 'Another active contract covers these dates.',
    hrmInProgress: 'A renewal is already in progress.',
  },
  ar: {
    hrmDuplicate: 'هذا الرمز مستخدم من قبل.',
    hrmCycle: 'لا يمكن وضع الإدارة تحت نفسها أو تحت إحدى إداراتها الفرعية.',
    hrmInUse: 'انقل الموظفين المعيَّنين هنا أو أنهِ خدمتهم أولًا.',
    hrmUnknown: 'مرجع غير معروف.',
    hrmLeft: 'هذا الموظف غادر الشركة.',
    hrmAfterStart: 'يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء.',
    hrmOverlap: 'يوجد عقد ساري آخر يغطي هذه التواريخ.',
    hrmInProgress: 'يوجد تجديد قيد الإجراء بالفعل.',
  },
};
