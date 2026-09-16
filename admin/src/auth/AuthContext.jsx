// سياق المصادقة (Auth Context) — يوفّر حالة الأدمن الحالية ودوال الدخول/الخروج
// مع صلاحيات الدور القادمة من الخادم.

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
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
    const token = localStorage.getItem('token');
    if (!token) return setLoading(false);

    api.get('/auth/me')
      .then(async (data) => {
        if (data.role === 'admin') {
          setAdmin(data.user);
          await loadAccess();
          enablePush();
        } else localStorage.removeItem('token');
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(phone, password) {
    const data = await api.post('/auth/login', { phone, password });
    if (data.user.role !== 'admin') throw new Error('هذا الحساب ليس أدمن');
    localStorage.setItem('token', data.token);
    setAdmin(data.user);
    await loadAccess();
    enablePush();
  }

  function logout() {
    disablePush();
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
