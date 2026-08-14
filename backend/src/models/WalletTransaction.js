'use strict';

const mongoose = require('mongoose');
const {
  TOPUP_STATUS,
  WALLET_DIRECTION,
  WALLET_TX_TYPE,
  PAYMENT_METHOD,
} = require('../utils/constants');

// حركة محفظة — دفتر أستاذ (Ledger) لكل تغيّر على الرصيد أو طلب شحن.
//
// مصمّم ليخدم المرحلتين معًا:
//   • المرحلة 1 (يدوي): يُنشأ بحالة pending مع proof (صورة الإيصال + رقم العملية)
//     ولا يُضاف الرصيد إلّا بعد موافقة الأدمن (يصبح approved).
//   • المرحلة 2 (بوابات): تملأ الاستراتيجية gatewayResponse، وقد يُنشأ approved فورًا.
const walletTransactionSchema = new mongoose.Schema(
  {
    // العلاقات
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },

    // نوع الحركة واتجاهها على الرصيد
    type: {
      type: String,
      enum: Object.values(WALLET_TX_TYPE),
      required: true,
    },
    direction: {
      type: String,
      enum: Object.values(WALLET_DIRECTION),
      required: true,
    },

    // المبلغ (موجب دائمًا؛ الاتّجاه يحدّد الإضافة أو الخصم) — بالشيكل
    amount: { type: Number, required: true, min: 0 },

    // طريقة الدفع (لحركات الشحن) — تُحدّد استراتيجية المعالجة
    method: { type: String, enum: Object.values(PAYMENT_METHOD), default: null },

    // حالة الحركة (المعلّق/المقبول/المرفوض)
    status: {
      type: String,
      enum: Object.values(TOPUP_STATUS),
      default: TOPUP_STATUS.PENDING,
      index: true,
    },

    // ── المرحلة 1: إثبات التحويل اليدوي ──────────────────────────
    proof: {
      imageUrl: { type: String, default: '' },       // مسار صورة الإيصال
      referenceNumber: { type: String, default: '' }, // رقم العملية من التطبيق البنكي
      senderName: { type: String, default: '' },       // اسم المُحوِّل (اختياري)
      paidAt: { type: Date, default: null },           // وقت التحويل (اختياري)
    },

    // ── المرحلة 2: استجابة بوابة الدفع الرسمية ───────────────────
    // نحفظها كما هي (Mixed) للتدقيق والمطابقة (transactionId, رمز الحالة...).
    gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },

    // الرصيد بعد تطبيق الحركة (يُملأ عند approved) — للتدقيق وكشوف الحساب
    balanceAfter: { type: Number, default: null },

    // مراجعة الأدمن (المرحلة 1)
    review: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
      note: { type: String, default: '' },
    },
    rejectionReason: { type: String, default: '' },

    // منع التكرار (نفس مفتاح idempotency لا يُنشئ حركتين)
    idempotencyKey: { type: String, default: undefined },
  },
  { timestamps: true }
);

// فهرس لجلب حركات المستخدم مرتّبة زمنيًا بكفاءة
walletTransactionSchema.index({ user: 1, createdAt: -1 });

// فريد لكل (مستخدم + مفتاح) عند وجود المفتاح فقط (partial)
walletTransactionSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
