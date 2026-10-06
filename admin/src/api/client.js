// عميل API موحّد للوحة الأدمن — يرفق التوكن عند الحاجة ويوحّد معالجة الأخطاء.

const API = (
  import.meta.env.DEV
    ? (import.meta.env.VITE_API_URL || 'http://localhost:4000')
    : 'https://api.yalladelivery.org'
).replace(/\/$/, '');

// قيمة توافق غير سرّية: وجودها يعني أن نسخة الويب تعتمد على HttpOnly cookie.
// لا تُرسل كـ Bearer ولا تحتوي أي جزء من JWT.
export const ADMIN_SESSION_SENTINEL = '__yalla_admin_cookie__';

const getStoredToken = () => localStorage.getItem('token');
const getBearerToken = () => {
  const token = getStoredToken();
  return token && token !== ADMIN_SESSION_SENTINEL ? token : null;
};

function authHeaders() {
  const token = getBearerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API}/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.');
  }

  const data = res.status !== 204 ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new Error(data?.message || `خطأ ${res.status}`);
  return data;
}

async function requestBlob(path) {
  let res;
  try {
    res = await fetch(`${API}/api${path}`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    });
  } catch {
    throw new Error('تعذر تحميل الملف من الخادم.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || `خطأ ${res.status}`);
  }
  return res.blob();
}

async function upload(path, file, field = 'image') {
  const body = new FormData();
  body.append(field, file);
  const res = await fetch(`${API}/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
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
  blob: requestBlob,
  upload,
};

export { API };
