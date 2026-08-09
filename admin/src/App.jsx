// جذر تطبيق لوحة الأدمن — يربط المصادقة بالبوابة (Login Gate)
// مع تنقّل بسيط بين اللوحة اللحظية وإدارة المستخدمين.

import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import LiveDashboard from './pages/LiveDashboard';
import UsersManagement from './pages/UsersManagement';
import StatsPage from './pages/StatsPage';
import OrdersPage from './pages/OrdersPage';

function Gate() {
  const { admin, loading, logout } = useAuth();
  const [page, setPage] = useState('dashboard'); // dashboard | users

  // أثناء استعادة الجلسة نعرض مؤشّر تحميل
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>...جارٍ التحميل</div>;

  // غير مسجّل → صفحة الدخول
  if (!admin) return <LoginPage />;

  // مسجّل → شريط تنقّل + الصفحة المختارة
  return (
    <div>
      <nav style={styles.nav}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.link(page === 'dashboard')} onClick={() => setPage('dashboard')}>
            اللوحة اللحظية
          </button>
          <button style={styles.link(page === 'users')} onClick={() => setPage('users')}>
            إدارة المستخدمين
          </button>
          <button style={styles.link(page === 'orders')} onClick={() => setPage('orders')}>
            بحث الطلبات
          </button>
          <button style={styles.link(page === 'stats')} onClick={() => setPage('stats')}>
            الإحصائيات
          </button>
        </div>
        <div>
          <span style={{ marginInlineEnd: 12 }}>مرحبًا، {admin.name}</span>
          <button onClick={logout} style={{ cursor: 'pointer' }}>خروج</button>
        </div>
      </nav>

      {page === 'dashboard' && <LiveDashboard />}
      {page === 'orders' && <OrdersPage />}
      {page === 'users' && <UsersManagement />}
      {page === 'stats' && <StatsPage />}
    </div>
  );
}

const styles = {
  nav: {
    direction: 'rtl',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 24px',
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
  },
  link: (active) => ({
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    border: 'none',
    background: active ? '#0f172a' : 'transparent',
    color: active ? '#fff' : '#334155',
  }),
};

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
