import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  TableWrap,
} from '../components/ui';
import { IconCashOut } from '../components/icons';

const COMPANY_SHARE_PCT = 20;

const METHOD_AR = {
  bank_of_palestine: 'بنك فلسطين',
  jawwal_pay: 'جوال باي',
  palpay: 'بال باي',
  cash: 'نقدًا',
};

const WALLET_CAT_AR = {
  bank_of_palestine: 'بنك فلسطين',
  palpay: 'محفظة بال باي',
  jawwal_pay: 'جوال باي',
  all: 'الكل',
};

const STATUS_AR = { pending: 'معلّق', done: 'تمّ التحويل', rejected: 'مرفوض' };
const STATUS_TONE = { pending: 'warning', done: 'success', rejected: 'danger' };
const FILTERS = ['pending', 'done', 'rejected', 'all'];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function StatusFilter({ status, onChange }) {
  return (
    <div className="yl-chips" style={{ marginBottom: 'var(--s-4)' }}>
      {FILTERS.map((s) => (
        <Chip key={s} active={status === s} onClick={() => onChange(s)}>
          {s === 'all' ? 'الكل' : STATUS_AR[s]}
        </Chip>
      ))}
    </div>
  );
}

function ActionCell({ row, note, onNote, onProcess }) {
  if (row.status !== 'pending') return <span className="yl-muted">{row.adminNote || '—'}</span>;
  return (
    <div className="yl-stack yl-stack--sm">
      <Input
        placeholder="نص إشعار التحويل للكابتن (اختياري)"
        value={note || ''}
        onChange={(e) => onNote(e.target.value)}
      />
      <div className="yl-btnrow">
        <Button size="sm" variant="success" onClick={() => onProcess('done')}>تم التحويل</Button>
        <Button size="sm" variant="danger" onClick={() => onProcess('rejected')}>رفض</Button>
      </div>
    </div>
  );
}

export default function Withdrawals() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState({});
  const [wallet, setWallet] = useState(null);

  const load = () => {
    const qs = status && status !== 'all' ? `?status=${status}` : '';
    api.get(`/admin/withdrawals${qs}`).then(setItems);
  };

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function process(w, action) {
    const note = notes[w._id] || '';
    if (action === 'rejected' && !note && !window.confirm('رفض بدون ذكر سبب؟')) return;
    try {
      await api.patch(`/admin/withdrawals/${w._id}`, { action, note });
      setNotes((p) => {
        const next = { ...p };
        delete next[w._id];
        return next;
      });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function showWallet(captainId, captainName) {
    try {
      const data = await api.get(`/admin/captains/${captainId}/wallet`);
      setWallet({ ...data, captainName });
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="سحوبات الكباتن"
        subtitle="مراجعة وتحويل مستحقات الكباتن إلى وجهات السحب المسجلة"
      />

      <p className="yl-muted" style={{ marginBottom: 'var(--s-3)' }}>
        نسبة الشركة {COMPANY_SHARE_PCT}% · اضغط اسم الكابتن لعرض تفاصيل محفظته
      </p>
      <StatusFilter status={status} onChange={setStatus} />

      {items.length === 0 ? (
        <EmptyState icon={<IconCashOut size={26} />} title="لا توجد طلبات في هذه الحالة" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>الكابتن</th>
              <th>المبلغ</th>
              <th>الطريقة</th>
              <th>رقم الاستلام</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>إشعار التحويل / إجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w._id}>
                <td data-label="الكابتن">
                  <button className="yl-link" onClick={() => showWallet(w.captain?._id, w.captain?.name)}>
                    {w.captain?.name || '—'}
                  </button>
                  <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>{w.captain?.phone || ''}</div>
                  {Array.isArray(w.captain?.payoutWallets) && w.captain.payoutWallets.length > 0 && (
                    <div className="yl-btnrow" style={{ marginTop: 6 }}>
                      {w.captain.payoutWallets.map((pw, i) => (
                        <Badge key={i} tone="info">
                          {WALLET_CAT_AR[pw.category] || pw.category}: {pw.number}
                          {pw.ownerName ? ` — ${pw.ownerName}` : ''}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td data-label="المبلغ"><b className="yl-num">{w.amount} ₪</b></td>
                <td data-label="الطريقة">{METHOD_AR[w.method] || w.method}</td>
                <td data-label="رقم الاستلام" className="yl-num">{w.phone}</td>
                <td data-label="التاريخ" className="yl-muted yl-nowrap" style={{ fontSize: 'var(--fs-sm)' }}>
                  {fmtDate(w.createdAt)}
                </td>
                <td data-label="الحالة">
                  <Badge tone={STATUS_TONE[w.status]}>{STATUS_AR[w.status] || w.status}</Badge>
                </td>
                <td data-label="إجراء" className="yl-td-actions">
                  <ActionCell
                    row={w}
                    note={notes[w._id]}
                    onNote={(v) => setNotes((p) => ({ ...p, [w._id]: v }))}
                    onProcess={(action) => process(w, action)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {wallet && (
        <Modal title={`محفظة ${wallet.captainName || wallet.captain?.name || ''}`} onClose={() => setWallet(null)}>
          <div className="yl-grid yl-grid--stats">
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.deliveries ?? 0}</div><div className="yl-stat__label">توصيلة</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.gross ?? 0} ₪</div><div className="yl-stat__label">إجمالي محصّل</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.net ?? 0} ₪</div><div className="yl-stat__label">صافي الكابتن</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.commission ?? 0} ₪</div><div className="yl-stat__label">نسبة الشركة</div></div></div>
          </div>
        </Modal>
      )}
    </>
  );
}
