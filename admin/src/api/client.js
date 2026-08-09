// عميل API موحّد للوحة الأدمن — يرفق التوكن ويوحّد معالجة الأخطاء.

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
};

export { API };
