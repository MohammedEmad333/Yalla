// صفحة البحث والفلترة في الطلبات (لوحة الأدمن) مع ترقيم.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';

const STATUSES = ['', 'pending', 'assigned', 'accepted', 'picked_up', 'delivered', 'cancelled'];
const STATUS_AR = {
  '': 'كل الحالات', pending: 'بانتظار', assigned: 'مُسنَد', accepted: 'مقبول',
  picked_up: 'جارٍ التوصيل', delivered: 'مسلّم', cancelled: 'ملغى',
};

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });

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
    <div style={styles.page}>
      <h1>🔍 بحث الطلبات</h1>

      {/* شريط الفلاتر */}
      <div style={styles.filters}>
        <select style={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
        </select>
        <input
          style={styles.input}
          placeholder="بحث في العناوين/الملاحظة"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1)}
        />
        <button style={styles.btn} onClick={() => load(1)}>بحث</button>
        <button style={styles.exportBtn} onClick={exportCsv}>⬇ تصدير CSV</button>
      </div>

      <p style={styles.count}>الإجمالي: {data.total} طلب</p>

      <table style={styles.table}>
        <thead>
          <tr><th>#</th><th>الحالة</th><th>الاستلام</th><th>التسليم</th><th>الكابتن</th><th>السعر</th></tr>
        </thead>
        <tbody>
          {data.items.map((o) => (
            <tr key={o._id}>
              <td>#{o._id.slice(-5)}</td>
              <td>{STATUS_AR[o.status] || o.status}</td>
              <td>{o.pickup?.address}</td>
              <td>{o.dropoff?.address}</td>
              <td>{o.captain?.name || '—'}</td>
              <td>{o.price} ج.م</td>
            </tr>
          ))}
          {data.items.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 16 }}>لا نتائج</td></tr>
          )}
        </tbody>
      </table>

      {/* ترقيم */}
      <div style={styles.pager}>
        <button style={styles.pageBtn} disabled={data.page <= 1} onClick={() => load(data.page - 1)}>السابق</button>
        <span>صفحة {data.page} من {data.pages}</span>
        <button style={styles.pageBtn} disabled={data.page >= data.pages} onClick={() => load(data.page + 1)}>التالي</button>
      </div>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: 'system-ui', padding: 24, background: '#f8fafc', minHeight: '100vh' },
  filters: { display: 'flex', gap: 8, margin: '16px 0' },
  input: { padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' },
  btn: { background: '#0f172a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' },
  exportBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' },
  count: { color: '#64748b' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden' },
  pager: { display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  pageBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' },
};
