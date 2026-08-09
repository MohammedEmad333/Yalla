'use strict';

const Captain = require('../models/Captain');
const io = require('../sockets/io');
const { CAPTAIN_STATUS, ROOMS, EVENTS } = require('../utils/constants');

// تبديل حالة الكابتن (online/offline) عبر REST — بديل لحدث السوكت
async function toggleStatus(req, res, next) {
  try {
    const { status } = req.body; // online | offline
    if (![CAPTAIN_STATUS.ONLINE, CAPTAIN_STATUS.OFFLINE].includes(status)) {
      return res.status(400).json({ message: 'حالة غير صالحة' });
    }
    const captain = await Captain.findByIdAndUpdate(
      req.auth.id,
      { status },
      { new: true }
    ).select('name status');

    // إعلام الأدمن بتغيّر توفّر الكابتن (تحديث قائمة الإسناد)
    io.get().to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
      captainId: captain._id,
      status: captain.status,
    });

    res.json(captain);
  } catch (err) {
    next(err);
  }
}

module.exports = { toggleStatus };
