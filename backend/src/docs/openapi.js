'use strict';

// بناء مواصفة OpenAPI 3.0 لواجهة يلا — دالة نقيّة (بلا تبعيات) قابلة للاختبار.
// تُقدَّم كـ JSON على /api/openapi.json وتُعرض بصفحة بسيطة على /api/docs.

// مساعد مختصر لتقليل التكرار في تعريف العمليات
function op({ summary, tags, auth = true, roles = [], body = null, params = [] }) {
  const operation = {
    summary: roles.length ? `${summary} (${roles.join('/')})` : summary,
    tags,
    responses: {
      200: { description: 'نجاح' },
      400: { description: 'مدخلات غير صالحة' },
      401: { description: 'غير مصادَق' },
      403: { description: 'غير مصرّح' },
    },
  };
  if (auth) operation.security = [{ bearerAuth: [] }];
  if (params.length) {
    operation.parameters = params.map((p) => ({
      name: p,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
  }
  if (body) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: body } } },
    };
  }
  return operation;
}

// أنواع مختصرة
const str = { type: 'string' };
const num = { type: 'number' };
const coords = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };

function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Yalla API',
      version: '1.0.0',
      description: 'واجهة تطبيق يلا للتوصيل اللحظي (مستخدم/كابتن/أدمن).',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    tags: [
      { name: 'Auth', description: 'المصادقة والحسابات' },
      { name: 'Orders', description: 'الطلبات ودورة حياتها' },
      { name: 'Captains', description: 'الكباتن والأرباح والمحفظة' },
      { name: 'Admin', description: 'الإدارة والإحصائيات' },
      { name: 'Notifications', description: 'رموز أجهزة FCM' },
    ],
    paths: {
      // ── Auth ──
      '/auth/register': {
        post: op({ summary: 'إنشاء حساب مستخدم', tags: ['Auth'], auth: false,
          body: { name: str, phone: str, password: str } }),
      },
      '/auth/login': {
        post: op({ summary: 'دخول مستخدم/أدمن', tags: ['Auth'], auth: false,
          body: { phone: str, password: str } }),
      },
      '/auth/captain/login': {
        post: op({ summary: 'دخول كابتن', tags: ['Auth'], auth: false,
          body: { phone: str, password: str } }),
      },
      '/auth/captain/register': {
        post: op({ summary: 'إنشاء كابتن', tags: ['Auth'], roles: ['admin'],
          body: { name: str, phone: str, password: str, vehicleType: str } }),
      },
      '/auth/me': { get: op({ summary: 'الجلسة الحالية', tags: ['Auth'] }) },

      // ── Orders ──
      '/orders/quote': {
        post: op({ summary: 'تسعيرة تقديرية', tags: ['Orders'], roles: ['user'],
          body: { pickup: coords, dropoff: coords } }),
      },
      '/orders': {
        post: op({ summary: 'إنشاء طلب', tags: ['Orders'], roles: ['user'],
          body: { pickup: { type: 'object' }, dropoff: { type: 'object' }, packageNote: str,
            scheduledAt: { type: 'string', format: 'date-time' } } }),
      },
      '/orders/mine': { get: op({ summary: 'سجلّ طلباتي', tags: ['Orders'], roles: ['user'] }) },
      '/orders/active': { get: op({ summary: 'الطلبات النشطة', tags: ['Orders'], roles: ['admin'] }) },
      '/orders/search': { get: op({ summary: 'بحث/فلترة الطلبات', tags: ['Orders'], roles: ['admin'] }) },
      '/orders/export': { get: op({ summary: 'تصدير CSV', tags: ['Orders'], roles: ['admin'] }) },
      '/orders/available-captains': { get: op({ summary: 'الكباتن المتاحون', tags: ['Orders'], roles: ['admin'] }) },
      '/orders/{orderId}': { get: op({ summary: 'تتبّع طلب', tags: ['Orders'], params: ['orderId'] }) },
      '/orders/{orderId}/rate': {
        post: op({ summary: 'تقييم الكابتن', tags: ['Orders'], roles: ['user'], params: ['orderId'],
          body: { stars: num, comment: str } }),
      },
      '/orders/{orderId}/cancel': {
        post: op({ summary: 'إلغاء طلب', tags: ['Orders'], roles: ['user', 'admin'], params: ['orderId'],
          body: { reason: str } }),
      },
      '/orders/{orderId}/assign': {
        patch: op({ summary: 'إسناد يدوي', tags: ['Orders'], roles: ['admin'], params: ['orderId'],
          body: { captainId: str } }),
      },
      '/orders/{orderId}/auto-assign': {
        patch: op({ summary: 'إسناد تلقائي لأقرب كابتن', tags: ['Orders'], roles: ['admin'], params: ['orderId'] }),
      },
      '/orders/{orderId}/status': {
        patch: op({ summary: 'تحديث حالة الطلب', tags: ['Orders'], roles: ['captain'], params: ['orderId'],
          body: { status: str, reason: str } }),
      },

      // ── Captains ──
      '/captains/status': {
        patch: op({ summary: 'تبديل التوفّر', tags: ['Captains'], roles: ['captain'], body: { status: str } }),
      },
      '/captains/me/orders': { get: op({ summary: 'سجلّ توصيلاتي', tags: ['Captains'], roles: ['captain'] }) },
      '/captains/me/earnings': { get: op({ summary: 'ملخّص الأرباح', tags: ['Captains'], roles: ['captain'] }) },
      '/captains/me/wallet': { get: op({ summary: 'المحفظة (COD)', tags: ['Captains'], roles: ['captain'] }) },
      '/captains/{id}/reviews': { get: op({ summary: 'مراجعات كابتن', tags: ['Captains'], params: ['id'] }) },

      // ── Admin ──
      '/admin/stats': { get: op({ summary: 'مؤشّرات الأداء', tags: ['Admin'], roles: ['admin'] }) },
      '/admin/users': { get: op({ summary: 'قائمة المستخدمين', tags: ['Admin'], roles: ['admin'] }) },
      '/admin/users/{userId}/active': {
        patch: op({ summary: 'تفعيل/تعطيل مستخدم', tags: ['Admin'], roles: ['admin'], params: ['userId'],
          body: { isActive: { type: 'boolean' } } }),
      },
      '/admin/captains': { get: op({ summary: 'قائمة الكباتن', tags: ['Admin'], roles: ['admin'] }) },
      '/admin/captains/{captainId}/approve': {
        patch: op({ summary: 'اعتماد كابتن', tags: ['Admin'], roles: ['admin'], params: ['captainId'],
          body: { isApproved: { type: 'boolean' } } }),
      },
      '/admin/captains/{captainId}/wallet': {
        get: op({ summary: 'محفظة كابتن', tags: ['Admin'], roles: ['admin'], params: ['captainId'] }),
      },
      '/admin/captains/{captainId}/settle': {
        post: op({ summary: 'تسوية عمولة', tags: ['Admin'], roles: ['admin'], params: ['captainId'],
          body: { amount: num } }),
      },

      // ── Notifications ──
      '/notifications/device-token': {
        post: op({ summary: 'تسجيل رمز جهاز', tags: ['Notifications'], body: { token: str } }),
        delete: op({ summary: 'إزالة رمز جهاز', tags: ['Notifications'], body: { token: str } }),
      },
      '/notifications': { get: op({ summary: 'إشعاراتي (داخل التطبيق)', tags: ['Notifications'] }) },
      '/notifications/read-all': { patch: op({ summary: 'تعليم الكلّ كمقروء', tags: ['Notifications'] }) },
      '/notifications/{id}/read': {
        patch: op({ summary: 'تعليم إشعار كمقروء', tags: ['Notifications'], params: ['id'] }),
      },
    },
  };
}

module.exports = { buildOpenApiSpec };
