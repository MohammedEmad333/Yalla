'use strict';

// حسابات محفظة الكابتن (التحصيل النقدي COD) — دوال نقيّة قابلة للاختبار.
//
// النموذج: العميل يدفع قيمة التوصيلة نقدًا للكابتن (COD). من هذه القيمة:
//   - عمولة الشركة  = price × rate
//   - صافي الكابتن   = price − عمولة الشركة
// وبما أن الكابتن حصّل المبلغ كاملًا نقدًا، فهو **مدين للشركة** بمجموع العمولات
// حتى يُسوّيها. المستحقّ = إجمالي العمولات − ما سُوّي.

/**
 * حساب عمولة الشركة وصافي الكابتن لتوصيلة واحدة.
 * @param {number} price
 * @param {number} rate نسبة العمولة (0..1)
 * @returns {{ commission:number, net:number }}
 */
function computeSettlement(price, rate) {
  const p = Number(price) || 0;
  const r = Math.min(1, Math.max(0, Number(rate) || 0));
  const commission = Math.round(p * r);
  return { commission, net: p - commission };
}

/**
 * تلخيص محفظة الكابتن من طلباته المسلّمة.
 * @param {Array<{price:number, commission:number, captainNet:number}>} deliveredOrders
 * @param {number} settledCommission ما سُوّي من العمولات
 * @returns {{ deliveries:number, gross:number, commission:number, net:number, owed:number }}
 */
function summarizeWallet(deliveredOrders, settledCommission = 0) {
  const acc = deliveredOrders.reduce(
    (a, o) => {
      a.gross += o.price || 0;
      a.commission += o.commission || 0;
      a.net += o.captainNet || 0;
      a.deliveries += 1;
      return a;
    },
    { deliveries: 0, gross: 0, commission: 0, net: 0 }
  );

  // المستحقّ للشركة لا ينزل تحت الصفر
  acc.owed = Math.max(0, acc.commission - (settledCommission || 0));
  return acc;
}

module.exports = { computeSettlement, summarizeWallet };
