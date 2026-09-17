'use strict';

const mongoose = require('mongoose');
const Merchant = require('./Merchant');
const MerchantEarning = require('./MerchantEarning');
const Coupon = require('./Coupon');
const walletHoldService = require('../services/walletHold.service');
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

    rewardPointsUsed: { type: Number, default: 0, min: 0 },
    rewardPointsRefunded: { type: Number, default: 0, min: 0 },
    rewardPointsPerIls: { type: Number, default: 0, min: 0 },
    rewardDiscount: { type: Number, default: 0, min: 0 },
    rewardDiscountApplied: { type: Number, default: 0, min: 0 },

    commission: { type: Number, default: 0 },
    captainNet: { type: Number, default: 0 },
    customerCharged: { type: Number, default: 0 },
    adminCredit: { type: Number, default: 0 },
    merchantCredit: { type: Number, default: 0 },
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

const MERCHANT_DISPATCH_ALLOWED = ['accepted', 'preparing', 'ready', 'handed_over'];
const MERCHANT_PICKUP_ALLOWED = ['ready', 'handed_over'];

orderSchema.pre('validate', function enforceMerchantDeliveryFlow(next) {
  const isStoreOrder = !!this.store?.restaurant;
  if (!isStoreOrder) return next();

  const merchantStatus = this.store?.merchantStatus || 'new';

  // لا يظهر طلب المتجر للكباتن ولا يُسند قبل أن يقبله المتجر.
  if (this.broadcast && !MERCHANT_DISPATCH_ALLOWED.includes(merchantStatus)) {
    return next(new Error('لا يمكن بث طلب المتجر للكباتن قبل قبول المتجر للطلب'));
  }

  if (
    [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP].includes(this.status) &&
    !MERCHANT_DISPATCH_ALLOWED.includes(merchantStatus)
  ) {
    return next(new Error('لا يمكن إسناد طلب المتجر لكابتن قبل قبول المتجر للطلب'));
  }

  if (
    this.status === ORDER_STATUS.PICKED_UP &&
    !MERCHANT_PICKUP_ALLOWED.includes(merchantStatus)
  ) {
    return next(new Error('لا يمكن للكابتن استلام طلب المتجر قبل أن يصبح جاهزًا'));
  }

  if (merchantStatus === 'handed_over' && !this.captain) {
    return next(new Error('لا يمكن للمتجر تسليم الطلب قبل تعيين كابتن'));
  }

  if (merchantStatus === 'rejected' && this.status !== ORDER_STATUS.CANCELLED) {
    return next(new Error('طلب مرفوض من المتجر يجب أن يكون ملغيًا'));
  }

  if (this.status === ORDER_STATUS.DELIVERED && this.financialSettlementState === 'settled') {
    this.merchantCredit = Math.max(0, Number(this.store?.itemsTotal) || 0);
    this.adminCredit = Math.max(0, Number(this.commission) || 0);
  }

  return next();
});

// نحجز القيمة التقديرية كاملة لطلب المتجر قبل إدخاله قاعدة البيانات. هكذا لا يستطيع
// طلب ثانٍ استهلاك المبلغ المحجوز حتى لو كان الرصيد الإجمالي ما يزال مرتفعًا.
orderSchema.pre('save', async function reserveStoreOrderWalletHold(next) {
  try {
    if (!this.isNew || !this.store?.restaurant) return next();
    const estimatedTotal = Math.max(
      0,
      (Number(this.price) || 0) +
        (Number(this.store?.itemsTotal) || 0) -
        (Number(this.rewardDiscount) || 0)
    );
    if (estimatedTotal > 0) {
      await walletHoldService.reserveOrderAmount(this.user, this._id, estimatedTotal);
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// findOneAndUpdate لا يمر عبر document validation hooks. نضيف حارسًا ذريًا هنا حتى
// لا يستطيع claimOrder أو أي مسار إسناد مباشر تجاوز موافقة/جاهزية المتجر.
orderSchema.pre('findOneAndUpdate', function enforceAtomicMerchantFlow(next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  const nextStatus = set.status;
  const startsBroadcast = set.broadcast === true;
  const isDispatchUpdate =
    startsBroadcast ||
    [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED].includes(nextStatus) ||
    (!!set.captain && nextStatus !== ORDER_STATUS.CANCELLED);
  const isPickupUpdate = nextStatus === ORDER_STATUS.PICKED_UP;

  if (!isDispatchUpdate && !isPickupUpdate) return next();

  const originalQuery = this.getQuery();
  const merchantStates = isPickupUpdate ? MERCHANT_PICKUP_ALLOWED : MERCHANT_DISPATCH_ALLOWED;
  this.setQuery({
    $and: [
      originalQuery,
      {
        $or: [
          { 'store.restaurant': null },
          { 'store.merchantStatus': { $in: merchantStates } },
        ],
      },
    ],
  });
  return next();
});

orderSchema.post('save', async function createMerchantEarning(doc, next) {
  try {
    const isStoreOrder = !!doc.store?.restaurant;
    const amount = Math.max(0, Number(doc.merchantCredit) || 0);
    if (
      !isStoreOrder ||
      doc.status !== ORDER_STATUS.DELIVERED ||
      doc.financialSettlementState !== 'settled' ||
      !(amount > 0)
    ) {
      return next();
    }

    const merchant = await Merchant.findOne({
      $or: [
        { restaurant: doc.store.restaurant },
        { restaurants: doc.store.restaurant },
      ],
      isActive: { $ne: false },
    }).select('_id');

    if (!merchant) return next();

    await MerchantEarning.updateOne(
      { order: doc._id },
      {
        $setOnInsert: {
          order: doc._id,
          restaurant: doc.store.restaurant,
          merchant: merchant._id,
          amount,
          status: 'available',
          availableAt: doc.financialSettledAt || new Date(),
          metadata: {
            restaurantName: doc.store?.name || '',
            itemsTotal: Number(doc.store?.itemsTotal) || 0,
          },
        },
      },
      { upsert: true }
    );
    return next();
  } catch (_) {
    return next();
  }
});

// كل حجز مالي لطلب متجر ينتهي تلقائيًا عند الإلغاء أو بعد نجاح التسليم.
// عند التسليم يكون captureOrderHold/chargeForOrder قد خصم المبلغ الحقيقي قبل الحفظ،
// لذلك هذا الـhook لا يعيد أي مال؛ فقط يتأكد من عدم بقاء حجز نشط.
orderSchema.post('save', async function releaseTerminalWalletHold(doc, next) {
  try {
    if (![ORDER_STATUS.CANCELLED, ORDER_STATUS.DELIVERED].includes(doc.status)) {
      return next();
    }
    await walletHoldService.releaseOrderHold(
      doc._id,
      doc.status === ORDER_STATUS.DELIVERED ? 'order_delivered' : 'order_cancelled'
    );
    return next();
  } catch (_) {
    // لا نفشل حفظ حالة الطلب بسبب تعطل تحرير الحجز؛ العملية idempotent ويمكن إصلاحها لاحقًا.
    return next();
  }
});

// إعادة عداد استخدام الكوبون مرة واحدة فقط عند إلغاء الطلب. restoredOrders يجعل
// العملية idempotent حتى لو حُفظ الطلب الملغي أكثر من مرة أو وصل أكثر من طلب إلغاء.
orderSchema.post('save', async function rollbackCouponOnCancellation(doc, next) {
  try {
    const code = String(doc.store?.couponCode || '').trim().toUpperCase();
    if (doc.status !== ORDER_STATUS.CANCELLED || !code) return next();

    await Coupon.updateOne(
      {
        code,
        usedCount: { $gt: 0 },
        restoredOrders: { $ne: doc._id },
      },
      {
        $inc: { usedCount: -1 },
        $addToSet: { restoredOrders: doc._id },
      }
    );
    return next();
  } catch (_) {
    // لا نفشل إلغاء الطلب بسبب فشل bookkeeping للكوبون.
    return next();
  }
});

// إذا فشل إنشاء طلب متجر بعد نجاح الحجز (مثل تعارض idempotency نادر)، لا نترك
// مبلغًا محجوزًا لطلب لم يُحفظ.
orderSchema.post('save', async function releaseHoldAfterSaveError(error, doc, next) {
  try {
    if (error && doc?._id && doc?.store?.restaurant) {
      await walletHoldService.releaseOrderHold(doc._id, 'order_save_failed');
    }
  } catch (_) {
    // نمرر الخطأ الأصلي دائمًا.
  }
  return next(error);
});

orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Order', orderSchema);
