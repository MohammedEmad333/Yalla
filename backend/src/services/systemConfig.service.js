'use strict';

const SystemConfig = require('../models/SystemConfig');

const ORDER_MAINTENANCE_KEY = 'orderMaintenance';

function normalize(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enabled: raw.enabled === true,
    message: typeof raw.message === 'string' && raw.message.trim()
      ? raw.message.trim()
      : 'نجري حاليًا أعمال صيانة مؤقتة على نظام الطلب والدفع. الطلب من داخل التطبيق متوقف مؤقتًا، لكن يمكنك الطلب مباشرة عبر رقم يلا.',
  };
}

async function getOrderMaintenance() {
  const config = await SystemConfig.findOne({ key: ORDER_MAINTENANCE_KEY }).lean();
  const normalized = normalize(config?.value);
  return {
    ...normalized,
    updatedAt: config?.updatedAt || null,
  };
}

async function setOrderMaintenance(enabled, updatedBy, message) {
  const current = await getOrderMaintenance();
  const value = {
    enabled: enabled === true,
    message: typeof message === 'string' && message.trim() ? message.trim() : current.message,
  };
  const config = await SystemConfig.findOneAndUpdate(
    { key: ORDER_MAINTENANCE_KEY },
    { $set: { value, updatedBy: updatedBy || null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return { ...normalize(config.value), updatedAt: config.updatedAt || null };
}

async function isOrderMaintenanceEnabled() {
  const state = await getOrderMaintenance();
  return state.enabled;
}

module.exports = {
  getOrderMaintenance,
  setOrderMaintenance,
  isOrderMaintenanceEnabled,
};
