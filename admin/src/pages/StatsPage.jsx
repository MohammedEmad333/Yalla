// صفحة الإحصائيات (لوحة الأدمن) — بطاقات مؤشّرات الأداء الرئيسية.

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { theme } from '../theme';

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api.get('/admin/stats').then(setStats).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if (error) return <div style={styles.page}><p style={styles.err}>{error}</p></div>;
  if (!stats) return <div style={{ ...styles.page, color: theme.color.muted }}>...جارٍ التحميل</div>;

  const C = theme.color;
  // تعريف البطاقات (تسمية، قيمة، أيقونة، لون من نظام Velocity)
  const cards = [
    { label: 'إجمالي الطلبات', value: stats.totalOrders, icon: '📦', color: C.secondary },
    { label: 'طلبات اليوم', value: stats.todayOrders, icon: '📅', color: C.secondaryDeep },
    { label: 'طلبات نشطة', value: stats.active, icon: '🚴', color: C.primary },
    { label: 'تم التسليم', value: stats.delivered, icon: '✅', color: C.success },
    { label: 'ملغاة', value: stats.cancelled, icon: '❌', color: C.error },
    { label: 'الإيرادات', value: `${stats.revenue} ₪`, icon: '💰', color: C.primaryDeep },
    { label: 'متوسّط زمن التوصيل', value: `${stats.avgDeliveryMinutes} دق`, icon: '⏱️', color: C.warning },
    { label: 'كباتن متصلون', value: stats.onlineCaptains, icon: '🧑‍✈️', color: C.secondary },
  ];

  return (
    <div className="yl-page" style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={{ margin: 0 }}>الإحصائيات</h1>
          <p style={styles.subtitle}>نظرة عامّة على أداء المنظومة</p>
        </div>
        <button style={styles.refresh} onClick={load}>↻ تحديث</button>
      </div>

      <div style={styles.grid}>
        {cards.map((c) => (
          <div key={c.label} style={styles.card(c.color)}>
            <div style={{ ...styles.iconWrap, background: `${c.color}1a` }}>
              <span style={{ fontSize: 24 }}>{c.icon}</span>
            </div>
            <div>
              <div style={styles.value}>{c.value}</div>
              <div style={styles.label}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' },
  subtitle: { color: theme.color.muted, margin: '4px 0 0', fontSize: 14 },
  err: { color: theme.color.error, background: theme.color.errorSoft, padding: 14, borderRadius: theme.radius.md },
  refresh: {
    padding: '9px 18px',
    borderRadius: theme.radius.pill,
    border: `1px solid ${theme.color.outlineStrong}`,
    background: theme.color.card,
    color: theme.color.onSurfaceVariant,
    cursor: 'pointer',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 },
  card: (accent) => ({
    background: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    boxShadow: theme.shadow.card,
    borderRight: `4px solid ${accent}`,
  }),
  iconWrap: { width: 52, height: 52, borderRadius: theme.radius.md, display: 'grid', placeItems: 'center', flexShrink: 0 },
  value: { fontSize: 24, fontWeight: 700, color: theme.color.onSurface },
  label: { color: theme.color.muted, fontSize: 13, marginTop: 2 },
};
