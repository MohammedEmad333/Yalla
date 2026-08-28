'use strict';

const mongoose = require('mongoose');

// إشعار داخل التطبيق — سجلّ لكل مستلِم (مستخدم/كابتن) يظهر في قائمة إشعاراته.
const notificationSchema = new mongoose.Schema(
  {
    // المستلِم ودوره (نبحث دائمًا بهذين الحقلين)
    recipient: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // Card 103: 'admin' لإشعارات المشرفين داخل نسخة أندرويد من لوحة الأدمن
    recipientRole: { type: String, enum: ['user', 'captain', 'admin'], required: true },

    type: { type: String, required: true }, // ORDER_ASSIGNED, ORDER_STATUS, ...
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }, // {orderId, status, ...}

    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true } // createdAt = وقت الإشعار
);

module.exports = mongoose.model('Notification', notificationSchema);
