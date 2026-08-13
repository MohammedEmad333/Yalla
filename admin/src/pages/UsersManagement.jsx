// صفحة إدارة المستخدمين والكباتن (لوحة الأدمن)
// تبويبان: العملاء (تفعيل/تعطيل) والكباتن (اعتماد + إضافة كابتن جديد).

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { theme } from '../theme';

export default function UsersManagement() {
  const [tab, setTab] = useState('users'); // users | captains
  return (
    <div style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>إدارة المستخدمين</h1>
      <p style={styles.subtitle}>العملاء والكباتن — التفعيل والاعتماد والمحافظ</p>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'users')} onClick={() => setTab('users')}>العملاء</button>
        <button style={styles.tab(tab === 'captains')} onClick={() => setTab('captains')}>الكباتن</button>
      </div>
      {tab === 'users' ? <UsersTab /> : <CaptainsTab />}
    </div>
  );
}

// ── تبويب العملاء ──────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');

  const load = () => api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setUsers);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // تبديل تفعيل المستخدم
  async function toggle(u) {
    const updated = await api.patch(`/admin/users/${u._id}/active`, { isActive: !u.isActive });
    setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...x, isActive: updated.isActive } : x)));
  }

  return (
    <div>
      <div style={styles.searchRow}>
        <input
          style={styles.search}
          placeholder="بحث بالاسم أو الهاتف"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button style={styles.btn} onClick={load}>بحث</button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr><th>الاسم</th><th>الهاتف</th><th>الحالة</th><th>إجراء</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.phone}</td>
              <td>
                <span style={styles.pill(u.isActive ? '#16a34a' : '#dc2626')}>
                  {u.isActive ? 'مفعّل' : 'معطّل'}
                </span>
              </td>
              <td>
                <button
                  style={styles.btn2(u.isActive ? '#dc2626' : '#16a34a')}
                  onClick={() => toggle(u)}
                >
                  {u.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── تبويب الكباتن ──────────────────────────────────────────────
function CaptainsTab() {
  const [captains, setCaptains] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '', vehicleType: 'motorcycle' });
  const [reviews, setReviews] = useState(null); // مراجعات الكابتن المعروض حاليًا
  const [wallet, setWallet] = useState(null);   // محفظة الكابتن المعروض حاليًا

  const load = () => api.get('/admin/captains').then(setCaptains);
  useEffect(() => { load(); }, []);

  // جلب محفظة كابتن (COD)
  async function showWallet(c) {
    const data = await api.get(`/admin/captains/${c._id}/wallet`);
    setWallet(data);
  }

  // تسوية كامل المستحقّ على الكابتن
  async function settle(captainId, owed) {
    if (owed <= 0) return;
    await api.post(`/admin/captains/${captainId}/settle`, { amount: owed });
    showWallet({ _id: captainId }); // إعادة تحميل المحفظة
  }

  // اعتماد/إلغاء اعتماد كابتن
  async function toggleApprove(c) {
    const updated = await api.patch(`/admin/captains/${c._id}/approve`, { isApproved: !c.isApproved });
    setCaptains((prev) => prev.map((x) => (x._id === c._id ? { ...x, isApproved: updated.isApproved } : x)));
  }

  // جلب مراجعات كابتن وعرضها في لوحة أسفل الجدول
  async function showReviews(c) {
    const data = await api.get(`/captains/${c._id}/reviews`);
    setReviews(data);
  }

  // إضافة كابتن جديد (يستخدم POST /auth/captain/register)
  async function addCaptain(e) {
    e.preventDefault();
    try {
      await api.post('/auth/captain/register', form);
      setForm({ name: '', phone: '', password: '', vehicleType: 'motorcycle' });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      {/* نموذج إضافة كابتن */}
      <form onSubmit={addCaptain} style={styles.addForm}>
        <input style={styles.search} placeholder="الاسم" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input style={styles.search} placeholder="الهاتف" value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        <input style={styles.search} type="password" placeholder="كلمة المرور" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select style={styles.search} value={form.vehicleType}
          onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
          <option value="motorcycle">موتوسيكل</option>
          <option value="bicycle">دراجة</option>
        </select>
        <button style={styles.btn} type="submit">+ إضافة كابتن</button>
      </form>

      <table style={styles.table}>
        <thead>
          <tr><th>الاسم</th><th>الهاتف</th><th>المركبة</th><th>التقييم</th><th>الاعتماد</th><th>إجراء</th></tr>
        </thead>
        <tbody>
          {captains.map((c) => (
            <tr key={c._id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.vehicleType}</td>
              <td>⭐ {c.rating} ({c.ratingsCount})</td>
              <td>
                <span style={styles.pill(c.isApproved ? '#16a34a' : '#f59e0b')}>
                  {c.isApproved ? 'معتمَد' : 'قيد المراجعة'}
                </span>
              </td>
              <td>
                <button
                  style={styles.btn2(c.isApproved ? '#f59e0b' : '#16a34a')}
                  onClick={() => toggleApprove(c)}
                >
                  {c.isApproved ? 'إلغاء الاعتماد' : 'اعتماد'}
                </button>
                <button style={{ ...styles.btn2('#334155'), marginInlineStart: 6 }} onClick={() => showReviews(c)}>
                  المراجعات
                </button>
                <button style={{ ...styles.btn2('#059669'), marginInlineStart: 6 }} onClick={() => showWallet(c)}>
                  المحفظة
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* لوحة مراجعات الكابتن المختار */}
      {reviews && (
        <div style={styles.reviewsPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>مراجعات {reviews.captain?.name} — ⭐ {reviews.average} ({reviews.count})</h3>
            <button style={styles.btn2('#64748b')} onClick={() => setReviews(null)}>إغلاق</button>
          </div>

          {/* توزيع النجوم */}
          <div style={{ margin: '12px 0' }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const n = reviews.distribution?.[star] || 0;
              const pct = reviews.count ? (n / reviews.count) * 100 : 0;
              return (
                <div key={star} style={styles.distRow}>
                  <span style={{ width: 30 }}>{star}⭐</span>
                  <div style={styles.barTrack}>
                    <div style={{ ...styles.barFill, width: `${pct}%` }} />
                  </div>
                  <span style={{ width: 30, textAlign: 'left' }}>{n}</span>
                </div>
              );
            })}
          </div>

          {/* التعليقات */}
          {reviews.reviews?.length === 0 && <p style={styles.pill('#94a3b8')}>لا توجد تعليقات</p>}
          {reviews.reviews?.filter((r) => r.comment).map((r, i) => (
            <div key={i} style={styles.reviewItem}>
              <strong>{'⭐'.repeat(Math.round(r.stars))}</strong>
              <span> — {r.comment}</span>
            </div>
          ))}
        </div>
      )}

      {/* لوحة محفظة الكابتن (COD) */}
      {wallet && (
        <div style={styles.reviewsPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>محفظة {wallet.captain?.name}</h3>
            <button style={styles.btn2('#64748b')} onClick={() => setWallet(null)}>إغلاق</button>
          </div>
          <div style={styles.walletGrid}>
            <div style={styles.walletCell}><b>{wallet.deliveries}</b><span>توصيلة</span></div>
            <div style={styles.walletCell}><b>{wallet.gross} ₪</b><span>إجمالي محصّل</span></div>
            <div style={styles.walletCell}><b>{wallet.net} ₪</b><span>صافي الكابتن</span></div>
            <div style={styles.walletCell}><b>{wallet.commission} ₪</b><span>عمولة الشركة</span></div>
            <div style={{ ...styles.walletCell, background: wallet.owed > 0 ? '#fef2f2' : '#f0fdf4' }}>
              <b style={{ color: wallet.owed > 0 ? '#dc2626' : '#16a34a' }}>{wallet.owed} ₪</b>
              <span>مستحقّ للشركة</span>
            </div>
          </div>
          {wallet.owed > 0 && (
            <button style={styles.btn} onClick={() => settle(wallet.captain.id, wallet.owed)}>
              تسوية المستحقّ ({wallet.owed} ₪)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
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
  searchRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  addForm: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  search: { padding: '11px 14px', borderRadius: theme.radius.md, border: `1px solid ${theme.color.outlineStrong}` },
  table: { marginTop: 4 },
  btn: {
    background: theme.color.primary,
    color: theme.color.onPrimary,
    border: 'none',
    padding: '11px 18px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
  },
  btn2: (bg) => ({
    background: bg,
    color: '#fff',
    border: 'none',
    padding: '7px 14px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    fontSize: 13,
  }),
  pill: (bg) => ({
    background: bg,
    color: '#fff',
    padding: '3px 12px',
    borderRadius: theme.radius.pill,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }),
  reviewsPanel: {
    background: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    marginTop: 16,
    boxShadow: theme.shadow.card,
  },
  distRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  barTrack: { flex: 1, height: 10, background: theme.color.surfaceContainer, borderRadius: theme.radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', background: theme.color.primary, borderRadius: theme.radius.pill },
  reviewItem: { borderTop: `1px solid ${theme.color.outline}`, padding: '10px 0', color: theme.color.onSurfaceVariant },
  walletGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, margin: '14px 0' },
  walletCell: {
    background: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    textAlign: 'center',
    border: `1px solid ${theme.color.outline}`,
  },
};
