// سياق المصادقة (Auth Context) — يوفّر حالة الأدمن الحالية ودوال الدخول/الخروج
// لكل شجرة المكوّنات، مع استعادة الجلسة تلقائيًا عند تحميل الصفحة.

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true); // أثناء استعادة الجلسة

  // عند الإقلاع: إن وُجد توكن، نتحقّق منه عبر /auth/me
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return setLoading(false);

    api
      .get('/auth/me')
      .then((data) => {
        // نقبل فقط دور admin في هذه اللوحة
        if (data.role === 'admin') setAdmin(data.user);
        else localStorage.removeItem('token');
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // تسجيل دخول الأدمن (يستخدم نفس /auth/login الخاص بالمستخدم)
  async function login(phone, password) {
    const data = await api.post('/auth/login', { phone, password });
    if (data.user.role !== 'admin') {
      throw new Error('هذا الحساب ليس أدمن');
    }
    localStorage.setItem('token', data.token);
    setAdmin(data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// hook مختصر للوصول للسياق
export const useAuth = () => useContext(AuthContext);
