'use strict';

const { normalizePalestinianMobile } = require('./phone');

// The admin may edit profile/contact fields only. Account roles, passwords,
// balances, verification state and activation have separate protected flows.
const EDITABLE_FIELDS = Object.freeze([
  'name', 'lastName', 'phone', 'email', 'governorate', 'city', 'address',
]);
const MAX_LENGTHS = {
  name: 100,
  lastName: 100,
  governorate: 100,
  city: 100,
  address: 500,
};

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function parseCustomerProfilePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('بيانات التعديل غير صالحة');
  }
  const fields = Object.keys(input);
  if (!fields.length) throw badRequest('أدخل بيانات لتعديلها');
  if (fields.some((field) => !EDITABLE_FIELDS.includes(field))) {
    throw badRequest('لا يُسمح بتعديل هذا الحقل من بيانات الزبون');
  }

  const patch = {};
  for (const field of fields) {
    if (typeof input[field] !== 'string') {
      throw badRequest('قيم حقول الملف الشخصي يجب أن تكون نصوصًا');
    }
    const value = input[field].trim();
    if (field === 'phone') {
      const normalized = normalizePalestinianMobile(value);
      if (!normalized) throw badRequest('أدخل رقم الجوال بصيغة 05xxxxxxxx');
      patch.phone = normalized;
    } else if (field === 'email') {
      if (value.length > 254 || (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
        throw badRequest('البريد الإلكتروني غير صالح');
      }
      // Use undefined to remove the indexed optional email, not an empty string.
      patch.email = value ? value.toLowerCase() : undefined;
    } else {
      if (value.length > MAX_LENGTHS[field]) {
        throw badRequest('قيمة الحقل طويلة جدًا');
      }
      if (field === 'name' && !value) throw badRequest('اسم الزبون مطلوب');
      patch[field] = value;
    }
  }
  return patch;
}

module.exports = { EDITABLE_FIELDS, parseCustomerProfilePatch };
