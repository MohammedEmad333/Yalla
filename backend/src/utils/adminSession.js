'use strict';

const jwt = require('jsonwebtoken');

const ADMIN_SESSION_COOKIE = '__Host-yalla_admin_session';
const ADMIN_SESSION_SENTINEL = '__yalla_admin_cookie__';

function readCookie(cookieHeader, name) {
  if (!cookieHeader || !name) return null;
  const parts = String(cookieHeader).split(';');
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function getAdminSessionTokenFromCookieHeader(cookieHeader) {
  return readCookie(cookieHeader, ADMIN_SESSION_COOKIE);
}

function tokenMaxAgeSeconds(token) {
  try {
    const payload = jwt.decode(token);
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) return 7 * 24 * 60 * 60;
    return Math.max(1, exp - Math.floor(Date.now() / 1000));
  } catch {
    return 7 * 24 * 60 * 60;
  }
}

function serializeAdminSessionCookie(token) {
  const maxAge = tokenMaxAgeSeconds(token);
  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    'Priority=High',
  ].join('; ');
}

function serializeAdminSessionClearCookie() {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Priority=High',
  ].join('; ');
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_SENTINEL,
  readCookie,
  getAdminSessionTokenFromCookieHeader,
  serializeAdminSessionCookie,
  serializeAdminSessionClearCookie,
  tokenMaxAgeSeconds,
};
