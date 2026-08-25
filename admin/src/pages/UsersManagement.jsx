// صفحة إدارة المستخدمين والكباتن (لوحة الأدمن)
// تبويبان: الزبائن (تفعيل/تعطيل + حذف نهائي) والكباتن (اعتماد + إضافة + حذف نهائي).
// Card 37: جدول كامل بالكباتن المسجّلين.  Card 38: حذف نهائي.  Card 41: تفاصيل كاملة
// (رقم/اسم/عنوان/رصيد متوفّر/تاريخ الانضمام) مع علامة تمييز حالة الكابتن (Card 35).

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { theme } from '../theme';
import { VEHICLE_TYPES, vehicleLabel } from '../vehicles';

// Card 76: صورة الحساب (كابتن/عميل) بجانب الاسم. avatarUrl مسار نسبيّ من الخادم
// (/uploads/avatars/..)، فنضيف عنوان الـ API. عند غياب الصورة نعرض بديلًا بأوّل حرف.
function Avatar({ url, name }) {
  const src = url ? (url.startsWith('http') ? url : `${API}${url}`) : '';
  if (src) {
    return <img src={src} alt={name || ''} style={styles.avatar} loading="lazy" />;
  }
  const initial = (name || '؟').trim().charAt(0) || '؟';
  return <span style={styles.avatarFallback}>{initial}</span>;
}

// خلية الاسم مع الصورة (Card 76)
function NameCell({ url, name }) {
  return (
    <div style={styles.nameCell}>
      <Avatar url={url} name={name} />
      <span>{name}</span>
    </div>
  );
}

// تنسيق تاريخ الانضمام بالعربية
function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

// شارة حالة الكابتن (online / offline / busy) — Card 35
function StatusBadge({ status }) {
  const map = {
    online: { bg: '#16a34a', label: '🟢 متصل' },
    busy: { bg: '#f59e0b', label: '🟠 مشغول' },
    offline: { bg: '#94a3b8', label: '⚪ غير متصل' },
  };
  const s = map[status] || map.offline;
  return <span style={styles.pill(s.bg)}>{s.label}</span>;
}

export default function UsersManagement() {
  const [tab, setTab] = useState('users'); // users | captains
  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>إدارة المستخدمين</h1>
      <p style={styles.subtitle}>الزبائن والكباتن — التفعيل والاعتماد والمحافظ والحذف النهائي</p>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'users')} onClick={() => setTab('users')}>الزبائن</button>
        <button style={styles.tab(tab === 'captains')} onClick={() => setTab('captains')}>الكباتن</button>
      </div>
      {tab === 'users' ? <UsersTab /> : <CaptainsTab />}
    </div>
  );
}

// Card 91: نافذة تفاصيل الحساب — تُعرض عند ضغط الأدمن على أي حساب (زبون/كابتن).
// تعرض الصورة وكل معلومات الحساب في صفوف «تسمية: قيمة».
function AccountDetailsModal({ title, avatarUrl, name, rows, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
        <div style={styles.modalHead}>
          <b>{title}</b>
          <button style={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Avatar url={avatarUrl} name={name} />
            <b style={{ fontSize: 16 }}>{name}</b>
          </div>
          {rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([label, value]) => (
            <div key={label} style={styles.detailRow}>
              <span style={styles.detailLabel}>{label}</span>
              <span style={styles.detailValue}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── تبويب الزبائن (Card 41) ────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null); // Card 91: الحساب المعروضة تفاصيله
  const [crediting, setCrediting] = useState(null); // الزبون المطلوب إضافة رصيد له (أو null)

  const load = () =>
    api.get(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setUsers);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // تبديل تفعيل الزبون — Card 86: تنبيه تأكيد عند التعطيل
  async function toggle(u) {
    if (u.isActive && !window.confirm(`هل أنت متأكد من تعطيل حساب "${u.name}"؟ لن يستطيع الدخول.`)) return;
    const updated = await api.patch(`/admin/users/${u.id}/active`, { isActive: !u.isActive });
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: updated.isActive } : x)));
  }

  // حذف نهائي للزبون (Card 38)
  async function remove(u) {
    if (!window.confirm(`حذف الزبون "${u.name}" نهائيًا من الذاكرة؟ لا يمكن التراجع.`)) return;
    try {
      await api.del(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      alert(err.message);
    }
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

      <div className="yl-table-wrap">
        {/* Card 6: yl-rtable يحوّل الجدول إلى بطاقات مكدّسة على الجوّال */}
        <table className="yl-rtable" style={styles.table}>
          <thead>
            <tr>
              <th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الرصيد المتوفّر</th>
              <th>تاريخ الانضمام</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="الاسم">
                  <div style={styles.nameCell}>
                    <Avatar url={u.avatarUrl} name={u.name} />
                    <span>{u.name}</span>
                    {/* Card 80: تمييز الحساب الخارجي المؤقّت عن الدائم */}
                    {u.isExternal && <span style={styles.externalBadge} title="حساب خارجي مؤقّت يُحذف بعد انتهاء طلبه">مؤقّت</span>}
                  </div>
                </td>
                <td data-label="الهاتف">{u.phone}</td>
                <td data-label="العنوان">{u.address || '—'}</td>
                <td data-label="الرصيد المتوفّر"><b>{u.balance} ₪</b></td>
                <td data-label="تاريخ الانضمام">{fmtDate(u.createdAt)}</td>
                <td data-label="الحالة">
                  <span style={styles.pill(u.isActive ? '#16a34a' : '#dc2626')}>
                    {u.isActive ? 'مفعّل' : 'معطّل'}
                  </span>
                </td>
                <td data-label="إجراء" className="yl-actions">
                  <div className="yl-btnrow">
                    {/* Card 91: عرض كل معلومات الحساب */}
                    <button style={styles.btn2('#334155')} onClick={() => setDetail(u)}>
                      تفاصيل
                    </button>
                    {/* إضافة رصيد لمحفظة الزبون */}
                    <button style={styles.btn2('#059669')} onClick={() => setCrediting(u)}>
                      إضافة رصيد
                    </button>
                    <button style={styles.btn2(u.isActive ? '#dc2626' : '#16a34a')} onClick={() => toggle(u)}>
                      {u.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button style={styles.btn2('#991b1b')} onClick={() => remove(u)}>
                      حذف نهائي
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: theme.color.muted }}>لا يوجد زبائن</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Card 91: تفاصيل حساب الزبون */}
      {detail && (
        <AccountDetailsModal
          title="تفاصيل حساب الزبون"
          avatarUrl={detail.avatarUrl}
          name={detail.name}
          onClose={() => setDetail(null)}
          rows={[
            ['رقم الجوال', detail.phone],
            ['البريد الإلكتروني', detail.email],
            ['العنوان', detail.address],
            ['الرصيد المتوفّر', `${detail.balance} ₪`],
            ['نوع الحساب', detail.isExternal ? 'خارجي مؤقّت' : 'دائم'],
            ['الحالة', detail.isActive ? 'مفعّل' : 'معطّل'],
            ['تاريخ الانضمام', fmtDate(detail.createdAt)],
          ]}
        />
      )}

      {/* نافذة إضافة رصيد لمحفظة الزبون */}
      {crediting && (
        <CreditUserModal
          user={crediting}
          onClose={() => setCrediting(null)}
          onCredited={(balance) => {
            setUsers((prev) => prev.map((x) => (x.id === crediting.id ? { ...x, balance } : x)));
            setCrediting(null);
          }}
        />
      )}
    </div>
  );
}

// ── نافذة إضافة رصيد لمحفظة زبون ────────────────────────────────
function CreditUserModal({ user, onClose, onCredited }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) {
      setError('أدخل مبلغًا صحيحًا أكبر من صفر');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { balance } = await api.post(`/admin/users/${user.id}/wallet/add`, { amount: value });
      onCredited(balance);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
        <div style={styles.modalHead}>
          <b>إضافة رصيد</b>
          <button style={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} style={styles.modalBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar url={user.avatarUrl} name={user.name} />
            <div>
              <b style={{ fontSize: 16 }}>{user.name}</b>
              <div style={{ color: theme.color.muted, fontSize: 13 }}>الرصيد الحالي: {user.balance} ₪</div>
            </div>
          </div>
          <label style={styles.field}>
            <span>المبلغ المضاف (₪)</span>
            <input
              style={styles.search}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مثال: 50"
              autoFocus
              required
            />
          </label>
          {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button style={styles.btn} type="submit" disabled={busy}>
              {busy ? '...' : 'إضافة'}
            </button>
            <button style={styles.btn2('#64748b')} type="button" onClick={onClose}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── تبويب الكباتن (Card 37) ────────────────────────────────────
function CaptainsTab() {
  const [captains, setCaptains] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '', vehicleType: 'motorcycle' });
  const [reviews, setReviews] = useState(null); // مراجعات الكابتن المعروض حاليًا
  const [wallet, setWallet] = useState(null);   // محفظة الكابتن المعروض حاليًا
  const [editing, setEditing] = useState(null); // Card 78: الكابتن قيد التعديل (أو null)
  const [detail, setDetail] = useState(null);   // Card 91: الكابتن المعروضة تفاصيله

  const load = () => api.get('/admin/captains/detailed').then(setCaptains);
  useEffect(() => { load(); }, []);

  // جلب محفظة كابتن (COD)
  async function showWallet(c) {
    const data = await api.get(`/admin/captains/${c.id}/wallet`);
    setWallet(data);
  }

  // تسوية كامل المستحقّ على الكابتن
  async function settle(captainId, owed) {
    if (owed <= 0) return;
    await api.post(`/admin/captains/${captainId}/settle`, { amount: owed });
    showWallet({ id: captainId }); // إعادة تحميل المحفظة
  }

  // اعتماد/إلغاء اعتماد كابتن — Card 86: تنبيه تأكيد عند إلغاء الاعتماد (تعطيل)
  async function toggleApprove(c) {
    if (c.isApproved && !window.confirm(`هل أنت متأكد من إلغاء اعتماد الكابتن "${c.name}"؟ لن يستقبل طلبات.`)) return;
    const updated = await api.patch(`/admin/captains/${c.id}/approve`, { isApproved: !c.isApproved });
    setCaptains((prev) => prev.map((x) => (x.id === c.id ? { ...x, isApproved: updated.isApproved } : x)));
  }

  // حذف نهائي للكابتن (Card 38)
  async function remove(c) {
    if (!window.confirm(`حذف الكابتن "${c.name}" نهائيًا من الذاكرة؟ لا يمكن التراجع.`)) return;
    try {
      await api.del(`/admin/captains/${c.id}`);
      setCaptains((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      alert(err.message);
    }
  }

  // جلب مراجعات كابتن وعرضها في لوحة أسفل الجدول
  async function showReviews(c) {
    const data = await api.get(`/captains/${c.id}/reviews`);
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
          {VEHICLE_TYPES.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
        <button style={styles.btn} type="submit">+ إضافة كابتن</button>
      </form>

      <div className="yl-table-wrap">
        {/* Card 6: yl-rtable يحوّل الجدول إلى بطاقات مكدّسة على الجوّال */}
        <table className="yl-rtable" style={styles.table}>
          <thead>
            <tr>
              <th>الاسم</th><th>الهاتف</th><th>المركبة</th><th>الحالة</th><th>التقييم</th>
              <th>الرصيد المتوفّر</th><th>تاريخ الانضمام</th><th>الاعتماد</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {captains.map((c) => (
              <tr key={c.id}>
                <td data-label="الاسم"><NameCell url={c.avatarUrl} name={c.name} /></td>
                <td data-label="الهاتف">{c.phone}</td>
                <td data-label="المركبة">{vehicleLabel(c.vehicleType)}{c.vehiclePlate ? ` · ${c.vehiclePlate}` : ''}</td>
                <td data-label="الحالة"><StatusBadge status={c.status} /></td>
                <td data-label="التقييم">⭐ {c.rating} ({c.ratingsCount})</td>
                <td data-label="الرصيد المتوفّر"><b>{c.balance} ₪</b></td>
                <td data-label="تاريخ الانضمام">{fmtDate(c.createdAt)}</td>
                <td data-label="الاعتماد">
                  <span style={styles.pill(c.isApproved ? '#16a34a' : '#f59e0b')}>
                    {c.isApproved ? 'معتمَد' : 'قيد المراجعة'}
                  </span>
                </td>
                <td data-label="إجراء" className="yl-actions">
                  <div className="yl-btnrow">
                    {/* Card 91: عرض كل معلومات حساب الكابتن */}
                    <button style={styles.btn2('#334155')} onClick={() => setDetail(c)}>
                      تفاصيل
                    </button>
                    <button style={styles.btn2(c.isApproved ? '#f59e0b' : '#16a34a')} onClick={() => toggleApprove(c)}>
                      {c.isApproved ? 'إلغاء' : 'اعتماد'}
                    </button>
                    {/* Card 78: تعديل بيانات حساب الكابتن */}
                    <button style={styles.btn2('#2563eb')} onClick={() => setEditing(c)}>
                      تعديل
                    </button>
                    <button style={styles.btn2('#334155')} onClick={() => showReviews(c)}>
                      المراجعات
                    </button>
                    <button style={styles.btn2('#059669')} onClick={() => showWallet(c)}>
                      المحفظة
                    </button>
                    <button style={styles.btn2('#991b1b')} onClick={() => remove(c)}>
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {captains.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: theme.color.muted }}>لا يوجد كباتن مسجّلون</td></tr>
            )}
          </tbody>
        </table>
      </div>

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

      {/* Card 78: نافذة تعديل بيانات حساب الكابتن */}
      {editing && (
        <EditCaptainModal
          captain={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {/* Card 91: تفاصيل حساب الكابتن */}
      {detail && (
        <AccountDetailsModal
          title="تفاصيل حساب الكابتن"
          avatarUrl={detail.avatarUrl}
          name={detail.name}
          onClose={() => setDetail(null)}
          rows={[
            ['رقم الجوال', detail.phone],
            ['نوع المركبة', vehicleLabel(detail.vehicleType)],
            ['لوحة المركبة', detail.vehiclePlate],
            ['الحالة', detail.status === 'online' ? 'متصل' : detail.status === 'busy' ? 'مشغول' : 'غير متصل'],
            ['الاعتماد', detail.isApproved ? 'معتمَد' : 'قيد المراجعة'],
            ['التقييم', `⭐ ${detail.rating} (${detail.ratingsCount})`],
            ['الرصيد المتوفّر للسحب', `${detail.balance} ₪`],
            ['تاريخ الانضمام', fmtDate(detail.createdAt)],
          ]}
        />
      )}
    </div>
  );
}

// ── Card 78: نافذة تعديل حساب كابتن (اسم/جوال/مركبة/كلمة سر + صورة) ──
function EditCaptainModal({ captain, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: captain.name || '',
    phone: captain.phone || '',
    vehicleType: captain.vehicleType || 'motorcycle',
    vehiclePlate: captain.vehiclePlate || '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // حفظ الحقول النصّية — نُرسل كلمة السر فقط إن كُتبت (تغيير اختياري)
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      vehicleType: form.vehicleType,
      vehiclePlate: form.vehiclePlate.trim(),
    };
    if (form.password) payload.password = form.password;
    try {
      await api.patch(`/admin/captains/${captain.id}`, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // رفع صورة الكابتن (multipart) — مسار أدمن مخصّص
  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch(`${API}/api/admin/captains/${captain.id}/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || 'تعذّر رفع الصورة');
      captain.avatarUrl = data.avatarUrl; // تحديث فوري للمعاينة
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
        <div style={styles.modalHead}>
          <b>تعديل حساب الكابتن</b>
          <button style={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={save} style={styles.modalBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar url={captain.avatarUrl} name={form.name} />
            <label style={styles.uploadLabel}>
              تغيير الصورة
              <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: 'none' }} />
            </label>
          </div>
          <label style={styles.field}>
            <span>الاسم</span>
            <input style={styles.search} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label style={styles.field}>
            <span>رقم الجوال</span>
            <input style={styles.search} value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </label>
          <label style={styles.field}>
            <span>المركبة</span>
            <select style={styles.search} value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </label>
          <label style={styles.field}>
            <span>لوحة المركبة</span>
            <input style={styles.search} value={form.vehiclePlate}
              onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} />
          </label>
          <label style={styles.field}>
            <span>كلمة سر جديدة (اتركها فارغة لعدم التغيير)</span>
            <input style={styles.search} type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••" autoComplete="new-password" />
          </label>
          {error && <p style={{ color: '#dc2626', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button style={styles.btn} type="submit" disabled={busy}>
              {busy ? '...' : 'حفظ'}
            </button>
            <button style={styles.btn2('#64748b')} type="button" onClick={onClose}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1280, margin: '0 auto' },
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
  // Card 76: صورة الحساب وبديلها في خلية الاسم
  nameCell: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${theme.color.outline}`, flexShrink: 0 },
  avatarFallback: {
    width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: theme.color.surfaceContainer, color: theme.color.muted, fontWeight: 700, flexShrink: 0,
  },
  // Card 80: شارة الحساب الخارجي المؤقّت
  externalBadge: {
    background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
    borderRadius: theme.radius.pill, padding: '1px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
  },
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
  // Card 78: نافذة تعديل الكابتن
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'grid', placeItems: 'center', zIndex: 50, padding: 16,
  },
  modal: {
    background: theme.color.card, borderRadius: theme.radius.lg, width: '100%',
    maxWidth: 460, boxShadow: theme.shadow.float, direction: 'rtl',
  },
  modalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', borderBottom: `1px solid ${theme.color.outline}`,
  },
  modalClose: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: theme.color.muted },
  modalBody: { padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '75vh', overflowY: 'auto' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: theme.color.muted },
  // Card 91: صفوف تفاصيل الحساب
  detailRow: {
    display: 'flex', justifyContent: 'space-between', gap: 12,
    padding: '8px 0', borderBottom: `1px solid ${theme.color.outline}`, fontSize: 14,
  },
  detailLabel: { color: theme.color.muted },
  detailValue: { color: theme.color.onSurface, fontWeight: 600, textAlign: 'left' },
  uploadLabel: {
    background: theme.color.surfaceContainer, color: theme.color.onSurfaceVariant,
    padding: '8px 14px', borderRadius: theme.radius.pill, cursor: 'pointer', fontSize: 13,
  },
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
