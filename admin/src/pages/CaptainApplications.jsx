// Card 79: توثيق الكباتن — تبويبان:
//  (1) طلبات التوثيق: طلبات التسجيل من التطبيق مع مستنداتها، قبول (إنشاء حساب)
//      أو رفض (حذف الطلب نهائيًا).
//  (2) بيانات الكباتن: البيانات الحسّاسة (رقم الهوية/تاريخ الميلاد/المستندات)
//      للأدمن فقط.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { theme } from '../theme';
import { vehicleLabel } from '../vehicles';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

// عنوان صورة كامل من مسار نسبيّ
const imgUrl = (u) => (!u ? '' : u.startsWith('http') ? u : `${API}${u}`);

// معاينة صورة قابلة للتكبير (فتح في تبويب جديد)
function DocThumb({ url, label }) {
  if (!url) return <span style={{ color: theme.color.muted }}>—</span>;
  const full = imgUrl(url);
  return (
    <a href={full} target="_blank" rel="noopener noreferrer" title={`فتح ${label}`}>
      <img src={full} alt={label} style={styles.thumb} loading="lazy" />
    </a>
  );
}

export default function CaptainApplications() {
  const [tab, setTab] = useState('applications'); // applications | data
  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>توثيق الكباتن</h1>
      <p style={styles.subtitle}>مراجعة طلبات تسجيل الكباتن من التطبيق واعتمادها، وبياناتهم الحسّاسة</p>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'applications')} onClick={() => setTab('applications')}>طلبات التوثيق</button>
        <button style={styles.tab(tab === 'data')} onClick={() => setTab('data')}>بيانات الكباتن</button>
      </div>

      {tab === 'applications' ? <ApplicationsTab /> : <CaptainsDataTab />}
    </div>
  );
}

// ── تبويب طلبات التوثيق ─────────────────────────────────────────
function ApplicationsTab() {
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState('');

  const load = () => api.get('/admin/captain-applications?status=pending').then(setApps);
  useEffect(() => { load(); }, []);

  async function approve(a) {
    if (!window.confirm(`اعتماد الكابتن "${a.fullName}" وإنشاء حسابه؟`)) return;
    setBusy(a.id);
    try {
      await api.post(`/admin/captain-applications/${a.id}/approve`);
      setApps((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  async function reject(a) {
    if (!window.confirm(`رفض طلب "${a.fullName}" وحذفه نهائيًا؟ لا يمكن التراجع.`)) return;
    setBusy(a.id);
    try {
      await api.post(`/admin/captain-applications/${a.id}/reject`);
      setApps((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  if (apps.length === 0) {
    return <p style={{ color: theme.color.muted }}>لا توجد طلبات توثيق معلّقة.</p>;
  }

  return (
    <div style={styles.cards}>
      {apps.map((a) => (
        <div key={a.id} style={styles.card}>
          <div style={styles.cardHead}>
            <b>{a.fullName}</b>
            <span style={styles.pill('#f59e0b')}>قيد التوثيق</span>
          </div>
          <p style={styles.line}><b>الهاتف:</b> {a.phone}</p>
          <p style={styles.line}><b>رقم الهوية:</b> {a.nationalId}</p>
          <p style={styles.line}><b>تاريخ الميلاد:</b> {fmtDate(a.birthDate)}</p>
          <p style={styles.line}><b>المركبة:</b> {vehicleLabel(a.vehicleType)}</p>
          <div style={styles.docsRow}>
            <div style={styles.docCell}><span style={styles.docLabel}>صورة الهوية</span><DocThumb url={a.idPhotoUrl} label="صورة الهوية" /></div>
            <div style={styles.docCell}><span style={styles.docLabel}>سيلفي مع الهوية</span><DocThumb url={a.selfieUrl} label="السيلفي" /></div>
          </div>
          <div style={styles.actions}>
            <button style={styles.btn('#16a34a')} disabled={busy === a.id} onClick={() => approve(a)}>
              {busy === a.id ? '...' : '✓ قبول وإنشاء الحساب'}
            </button>
            <button style={styles.btn('#dc2626')} disabled={busy === a.id} onClick={() => reject(a)}>
              ✕ رفض وحذف
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── تبويب بيانات الكباتن الحسّاسة ───────────────────────────────
function CaptainsDataTab() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/admin/captains/data').then(setRows); }, []);

  return (
    <div className="yl-table-wrap">
      <table className="yl-rtable" style={{ marginTop: 4 }}>
        <thead>
          <tr>
            <th>الاسم</th><th>الهاتف</th><th>رقم الهوية</th><th>تاريخ الميلاد</th>
            <th>المصدر</th><th>الهوية</th><th>السيلفي</th><th>الانضمام</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td data-label="الاسم">{c.name}</td>
              <td data-label="الهاتف">{c.phone}</td>
              <td data-label="رقم الهوية">{c.nationalId || '—'}</td>
              <td data-label="تاريخ الميلاد">{fmtDate(c.birthDate)}</td>
              <td data-label="المصدر">
                <span style={styles.pill(c.createdVia === 'app' ? '#2563eb' : '#64748b')}>
                  {c.createdVia === 'app' ? 'التطبيق' : 'الأدمن'}
                </span>
              </td>
              <td data-label="الهوية"><DocThumb url={c.idPhotoUrl} label="صورة الهوية" /></td>
              <td data-label="السيلفي"><DocThumb url={c.selfieUrl} label="السيلفي" /></td>
              <td data-label="الانضمام">{fmtDate(c.createdAt)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: theme.color.muted }}>لا يوجد كباتن</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: (active) => ({
    padding: '9px 22px', borderRadius: theme.radius.pill, cursor: 'pointer', border: 'none', fontSize: 14,
    background: active ? theme.color.primary : theme.color.surfaceContainer,
    color: active ? theme.color.onPrimary : theme.color.muted,
    boxShadow: active ? theme.shadow.float : 'none',
  }),
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  card: { background: theme.color.card, borderRadius: theme.radius.lg, padding: 18, boxShadow: theme.shadow.card },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  line: { margin: '3px 0', fontSize: 14, color: theme.color.onSurfaceVariant },
  docsRow: { display: 'flex', gap: 12, margin: '12px 0' },
  docCell: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' },
  docLabel: { fontSize: 12, color: theme.color.muted },
  thumb: { width: 90, height: 90, objectFit: 'cover', borderRadius: theme.radius.md, border: `1px solid ${theme.color.outline}`, cursor: 'pointer' },
  actions: { display: 'flex', gap: 8, marginTop: 8 },
  btn: (bg) => ({ background: bg, color: '#fff', border: 'none', padding: '9px 14px', borderRadius: theme.radius.pill, cursor: 'pointer', fontSize: 13, flex: 1 }),
  pill: (bg) => ({ background: bg, color: '#fff', padding: '3px 12px', borderRadius: theme.radius.pill, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }),
};
