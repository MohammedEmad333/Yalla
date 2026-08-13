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
  // من العملاء -> الخادم
  CAPTAIN_TOGGLE_STATUS: 'captain:toggle_status',
  CAPTAIN_UPDATE_LOCATION: 'captain:update_location',
  ORDER_UPDATE_STATUS: 'order:update_status',
});

module.exports = { ROLES, ORDER_STATUS, CAPTAIN_STATUS, ROOMS, EVENTS };
