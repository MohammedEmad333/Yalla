// صفحة البحث والفلترة في الطلبات مع ترقيم وتصدير CSV.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { statusLabel, statusTone, ORDER_STATUS_AR } from '../status';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  TableWrap,
} from '../components/ui';
import { IconDownload, IconOrders, IconSearch } from '../components/icons';

const STATUSES = ['', 'pending', 'assigned', 'accepted', 'picked_up', 'delivered', 'cancelled'];

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
    <>
      <PageHeader title="بحث الطلبات" subtitle={`الإجمالي: ${data.total} طلب`}>
        <Button variant="soft" icon={<IconDownload size={18} />} onClick={exportCsv}>
          تصدير CSV
        </Button>
      </PageHeader>

      {/* شريط الفلاتر */}
      <div className="yl-toolbar">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_AR[s]}</option>
          ))}
        </Select>
        <SearchInput
          placeholder="بحث في العناوين أو الملاحظة"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1)}
        />
        <Button variant="primary" icon={<IconSearch size={18} />} onClick={() => load(1)}>
          بحث
        </Button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState icon={<IconOrders size={26} />} title="لا نتائج مطابقة">
          جرّب تغيير الحالة أو كلمة البحث.
        </EmptyState>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>#</th>
              <th>الحالة</th>
              <th>صاحب الطلب</th>
              <th>الاستلام</th>
              <th>التسليم</th>
              <th>الكابتن</th>
              <th>رمز التسليم</th>
              <th>السعر</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o._id}>
                <td data-label="رقم الطلب"><b className="yl-num">#{o._id.slice(-5)}</b></td>
                <td data-label="الحالة">
                  <div className="yl-stack yl-stack--sm" style={{ alignItems: 'flex-start' }}>
                    <Badge tone={statusTone(o.status)} dot>{statusLabel(o.status)}</Badge>
                    {/* Card 47: علامة رفض الكابتن مع زر لعرض السبب */}
                    {o.rejections?.length > 0 && (
                      <button className="yl-link" onClick={() => setRejectModal(o)} title="عرض سبب الرفض">
                        مرفوض ({o.rejections.length}) — عرض السبب
                      </button>
                    )}
                  </div>
                </td>
                <td data-label="صاحب الطلب">
                  {[o.user?.name, o.user?.lastName].filter(Boolean).join(' ') || '—'}
                </td>
                <td data-label="الاستلام">{o.pickup?.address}</td>
                <td data-label="التسليم">{o.dropoff?.address}</td>
                <td data-label="الكابتن">{o.captain?.name || '—'}</td>
                {/* Card 73: رمز التسليم — للأدمن فقط ليعطيه لصاحب الطلب عند الحاجة */}
                <td data-label="رمز التسليم">
                  <b className="yl-num" style={{ letterSpacing: 1 }}>{o.deliveryCode || '—'}</b>
                </td>
                {/* Card 28: بعد التسليم نعرض السعر الحقيقي (finalPrice) لا التقريبي */}
                <td data-label="السعر">
                  <b className="yl-num">
                    {o.status === 'delivered' && Number(o.finalPrice) > 0 ? o.finalPrice : o.price} ₪
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* ترقيم */}
      {data.pages > 1 && (
        <div className="yl-pager">
          <Button disabled={data.page <= 1} onClick={() => load(data.page - 1)}>السابق</Button>
          <span className="yl-muted">صفحة {data.page} من {data.pages}</span>
          <Button disabled={data.page >= data.pages} onClick={() => load(data.page + 1)}>التالي</Button>
        </div>
      )}

      {/* Card 47: نافذة عرض أسباب رفض الكباتن للطلب */}
      {rejectModal && (
        <Modal
          title={`أسباب رفض الطلب #${rejectModal._id.slice(-5)}`}
          onClose={() => setRejectModal(null)}
        >
          <div className="yl-stack">
            {rejectModal.rejections.map((r, i) => (
              <div className="yl-card yl-card--flat yl-card--pad" key={i}>
                <b>
                  {r.captain?.name || 'كابتن'}
                  {r.captain?.phone ? ` · ${r.captain.phone}` : ''}
                </b>
                <p className="yl-soft" style={{ marginTop: 4 }}>
                  {r.reason ? `السبب: ${r.reason}` : 'لم يُذكر سبب'}
                </p>
                {r.at && <p className="yl-hint" style={{ marginTop: 4 }}>{fmtTime(r.at)}</p>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
