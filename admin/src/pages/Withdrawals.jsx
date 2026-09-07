// صفحة السحوبات — تبويبان (Card 33 + Card 98):
//  • سحب أموال الكباتن: تفاصيل الطلب ومحفظة الكابتن ونسبة الشركة وإشعار التحويل.
//  • سحب رصيد الزبائن: وجهة التحويل ورقم الحساب، و«تم التحويل» يخصم ويُشعر.

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

// نسبة الشركة الافتراضية (تُعرَض للأدمن كمرجع) — الكابتن يحصل على 80%
const COMPANY_SHARE_PCT = 20;

const METHOD_AR = {
  bank_of_palestine: 'بنك فلسطين',
  jawwal_pay: 'جوال باي',
  palpay: 'بال باي',
  cash: 'نقدًا',
};
// Card 67: تسميات تصنيفات محافظ الكابتن الإلكترونية المحفوظة
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
    return new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

// شريط فلترة الحالة (مشترك بين التبويبين)
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

// خليّة الإجراء: ملاحظة + زرّا التنفيذ (أو ملاحظة الأدمن السابقة)
function ActionCell({ row, note, onNote, onProcess, placeholder }) {
  if (row.status !== 'pending') return <span className="yl-muted">{row.adminNote || '—'}</span>;
  return (
    <div className="yl-stack yl-stack--sm">
      <Input placeholder={placeholder} value={note || ''} onChange={(e) => onNote(e.target.value)} />
      <div className="yl-btnrow">
        <Button size="sm" variant="success" onClick={() => onProcess('done')}>تم التحويل</Button>
        <Button size="sm" variant="danger" onClick={() => onProcess('rejected')}>رفض</Button>
      </div>
    </div>
  );
}

export default function Withdrawals() {
  const [tab, setTab] = useState('captains'); // captains | customers

  return (
    <>
      <PageHeader
        title="طلبات السحب"
        subtitle="تحويل أموال الكباتن وسحب رصيد الزبائن إلى محافظهم أو بنوكهم"
      />

      <div className="yl-chips" style={{ marginBottom: 'var(--s-5)' }}>
        <Chip active={tab === 'captains'} onClick={() => setTab('captains')}>سحب أموال الكباتن</Chip>
        <Chip active={tab === 'customers'} onClick={() => setTab('customers')}>سحب رصيد الزبائن</Chip>
      </div>

      {tab === 'captains' ? <CaptainWithdrawals /> : <CustomerWithdrawals />}
    </>
  );
}

function CaptainWithdrawals() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('pending'); // pending | done | rejected | all
  const [notes, setNotes] = useState({});          // {withdrawalId: نص إشعار التحويل}
  const [wallet, setWallet] = useState(null);      // تفاصيل محفظة الكابتن المعروض

  const load = () => {
    const qs = status && status !== 'all' ? `?status=${status}` : '';
    api.get(`/admin/withdrawals${qs}`).then(setItems);
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // تنفيذ طلب السحب: "done" (تم التحويل) أو "rejected" (رفض) مع ملاحظة/إشعار
  async function process(w, action) {
    const note = notes[w._id] || '';
    if (action === 'rejected' && !note) {
      if (!window.confirm('رفض بدون ذكر سبب؟')) return;
    }
    try {
      await api.patch(`/admin/withdrawals/${w._id}`, { action, note });
      setNotes((p) => { const n = { ...p }; delete n[w._id]; return n; });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  // تفاصيل محفظة الكابتن (إجمالي/صافي/نسبة الشركة)
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
                  {/* Card 67: محافظ الكابتن المحفوظة — وجهة التحويل الصحيحة */}
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
                    placeholder="نص إشعار التحويل للكابتن (اختياري)"
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

// Card 98: طلبات سحب رصيد الزبائن
function CustomerWithdrawals() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState({});

  const load = () => {
    const qs = status && status !== 'all' ? `?status=${status}` : '';
    api.get(`/admin/customer-withdrawals${qs}`).then(setItems);
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function process(w, action) {
    const note = notes[w._id] || '';
    if (action === 'rejected' && !note) {
      if (!window.confirm('رفض بدون ذكر سبب؟')) return;
    }
    try {
      await api.patch(`/admin/customer-withdrawals/${w._id}`, { action, note });
      setNotes((p) => { const n = { ...p }; delete n[w._id]; return n; });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <p className="yl-muted" style={{ marginBottom: 'var(--s-3)' }}>
        «تم التحويل» يخصم المبلغ من رصيد الزبون ويُرسل له إشعارًا
      </p>
      <StatusFilter status={status} onChange={setStatus} />

      {items.length === 0 ? (
        <EmptyState icon={<IconCashOut size={26} />} title="لا توجد طلبات في هذه الحالة" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>الزبون</th>
              <th>المبلغ</th>
              <th>الوجهة</th>
              <th>رقم الحساب</th>
              <th>التاريخ</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w._id}>
                <td data-label="الزبون">
                  <b>{[w.user?.name, w.user?.lastName].filter(Boolean).join(' ') || '—'}</b>
                  <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>{w.user?.phone || ''}</div>
                </td>
                <td data-label="المبلغ"><b className="yl-num">{w.amount} ₪</b></td>
                <td data-label="الوجهة">
                  {w.destination}
                  {w.accountOwner && <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>صاحب الحساب: {w.accountOwner}</div>}
                  {w.note && <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>ملاحظة: {w.note}</div>}
                </td>
                <td data-label="رقم الحساب" className="yl-num">{w.accountNumber}</td>
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
                    placeholder="ملاحظة/سبب (اختياري)"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
