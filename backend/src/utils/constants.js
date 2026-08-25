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

// ── سحب أرباح الكابتن (Card 19) ──────────────────────────────────
// حالات طلب سحب الأموال من محفظة الكابتن:
//   pending : بانتظار تحويل الأدمن
//   done    : حوّل الأدمن المبلغ وخُصم من رصيد الكابتن
//   rejected: رُفض الطلب (بيانات غير صحيحة/سبب آخر)
const WITHDRAWAL_STATUS = Object.freeze({
  PENDING: 'pending',
  DONE: 'done',
  REJECTED: 'rejected',
});

// طرق سحب الأموال المتاحة للكابتن — تطابق تصنيفات محافظه الإلكترونية (Card 71)
const WITHDRAWAL_METHOD = Object.freeze({
  BANK_OF_PALESTINE: 'bank_of_palestine', // بنك فلسطين
  JAWWAL_PAY: 'jawwal_pay',               // جوال باي
  PALPAY: 'palpay',                       // بال باي
  ALL: 'all',                             // محفظة "الكل" (رقم صالح لكل الطرق)
  CASH: 'cash',                           // نقدًا
});

// الحدّ الأدنى لرصيد السحب (₪) — لا يُسمح بالسحب تحته
const MIN_WITHDRAWAL = 10;

// تصنيفات محفظة الكابتن الإلكترونية المحفوظة (Card 67) — يخزّن الكابتن رقم
// المحفظة واسم صاحبها لكل تصنيف ليعرفه الأدمن عند تحويل أمواله:
//   bank_of_palestine : بنك فلسطين
//   palpay            : محفظة بال باي
//   jawwal_pay        : جوال باي
//   all               : خيار "الكل" (رقم واحد صالح لكل الطرق)
const PAYOUT_WALLET_CATEGORY = Object.freeze({
  BANK_OF_PALESTINE: 'bank_of_palestine',
  PALPAY: 'palpay',
  JAWWAL_PAY: 'jawwal_pay',
  ALL: 'all',
});

// جمهور رسائل/إشعارات الأدمن الجماعية (Card 66)
const BROADCAST_AUDIENCE = Object.freeze({
  ALL: 'all',           // كل المستخدمين والكباتن
  USERS: 'users',       // كل الزبائن
  CAPTAINS: 'captains', // كل الكباتن
  SPECIFIC: 'specific', // مستلِمون محدّدون (userIds/captainIds)
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
  CAPTAIN_WALLET_UPDATED: 'captain_wallet:updated', // تغيّر رصيد محفظة الكابتن (Card 19)
  WITHDRAWAL_REQUESTED: 'withdrawal:requested',     // طلب سحب جديد يُبثّ للأدمن (Card 19)
  CHAT_MESSAGE: 'chat:message',   // رسالة دردشة جديدة على طلب (Card 18)
  CHAT_CLEARED: 'chat:cleared',   // حُذفت رسائل الطلب (بعد التسليم/الإلغاء)
  CHAT_MESSAGE_DELETED: 'chat:message_deleted', // حذف الأدمن لرسالة دردشة واحدة (Card 94)
  ORDER_DELAYED: 'order:delayed', // طلب تجاوز زمنه التقديري — تحذير للأدمن (Card 40)
  ORDER_ASSIGN_TIMEOUT: 'order:assign_timeout', // انتهت مهلة قبول الكابتن — تنبيه للأدمن (Card 54)
  CAPTAIN_DELETED: 'captain:deleted', // حُذف كابتن نهائيًا (Card 38)
  USER_DELETED: 'user:deleted',       // حُذف زبون نهائيًا (Card 38)
  SUPPORT_MESSAGE: 'support:message', // رسالة دعم بين الزبون والأدمن (Card 44/46)
  SUPPORT_MESSAGE_DELETED: 'support:message_deleted', // حُذفت رسالة دعم نهائيًا (Card 56)
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
  WITHDRAWAL_STATUS,
  WITHDRAWAL_METHOD,
  MIN_WITHDRAWAL,
  PAYOUT_WALLET_CATEGORY,
  BROADCAST_AUDIENCE,
  ROOMS,
  EVENTS,
};
