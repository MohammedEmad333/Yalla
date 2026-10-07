'use strict';

try {
  require('dotenv').config();
} catch {
  // dotenv غير مثبّت — نعتمد على متغيّرات البيئة الموجودة مباشرةً
}

const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost'];

const OFFICIAL_WEB_ORIGINS = [
  'https://yalladelivery.org',
  'https://www.yalladelivery.org',
  'https://app.yalladelivery.org',
  'https://admin.yalladelivery.org',
  'https://partner.yalladelivery.org',
];

function parseCorsOrigin(value) {
  if (!value || value.trim() === '*') return '*';
  const list = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([...list, ...OFFICIAL_WEB_ORIGINS, ...CAPACITOR_ORIGINS])];
}

function validateProductionEnv() {
  if ((process.env.NODE_ENV || 'development') !== 'production') return;

  const jwtSecret = (process.env.JWT_SECRET || '').trim();
  if (!jwtSecret || jwtSecret === 'change_me_super_secret' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be explicitly set to a strong value (32+ chars) in production');
  }

  const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
  if (!corsOrigin || corsOrigin === '*') {
    throw new Error('CORS_ORIGIN must explicitly list trusted origins in production');
  }

  const redisUrl = (process.env.REDIS_URL || '').trim();
  if (!redisUrl) {
    throw new Error('REDIS_URL must be explicitly set in production for distributed rate limiting');
  }
  let parsed;
  try {
    parsed = new URL(redisUrl);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// URL');
  }
  if (parsed.protocol !== 'redis:') throw new Error('REDIS_URL must use redis://');
  if (parsed.username || parsed.password) {
    throw new Error('REDIS_URL credentials are unsupported; bind Redis to localhost/private network instead');
  }
}

validateProductionEnv();

const env = {
  port: parseInt(process.env.PORT, 10) || 4000,
  apiBindHost: process.env.API_BIND_HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yalla',
  redisUrl: (process.env.REDIS_URL || '').trim(),
  jwtSecret: process.env.JWT_SECRET || 'change_me_super_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtIssuer: process.env.JWT_ISSUER || 'yalla-api',
  jwtAudience: process.env.JWT_AUDIENCE || 'yalla-clients',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  enableApiDocs: process.env.ENABLE_API_DOCS === 'true',
  autoAssign: process.env.AUTO_ASSIGN === 'true',
  commissionRate: parseFloat(process.env.COMMISSION_RATE) || 0.2,
  acceptTimeoutSeconds: parseInt(process.env.ACCEPT_TIMEOUT_SECONDS, 10) || 180,
  fcm: {
    credentialsPath: process.env.FCM_CREDENTIALS_PATH || '',
    credentialsJson: process.env.FCM_CREDENTIALS_JSON || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@yalladelivery.org',
    fromName: process.env.SMTP_FROM_NAME || 'Yalla Delivery',
  },
  jawwalPay: {
    baseUrl: process.env.JAWWAL_PAY_BASE_URL || 'https://api.leadersms.ps',
    authMode: (process.env.JAWWAL_PAY_AUTH_MODE || 'basic').toLowerCase(),
    username: process.env.JAWWAL_PAY_USERNAME || '',
    password: process.env.JAWWAL_PAY_PASSWORD || '',
    privateKey: process.env.JAWWAL_PAY_PRIVATE_KEY || '',
  },
};

module.exports = env;
module.exports.parseCorsOrigin = parseCorsOrigin;
module.exports.CAPACITOR_ORIGINS = CAPACITOR_ORIGINS;
module.exports.OFFICIAL_WEB_ORIGINS = OFFICIAL_WEB_ORIGINS;
