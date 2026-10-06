'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_SENTINEL,
  readCookie,
  getAdminSessionTokenFromCookieHeader,
  serializeAdminSessionCookie,
  serializeAdminSessionClearCookie,
  tokenMaxAgeSeconds,
} = require('../src/utils/adminSession');
const { tokenFromRequest, adminCookieOriginAllowed } = require('../src/middlewares/auth.middleware');

test('admin session cookie is host-only, HttpOnly, Secure and Strict', () => {
  const token = jwt.sign({ id: 'admin-1', role: 'admin' }, 'test-secret', { expiresIn: '1h' });
  const cookie = serializeAdminSessionCookie(token);

  assert.match(cookie, new RegExp(`^${ADMIN_SESSION_COOKIE}=`));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, /; Max-Age=\d+/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test('admin session cookie can be parsed from a normal Cookie header', () => {
  const token = 'header.payload.signature';
  const header = `theme=dark; ${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; lang=ar`;
  assert.equal(readCookie(header, ADMIN_SESSION_COOKIE), token);
  assert.equal(getAdminSessionTokenFromCookieHeader(header), token);
});

test('clearing admin session expires the same secure cookie', () => {
  const cookie = serializeAdminSessionClearCookie();
  assert.match(cookie, new RegExp(`^${ADMIN_SESSION_COOKIE}=`));
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});

test('token max age follows JWT exp and never becomes non-positive', () => {
  const token = jwt.sign({ id: 'admin-1' }, 'test-secret', { expiresIn: '10m' });
  const maxAge = tokenMaxAgeSeconds(token);
  assert.ok(maxAge > 0 && maxAge <= 600);
});

test('request auth prefers real Bearer token and treats Sentinel as cookie mode', () => {
  const bearerReq = {
    headers: {
      authorization: 'Bearer real-jwt',
      cookie: `${ADMIN_SESSION_COOKIE}=cookie-jwt`,
    },
  };
  assert.deepEqual(tokenFromRequest(bearerReq), { token: 'real-jwt', source: 'bearer' });

  const cookieReq = {
    headers: {
      authorization: `Bearer ${ADMIN_SESSION_SENTINEL}`,
      cookie: `${ADMIN_SESSION_COOKIE}=cookie-jwt`,
    },
  };
  assert.deepEqual(tokenFromRequest(cookieReq), { token: 'cookie-jwt', source: 'admin-cookie' });
});

test('admin cookie authentication is bound to the official admin origin', () => {
  assert.equal(adminCookieOriginAllowed({ headers: { origin: 'https://admin.yalladelivery.org' } }), true);
  assert.equal(adminCookieOriginAllowed({ headers: { origin: 'https://app.yalladelivery.org' } }), false);
  assert.equal(adminCookieOriginAllowed({ headers: {} }), false);
});
