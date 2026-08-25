'use strict';

const {
  WITHDRAWAL_STATUS,
  WITHDRAWAL_METHOD,
  MIN_WITHDRAWAL,
} = require('./constants');

// منطق سحب أرباح الكابتن (Card 19) — دوال نقيّة قابلة للاختبار بلا قاعدة بيانات.

/**
 * حساب رصيد محفظة الكابتن القابل للسحب.
 *   المتاح = صافي الأرباح − (المسحوب فعلًا + المعلّق قيد التحويل)
 * المعلّق يُحجَز حتى لا يطلب الكابتن سحبًا يتجاوز رصيده الحقيقي.
 * @param {number} earnedNet   إجمالي صافي أرباح الكابتن من الطلبات المسلّمة
 * @param {Array<{amount:number,status:string}>} withdrawals
 * @returns {{earned:number, done:number, pending:number, available:number}}
 */
function computeCaptainBalance(earnedNet, withdrawals = []) {
  let done = 0;
  let pending = 0;
  for (const w of withdrawals) {
    const amount = Number(w.amount) || 0;
    if (w.status === WITHDRAWAL_STATUS.DONE) done += amount;
    else if (w.status === WITHDRAWAL_STATUS.PENDING) pending += amount;
    // rejected لا يؤثّر على الرصيد
  }
  const earned = Math.max(0, Number(earnedNet) || 0);
  const available = Math.max(0, +(earned - done - pending).toFixed(2));
  return { earned, done, pending, available };
}

/**
 * التحقّق من صلاحية طلب سحب. يُعيد رسالة خطأ (نص) عند الفشل، أو null عند الصلاحية.
 * @param {{amount:number, method:string, phone:string}} req
 * @param {number} available  الرصيد المتاح للسحب
 */
function validateWithdrawal({ amount, method, phone } = {}, available = 0) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 'مبلغ السحب غير صالح';
  if (value < MIN_WITHDRAWAL) return `الحدّ الأدنى للسحب ${MIN_WITHDRAWAL} ₪`;
  if (value > available) return `المبلغ يتجاوز الرصيد المتاح (${available} ₪)`;
  if (!Object.values(WITHDRAWAL_METHOD).includes(method)) return 'طريقة سحب غير مدعومة';
  if (!phone || String(phone).trim().length < 6) return 'رقم الجوال مطلوب';
  return null;
}

/** هل يمكن للكابتن طلب سحب الآن؟ (رصيده يبلغ الحدّ الأدنى على الأقلّ) */
function canRequestWithdrawal(available) {
  return (Number(available) || 0) >= MIN_WITHDRAWAL;
}

/**
 * Card 98: التحقّق من صلاحية طلب سحب رصيد لزبون. الوجهة تُذكَر نصًّا (اسم محفظة
 * إلكترونية أو بنك) مع رقم الحساب. يُعيد رسالة خطأ (نص) عند الفشل، أو null عند الصلاحية.
 * @param {{amount:number, destination:string, accountNumber:string}} req
 * @param {number} available  الرصيد المتاح للسحب
 */
function validateCustomerWithdrawal({ amount, destination, accountNumber } = {}, available = 0) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 'مبلغ السحب غير صالح';
  if (value < MIN_WITHDRAWAL) return `الحدّ الأدنى للسحب ${MIN_WITHDRAWAL} ₪`;
  if (value > available) return `المبلغ يتجاوز رصيدك المتاح (${available} ₪)`;
  if (!destination || String(destination).trim().length < 2) {
    return 'اذكر المحفظة الإلكترونية أو البنك المطلوب التحويل إليه';
  }
  if (!accountNumber || String(accountNumber).trim().length < 4) {
    return 'أدخل رقم الحساب/المحفظة المستلِم للتحويل';
  }
  return null;
}

module.exports = {
  computeCaptainBalance,
  validateWithdrawal,
  canRequestWithdrawal,
  validateCustomerWithdrawal,
};
