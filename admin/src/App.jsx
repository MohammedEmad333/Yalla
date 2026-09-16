import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import PullToRefresh from './components/PullToRefresh';
import { Avatar, IconButton } from './components/ui';
import { getThemeMode, setThemeMode, THEME_MODES } from './theme-mode';
import {
  IconChart, IconChat, IconCashOut, IconDashboard, IconIdCard, IconLogout,
  IconMegaphone, IconMenu, IconOrders, IconRefresh, IconStore, IconSupport,
  IconUsers, IconWallet, IconSun, IconMoon, IconAuto,
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
import AdminWallet from './pages/AdminWallet';
import AdminAccount from './pages/AdminAccount';
import OperationsFinance from './pages/OperationsFinance';
import QualitySystem from './pages/QualitySystem';
import MarketingCenter from './pages/MarketingCenter';

const NAV = [
  {
    group: 'العمليات',
    items: [
      { key: 'dashboard', label: 'اللوحة اللحظية', icon: IconDashboard, Page: LiveDashboard },
      { key: 'opsFinance', label: 'مركز العمليات والمال', icon: IconChart, Page: OperationsFinance },
      { key: 'quality', label: 'الجودة وصحة النظام', icon: IconSupport, Page: QualitySystem },
      { key: 'orders', label: 'بحث الطلبات', icon: IconOrders, Page: OrdersPage },
      { key: 'restaurants', label: 'المتاجر والمطاعم', icon: IconStore, Page: Restaurants },
    ],
  },
  {
    group: 'التواصل والتسويق',
    items: [
      { key: 'chats', label: 'المحادثات', icon: IconChat, Page: Chats },
      { key: 'support', label: 'الدعم', icon: IconSupport, Page: Support },
      { key: 'broadcast', label: 'الرسائل الجماعية', icon: IconMegaphone, Page: Broadcast },
      { key: 'marketing', label: 'التسويق والعروض', icon: IconMegaphone, Page: MarketingCenter },
    ],
  },
  {
    group: 'المال',
    items: [
      { key: 'adminWallet', label: 'محفظة الإدارة', icon: IconWallet, Page: AdminWallet },
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
      { key: 'account', label: 'حساب الأدمن', icon: IconUsers, Page: AdminAccount },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);
const DEFAULT_PAGE = 'dashboard';

function pageFromUrl() {
  const key = new URLSearchParams(window.location.search).get('page');
  return ALL_ITEMS.some((i) => i.key === key) ? key : DEFAULT_PAGE;
}

const THEME_META = {
  system: { icon: IconAuto, label: 'حسب النظام' },
  light: { icon: IconSun, label: 'الوضع الفاتح' },
  dark: { icon: IconMoon, label: 'الوضع الليلي' },
};

function ThemeToggle() {
  const [mode, setMode] = useState(getThemeMode);
  const { icon: Icon, label } = THEME_META[mode];
  function cycle() {
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    setMode(setThemeMode(next));
  }
  return <IconButton label={`المظهر: ${label} — اضغط للتبديل`} onClick={cycle}><Icon size={20} /></IconButton>;
}

function Console() {
  const { admin, logout } = useAuth();
  const [page, setPage] = useState(pageFromUrl);
  const [drawer, setDrawer] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const current = ALL_ITEMS.find((i) => i.key === page) || ALL_ITEMS[0];

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

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const refresh = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    await new Promise((r) => setTimeout(r, 650));
  }, []);

  function go(key) {
    setPage(key); setDrawer(false); window.scrollTo({ top: 0 });
  }

  const { Page } = current;

  return (
    <div className="yl-app">
      <aside className="yl-side" data-open={drawer}>
        <div className="yl-side__brand">
          <img className="yl-side__logo" src="/logo.png" alt="" />
          <div style={{ flex: 1 }}><span className="yl-side__name">Yalla</span><span className="yl-side__tag">لوحة التحكّم</span></div>
          <span className="yl-hide-lg"><IconButton label="إغلاق القائمة" onClick={() => setDrawer(false)} small><IconMenu size={18} /></IconButton></span>
        </div>
        <nav className="yl-side__nav">
          {NAV.map((g) => <div className="yl-navgroup" key={g.group}>
            <div className="yl-navgroup__title">{g.group}</div>
            {g.items.map(({ key, label, icon: Icon }) => <button key={key} className="yl-navlink" aria-current={key === page ? 'page' : undefined} onClick={() => go(key)}>
              <span className="yl-navlink__icon"><Icon size={20} /></span><span className="yl-navlink__label">{label}</span>
            </button>)}
          </div>)}
        </nav>
        <div className="yl-side__foot">
          <Avatar name={admin?.name} size="sm" />
          <div className="yl-side__user"><b className="yl-truncate">{admin?.name || 'المدير'}</b><span>{admin?.phone}</span></div>
          <ThemeToggle />
          <IconButton label="تسجيل الخروج" onClick={logout}><IconLogout size={20} /></IconButton>
        </div>
      </aside>
      {drawer && <button className="yl-scrim" aria-label="إغلاق القائمة" onClick={() => setDrawer(false)} />}
      <div className="yl-main">
        <header className="yl-topbar">
          <span className="yl-burger"><IconButton label="القائمة" onClick={() => setDrawer(true)}><IconMenu /></IconButton></span>
          <span className="yl-topbar__title">{current.label}</span>
          <IconButton label="تحديث" onClick={refresh}><IconRefresh /></IconButton>
        </header>
        <PullToRefresh onRefresh={refresh}><main className="yl-content" key={`${page}-${refreshKey}`}><Page /></main></PullToRefresh>
      </div>
    </div>
  );
}

function Gate() {
  const { admin, loading } = useAuth();
  if (loading) return <div className="yl-empty" style={{ minHeight: '100dvh' }}><span className="yl-spinner" style={{ color: 'var(--brand)' }} /><span>...جارٍ التحميل</span></div>;
  return admin ? <Console /> : <LoginPage />;
}

export default function App() {
  return <AuthProvider><Gate /></AuthProvider>;
}
