// صفحة مراجعة طلبات شحن الرصيد (لوحة الأدمن — المرحلة 1)
// تعرض الطلبات حسب الحالة، وتتيح فتح صورة الإيصال ثم الموافقة/الرفض.
// الموافقة تضيف الرصيد تلقائيًّا لمحفظة المستخدم في الخادم.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { theme } from '../theme';

const STATUS_TABS = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'approved', label: 'مقبولة' },
  { key: 'rejected', label: 'مرفوضة' },
  { key: 'all', label: 'الكل' },
];

const METHOD_LABELS = {
  bank_of_palestine: 'بنك فلسطين',
  jawwal_pay: 'جوال باي',
  palpay: 'بال باي',
};

export default function WalletTopups() {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // رابط صورة الإيصال المكبّرة
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api
      .get(`/admin/wallet/topups?status=${status}`)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // الموافقة على طلب شحن (تضيف الرصيد تلقائيًّا)
  async function approve(tx) {
    if (!confirm(`تأكيد إضافة ${tx.amount} ₪ إلى محفظة العميل؟`)) return;
    try {
      await api.post(`/admin/wallet/topups/${tx._id}/approve`, {});
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  // رفض طلب شحن مع سبب اختياري
  async function reject(tx) {
    const reason = prompt('سبب الرفض (اختياري):', '');
    if (reason === null) return; // ألغى الأدمن
    try {
      await api.post(`/admin/wallet/topups/${tx._id}/reject`, { reason });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>شحن الرصيد</h1>
      <p style={styles.subtitle}>مراجعة طلبات شحن المحافظ والموافقة عليها</p>

      <div style={styles.tabs}>
        {STATUS_TABS.map((t) => (
          <button key={t.key} style={styles.tab(status === t.key)} onClick={() => setStatus(t.key)}>
            {t.label}
          </button>
        ))}
        <button style={styles.refresh} onClick={load}>↻ تحديث</button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {loading && <p style={styles.muted}>...جارٍ التحميل</p>}
      {!loading && items.length === 0 && <p style={styles.muted}>لا توجد طلبات</p>}

      <div className="yl-table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>
              <th>العميل</th><th>المبلغ</th><th>الطريقة</th><th>رقم العملية</th>
              <th>الإيصال</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tx) => (
              <tr key={tx._id}>
                <td>
                  {tx.user?.name} {tx.user?.lastName || ''}
                  <div style={styles.phone}>{tx.user?.phone}</div>
                </td>
                <td><b>{tx.amount} ₪</b></td>
                <td>{METHOD_LABELS[tx.method] || tx.method}</td>
                <td>{tx.proof?.referenceNumber || '—'}</td>
                <td>
                  {tx.proof?.imageUrl ? (
                    <img
                      src={`${API}${tx.proof.imageUrl}`}
                      alt="إيصال"
                      style={styles.thumb}
                      onClick={() => setPreview(`${API}${tx.proof.imageUrl}`)}
                    />
                  ) : '—'}
                </td>
                <td style={styles.date}>{new Date(tx.createdAt).toLocaleString('ar')}</td>
                <td><span style={styles.pill(tx.status)}>{statusLabel(tx.status)}</span></td>
                <td>
                  {tx.status === 'pending' ? (
                    <>
                      <button style={styles.btn2('#16a34a')} onClick={() => approve(tx)}>موافقة</button>
                      <button style={{ ...styles.btn2('#dc2626'), marginInlineStart: 6 }} onClick={() => reject(tx)}>رفض</button>
                    </>
                  ) : (
                    <span style={styles.muted}>{tx.rejectionReason || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* معاينة مكبّرة لصورة الإيصال */}
      {preview && (
        <div style={styles.overlay} onClick={() => setPreview(null)}>
          <img src={preview} alt="إيصال" style={styles.previewImg} />
        </div>
      )}
    </div>
  );
}

function statusLabel(s) {
  return { pending: 'قيد المراجعة', approved: 'مقبولة', rejected: 'مرفوضة' }[s] || s;
}

const STATUS_COLORS = { pending: '#f59e0b', approved: '#16a34a', rejected: '#dc2626' };

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  tab: (active) => ({
    padding: '9px 22px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    border: 'none',
    fontSize: 14,
    background: active ? theme.color.primary : theme.color.surfaceContainer,
    color: active ? theme.color.onPrimary : theme.color.muted,
    boxShadow: active ? theme.shadow.float : 'none',
  }),
  refresh: {
    marginInlineStart: 'auto',
    background: theme.color.card,
    border: `1px solid ${theme.color.outlineStrong}`,
    color: theme.color.onSurfaceVariant,
    padding: '8px 14px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    fontSize: 13,
  },
  table: { marginTop: 4 },
  phone: { fontSize: 12, color: theme.color.muted },
  date: { fontSize: 12, color: theme.color.muted, whiteSpace: 'nowrap' },
  thumb: {
    width: 44, height: 44, objectFit: 'cover', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${theme.color.outline}`,
  },
  btn2: (bg) => ({
    background: bg, color: '#fff', border: 'none', padding: '7px 14px',
    borderRadius: theme.radius.pill, cursor: 'pointer', fontSize: 13,
  }),
  pill: (s) => ({
    background: STATUS_COLORS[s] || '#94a3b8', color: '#fff', padding: '3px 12px',
    borderRadius: theme.radius.pill, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  }),
  muted: { color: theme.color.muted, fontSize: 13 },
  error: { color: '#dc2626', fontSize: 14 },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'grid',
    placeItems: 'center', zIndex: 50, cursor: 'zoom-out', padding: 24,
  },
  previewImg: { maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' },
};
