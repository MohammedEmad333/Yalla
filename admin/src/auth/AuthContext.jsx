// سياق المصادقة (Auth Context) — يوفّر حالة الأدمن الحالية ودوال الدخول/الخروج
// مع صلاحيات الدور القادمة من الخادم.

import { createContext, useContext, useEffect, useState } from 'react';
import { api, ADMIN_SESSION_SENTINEL } from '../api/client';
import { enablePush, disablePush } from '../push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [access, setAccess] = useState({ adminRole: 'super_admin', permissions: ['*'], regions: [] });
  const [loading, setLoading] = useState(true);

  async function loadAccess() {
    const data = await api.get('/admin/access/me');
    setAccess(data);
    return data;
  }

  useEffect(() => {
    // لا نعتمد على وجود JWT في localStorage: نسخة الويب الرسمية تستعيد الجلسة
    // مباشرةً من HttpOnly cookie. إن كانت الجلسة صالحة نضع Sentinel غير سرّي
    // فقط لتوافق الأجزاء القديمة التي تتحقق من وجود قيمة token.
    api.get('/auth/me')
      .then(async (data) => {
        if (data.role === 'admin') {
          const current = localStorage.getItem('token');
          if (!current) localStorage.setItem('token', ADMIN_SESSION_SENTINEL);
          setAdmin(data.user);
          await loadAccess();
          enablePush();
        } else {
          localStorage.removeItem('token');
        }
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(phone, password) {
    const data = await api.post('/auth/admin-session/login', { phone, password });
    if (data.user.role !== 'admin') throw new Error('هذا الحساب ليس أدمن');

    // Android/Capacitor والتطوير قد يعيدان Bearer token للتوافق. الويب الرسمي
    // لا يرى JWT إطلاقًا ويخزن Sentinel غير سري فقط.
    localStorage.setItem('token', data.token || ADMIN_SESSION_SENTINEL);
    setAdmin(data.user);
    await loadAccess();
    enablePush();
  }

  async function logout() {
    // في تطبيق Android نلغي device token بينما Bearer JWT ما زال متاحًا.
    await disablePush();
    try {
      await api.post('/auth/admin-session/logout');
    } catch (_) {
      // حذف الحالة المحلية يجب أن يتم حتى لو كان الخادم غير متاح.
    }
    localStorage.removeItem('token');
    setAdmin(null);
    setAccess({ adminRole: 'super_admin', permissions: ['*'], regions: [] });
  }

  function updateAdmin(patch) {
    setAdmin((current) => ({ ...current, ...patch }));
  }

  return (
    <AuthContext.Provider value={{ admin, access, loading, login, logout, updateAdmin, refreshAccess: loadAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
