'use strict';

// دوال إشعارات نقيّة — قابلة للاختبار بلا قاعدة بيانات.

/**
 * عدّ الإشعارات غير المقروءة.
 * @param {Array<{read:boolean}>} list
 * @returns {number}
 */
function unreadCount(list) {
  return list.reduce((n, x) => (x.read ? n : n + 1), 0);
}

module.exports = { unreadCount };
