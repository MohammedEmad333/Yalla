'use strict';

const expansionService = require('../services/expansion.service');
const OrderIssue = require('../models/OrderIssue');
const OrderPayment = require('../models/OrderPayment');

async function resolveIssue(req, res, next) {
  try {
    const approvedRefund = Math.max(0, Number(req.body?.approvedRefund) || 0);
    if (approvedRefund > 0) {
      const issue = await OrderIssue.findById(req.params.issueId).select('order');
      if (!issue) return res.status(404).json({ message: 'الشكوى غير موجودة' });
      const jawwalPayment = await OrderPayment.findOne({
        order: issue.order,
        provider: 'jawwal_pay',
        status: { $in: ['paid', 'refund_pending', 'refunded'] },
      }).select('_id status amount');
      if (jawwalPayment) {
        return res.status(409).json({
          message: 'هذا الطلب مدفوع عبر جوال. عالج الاسترداد من قسم استردادات Jawwal Pay بدل محفظة Yalla.',
          paymentId: String(jawwalPayment._id),
          paymentStatus: jawwalPayment.status,
          paidAmount: jawwalPayment.amount,
        });
      }
    }
    res.json(await expansionService.resolveIssue(req.auth.id, req.params.issueId, req.body));
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveIssue };
