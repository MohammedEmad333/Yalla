'use strict';

// Card 102: أدوات نقيّة (بلا قاعدة بيانات) لرابط الصورة المخزّنة في قاعدة البيانات.
// نمط الرابط: /files/<ObjectId> (24 خانة hex).
const FILE_URL_RE = /^\/files\/([a-f0-9]{24})$/i;

// يستخرج معرّف الصورة من الرابط، أو null إن لم يكن رابط قاعدة بيانات.
function fileIdFromUrl(url) {
  const m = typeof url === 'string' && url.match(FILE_URL_RE);
  return m ? m[1] : null;
}

module.exports = { FILE_URL_RE, fileIdFromUrl };
