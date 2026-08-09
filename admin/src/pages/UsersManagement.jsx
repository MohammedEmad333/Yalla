// صفحة إدارة المستخدمين والكباتن (لوحة الأدمن)
// تبويبان: العملاء (تفعيل/تعطيل) والكباتن (اعتماد + إضافة كابتن جديد).

import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function UsersManagement() {
  const [tab, setTab] = useState('users'); // users | captains
  return (
    <div style={styles.page}>
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

  const load = () => api.get('/admin/captains').then(setCaptains);
  useEffect(() => { load(); }, []);

  // اعتماد/إلغاء اعتماد كابتن
  async function toggleApprove(c) {
    const updated = await api.patch(`/admin/captains/${c._id}/approve`, { isApproved: !c.isApproved });
    setCaptains((prev) => prev.map((x) => (x._id === c._id ? { ...x, isApproved: updated.isApproved } : x)));
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: 'system-ui', padding: 24, background: '#f8fafc', minHeight: '100vh' },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
  tab: (active) => ({
    padding: '8px 20px', borderRadius: 8, cursor: 'pointer', border: 'none',
    background: active ? '#0f172a' : '#e2e8f0', color: active ? '#fff' : '#334155',
  }),
  searchRow: { display: 'flex', gap: 8, marginBottom: 16 },
  addForm: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  search: { padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden' },
  btn: { background: '#0f172a', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' },
  btn2: (bg) => ({ background: bg, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }),
  pill: (bg) => ({ background: bg, color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12 }),
};
