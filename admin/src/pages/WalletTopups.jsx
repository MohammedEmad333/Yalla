// صفحة مراجعة طلبات شحن الرصيد (المرحلة 1)
// تعرض الطلبات حسب الحالة، وتتيح فتح صورة الإيصال ثم الموافقة/الرفض.
// الموافقة تضيف الرصيد تلقائيًّا لمحفظة المستخدم في الخادم.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import {
  Alert,
  Badge,
  Button,
  Chip,
  EmptyState,
  Loading,
  PageHeader,
  TableWrap,
} from '../components/ui';
import { IconRefresh, IconWallet } from '../components/icons';

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

const STATUS_META = {
  pending: { tone: 'warning', label: 'قيد المراجعة' },
  approved: { tone: 'success', label: 'مقبولة' },
  rejected: { tone: 'danger', label: 'مرفوضة' },
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
    <>
      <PageHeader title="شحن الرصيد" subtitle="مراجعة طلبات شحن المحافظ والموافقة عليها">
        <Button icon={<IconRefresh size={18} />} onClick={load} aria-label="تحديث">
          <span className="yl-hide-xs">تحديث</span>
        </Button>
      </PageHeader>

      <div className="yl-chips" style={{ marginBottom: 'var(--s-4)' }}>
        {STATUS_TABS.map((t) => (
          <Chip key={t.key} active={status === t.key} onClick={() => setStatus(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && <Loading />}

      {!loading && items.length === 0 && (
        <EmptyState icon={<IconWallet size={26} />} title="لا توجد طلبات في هذه الحالة" />
      )}

      {!loading && items.length > 0 && (
        <TableWrap>
          <thead>
            <tr>
              <th>العميل</th>
              <th>المبلغ</th>
              <th>الطريقة</th>
              <th>رقم العملية</th>
              <th>الإيصال</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tx) => {
              const meta = STATUS_META[tx.status] || { tone: 'neutral', label: tx.status };
              return (
                <tr key={tx._id}>
                  <td data-label="العميل">
                    <b>{tx.user?.name} {tx.user?.lastName || ''}</b>
                    <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>{tx.user?.phone}</div>
                  </td>
                  <td data-label="المبلغ"><b className="yl-num">{tx.amount} ₪</b></td>
                  <td data-label="الطريقة">{METHOD_LABELS[tx.method] || tx.method}</td>
                  <td data-label="رقم العملية" className="yl-num">{tx.proof?.referenceNumber || '—'}</td>
                  <td data-label="الإيصال">
                    {tx.proof?.imageUrl ? (
                      <button
                        className="yl-thumb"
                        onClick={() => setPreview(`${API}${tx.proof.imageUrl}`)}
                        aria-label="تكبير الإيصال"
                      >
                        <img src={`${API}${tx.proof.imageUrl}`} alt="إيصال" />
                      </button>
                    ) : '—'}
                  </td>
                  <td data-label="التاريخ" className="yl-muted yl-nowrap" style={{ fontSize: 'var(--fs-sm)' }}>
                    {new Date(tx.createdAt).toLocaleString('ar')}
                  </td>
                  <td data-label="الحالة"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                  <td data-label="إجراء" className="yl-td-actions">
                    {tx.status === 'pending' ? (
                      <div className="yl-btnrow">
                        <Button size="sm" variant="success" onClick={() => approve(tx)}>موافقة</Button>
                        <Button size="sm" variant="danger" onClick={() => reject(tx)}>رفض</Button>
                      </div>
                    ) : (
                      <span className="yl-muted">{tx.rejectionReason || '—'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {/* معاينة مكبّرة لصورة الإيصال */}
      {preview && (
        <div className="yl-lightbox" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <img src={preview} alt="إيصال" />
        </div>
      )}
    </>
  );
}
