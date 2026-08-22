'use strict';

const supportService = require('../services/support.service');

// ── الزبون (Card 44) ─────────────────────────────────────────────

// الزبون يجلب محادثته مع الدعم
async function myMessages(req, res, next) {
  try {
    const items = await supportService.listMessages(req.auth.id);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// الزبون يرسل رسالة للدعم
async function send(req, res, next) {
  try {
    const message = await supportService.userSend(req.auth.id, (req.body || {}).text);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

// ── الأدمن (Card 46) ─────────────────────────────────────────────

// قائمة سلاسل الدعم (زبون لكل سلسلة) مع عدد غير المقروء
async function listThreads(req, res, next) {
  try {
    const items = await supportService.listThreads();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// رسائل سلسلة زبون معيّن (وتُعلَّم الواردة منه كمقروءة)
async function threadMessages(req, res, next) {
  try {
    const items = await supportService.adminThread(req.params.userId);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// الأدمن يردّ على زبون
async function reply(req, res, next) {
  try {
    const message = await supportService.adminReply(req.params.userId, (req.body || {}).text);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

// الأدمن يحذف رسالة دعم نهائيًا (Card 56)
async function deleteMessage(req, res, next) {
  try {
    const result = await supportService.deleteMessage(req.params.messageId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { myMessages, send, listThreads, threadMessages, reply, deleteMessage };
