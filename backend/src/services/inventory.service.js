'use strict';

const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

function httpError(message, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * يخصم مخزون الأصناف المتتبعة واحدًا واحدًا بشرط ذري (inventoryQty >= qty).
 * إذا فشل أي صنف، نعيد كل ما خُصم في هذه المحاولة قبل رمي الخطأ.
 */
async function consumeInventory(docs, wanted) {
  const consumed = [];
  try {
    for (const doc of docs) {
      if (!doc.trackInventory) continue;
      const qty = Number(wanted.get(String(doc._id)) || 0);
      if (!(qty > 0)) continue;

      const updated = await MenuItem.findOneAndUpdate(
        {
          _id: doc._id,
          trackInventory: true,
          available: { $ne: false },
          inventoryQty: { $gte: qty },
        },
        { $inc: { inventoryQty: -qty } },
        { new: true }
      );

      if (!updated) {
        throw httpError(`الكمية المتوفرة من «${doc.name}» لم تعد تكفي للطلب — حدّث السلّة وحاول مجددًا`);
      }

      consumed.push({ itemId: doc._id, qty });
      if (Number(updated.inventoryQty) <= 0) {
        await MenuItem.updateOne(
          { _id: doc._id, inventoryQty: { $lte: 0 } },
          { $set: { inventoryQty: 0, available: false } }
        );
      }
    }
    return consumed;
  } catch (err) {
    await restoreConsumed(consumed);
    throw err;
  }
}

async function restoreConsumed(consumed = []) {
  for (const row of consumed) {
    if (!row?.itemId || !(Number(row.qty) > 0)) continue;
    await MenuItem.updateOne(
      { _id: row.itemId, trackInventory: true },
      { $inc: { inventoryQty: Number(row.qty) }, $set: { available: true } }
    );
  }
}

/**
 * يعلّم مخزون الطلب كمحرر ذرّيًا أولًا، ثم يعيد الكميات مرة واحدة فقط.
 * إذا فشلت إعادة أي كمية نعيد علامة التحرير إلى null ليتمكن reconciliation/retry من المحاولة.
 */
async function releaseOrderInventory(orderId) {
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      inventoryCommitted: true,
      inventoryReleasedAt: null,
    },
    { $set: { inventoryReleasedAt: new Date() } },
    { new: false }
  ).lean();

  if (!claimed) return { released: false, duplicate: true };

  try {
    for (const line of claimed.store?.items || []) {
      if (!line.menuItem || !(Number(line.qty) > 0)) continue;
      await MenuItem.updateOne(
        { _id: line.menuItem, trackInventory: true },
        { $inc: { inventoryQty: Number(line.qty) }, $set: { available: true } }
      );
    }
    return { released: true, duplicate: false };
  } catch (err) {
    await Order.updateOne(
      { _id: orderId },
      { $set: { inventoryReleasedAt: null } }
    ).catch(() => {});
    throw err;
  }
}

module.exports = {
  consumeInventory,
  restoreConsumed,
  releaseOrderInventory,
};
