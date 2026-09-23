function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildAdminNumbers({ adminNumbers = '', businessNumber = '', supportNumber = '' } = {}) {
  return Array.from(
    new Set(
      [
        ...String(adminNumbers || '').split(','),
        businessNumber,
        supportNumber,
      ]
        .map(normalizePhone)
        .filter((value) => value.length >= 8),
    ),
  );
}

function isAdminPhone(phone, adminNumbers) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;
  return adminNumbers.includes(normalizedPhone);
}

function redactSensitiveText(value) {
  let text = String(value || '');
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
  text = text.replace(/\b(?:\+?\d[\d\s-]{7,}\d)\b/g, '[REDACTED_PHONE_OR_NUMBER]');
  if (/(?:otp|رمز|كود|تحقق)/i.test(text)) {
    text = text.replace(/\b\d{4,8}\b/g, '[REDACTED_CODE]');
  }
  return text;
}

function createAdminHttpAuth(expectedToken) {
  return function adminHttpAuth(req, res, next) {
    if (!expectedToken) {
      return res.status(503).json({
        error: 'Admin HTTP endpoints are disabled until ADMIN_HTTP_TOKEN is configured.',
      });
    }

    const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const headerToken = String(req.get('x-admin-token') || '').trim();

    if (bearer !== expectedToken && headerToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return next();
  };
}

module.exports = {
  normalizePhone,
  buildAdminNumbers,
  isAdminPhone,
  redactSensitiveText,
  createAdminHttpAuth,
};
