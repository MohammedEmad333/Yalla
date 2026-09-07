// صفحة الإحصائيات — بطاقات مؤشّرات الأداء الرئيسية (KPIs).

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Alert, Button, EmptyState, Loading, PageHeader } from '../components/ui';
import {
  IconBike,
  IconBolt,
  IconCheck,
  IconChart,
  IconClock,
  IconClose,
  IconOrders,
  IconRefresh,
  IconUsers,
  IconWallet,
} from '../components/icons';

// تعريف البطاقات: التسمية، مفتاح القيمة، اللاحقة، الأيقونة، ولون الحالة
const CARDS = [
  { key: 'totalOrders', label: 'إجمالي الطلبات', icon: IconOrders, tone: 'info' },
  { key: 'todayOrders', label: 'طلبات اليوم', icon: IconBolt, tone: 'brand' },
  { key: 'active', label: 'طلبات نشطة', icon: IconBike, tone: 'warning' },
  { key: 'delivered', label: 'تم التسليم', icon: IconCheck, tone: 'success' },
  { key: 'cancelled', label: 'ملغاة', icon: IconClose, tone: 'danger' },
  { key: 'revenue', label: 'الإيرادات', icon: IconWallet, tone: 'success', suffix: ' ₪' },
  { key: 'avgDeliveryMinutes', label: 'متوسّط زمن التوصيل', icon: IconClock, tone: 'info', suffix: ' دقيقة' },
  { key: 'onlineCaptains', label: 'كباتن متصلون', icon: IconUsers, tone: 'brand' },
];

// ألوان الأيقونة حسب النغمة (مشتقّة من رموز التصميم)
const TONE = {
  brand: { bg: 'var(--brand-tint)', fg: 'var(--brand-deep)' },
  info: { bg: 'var(--accent-tint)', fg: 'var(--accent-deep)' },
  success: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-tint)', fg: 'var(--warning)' },
  danger: { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
};

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get('/admin/stats').then(setStats).catch((e) => setError(e.message));
  };

  useEffect(load, []);

  return (
    <>
      <PageHeader title="الإحصائيات" subtitle="نظرة عامّة على أداء المنظومة">
        <Button icon={<IconRefresh size={18} />} onClick={load} aria-label="تحديث">
          <span className="yl-hide-xs">تحديث</span>
        </Button>
      </PageHeader>

      {error && <Alert tone="error">{error}</Alert>}

      {!stats && !error && <Loading />}

      {stats && (
        <div className="yl-grid yl-grid--stats">
          {CARDS.map(({ key, label, icon: Icon, tone, suffix = '' }) => {
            const value = stats[key];
            if (value === undefined || value === null) return null;
            const c = TONE[tone];
            return (
              <div className="yl-stat" key={key}>
                <span className="yl-stat__icon" style={{ background: c.bg, color: c.fg }}>
                  <Icon size={22} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="yl-stat__value yl-num">
                    {value}
                    {suffix}
                  </div>
                  <div className="yl-stat__label">{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stats && Object.keys(stats).length === 0 && (
        <EmptyState icon={<IconChart size={26} />} title="لا توجد بيانات بعد" />
      )}
    </>
  );
}
