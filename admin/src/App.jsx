// جذر لوحة الأدمن (Yalla Console) — بوابة مصادقة + هيكل تطبيق متجاوب:
// الجوال: شريط علويّ ثابت + درج تنقّل منزلق. الحاسوب: شريط جانبي دائم.
// الصفحة الحاليّة محفوظة في عنوان المتصفّح (?page=) ليعمل زرّ الرجوع والمشاركة.

import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import PullToRefresh from './components/PullToRefresh';
import { Avatar, IconButton } from './components/ui';
import {
  IconChart,
  IconChat,
  IconCashOut,
  IconDashboard,
  IconIdCard,
  IconLogout,
  IconMegaphone,
  IconMenu,
  IconOrders,
  IconRefresh,
  IconStore,
  IconSupport,
  IconUsers,
  IconWallet,
} from './components/icons';

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
import Restaurants from './pages/Restaurants';

// أقسام التنقّل — مجموعات مسمّاة بدل شريط تبويبات طويل يلتفّ على الجوال
const NAV = [
  {
    group: 'العمليات',
    items: [
      { key: 'dashboard', label: 'اللوحة اللحظية', icon: IconDashboard, Page: LiveDashboard },
      { key: 'orders', label: 'بحث الطلبات', icon: IconOrders, Page: OrdersPage },
      { key: 'restaurants', label: 'المطاعم', icon: IconStore, Page: Restaurants },
    ],
  },
  {
    group: 'التواصل',
    items: [
      { key: 'chats', label: 'المحادثات', icon: IconChat, Page: Chats },
      { key: 'support', label: 'الدعم', icon: IconSupport, Page: Support },
      { key: 'broadcast', label: 'الرسائل الجماعية', icon: IconMegaphone, Page: Broadcast },
    ],
  },
  {
    group: 'المال',
    items: [
      { key: 'wallet', label: 'شحن الرصيد', icon: IconWallet, Page: WalletTopups },
      { key: 'withdrawals', label: 'طلبات السحب', icon: IconCashOut, Page: Withdrawals },
    ],
  },
  {
    group: 'الأشخاص والتقارير',
    items: [
      { key: 'users', label: 'إدارة المستخدمين', icon: IconUsers, Page: UsersManagement },
      { key: 'captainDocs', label: 'توثيق الكباتن', icon: IconIdCard, Page: CaptainApplications },
      { key: 'stats', label: 'الإحصائيات', icon: IconChart, Page: StatsPage },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);
const DEFAULT_PAGE = 'dashboard';

// قراءة الصفحة من عنوان المتصفّح (مع التحقّق من صلاحيّتها)
function pageFromUrl() {
  const key = new URLSearchParams(window.location.search).get('page');
  return ALL_ITEMS.some((i) => i.key === key) ? key : DEFAULT_PAGE;
}

function Console() {
  const { admin, logout } = useAuth();
  const [page, setPage] = useState(pageFromUrl);
  const [drawer, setDrawer] = useState(false);
  // مفتاح إعادة التركيب: السحب-للتحديث (أو زرّ التحديث) يُعيد تركيب الصفحة
  // الحاليّة فتُعيد جلب بياناتها عبر useEffect دون منطق خاصّ بكلّ صفحة.
  const [refreshKey, setRefreshKey] = useState(0);

  const current = ALL_ITEMS.find((i) => i.key === page) || ALL_ITEMS[0];

  // مزامنة العنوان + دعم زرّ الرجوع في المتصفّح
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('page') !== page) {
      url.searchParams.set('page', page);
      window.history.pushState({ page }, '', url);
    }
    document.title = `${current.label} · Yalla`;
  }, [page, current.label]);

  useEffect(() => {
    const onPop = () => setPage(pageFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // إغلاق الدرج بمفتاح Escape
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const refresh = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    // مهلة قصيرة لإبقاء المؤشّر ظاهرًا ريثما تُعيد الصفحة المُركّبة جلب بياناتها
    await new Promise((r) => setTimeout(r, 650));
  }, []);

  function go(key) {
    setPage(key);
    setDrawer(false);
    window.scrollTo({ top: 0 });
  }

  const { Page } = current;

  return (
    <div className="yl-app">
      <aside className="yl-side" data-open={drawer}>
        <div className="yl-side__brand">
          <img className="yl-side__logo" src="/logo.png" alt="" />
          <div style={{ flex: 1 }}>
            <span className="yl-side__name">Yalla</span>
            <span className="yl-side__tag">لوحة التحكّم</span>
          </div>
          <span className="yl-hide-lg">
            <IconButton label="إغلاق القائمة" onClick={() => setDrawer(false)} small>
              <IconMenu size={18} />
            </IconButton>
          </span>
        </div>

        <nav className="yl-side__nav">
          {NAV.map((g) => (
            <div className="yl-navgroup" key={g.group}>
              <div className="yl-navgroup__title">{g.group}</div>
              {g.items.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className="yl-navlink"
                  aria-current={key === page ? 'page' : undefined}
                  onClick={() => go(key)}
                >
                  <span className="yl-navlink__icon">
                    <Icon size={20} />
                  </span>
                  <span className="yl-navlink__label">{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="yl-side__foot">
          <Avatar name={admin?.name} size="sm" />
          <div className="yl-side__user">
            <b className="yl-truncate">{admin?.name || 'المدير'}</b>
            <span>{admin?.phone}</span>
          </div>
          <IconButton label="تسجيل الخروج" onClick={logout}>
            <IconLogout size={20} />
          </IconButton>
        </div>
      </aside>

      {drawer && <button className="yl-scrim" aria-label="إغلاق القائمة" onClick={() => setDrawer(false)} />}

      <div className="yl-main">
        <header className="yl-topbar">
          <span className="yl-burger">
            <IconButton label="القائمة" onClick={() => setDrawer(true)}>
              <IconMenu />
            </IconButton>
          </span>
          <span className="yl-topbar__title">{current.label}</span>
          <IconButton label="تحديث" onClick={refresh}>
            <IconRefresh />
          </IconButton>
        </header>

        <PullToRefresh onRefresh={refresh}>
          <main className="yl-content" key={`${page}-${refreshKey}`}>
            <Page />
          </main>
        </PullToRefresh>
      </div>
    </div>
  );
}

function Gate() {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="yl-empty" style={{ minHeight: '100dvh' }}>
        <span className="yl-spinner" style={{ color: 'var(--brand)' }} />
        <span>...جارٍ التحميل</span>
      </div>
    );
  }
  return admin ? <Console /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
