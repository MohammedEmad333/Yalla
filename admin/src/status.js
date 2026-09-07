// حالات الطلب: التسمية العربية ونغمة الشارة — مصدر واحد لكل الصفحات.

export const ORDER_STATUS_AR = {
  '': 'كل الحالات',
  pending: 'بانتظار كابتن',
  assigned: 'مُسنَد',
  accepted: 'مقبول',
  picked_up: 'جارٍ التوصيل',
  delivered: 'مسلّم',
  cancelled: 'ملغى',
};

// نغمات شارات الحالة (تطابق Badge tone في مكتبة المكوّنات)
export const ORDER_STATUS_TONE = {
  pending: 'neutral',
  assigned: 'info',
  accepted: 'brand',
  picked_up: 'brand',
  delivered: 'success',
  cancelled: 'danger',
};

export const statusLabel = (s) => ORDER_STATUS_AR[s] || s;
export const statusTone = (s) => ORDER_STATUS_TONE[s] || 'neutral';
