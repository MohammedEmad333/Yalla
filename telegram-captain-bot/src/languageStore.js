'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalizeLanguage } = require('./i18n');

// Only the private Telegram user ID is stored, never order or customer data.
// The file must be on persistent storage if preferences should survive deploys.
const DEFAULT_FILE = path.join(process.cwd(), 'data', 'telegram-languages.json');
const ID = /^[0-9]{1,20}$/;
const MAX_USERS = 10000;
function createLanguageStore({ file = process.env.TELEGRAM_PREFERENCES_PATH || DEFAULT_FILE, io = fs } = {}) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) {
    throw new Error('Telegram preference path must be absolute');
  }
  let saved = {};
  try {
    const raw = io.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid Telegram language preferences');
    }
    saved = Object.fromEntries(Object.entries(parsed).filter(([key, language]) =>
      ID.test(key) && ['ar', 'en'].includes(language)).slice(-MAX_USERS));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  let queue = Promise.resolve();
  function get(id) {
    return ID.test(String(id)) ? normalizeLanguage(saved[String(id)]) : 'ar';
  }
  function set(id, language) {
    if (!ID.test(String(id)) || !['ar', 'en'].includes(language)) {
      return Promise.reject(new Error('Invalid Telegram language preference'));
    }
    const key = String(id);
    const operation = queue.then(async () => {
      const next = { ...saved };
      // Remove and reinsert to evict the oldest preference on overflow.
      delete next[key];
      next[key] = language;
      const entries = Object.entries(next).slice(-MAX_USERS);
      const snapshot = Object.fromEntries(entries);
      const dir = path.dirname(file);
      const temporary = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid);
      await io.promises.mkdir(dir, { recursive: true, mode: 0o700 });
      try {
        await io.promises.writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600, flag: 'w' });
        await io.promises.rename(temporary, file);
      } catch (error) {
        await io.promises.unlink(temporary).catch(() => {});
        throw error;
      }
      saved = snapshot;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { get, set };
}

module.exports = { createLanguageStore };
