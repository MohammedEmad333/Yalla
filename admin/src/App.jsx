// جذر تطبيق لوحة الأدمن — يربط المصادقة بالبوابة (Login Gate)
// مع تنقّل بسيط بين اللوحة اللحظية وإدارة المستخدمين.

import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { theme } from './theme';
import PullToRefresh from './components/PullToRefresh';
import LoginPage from './pages/LoginPage';
import LiveDashboard from './pages/LiveDashboard';
import UsersManagement from './pages/UsersManagement';
import CaptainApplications from './pages/CaptainApplications';
import StatsPage from './pages/StatsPage';
import OrdersPage from './pages/OrdersPage';
import WalletTopups from './pages/WalletTopups';
import Withdrawals from './pages/Withdrawals';
import Chats from './pages/Chats';
import Support from './pages/Support';
import Broadcast from './pages/Broadcast';

const TABS = [
  { key: 'dashboard', label: 'اللوحة اللحظية' },
  { key: 'orders', label: 'بحث الطلبات' },
  { key: 'chats', label: 'المحادثات' },
  { key: 'support', label: 'الدعم' },
  { key: 'broadcast', label: 'الرسائل' },
  { key: 'wallet', label: 'شحن الرصيد' },
  { key: 'withdrawals', label: 'سحب الكباتن' },
  { key: 'users', label: 'إدارة المستخدمين' },
  { key: 'captainDocs', label: 'توثيق الكباتن' },
  { key: 'stats', label: 'الإحصائيات' },
];

function Gate() {
  const { admin, loading, logout } = useAuth();
  const [page, setPage] = useState('dashboard'); // dashboard | orders | users | stats
  // Card 105: مفتاح إعادة التركيب — السحب للتحديث يعيد تركيب الصفحة الحاليّة
  // فتُعيد كلّ صفحة تحميل بياناتها (عبر useEffect) دون منطق خاصّ بكلّ صفحة.
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    // مهلة قصيرة لإظهار المؤشّر ريثما تُعيد الصفحة المُركّبة جلب بياناتها
    await new Promise((r) => setTimeout(r, 650));
  }, []);

  // أثناء استعادة الجلسة نعرض مؤشّر تحميل
  if (loading) return <div style={styles.loading}>...جارٍ التحميل</div>;

  // غير مسجّل → صفحة الدخول
  if (!admin) return <LoginPage />;

  // مسجّل → شريط تنقّل + الصفحة المختارة
  return (
    <div style={{ direction: 'rtl', minHeight: '100vh', background: theme.color.surface }}>
      <nav className="yl-nav" style={styles.nav}>
        <div style={styles.brandBlock}>
          <img src="/logo.png" alt="Yalla" style={styles.logoMark} />
          <span style={styles.logo}>Yalla</span>
          <div className="yl-tabs" style={styles.tabs}>
            {TABS.map((t) => (
              <button key={t.key} style={styles.link(page === t.key)} onClick={() => setPage(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.userBlock}>
          <span style={styles.hello}>
            مرحبًا، <b style={{ color: theme.color.onSurface }}>{admin.name}</b>
          </span>
          <button onClick={logout} style={styles.logout}>
            خروج
          </button>
        </div>
      </nav>

      <PullToRefresh onRefresh={handleRefresh}>
        <div key={`${page}-${refreshKey}`}>
          {page === 'dashboard' && <LiveDashboard />}
          {page === 'orders' && <OrdersPage />}
          {page === 'chats' && <Chats />}
          {page === 'support' && <Support />}
          {page === 'broadcast' && <Broadcast />}
          {page === 'wallet' && <WalletTopups />}
          {page === 'withdrawals' && <Withdrawals />}
          {page === 'users' && <UsersManagement />}
          {page === 'captainDocs' && <CaptainApplications />}
          {page === 'stats' && <StatsPage />}
        </div>
      </PullToRefresh>
    </div>
  );
}

const styles = {
  loading: {
    display: 'grid',
    placeItems: 'center',
    height: '100vh',
    direction: 'rtl',
    color: theme.color.muted,
    fontFamily: theme.font,
  },
  nav: {
    direction: 'rtl',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 32px',
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: `1px solid ${theme.color.outline}`,
    position: 'sticky',
    top: 0,
    zIndex: 10,
    flexWrap: 'wrap',
    gap: 12,
  },
  brandBlock: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  logoMark: { width: 32, height: 32, borderRadius: 8, objectFit: 'cover', display: 'block' },
  logo: {
    fontSize: 22,
    fontWeight: 700,
    color: theme.color.primaryDeep,
    letterSpacing: '-0.02em',
    marginInlineStart: -8,
  },
  tabs: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  link: (active) => ({
    padding: '9px 18px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    border: 'none',
    fontSize: 14,
    background: active ? theme.color.primary : 'transparent',
    color: active ? theme.color.onPrimary : theme.color.muted,
    boxShadow: active ? theme.shadow.float : 'none',
  }),
  userBlock: { display: 'flex', alignItems: 'center', gap: 12 },
  hello: { color: theme.color.muted, fontSize: 14 },
  logout: {
    cursor: 'pointer',
    border: `1px solid ${theme.color.outlineStrong}`,
    background: theme.color.card,
    color: theme.color.onSurfaceVariant,
    padding: '8px 16px',
    borderRadius: theme.radius.pill,
    fontSize: 14,
  },
};

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
