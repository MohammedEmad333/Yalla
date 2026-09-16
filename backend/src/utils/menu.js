'use strict';

const MAX_QTY = 50;
const MAX_LINES = 40;
const DEFAULT_CATEGORY = 'أصناف أخرى';

function normalizeSelectedOptions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({ group: String(x.group || '').trim(), option: String(x.option || x.name || '').trim() }))
    .filter((x) => x.group && x.option)
    .slice(0, 20);
}

function normalizeCartItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const merged = new Map();

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = (entry.menuItemId ?? entry.menuItem ?? entry.id ?? '').toString().trim();
    if (!id) continue;
    const qty = Math.floor(Number(entry.qty ?? entry.quantity ?? 1));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const note = (entry.note || '').toString().trim();
    const variant = (entry.variant || '').toString().trim();
    const options = normalizeSelectedOptions(entry.options);
    const optionKey = options.map((x) => `${x.group}:${x.option}`).sort().join('|');
    const key = `${id}::${variant}::${optionKey}`;
    const prev = merged.get(key);
    if (prev) {
      prev.qty = Math.min(MAX_QTY, prev.qty + qty);
      if (note && !prev.note) prev.note = note;
    } else {
      merged.set(key, {
        menuItemId: id,
        qty: Math.min(MAX_QTY, qty),
        note,
        ...(variant ? { variant } : {}),
        ...(options.length ? { options } : {}),
      });
    }
  }
  return [...merged.values()].slice(0, MAX_LINES);
}

function priceOptions(doc, selections = []) {
  const groups = Array.isArray(doc.optionGroups) ? doc.optionGroups : [];
  const selectedByGroup = new Map();
  for (const s of selections) {
    if (!selectedByGroup.has(s.group)) selectedByGroup.set(s.group, []);
    selectedByGroup.get(s.group).push(s.option);
  }

  let extra = 0;
  const labels = [];
  for (const group of groups) {
    const chosen = selectedByGroup.get(String(group.name)) || [];
    const min = group.required ? Math.max(1, Number(group.minSelect) || 0) : Math.max(0, Number(group.minSelect) || 0);
    const max = group.multiple ? Math.max(min || 1, Number(group.maxSelect) || 99) : 1;
    if (chosen.length < min || chosen.length > max) return { valid: false, extra: 0, labels: [] };
    for (const optionName of chosen) {
      const option = (group.options || []).find((o) => o.available !== false && String(o.name).trim() === String(optionName).trim());
      if (!option) return { valid: false, extra: 0, labels: [] };
      extra += Math.max(0, Number(option.price) || 0);
      labels.push(`${group.name}: ${option.name}${option.price ? ` +${option.price}₪` : ''}`);
    }
  }
  // لا نسمح بإرسال مجموعة غير موجودة في قاعدة البيانات.
  for (const name of selectedByGroup.keys()) {
    if (!groups.some((g) => String(g.name) === name)) return { valid: false, extra: 0, labels: [] };
  }
  return { valid: true, extra, labels };
}

function buildOrderLines(menuDocs, cartItems) {
  const byId = new Map((Array.isArray(menuDocs) ? menuDocs : []).map((d) => [String(d._id ?? d.id), d]));
  const lines = [];
  const missing = [];

  for (const item of Array.isArray(cartItems) ? cartItems : []) {
    const doc = byId.get(String(item.menuItemId));
    if (!doc || doc.available === false) { missing.push(item.menuItemId); continue; }

    const variants = Array.isArray(doc.variants) ? doc.variants : [];
    let price = Math.max(0, Number(doc.price) || 0);
    let variant = '';
    if (variants.length) {
      const selected = variants.find((v) => String(v.label).trim() === String(item.variant || '').trim());
      if (!selected) { missing.push(item.menuItemId); continue; }
      variant = String(selected.label).trim();
      price = Math.max(0, Number(selected.price) || 0);
    }

    const pricedOptions = priceOptions(doc, item.options || []);
    if (!pricedOptions.valid) { missing.push(item.menuItemId); continue; }
    price = Math.round((price + pricedOptions.extra) * 100) / 100;
    const optionNote = pricedOptions.labels.length ? `الإضافات: ${pricedOptions.labels.join('، ')}` : '';
    const note = [item.note || '', optionNote].filter(Boolean).join(' — ');

    lines.push({ menuItem: doc._id ?? doc.id, name: String(doc.name || ''), variant, price, qty: item.qty, note });
  }
  return { lines, itemsTotal: cartTotal(lines), missing };
}

function cartTotal(lines) {
  const sum = (Array.isArray(lines) ? lines : []).reduce((acc, l) => acc + (Number(l?.price) || 0) * (Number(l?.qty) || 0), 0);
  return Math.round(sum * 100) / 100;
}

function summarizeCart(restaurantName, lines, note = '') {
  const items = (Array.isArray(lines) ? lines : []).map((l) => `${l.qty}× ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join('، ');
  const head = String(restaurantName || '').trim();
  const body = [head ? `${head}: ${items}` : items].filter(Boolean).join('');
  const extra = String(note || '').trim();
  return extra ? `${body} — ${extra}` : body;
}

function groupMenuByCategory(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(item?.category || '').trim() || DEFAULT_CATEGORY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([category, list]) => ({ category, items: list }));
}

function meetsMinOrder(itemsTotal, minOrder) {
  return (Number(itemsTotal) || 0) >= Math.max(0, Number(minOrder) || 0);
}

module.exports = {
  MAX_QTY, MAX_LINES, DEFAULT_CATEGORY,
  normalizeSelectedOptions, normalizeCartItems, priceOptions, buildOrderLines,
  cartTotal, summarizeCart, groupMenuByCategory, meetsMinOrder,
};
