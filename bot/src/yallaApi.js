'use strict';

const API_BASE_URL = String(process.env.YALLA_API_BASE_URL || 'https://api.yalladelivery.org').replace(/\/+$/, '');
const BOT_API_TOKEN = String(process.env.YALLA_BOT_API_TOKEN || '').trim();
const API_TIMEOUT_MS = Math.max(1000, parseInt(process.env.YALLA_API_TIMEOUT_MS || '5000', 10) || 5000);

function isConfigured() {
  return Boolean(API_BASE_URL && BOT_API_TOKEN);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

async function fetchCustomerContext(phone) {
  if (!isConfigured()) {
    return { ok: false, configured: false, error: 'Yalla API integration is not configured' };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return { ok: false, configured: true, error: 'Missing phone' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  timer.unref?.();

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/bot/customer-context?phone=${encodeURIComponent(normalizedPhone)}`,
      {
        headers: {
          accept: 'application/json',
          'x-yalla-bot-token': BOT_API_TOKEN,
        },
        signal: controller.signal,
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: res.status,
        error: data?.message || `Yalla API returned ${res.status}`,
      };
    }
    return { ok: true, configured: true, data };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error?.name === 'AbortError' ? 'Yalla API timeout' : (error?.message || String(error)),
    };
  } finally {
    clearTimeout(timer);
  }
}

const STATUS_AR = Object.freeze({
  pending: 'بانتظار الإسناد',
  assigned: 'تم تعيين كابتن',
  accepted: 'الكابتن قبل الطلب',
  picked_up: 'الكابتن استلم الطلب وهو في الطريق',
  delivered: 'تم التسليم',
  cancelled: 'تم إلغاء الطلب',
});

const MERCHANT_STATUS_AR = Object.freeze({
  new: 'بانتظار قبول المتجر',
  accepted: 'المتجر قبل الطلب',
  preparing: 'المتجر يجهّز الطلب',
  ready: 'الطلب جاهز في المتجر',
  handed_over: 'تم تسليم الطلب للكابتن',
  rejected: 'المتجر رفض الطلب',
});

function formatOrderStatus(context) {
  if (!context?.linked) {
    return '📦 ما لقيت حساب Yalla مرتبط بنفس رقم واتساب. افتح التطبيق وتأكد أن حسابك مسجّل بهذا الرقم، أو تواصل مع الدعم إذا احتجت مساعدة.';
  }
  const order = context.latestOrder;
  if (!order) {
    return '📦 حسابك مرتبط، لكن ما لقيت طلبات سابقة على الحساب.';
  }

  const lines = ['📦 *آخر طلب عندك*', ''];
  lines.push(`• الحالة: ${STATUS_AR[order.status] || order.status || 'غير معروفة'}`);
  if (order.storeName) lines.push(`• المتجر: ${order.storeName}`);
  if (order.merchantStatus && MERCHANT_STATUS_AR[order.merchantStatus]) {
    lines.push(`• حالة المتجر: ${MERCHANT_STATUS_AR[order.merchantStatus]}`);
  }
  if (order.captainName) lines.push(`• الكابتن: ${order.captainName}`);
  if (Number(order.etaMinutes) > 0 && !['delivered', 'cancelled'].includes(order.status)) {
    lines.push(`• الوقت التقديري: حوالي ${Math.round(Number(order.etaMinutes))} دقيقة`);
  }
  lines.push('', 'ℹ️ هذه البيانات مباشرة من نظام Yalla وقت سؤالك.');
  return lines.join('\n');
}

function formatWallet(context) {
  if (!context?.linked) {
    return '💳 ما لقيت حساب Yalla مرتبط بنفس رقم واتساب. تأكد أن حسابك في التطبيق يستخدم نفس الرقم.';
  }
  const wallet = context.wallet;
  if (!wallet) {
    return '💳 حسابك مرتبط، لكن ما في محفظة مفعّلة على الحساب حالياً.';
  }

  const currency = wallet.currency === 'ILS' ? '₪' : (wallet.currency || '₪');
  return [
    '💳 *محفظة Yalla*',
    '',
    `• الرصيد: ${Number(wallet.balance || 0).toFixed(2)} ${currency}`,
    `• المحجوز للطلبات: ${Number(wallet.reservedBalance || 0).toFixed(2)} ${currency}`,
    `• المتاح: ${Number(wallet.availableBalance || 0).toFixed(2)} ${currency}`,
    '',
    '🔒 ما بنعرض أي بيانات دفع أو معلومات حساسة على واتساب.',
  ].join('\n');
}

function contextForAI(context) {
  if (!context?.linked) return 'لا يوجد حساب Yalla مرتبط برقم واتساب الحالي.';
  const payload = {
    customerFirstName: context.customer?.firstName || '',
    wallet: context.wallet ? {
      availableBalance: Number(context.wallet.availableBalance || 0),
      currency: context.wallet.currency || 'ILS',
    } : null,
    latestOrder: context.latestOrder ? {
      status: context.latestOrder.status,
      storeName: context.latestOrder.storeName || '',
      merchantStatus: context.latestOrder.merchantStatus || '',
      etaMinutes: Number(context.latestOrder.etaMinutes || 0),
      captainName: context.latestOrder.captainName || '',
    } : null,
  };
  return JSON.stringify(payload);
}

module.exports = {
  isConfigured,
  fetchCustomerContext,
  formatOrderStatus,
  formatWallet,
  contextForAI,
  STATUS_AR,
  MERCHANT_STATUS_AR,
};
