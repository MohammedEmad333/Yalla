// عميل API موحّد للوحة الأدمن — يرفق التوكن ويوحّد معالجة الأخطاء.

// في التطوير المحلي نستخدم localhost، أمّا أي build إنتاجي (بما فيه تطبيق
// Android/Capacitor) فيستخدم API الرسمي افتراضيًا حتى لو نُسي VITE_API_URL.
// يمكن دائمًا تجاوز القيمة عبر VITE_API_URL أثناء البناء.
const DEFAULT_API = import.meta.env.DEV
  ? 'http://localhost:4000'
  : 'https://api.yalladelivery.org';

const API = (import.meta.env.VITE_API_URL || DEFAULT_API).replace(/\/$/, '');

// قراءة التوكن المحفوظ
const getToken = () => localStorage.getItem('token');

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = res.status !== 204 ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new Error(data?.message || `خطأ ${res.status}`);
  }
  return data;
}

async function upload(path, file, field = 'image') {
  const body = new FormData();
  body.append(field, file);
  const res = await fetch(`${API}/api${path}`, {
    method: 'POST',
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `خطأ ${res.status}`);
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p, body) => request(p, { method: 'DELETE', body }),
  upload,
};

export { API };
