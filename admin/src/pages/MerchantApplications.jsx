import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Badge, Button, Card, Chip, EmptyState, PageHeader } from '../components/ui';
import { IconCheck, IconClose, IconStore } from '../components/icons';

function fmtDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const statusMeta = {
  pending: { label: 'قيد المراجعة', tone: 'warning' },
  approved: { label: 'معتمد', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
};

export default function MerchantApplications() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  async function load(nextStatus = status) {
    setLoading(true);
    try {
      setRows(await api.get('/admin/restaurants/applications?status=' + nextStatus));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(status); }, [status]);

  async function approve(row) {
    if (!window.confirm('اعتماد متجر "' + row.name + '" وإظهاره للزبائن؟')) return;
    setBusy(row.id);
    try {
      await api.post('/admin/restaurants/applications/' + row.restaurantId + '/approve');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  async function reject(row) {
    const reason = window.prompt('اكتب سبب رفض "' + row.name + '". سيظهر السبب لصاحب المتجر:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('سبب الرفض مطلوب');
      return;
    }
    setBusy(row.id);
    try {
      await api.post('/admin/restaurants/applications/' + row.restaurantId + '/reject', { reason: reason.trim() });
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader
        title="طلبات انضمام المتاجر"
        subtitle="مراجعة حسابات التجار والمتاجر والفروع المضافة ذاتيًا قبل ظهورها للزبائن"
      />

      <div className="yl-chips" style={{ marginBottom: 'var(--s-4)' }}>
        {[
          ['pending', 'قيد المراجعة'],
          ['approved', 'المعتمدة'],
          ['rejected', 'المرفوضة'],
          ['all', 'الكل'],
        ].map(([key, label]) => (
          <Chip key={key} active={status === key} onClick={() => setStatus(key)}>
            {label}
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="yl-empty"><span className="yl-spinner" /><span>...جارٍ التحميل</span></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<IconStore size={28} />} title="لا توجد طلبات في هذه الحالة">
          الطلبات الجديدة القادمة من Yalla Partner ستظهر هنا تلقائيًا.
        </EmptyState>
      ) : (
        <div className="yl-grid yl-grid--wide">
          {rows.map((row) => {
            const meta = statusMeta[row.approvalStatus] || statusMeta.pending;
            return (
              <Card key={row.id}>
                <div className="yl-row yl-row--between" style={{ gap: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
                  <div>
                    <b style={{ fontSize: 'var(--fs-lg)' }}>{row.name}</b>
                    <div className="yl-muted" style={{ marginTop: 3 }}>
                      {row.isPrimary ? 'متجر أساسي وحساب جديد' : 'فرع جديد لحساب قائم'}
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                <dl className="yl-deflist">
                  <div><dt>صاحب المتجر</dt><dd>{row.ownerName || '—'}</dd></div>
                  <div><dt>جوال صاحب المتجر</dt><dd className="yl-num">{row.ownerPhone || '—'}</dd></div>
                  <div><dt>هاتف المتجر</dt><dd className="yl-num">{row.phone || '—'}</dd></div>
                  <div><dt>النوع</dt><dd>{row.category || '—'}</dd></div>
                  <div><dt>المدينة</dt><dd>{row.city || '—'}</dd></div>
                  <div><dt>المنطقة</dt><dd>{row.neighborhood || '—'}</dd></div>
                  <div><dt>العنوان</dt><dd>{row.address || row.street || '—'}</dd></div>
                  <div><dt>تاريخ الطلب</dt><dd>{fmtDate(row.submittedAt)}</dd></div>
                </dl>

                {row.description && (
                  <div style={{ marginTop: 'var(--s-3)' }}>
                    <div className="yl-hint">وصف المتجر</div>
                    <div style={{ lineHeight: 1.6 }}>{row.description}</div>
                  </div>
                )}

                {row.rejectionReason && (
                  <div className="yl-alert yl-alert--danger" style={{ marginTop: 'var(--s-3)' }}>
                    <b>سبب الرفض:</b> {row.rejectionReason}
                  </div>
                )}

                {row.approvalStatus === 'pending' && (
                  <div className="yl-btnrow" style={{ marginTop: 'var(--s-4)' }}>
                    <Button
                      variant="success"
                      icon={<IconCheck size={18} />}
                      disabled={busy === row.id}
                      onClick={() => approve(row)}
                      style={{ flex: 1 }}
                    >
                      اعتماد المتجر
                    </Button>
                    <Button
                      variant="danger"
                      icon={<IconClose size={18} />}
                      disabled={busy === row.id}
                      onClick={() => reject(row)}
                    >
                      رفض
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
