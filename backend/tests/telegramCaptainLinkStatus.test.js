'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Link = require('../src/models/TelegramCaptainLink');
const pairing = require('../src/services/telegramCaptainPairing.service');

test('getLinkStatus returns minimal unlinked response', async () => {
  const original = Link.findOne;
  Link.findOne = (filter) => {
    assert.equal(filter.captainId, 'captain-1');
    return { select: (fields) => {
      assert.equal(fields, 'linkedAt');
      return { lean: async () => null };
    } };
  };
  try {
    assert.deepEqual(await pairing.getLinkStatus('captain-1'), {
      linked: false, linkedAt: null
    });
  } finally {
    Link.findOne = original;
  }
});

test('getLinkStatus returns linked timestamp without Telegram identifiers', async () => {
  const original = Link.findOne;
  const linkedAt = new Date('2026-11-01T12:00:00Z');
  Link.findOne = () => ({ select: () => ({ lean: async () => ({
    linkedAt, telegramUserId: '12345', telegramChatId: '12345'
  }) }) });
  try {
    assert.deepEqual(await pairing.getLinkStatus('captain-2'), {
      linked: true, linkedAt
    });
  } finally {
    Link.findOne = original;
  }
});
