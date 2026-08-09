// صفحة الإحصائيات (لوحة الأدمن) — بطاقات مؤشّرات الأداء الرئيسية.

import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api.get('/admin/stats').then(setStats).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if (error) return <div style={styles.page}><p style={{ color: 'red' }}>{error}</p></div>;
  if (!stats) return <div style={styles.page}>...جارٍ التحميل</div>;

  // تعريف البطاقات (تسمية، قيمة، أيقونة، لون)
  const cards = [
    { label: 'إجمالي الطلبات', value: stats.totalOrders, icon: '📦', color: '#0ea5e9' },
    { label: 'طلبات اليوم', value: stats.todayOrders, icon: '📅', color: '#6366f1' },
    { label: 'طلبات نشطة', value: stats.active, icon: '🚴', color: '#f59e0b' },
    { label: 'تم التسليم', value: stats.delivered, icon: '✅', color: '#16a34a' },
    { label: 'ملغاة', value: stats.cancelled, icon: '❌', color: '#dc2626' },
    { label: 'الإيرادات', value: `${stats.revenue} ج.م`, icon: '💰', color: '#059669' },
    { label: 'متوسّط زمن التوصيل', value: `${stats.avgDeliveryMinutes} دق`, icon: '⏱️', color: '#7c3aed' },
    { label: 'كباتن متصلون', value: stats.onlineCaptains, icon: '🧑‍✈️', color: '#0891b2' },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1>📊 لوحة الإحصائيات</h1>
        <button style={styles.refresh} onClick={load}>تحديث</button>
      </div>

      <div style={styles.grid}>
        {cards.map((c) => (
          <div key={c.label} style={styles.card}>
            <div style={{ ...styles.iconWrap, background: `${c.color}22` }}>
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
  page: { direction: 'rtl', fontFamily: 'system-ui', padding: 24, background: '#f8fafc', minHeight: '100vh' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  refresh: { padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
  card: {
    background: '#fff', borderRadius: 12, padding: 18, display: 'flex', alignItems: 'center', gap: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,.08)',
  },
  iconWrap: { width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center' },
  value: { fontSize: 22, fontWeight: 700 },
  label: { color: '#64748b', fontSize: 13 },
};
