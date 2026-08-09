'use strict';

// صفحة توثيق بسيطة ومكتفية ذاتيًا (بلا مكتبات خارجية): تجلب مواصفة OpenAPI
// من /api/openapi.json وتعرض العمليات مجمّعة حسب الوسم.
function docsHtml() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yalla API — التوثيق</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    header { background: #0f172a; color: #fff; padding: 20px 24px; }
    header small { color: #94a3b8; }
    main { padding: 24px; max-width: 900px; margin: 0 auto; }
    .tag { margin-bottom: 28px; }
    .tag h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    .op { background: #fff; border-radius: 10px; padding: 12px 16px; margin: 8px 0; box-shadow: 0 1px 3px rgba(0,0,0,.06); display: flex; gap: 12px; align-items: center; }
    .method { font-weight: 700; padding: 3px 10px; border-radius: 6px; color: #fff; font-size: 12px; min-width: 56px; text-align: center; }
    .get { background: #16a34a; } .post { background: #2563eb; } .patch { background: #d97706; } .delete { background: #dc2626; }
    .path { font-family: monospace; direction: ltr; }
    .summary { color: #475569; margin-inline-start: auto; font-size: 14px; }
    .lock { font-size: 12px; }
  </style>
</head>
<body>
  <header><h1>🛵 Yalla API</h1><small>التوثيق التفاعلي — مبني من /api/openapi.json</small></header>
  <main id="root">...جارٍ التحميل</main>
  <script>
    const COLORS = { get: 'get', post: 'post', patch: 'patch', delete: 'delete' };
    fetch('/api/openapi.json').then(r => r.json()).then(spec => {
      const groups = {};
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(methods)) {
          const tag = (op.tags && op.tags[0]) || 'عام';
          (groups[tag] ||= []).push({ path, method, op });
        }
      }
      const root = document.getElementById('root');
      root.innerHTML = '';
      for (const [tag, ops] of Object.entries(groups)) {
        const sec = document.createElement('div');
        sec.className = 'tag';
        sec.innerHTML = '<h2>' + tag + '</h2>';
        for (const { path, method, op } of ops) {
          const div = document.createElement('div');
          div.className = 'op';
          const lock = op.security ? ' <span class="lock">🔒</span>' : '';
          div.innerHTML =
            '<span class="method ' + COLORS[method] + '">' + method.toUpperCase() + '</span>' +
            '<span class="path">' + path + '</span>' +
            '<span class="summary">' + (op.summary || '') + lock + '</span>';
          sec.appendChild(div);
        }
        root.appendChild(sec);
      }
    }).catch(() => { document.getElementById('root').textContent = 'تعذّر تحميل المواصفة'; });
  </script>
</body>
</html>`;
}

module.exports = { docsHtml };
