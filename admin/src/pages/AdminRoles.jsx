import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const ROLES = [
  ['super_admin', 'Super Admin'],
  ['operations', 'Operations'],
  ['support', 'Support'],
  ['finance', 'Finance'],
  ['marketing', 'Marketing'],
];

export default function AdminRoles() {
  const { access } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', password: '', adminRole: 'operations' });

  async function load() {
    setLoading(true); setError('');
    try { setRows(await api.get('/admin/access/admins')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (access.adminRole === 'super_admin') load(); else setLoading(false); }, [access.adminRole]);

  async function create(e) {
    e.preventDefault();
    try {
      await api.post('/admin/access/admins', form);
      setForm({ name: '', phone: '', password: '', adminRole: 'operations' });
      await load();
    } catch (e2) { setError(e2.message); }
  }

  async function patch(id, body) {
    try { await api.patch(`/admin/access/admins/${id}`, body); await load(); }
    catch (e) { setError(e.message); }
  }

  if (access.adminRole !== 'super_admin') {
    return <div className="yl-empty">إدارة صلاحيات الأدمن متاحة لـ Super Admin فقط.</div>;
  }

  return <div className="yl-stack">
    <div className="yl-pagehead">
      <div><h1>صلاحيات الإدارة</h1><p>أنشئ حسابات منفصلة للتشغيل والدعم والمال والتسويق بدل مشاركة حساب المدير الرئيسي.</p></div>
    </div>

    {error && <div className="yl-alert yl-alert--danger">{error}</div>}

    <form className="yl-card" onSubmit={create}>
      <h3>إضافة موظف إدارة</h3>
      <div className="yl-formgrid">
        <label>الاسم<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>الجوال<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
        <label>كلمة السر<input type="password" minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <label>الدور<select value={form.adminRole} onChange={(e) => setForm({ ...form, adminRole: e.target.value })}>{ROLES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
      </div>
      <button className="yl-btn yl-btn--primary" type="submit">إنشاء الحساب</button>
    </form>

    <div className="yl-card">
      <h3>حسابات الإدارة</h3>
      {loading ? <div className="yl-empty">جارٍ التحميل...</div> : <div className="yl-tablewrap"><table className="yl-table">
        <thead><tr><th>الاسم</th><th>الجوال</th><th>الدور</th><th>الحالة</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row._id || row.id}>
          <td>{row.name}</td><td>{row.phone}</td>
          <td><select value={row.adminRole || 'super_admin'} onChange={(e) => patch(row._id || row.id, { adminRole: e.target.value })}>{ROLES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></td>
          <td><button className="yl-btn yl-btn--ghost" onClick={() => patch(row._id || row.id, { isActive: !row.isActive })}>{row.isActive === false ? 'تفعيل' : 'تعطيل'}</button></td>
        </tr>)}</tbody>
      </table></div>}
    </div>
  </div>;
}
