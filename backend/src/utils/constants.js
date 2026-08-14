'use strict';

// أدوار المستخدمين في المنظومة
const ROLES = Object.freeze({
  USER: 'user',
  CAPTAIN: 'captain',
  ADMIN: 'admin',
});

// حالات الطلب — تمثّل دورة حياة الطلب من الإنشاء حتى التسليم
const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',       // تم الإنشاء، بانتظار الإسناد من الأدمن
  ASSIGNED: 'assigned',     // أسنده الأدمن لكابتن معيّن
  ACCEPTED: 'accepted',     // قبِله الكابتن
  PICKED_UP: 'picked_up',   // استلم الكابتن الشحنة من نقطة الاستلام
  DELIVERED: 'delivered',   // تم التسليم بنجاح
  CANCELLED: 'cancelled',   // أُلغي الطلب
});

// حالة توفّر الكابتن
const CAPTAIN_STATUS = Object.freeze({
  ONLINE: 'online',
  OFFLINE: 'offline',
  BUSY: 'busy', // متصل لكنه يقوم بتوصيل حاليًا
});

// ── نظام المحفظة وشحن الرصيد ─────────────────────────────────────
// حالات عملية شحن الرصيد (Top-up) — تُغطّي المرحلتين:
//   pending  : بانتظار مراجعة الأدمن (المرحلة 1) أو تأكيد البوابة (المرحلة 2)
//   approved : تمّت الموافقة وأُضيف الرصيد للمحفظة
//   rejected : رُفضت (إيصال غير صحيح / عملية غير مؤكّدة)
const TOPUP_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

// اتجاه حركة المحفظة في دفتر الأستاذ (Ledger)
const WALLET_DIRECTION = Object.freeze({
  CREDIT: 'credit', // رصيد داخل (شحن/استرداد)
  DEBIT: 'debit',   // رصيد خارج (دفع قيمة طلب)
});

// أنواع حركات المحفظة
const WALLET_TX_TYPE = Object.freeze({
  TOPUP: 'topup',                 // شحن رصيد
  ORDER_PAYMENT: 'order_payment', // خصم قيمة طلب
  REFUND: 'refund',               // استرداد
  ADJUSTMENT: 'adjustment',       // تعديل يدوي من الأدمن
});

// طرق الدفع لشحن الرصيد — المفتاح يُستخدم لاختيار استراتيجية الدفع (Strategy).
// المرحلة 1: كلّها يدوية (رفع إيصال). المرحلة 2: تُربَط ببوابات رسمية.
const PAYMENT_METHOD = Object.freeze({
  BANK_OF_PALESTINE: 'bank_of_palestine', // بنك فلسطين
  JAWWAL_PAY: 'jawwal_pay',               // جوال باي
  PALPAY: 'palpay',                       // بال باي
});

// أسماء غرف Socket.io — نجمّع الاتصالات حسب الدور والكيان
const ROOMS = Object.freeze({
  admins: () => 'admins',                    // غرفة كل الأدمن
  captain: (id) => `captain:${id}`,          // غرفة كابتن محدّد
  user: (id) => `user:${id}`,                // غرفة مستخدم محدّد
  order: (id) => `order:${id}`,              // غرفة طلب محدّد (لتتبّعه)
});

// أحداث Socket.io — عقد موحّد بين الخادم والعملاء
const EVENTS = Object.freeze({
  // من الخادم -> العملاء
  ORDER_CREATED: 'order:created',
  ORDER_ASSIGNED: 'order:assigned',
  ORDER_STATUS_UPDATED: 'order:status_updated',
  CAPTAIN_LOCATION: 'captain:location',
  CAPTAIN_STATUS_CHANGED: 'captain:status_changed',
  NOTIFICATION_NEW: 'notification:new', // إشعار داخلي جديد يُبثّ لحظيًا للمستلِم
  WALLET_UPDATED: 'wallet:updated',     // تغيّر رصيد محفظة المستخدم (بثّ لحظي له)
  // من العملاء -> الخادم
  CAPTAIN_TOGGLE_STATUS: 'captain:toggle_status',
  CAPTAIN_UPDATE_LOCATION: 'captain:update_location',
  ORDER_UPDATE_STATUS: 'order:update_status',
});

module.exports = {
  ROLES,
  ORDER_STATUS,
  CAPTAIN_STATUS,
  TOPUP_STATUS,
  WALLET_DIRECTION,
  WALLET_TX_TYPE,
  PAYMENT_METHOD,
  ROOMS,
  EVENTS,
};
