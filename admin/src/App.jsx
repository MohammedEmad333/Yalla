// جذر تطبيق لوحة الأدمن — يربط المصادقة بالبوابة (Login Gate).
// إن لم يكن هناك أدمن مسجّل الدخول نعرض صفحة الدخول، وإلا نعرض اللوحة.

import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import LiveDashboard from './pages/LiveDashboard';

function Gate() {
  const { admin, loading, logout } = useAuth();

  // أثناء استعادة الجلسة نعرض مؤشّر تحميل
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>...جارٍ التحميل</div>;

  // غير مسجّل → صفحة الدخول
  if (!admin) return <LoginPage />;

  // مسجّل → اللوحة مع زر خروج
  return (
    <div>
      <div style={{ direction: 'rtl', padding: '8px 24px', background: '#fff', textAlign: 'left' }}>
        <span style={{ marginInlineEnd: 12 }}>مرحبًا، {admin.name}</span>
        <button onClick={logout} style={{ cursor: 'pointer' }}>خروج</button>
      </div>
      <LiveDashboard />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
