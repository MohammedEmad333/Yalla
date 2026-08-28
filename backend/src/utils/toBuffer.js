'use strict';

// Card 104: عند قراءة صورة FileAsset بـ .lean()، تُرجع MongoDB حقلَ البيانات
// الثنائية كـ BSON Binary لا كـ Node Buffer (لأنّ سائق mongodb يُبقي
// promoteBuffers=false افتراضيًا، و lean لا يمرّ بتحويل mongoose للـ Buffer).
// وقتها كان res.send(binary) يُسلسِله كـ JSON (نصّ base64) بترويسة
// application/json بدل الصورة الخام — فلا تظهر الصورة في التطبيق ولا لوحة الأدمن.
// هذه الأداة النقيّة تُعيد Buffer صحيحًا من أيّ شكل محتمَل للبيانات.
function toBuffer(data) {
  if (data == null) return null;
  if (Buffer.isBuffer(data)) return data;
  // BSON Binary: يملك خاصية buffer (Buffer) — أبسط تحويل وأكثره أمانًا
  if (Buffer.isBuffer(data.buffer)) return Buffer.from(data.buffer);
  // Binary أقدم/بديل: دالة value(true) تُرجع Buffer الخام
  if (typeof data.value === 'function') {
    const v = data.value(true);
    if (Buffer.isBuffer(v)) return v;
  }
  // كائن شبيه بـ Buffer المسلسَل ({type:'Buffer', data:[...]}) أو مصفوفة بايتات
  if (Array.isArray(data)) return Buffer.from(data);
  if (Array.isArray(data.data)) return Buffer.from(data.data);
  // ملاذ أخير: محاولة إنشاء Buffer مباشرة
  try {
    return Buffer.from(data);
  } catch (_) {
    return null;
  }
}

module.exports = { toBuffer };
