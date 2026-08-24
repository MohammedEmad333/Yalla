// صفحة سحب أموال الكباتن (Card 33)
// يرى الأدمن تفاصيل كل طلب سحب (المبلغ، الطريقة، رقم الجوال) ونسبة الشركة،
// وتفاصيل محفظة الكابتن، وخانة لكتابة إشعار التحويل يُرسَل للكابتن عند "تم التحويل".

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { theme } from '../theme';

// نسبة الشركة الافتراضية (يُعرَض للأدمن كمرجع) — الكابتن يحصل على 80%
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
const STATUS_AR = {
  pending: 'معلّق',
  done: 'تمّ التحويل',
  rejected: 'مرفوض',
};
const STATUS_COLOR = { pending: '#f59e0b', done: '#16a34a', rejected: '#dc2626' };

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function Withdrawals() {
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

  // عرض تفاصيل محفظة الكابتن (إجمالي/صافي/نسبة الشركة) — من نقطة نهاية المحفظة
  async function showWallet(captainId, captainName) {
    try {
      const data = await api.get(`/admin/captains/${captainId}/wallet`);
      setWallet({ ...data, captainName });
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>سحب أموال الكباتن</h1>
      <p style={styles.subtitle}>
        مراجعة طلبات السحب وتفاصيل الأموال · نسبة الشركة {COMPANY_SHARE_PCT}% · إرسال إشعار التحويل
      </p>

      <div style={styles.filters}>
        {['pending', 'done', 'rejected', 'all'].map((s) => (
          <button key={s} style={styles.filter(status === s)} onClick={() => setStatus(s)}>
            {s === 'all' ? 'الكل' : STATUS_AR[s]}
          </button>
        ))}
        <button style={styles.reload} onClick={load}>تحديث</button>
      </div>

      <div className="yl-table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>
              <th>الكابتن</th><th>المبلغ</th><th>الطريقة</th><th>رقم الاستلام</th>
              <th>التاريخ</th><th>الحالة</th><th>إشعار التحويل / إجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w._id}>
                <td>
                  <button style={styles.linkBtn} onClick={() => showWallet(w.captain?._id, w.captain?.name)}>
                    {w.captain?.name || '—'}
                  </button>
                  <div style={styles.sub}>{w.captain?.phone || ''}</div>
                  {/* Card 67: محافظ الكابتن الإلكترونية المحفوظة — وجهة التحويل الصحيحة */}
                  {Array.isArray(w.captain?.payoutWallets) && w.captain.payoutWallets.length > 0 && (
                    <div style={styles.walletChips}>
                      {w.captain.payoutWallets.map((pw, i) => (
                        <span key={i} style={styles.walletChip} title={pw.ownerName || ''}>
                          {WALLET_CAT_AR[pw.category] || pw.category}: <b>{pw.number}</b>
                          {pw.ownerName ? ` — ${pw.ownerName}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td><b>{w.amount} ₪</b></td>
                <td>{METHOD_AR[w.method] || w.method}</td>
                <td>{w.phone}</td>
                <td style={{ fontSize: 12 }}>{fmtDate(w.createdAt)}</td>
                <td><span style={styles.pill(STATUS_COLOR[w.status])}>{STATUS_AR[w.status] || w.status}</span></td>
                <td>
                  {w.status === 'pending' ? (
                    <div style={styles.actionCell}>
                      <input
                        style={styles.noteInput}
                        placeholder="نص إشعار التحويل للكابتن (اختياري)"
                        value={notes[w._id] || ''}
                        onChange={(e) => setNotes((p) => ({ ...p, [w._id]: e.target.value }))}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={styles.btn2('#16a34a')} onClick={() => process(w, 'done')}>تم التحويل</button>
                        <button style={styles.btn2('#dc2626')} onClick={() => process(w, 'rejected')}>رفض</button>
                      </div>
                    </div>
                  ) : (
                    <span style={styles.sub}>{w.adminNote || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: theme.color.muted }}>لا توجد طلبات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* تفاصيل محفظة الكابتن (نسبة الشركة/الصافي) */}
      {wallet && (
        <div style={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>محفظة {wallet.captainName || wallet.captain?.name}</h3>
            <button style={styles.btn2('#64748b')} onClick={() => setWallet(null)}>إغلاق</button>
          </div>
          <div style={styles.walletGrid}>
            <div style={styles.walletCell}><b>{wallet.deliveries ?? 0}</b><span>توصيلة</span></div>
            <div style={styles.walletCell}><b>{wallet.gross ?? 0} ₪</b><span>إجمالي محصّل</span></div>
            <div style={styles.walletCell}><b>{wallet.net ?? 0} ₪</b><span>صافي الكابتن</span></div>
            <div style={styles.walletCell}><b>{wallet.commission ?? 0} ₪</b><span>نسبة الشركة</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filter: (active) => ({
    padding: '8px 18px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    border: 'none',
    fontSize: 14,
    background: active ? theme.color.primary : theme.color.surfaceContainer,
    color: active ? theme.color.onPrimary : theme.color.muted,
  }),
  reload: {
    marginInlineStart: 'auto',
    padding: '8px 18px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    border: `1px solid ${theme.color.outlineStrong}`,
    background: theme.color.card,
  },
  table: { marginTop: 4 },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    color: theme.color.primary,
    cursor: 'pointer',
    fontWeight: 700,
    padding: 0,
    fontSize: 14,
  },
  sub: { color: theme.color.muted, fontSize: 12 },
  walletChips: { display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 },
  walletChip: {
    background: theme.color.secondarySoft,
    color: theme.color.secondaryDeep,
    padding: '2px 8px',
    borderRadius: theme.radius.sm,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  actionCell: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 },
  noteInput: {
    padding: '8px 10px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.outlineStrong}`,
    fontSize: 13,
  },
  btn2: (bg) => ({
    background: bg, color: '#fff', border: 'none', padding: '7px 14px',
    borderRadius: theme.radius.pill, cursor: 'pointer', fontSize: 13,
  }),
  pill: (bg) => ({
    background: bg, color: '#fff', padding: '3px 12px', borderRadius: theme.radius.pill,
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  }),
  panel: {
    background: theme.color.card, borderRadius: theme.radius.lg, padding: 20, marginTop: 16,
    boxShadow: theme.shadow.card,
  },
  walletGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, margin: '14px 0' },
  walletCell: {
    background: theme.color.surface, borderRadius: theme.radius.md, padding: 14,
    display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'center',
    border: `1px solid ${theme.color.outline}`,
  },
};
