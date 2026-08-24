// صفحة البحث والفلترة في الطلبات (لوحة الأدمن) مع ترقيم.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { theme, orderStatusColor } from '../theme';

const STATUSES = ['', 'pending', 'assigned', 'accepted', 'picked_up', 'delivered', 'cancelled'];
const STATUS_AR = {
  '': 'كل الحالات', pending: 'بانتظار', assigned: 'مُسنَد', accepted: 'مقبول',
  picked_up: 'جارٍ التوصيل', delivered: 'مسلّم', cancelled: 'ملغى',
};

// تنسيق وقت مختصر لعرض وقت الرفض
function fmtTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  // Card 47: الطلب المفتوح لعرض تفاصيل رفض الكباتن له (أو null)
  const [rejectModal, setRejectModal] = useState(null);

  // بناء سلسلة الاستعلام وجلب الصفحة
  function load(targetPage = page) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    params.set('page', targetPage);
    params.set('limit', '10');
    api.get(`/orders/search?${params.toString()}`).then((d) => {
      setData(d);
      setPage(d.page);
    });
  }

  // تحميل عند تغيّر الحالة، وأوّل مرّة
  useEffect(() => { load(1); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // تصدير النتائج (بنفس الفلاتر) كملفّ CSV — نجلبه كـ blob مع التوكن ثم ننزّله
  async function exportCsv() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());

    const res = await fetch(`${API}/api/orders/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) return alert('تعذّر التصدير');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>بحث الطلبات</h1>
      <p style={styles.subtitle}>فلترة الطلبات وتصديرها</p>

      {/* شريط الفلاتر */}
      <div style={styles.filters}>
        <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
        </select>
        <input
          style={{ ...styles.input, flex: 1, minWidth: 200 }}
          placeholder="بحث في العناوين/الملاحظة"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1)}
        />
        <button style={styles.btn} onClick={() => load(1)}>بحث</button>
        <button style={styles.exportBtn} onClick={exportCsv}>⬇ تصدير CSV</button>
      </div>

      <p style={styles.count}>الإجمالي: <b>{data.total}</b> طلب</p>

      <div className="yl-table-wrap" style={styles.tableWrap}>
        <table>
          <thead>
            <tr><th>#</th><th>الحالة</th><th>صاحب الطلب</th><th>الاستلام</th><th>التسليم</th><th>الكابتن</th><th>رمز التسليم</th><th>السعر</th></tr>
          </thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o._id}>
                <td style={{ fontWeight: 600 }}>#{o._id.slice(-5)}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <span style={styles.pill(orderStatusColor(o.status))}>{STATUS_AR[o.status] || o.status}</span>
                    {/* Card 47: علامة رفض الكابتن مع زر لعرض السبب */}
                    {o.rejections?.length > 0 && (
                      <button style={styles.rejectBadge} onClick={() => setRejectModal(o)} title="عرض سبب الرفض">
                        🚫 مرفوض ({o.rejections.length}) — عرض السبب
                      </button>
                    )}
                  </div>
                </td>
                <td>{[o.user?.name, o.user?.lastName].filter(Boolean).join(' ') || '—'}</td>
                <td>{o.pickup?.address}</td>
                <td>{o.dropoff?.address}</td>
                <td>{o.captain?.name || '—'}</td>
                {/* Card 73: رمز التسليم — يظهر للأدمن فقط ليعطيه لصاحب الطلب عند الحاجة */}
                <td style={{ fontWeight: 700, letterSpacing: 1 }}>{o.deliveryCode || '—'}</td>
                {/* Card 28: بعد التسليم نعرض السعر الحقيقي (finalPrice) لا التقريبي */}
                <td style={{ fontWeight: 600 }}>
                  {(o.status === 'delivered' && Number(o.finalPrice) > 0 ? o.finalPrice : o.price)} ₪
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: theme.color.muted, padding: 20 }}>لا نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Card 47: نافذة عرض أسباب رفض الكباتن للطلب */}
      {rejectModal && (
        <div style={styles.overlay} onClick={() => setRejectModal(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <b>أسباب رفض الطلب #{rejectModal._id.slice(-5)}</b>
              <button style={styles.modalClose} onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <div style={styles.modalBody}>
              {rejectModal.rejections.map((r, i) => (
                <div key={i} style={styles.rejectRow}>
                  <div style={{ fontWeight: 600 }}>
                    🧑‍✈️ {r.captain?.name || 'كابتن'}
                    {r.captain?.phone ? ` · ${r.captain.phone}` : ''}
                  </div>
                  <div style={styles.rejectReason}>
                    {r.reason ? `السبب: ${r.reason}` : 'لم يُذكر سبب'}
                  </div>
                  {r.at && <div style={styles.rejectAt}>{fmtTime(r.at)}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ترقيم */}
      <div style={styles.pager}>
        <button style={styles.pageBtn} disabled={data.page <= 1} onClick={() => load(data.page - 1)}>السابق</button>
        <span style={styles.pageInfo}>صفحة {data.page} من {data.pages}</span>
        <button style={styles.pageBtn} disabled={data.page >= data.pages} onClick={() => load(data.page + 1)}>التالي</button>
      </div>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  filters: { display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' },
  input: { padding: '11px 14px', borderRadius: theme.radius.md, border: `1px solid ${theme.color.outlineStrong}` },
  btn: {
    background: theme.color.primary,
    color: theme.color.onPrimary,
    border: 'none',
    padding: '11px 22px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
  },
  exportBtn: {
    background: theme.color.secondary,
    color: theme.color.onSecondary,
    border: 'none',
    padding: '11px 20px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
  },
  count: { color: theme.color.muted, fontSize: 14 },
  tableWrap: { overflowX: 'auto' },
  // Card 47: زر علامة الرفض داخل خلية الحالة
  rejectBadge: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #ef4444',
    borderRadius: theme.radius.pill,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  // Card 47: نافذة عرض أسباب الرفض
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'grid', placeItems: 'center', zIndex: 50, padding: 16,
  },
  modal: {
    background: theme.color.card, borderRadius: theme.radius.lg, width: '100%',
    maxWidth: 480, boxShadow: theme.shadow.float, direction: 'rtl',
  },
  modalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', borderBottom: `1px solid ${theme.color.outline}`,
  },
  modalClose: {
    background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: theme.color.muted,
  },
  modalBody: { padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' },
  rejectRow: {
    border: `1px solid ${theme.color.outline}`, borderRadius: theme.radius.md,
    padding: 12, background: theme.color.surface,
  },
  rejectReason: { marginTop: 4, color: theme.color.onSurfaceVariant, fontSize: 14 },
  rejectAt: { marginTop: 4, color: theme.color.muted, fontSize: 12 },
  pill: (bg) => ({
    background: bg,
    color: theme.color.onPrimary,
    padding: '3px 12px',
    borderRadius: theme.radius.pill,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }),
  pager: { display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  pageInfo: { color: theme.color.onSurfaceVariant, fontSize: 14 },
  pageBtn: {
    padding: '9px 18px',
    borderRadius: theme.radius.pill,
    border: `1px solid ${theme.color.outlineStrong}`,
    background: theme.color.card,
    color: theme.color.onSurfaceVariant,
    cursor: 'pointer',
  },
};
