'use strict';

const jwt = require('jsonwebtoken');
const env = require('./env');

// يفرض سياسة واحدة على كل JWT يصدره الـ API. نثبّت السياسة قبل تحميل routes/controllers
// في app.js حتى لا يستطيع call site قديم إصدار توكن بلا algorithm/issuer/audience.
function installJwtPolicy() {
  if (jwt.__yallaJwtPolicyInstalled) return;
  const originalSign = jwt.sign.bind(jwt);

  jwt.sign = function hardenedSign(payload, secretOrPrivateKey, options, callback) {
    let opts = options;
    let cb = callback;
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = opts || {};

    if (secretOrPrivateKey === env.jwtSecret) {
      opts = {
        ...opts,
        algorithm: 'HS256',
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
      };
    }

    return typeof cb === 'function'
      ? originalSign(payload, secretOrPrivateKey, opts, cb)
      : originalSign(payload, secretOrPrivateKey, opts);
  };

  Object.defineProperty(jwt, '__yallaJwtPolicyInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

module.exports = { installJwtPolicy };
