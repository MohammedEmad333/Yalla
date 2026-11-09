'use strict';

const { coordsForNeighborhood, isValidCity, isValidNeighborhood } = require('./neighborhoods');
const { composeAddress } = require('./address');

function httpError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function textField(value, label, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw httpError(`${label}: أدخل نصًا صحيحًا`);
  const text = value.trim();
  if ((required && !text) || text.length > max) {
    throw httpError(`${label}: ${required && !text ? 'الحقل مطلوب' : 'النص طويل جدًا'}`);
  }
  return text;
}

function parseAddress(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(`بيانات ${label} غير صالحة`);
  }
  const allowed = new Set(['city', 'neighborhood', 'street', 'details', 'note', 'contactName', 'contactPhone']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw httpError(`حقول ${label} غير مسموحة`);
  }
  const city = textField(value.city, `مدينة ${label}`, 100, true);
  const neighborhood = textField(value.neighborhood, `حي ${label}`, 100, true);
  if (!isValidCity(city) || !isValidNeighborhood(neighborhood, city)) {
    throw httpError(`اختر مدينة وحيًا صالحين لـ ${label}`);
  }
  const street = textField(value.street, `شارع ${label}`, 150);
  const details = textField(value.details, `تفاصيل ${label}`, 300);
  const note = textField(value.note, `ملاحظة ${label}`, 300);
  const contactName = textField(value.contactName, `جهة اتصال ${label}`, 100);
  const contactPhone = textField(value.contactPhone, `هاتف ${label}`, 20);
  if (contactPhone && !/^[0-9+\-\s]{6,20}$/.test(contactPhone)) {
    throw httpError(`رقم هاتف ${label} غير صالح`);
  }
  return {
    city,
    neighborhood,
    street,
    details,
    note,
    contactName,
    contactPhone,
    address: composeAddress({ city, neighborhood, street, details }),
    location: { type: 'Point', coordinates: coordsForNeighborhood(neighborhood, city) },
  };
}

function parseAdminOrder(input, requireKey = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError('بيانات الطلب غير صالحة');
  }
  const allowed = new Set([
    'userId', 'pickup', 'dropoff', 'packageNote', 'requestKey',
    'priceMode', 'customPrice', 'priceReason', 'captainId',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw httpError('توجد حقول غير مسموحة في الطلب');
  }
  if (typeof input.userId !== 'string' || !/^[a-f\d]{24}$/i.test(input.userId)) {
    throw httpError('اختر زبونًا مسجّلًا وصحيحًا');
  }
  const pickup = parseAddress(input.pickup, 'الاستلام');
  const dropoff = parseAddress(input.dropoff, 'التسليم');
  const packageNote = textField(input.packageNote, 'وصف الشحنة', 500);
  const priceMode = input.priceMode === undefined ? 'calculated' : input.priceMode;
  if (!['calculated', 'custom'].includes(priceMode)) {
    throw httpError('اختر طريقة تسعير صالحة');
  }
  let customPrice;
  let priceReason = '';
  if (priceMode === 'custom') {
    customPrice = input.customPrice;
    if (
      typeof customPrice !== 'number' ||
      !Number.isFinite(customPrice) ||
      customPrice < 0 || customPrice > 10000 ||
      Math.abs(Math.round(customPrice * 100) - customPrice * 100) > 1e-7
    ) {
      throw httpError('السعر اليدوي يجب أن يكون من 0 إلى 10000 شيكل وبحد أقصى منزلتين عشريتين');
    }
    priceReason = textField(input.priceReason, 'سبب تحديد السعر', 250, true);
  } else if (input.customPrice !== undefined || input.priceReason !== undefined) {
    throw httpError('لا ترسل سعرًا يدويًا إلا عند اختيار التسعير اليدوي');
  }

  const captainId = input.captainId === undefined || input.captainId === ''
    ? null : input.captainId;
  if (captainId !== null && (typeof captainId !== 'string' || !/^[a-f\d]{24}$/i.test(captainId))) {
    throw httpError('اختر كابتنًا صالحًا');
  }
  let requestKey;
  if (requireKey) {
    if (typeof input.requestKey !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(input.requestKey)) {
      throw httpError('مفتاح منع تكرار الطلب غير صالح');
    }
    requestKey = `admin:${input.requestKey}`;
  } else if (input.requestKey !== undefined) {
    throw httpError('مفتاح الطلب غير مطلوب لمعاينة السعر');
  }
  return {
    userId: input.userId,
    payload: { pickup, dropoff, packageNote },
    priceMode, customPrice, priceReason, captainId, requestKey,
  };
}

module.exports = { parseAdminOrder };
