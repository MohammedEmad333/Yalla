'use strict';

const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../utils/constants');

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    city: { type: String, default: '' },
    neighborhood: { type: String, default: '' },
    street: { type: String, default: '' },
    details: { type: String, default: '' },
    note: { type: String, default: '' },
    contactName: String,
    contactPhone: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain', default: null, index: true },
    pickup: { type: locationSchema, required: true },
    dropoff: { type: locationSchema, required: true },

    store: {
      restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null },
      name: { type: String, default: '' },
      merchantStatus: {
        type: String,
        enum: ['new', 'accepted', 'preparing', 'ready', 'handed_over', 'rejected'],
        default: 'new',
      },
      merchantUpdatedAt: { type: Date, default: null },
      prepMinutes: { type: Number, default: 0 },
      items: [
        {
          menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
          name: { type: String, default: '' },
          variant: { type: String, default: '' },
          options: [{
            group: { type: String, default: '' },
            option: { type: String, default: '' },
            price: { type: Number, default: 0 },
            _id: false,
          }],
          price: { type: Number, default: 0 },
          qty: { type: Number, default: 1 },
          note: { type: String, default: '' },
          _id: false,
        },
      ],
      itemsTotal: { type: Number, default: 0 },
      itemsOriginalTotal: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      couponCode: { type: String, default: '' },
      promotionTitle: { type: String, default: '' },
      note: { type: String, default: '' },
    },

    packageNote: { type: String, default: '' },
    price: { type: Number, default: 0 },
    finalPrice: { type: Number, default: 0 },
    deliveryCode: { type: String, default: '', select: false },
    distanceKm: { type: Number, default: 0 },
    etaMinutes: { type: Number, default: 0 },
    scheduledAt: { type: Date, default: null, index: true },
    scheduledActivated: { type: Boolean, default: false },

    // نقاط Yalla لا تتحول إلى المحفظة؛ تُحجز وتُستهلك كخصم على هذا الطلب فقط.
    rewardPointsUsed: { type: Number, default: 0, min: 0 },
    rewardPointsRefunded: { type: Number, default: 0, min: 0 },
    rewardPointsPerIls: { type: Number, default: 0, min: 0 },
    rewardDiscount: { type: Number, default: 0, min: 0 },
    rewardDiscountApplied: { type: Number, default: 0, min: 0 },

    commission: { type: Number, default: 0 },
    captainNet: { type: Number, default: 0 },
    customerCharged: { type: Number, default: 0 },
    adminCredit: { type: Number, default: 0 },
    financialSettledAt: { type: Date, default: null },
    financialSettlementState: {
      type: String,
      enum: ['pending', 'processing', 'settled', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    financialSettlementError: { type: String, default: '' },
    refundedAt: { type: Date, default: null },
    refundAmount: { type: Number, default: 0 },

    rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Captain' }],
    broadcast: { type: Boolean, default: false, index: true },
    broadcastAt: { type: Date, default: null },
    rejections: [
      {
        captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain' },
        reason: { type: String, default: '' },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },
    timeline: {
      assignedAt: Date,
      acceptedAt: Date,
      pickedUpAt: Date,
      deliveredAt: Date,
      cancelledAt: Date,
    },
    cancelReason: { type: String, default: '' },
    delayWarnedAt: { type: Date, default: null },
    idempotencyKey: { type: String, default: undefined },
    rating: {
      stars: { type: Number, min: 1, max: 5 },
      comment: { type: String, default: '' },
      ratedAt: Date,
    },
  },
  { timestamps: true }
);

// طلبات المتاجر لها مساران متزامنان: تجهيز المتجر وتوصيل الكابتن.
// هذه القيود تجعل قاعدة البيانات نفسها تمنع القفز بين المسارين حتى لو كان
// الاستدعاء آليًا أو يدويًا أو جاء من إصدار قديم من التطبيق.
orderSchema.pre('validate', function enforceMerchantDeliveryFlow(next) {
  const isStoreOrder = !!this.store?.restaurant;
  if (!isStoreOrder) return next();

  const merchantStatus = this.store?.merchantStatus || 'new';
  const dispatchAllowed = ['accepted', 'preparing', 'ready', 'handed_over'];

  if (
    [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP].includes(this.status) &&
    !dispatchAllowed.includes(merchantStatus)
  ) {
    return next(new Error('لا يمكن إسناد طلب المتجر لكابتن قبل قبول المتجر للطلب'));
  }

  if (
    this.status === ORDER_STATUS.PICKED_UP &&
    !['ready', 'handed_over'].includes(merchantStatus)
  ) {
    return next(new Error('لا يمكن للكابتن استلام طلب المتجر قبل أن يصبح جاهزًا'));
  }

  if (merchantStatus === 'handed_over' && !this.captain) {
    return next(new Error('لا يمكن للمتجر تسليم الطلب قبل تعيين كابتن'));
  }

  if (merchantStatus === 'rejected' && this.status !== ORDER_STATUS.CANCELLED) {
    return next(new Error('طلب مرفوض من المتجر يجب أن يكون ملغيًا'));
  }

  return next();
});

orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Order', orderSchema);
