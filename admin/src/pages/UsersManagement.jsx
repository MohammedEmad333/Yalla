// صفحة إدارة المستخدمين والكباتن
// تبويبان: الزبائن (تفعيل/تعطيل + رصيد + حذف نهائي) والكباتن (اعتماد + إضافة +
// تعديل + مراجعات + محفظة + حذف). Cards 37/38/41/76/78/86/87/91.

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { VEHICLE_TYPES, vehicleLabel } from '../vehicles';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  TableWrap,
} from '../components/ui';
import { IconPlus, IconSearch, IconStar, IconUsers } from '../components/icons';

// Card 76: مسار الصورة النسبيّ من الخادم يحتاج عنوان الـ API
const avatarSrc = (url) => (url ? (url.startsWith('http') ? url : `${API}${url}`) : undefined);

// خلية الاسم مع الصورة (Card 76)
function NameCell({ url, name, children }) {
  return (
    <div className="yl-row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
      <Avatar src={avatarSrc(url)} name={name} size="sm" />
      <span className="yl-truncate">{name}</span>
      {children}
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
    online: { tone: 'success', label: 'متصل' },
    busy: { tone: 'warning', label: 'مشغول' },
    offline: { tone: 'neutral', label: 'غير متصل' },
  };
  const s = map[status] || map.offline;
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export default function UsersManagement() {
  const [tab, setTab] = useState('users'); // users | captains

  return (
    <>
      <PageHeader
        title="إدارة المستخدمين"
        subtitle="الزبائن والكباتن — التفعيل والاعتماد والمحافظ والحذف النهائي"
      />

      <div className="yl-chips" style={{ marginBottom: 'var(--s-5)' }}>
        <button className="yl-chip" aria-pressed={tab === 'users'} onClick={() => setTab('users')}>الزبائن</button>
        <button className="yl-chip" aria-pressed={tab === 'captains'} onClick={() => setTab('captains')}>الكباتن</button>
      </div>

      {tab === 'users' ? <UsersTab /> : <CaptainsTab />}
    </>
  );
}

// Card 91: نافذة تفاصيل الحساب — صفوف «تسمية: قيمة» مع صورة الحساب.
function AccountDetailsModal({ title, avatarUrl, name, rows, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="yl-row" style={{ marginBottom: 'var(--s-4)' }}>
        <Avatar src={avatarSrc(avatarUrl)} name={name} size="lg" />
        <b style={{ fontSize: 'var(--fs-lg)' }}>{name}</b>
      </div>
      <dl className="yl-deflist">
        {rows
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
    </Modal>
  );
}

// ── تبويب الزبائن (Card 41) ────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);       // Card 91: الحساب المعروضة تفاصيله
  const [crediting, setCrediting] = useState(null); // الزبون المطلوب إضافة رصيد له

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
    <>
      <div className="yl-toolbar">
        <SearchInput
          placeholder="بحث بالاسم أو الهاتف"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <Button variant="primary" icon={<IconSearch size={18} />} onClick={load}>بحث</Button>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={<IconUsers size={26} />} title="لا يوجد زبائن" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>العنوان</th>
              <th>الرصيد</th>
              <th>الانضمام</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="الاسم">
                  <NameCell url={u.avatarUrl} name={u.name}>
                    {/* Card 80: تمييز الحساب الخارجي المؤقّت عن الدائم */}
                    {u.isExternal && <Badge tone="warning">مؤقّت</Badge>}
                  </NameCell>
                </td>
                <td data-label="الهاتف" className="yl-num">{u.phone}</td>
                <td data-label="العنوان">{u.address || '—'}</td>
                <td data-label="الرصيد"><b className="yl-num">{u.balance} ₪</b></td>
                <td data-label="الانضمام" className="yl-nowrap">{fmtDate(u.createdAt)}</td>
                <td data-label="الحالة">
                  <Badge tone={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'مفعّل' : 'معطّل'}</Badge>
                </td>
                <td data-label="إجراء" className="yl-td-actions">
                  <div className="yl-btnrow">
                    <Button size="sm" onClick={() => setDetail(u)}>تفاصيل</Button>
                    <Button size="sm" variant="success" onClick={() => setCrediting(u)}>إضافة رصيد</Button>
                    <Button
                      size="sm"
                      variant={u.isActive ? 'warning' : 'success'}
                      onClick={() => toggle(u)}
                    >
                      {u.isActive ? 'تعطيل' : 'تفعيل'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(u)}>حذف نهائي</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

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
            ['المحافظة', detail.governorate || '—'],
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
    </>
  );
}

// ── نافذة إضافة/تعديل رصيد محفظة زبون ───────────────────────────
// Card 87: للحسابات الخارجية المؤقّتة يمكن أيضًا تعديل الرصيد على قيمة محدّدة.
function CreditUserModal({ user, onClose, onCredited }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 'add' = إضافة مبلغ للرصيد | 'set' = تعيين الرصيد على قيمة محدّدة (خارجي فقط)
  const [mode, setMode] = useState('add');

  async function submit(e) {
    e.preventDefault();
    const value = Number(amount);
    if (mode === 'add' ? !(value > 0) : !(value >= 0)) {
      setError(mode === 'add' ? 'أدخل مبلغًا صحيحًا أكبر من صفر' : 'أدخل رصيدًا صحيحًا (≥ 0)');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { balance } =
        mode === 'add'
          ? await api.post(`/admin/users/${user.id}/wallet/add`, { amount: value })
          : await api.patch(`/admin/users/${user.id}/wallet/balance`, { balance: value });
      onCredited(balance);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'add' ? 'إضافة رصيد' : 'تعديل الرصيد'} onClose={onClose}>
      <form onSubmit={submit} className="yl-stack">
        <div className="yl-row">
          <Avatar src={avatarSrc(user.avatarUrl)} name={user.name} size="lg" />
          <div>
            <b style={{ fontSize: 'var(--fs-lg)' }}>{user.name}</b>
            <div className="yl-muted">الرصيد الحالي: {user.balance} ₪</div>
          </div>
        </div>

        {/* Card 87: تبديل بين الإضافة والتعديل للحسابات الخارجية المؤقّتة */}
        {user.isExternal && (
          <div className="yl-chips">
            <button
              type="button"
              className="yl-chip"
              aria-pressed={mode === 'add'}
              onClick={() => { setMode('add'); setError(''); }}
            >
              إضافة مبلغ
            </button>
            <button
              type="button"
              className="yl-chip"
              aria-pressed={mode === 'set'}
              onClick={() => { setMode('set'); setError(''); setAmount(String(user.balance ?? '')); }}
            >
              تعديل الرصيد
            </button>
          </div>
        )}

        <Field label={mode === 'add' ? 'المبلغ المضاف (₪)' : 'الرصيد الجديد (₪)'}>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مثال: 50"
            autoFocus
            required
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="yl-btnrow">
          <Button variant="primary" type="submit" disabled={busy} loading={busy}>
            {mode === 'add' ? 'إضافة' : 'حفظ الرصيد'}
          </Button>
          <Button type="button" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── تبويب الكباتن (Card 37) ────────────────────────────────────
function CaptainsTab() {
  const [captains, setCaptains] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', password: '', vehicleType: 'motorcycle' });
  const [reviews, setReviews] = useState(null); // مراجعات الكابتن المعروض حاليًا
  const [wallet, setWallet] = useState(null);   // محفظة الكابتن المعروض حاليًا
  const [editing, setEditing] = useState(null); // Card 78: الكابتن قيد التعديل
  const [detail, setDetail] = useState(null);   // Card 91: الكابتن المعروضة تفاصيله
  const [adding, setAdding] = useState(false);  // إظهار نموذج إضافة كابتن

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

  // اعتماد/إلغاء اعتماد كابتن — Card 86: تنبيه تأكيد عند إلغاء الاعتماد
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

  // جلب مراجعات كابتن
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
      setAdding(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="yl-toolbar">
        <Button variant="primary" icon={<IconPlus size={18} />} onClick={() => setAdding((v) => !v)}>
          {adding ? 'إخفاء النموذج' : 'إضافة كابتن'}
        </Button>
      </div>

      {/* نموذج إضافة كابتن */}
      {adding && (
        <Card title="كابتن جديد" className="yl-mb-4">
          <form onSubmit={addCaptain}>
            <div className="yl-formgrid">
              <Field label="الاسم">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="الهاتف">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </Field>
              <Field label="كلمة المرور">
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="المركبة">
                <Select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ marginTop: 'var(--s-4)' }}>
              <Button variant="primary" type="submit" icon={<IconPlus size={18} />}>إضافة الكابتن</Button>
            </div>
          </form>
        </Card>
      )}

      {captains.length === 0 ? (
        <EmptyState icon={<IconUsers size={26} />} title="لا يوجد كباتن مسجّلون" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>المركبة</th>
              <th>الحالة</th>
              <th>التقييم</th>
              <th>الرصيد</th>
              <th>الانضمام</th>
              <th>الاعتماد</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {captains.map((c) => (
              <tr key={c.id}>
                <td data-label="الاسم"><NameCell url={c.avatarUrl} name={c.name} /></td>
                <td data-label="الهاتف" className="yl-num">{c.phone}</td>
                <td data-label="المركبة">
                  {vehicleLabel(c.vehicleType)}{c.vehiclePlate ? ` · ${c.vehiclePlate}` : ''}
                </td>
                <td data-label="الحالة"><StatusBadge status={c.status} /></td>
                <td data-label="التقييم" className="yl-nowrap">
                  <span className="yl-row" style={{ gap: 4, color: 'var(--warning)' }}>
                    <IconStar size={15} />
                    <span className="yl-num" style={{ color: 'var(--text)' }}>
                      {c.rating} ({c.ratingsCount})
                    </span>
                  </span>
                </td>
                <td data-label="الرصيد"><b className="yl-num">{c.balance} ₪</b></td>
                <td data-label="الانضمام" className="yl-nowrap">{fmtDate(c.createdAt)}</td>
                <td data-label="الاعتماد">
                  <Badge tone={c.isApproved ? 'success' : 'warning'}>
                    {c.isApproved ? 'معتمَد' : 'قيد المراجعة'}
                  </Badge>
                </td>
                <td data-label="إجراء" className="yl-td-actions">
                  <div className="yl-btnrow">
                    <Button size="sm" onClick={() => setDetail(c)}>تفاصيل</Button>
                    <Button
                      size="sm"
                      variant={c.isApproved ? 'warning' : 'success'}
                      onClick={() => toggleApprove(c)}
                    >
                      {c.isApproved ? 'إلغاء الاعتماد' : 'اعتماد'}
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => setEditing(c)}>تعديل</Button>
                    <Button size="sm" onClick={() => showReviews(c)}>المراجعات</Button>
                    <Button size="sm" variant="success" onClick={() => showWallet(c)}>المحفظة</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(c)}>حذف</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {/* مراجعات الكابتن المختار */}
      {reviews && (
        <Modal
          title={`مراجعات ${reviews.captain?.name || ''} — ${reviews.average} (${reviews.count})`}
          onClose={() => setReviews(null)}
        >
          {/* توزيع النجوم */}
          <div className="yl-stack yl-stack--sm" style={{ marginBottom: 'var(--s-4)' }}>
            {[5, 4, 3, 2, 1].map((star) => {
              const n = reviews.distribution?.[star] || 0;
              const pct = reviews.count ? (n / reviews.count) * 100 : 0;
              return (
                <div className="yl-row" key={star} style={{ flexWrap: 'nowrap' }}>
                  <span className="yl-nowrap" style={{ width: 42 }}>{star} ★</span>
                  <div className="yl-bar"><div className="yl-bar__fill" style={{ width: `${pct}%` }} /></div>
                  <span className="yl-num" style={{ width: 30, textAlign: 'end' }}>{n}</span>
                </div>
              );
            })}
          </div>

          {/* التعليقات */}
          {reviews.reviews?.filter((r) => r.comment).length === 0 && (
            <p className="yl-muted">لا توجد تعليقات</p>
          )}
          <div className="yl-stack yl-stack--sm">
            {reviews.reviews?.filter((r) => r.comment).map((r, i) => (
              <div className="yl-card yl-card--flat yl-card--pad" key={i}>
                <b style={{ color: 'var(--warning)' }}>{'★'.repeat(Math.round(r.stars))}</b>
                <p className="yl-soft">{r.comment}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* محفظة الكابتن (COD) */}
      {wallet && (
        <Modal
          title={`محفظة ${wallet.captain?.name || ''}`}
          onClose={() => setWallet(null)}
          footer={
            wallet.owed > 0 && (
              <Button variant="primary" onClick={() => settle(wallet.captain.id, wallet.owed)}>
                تسوية المستحقّ ({wallet.owed} ₪)
              </Button>
            )
          }
        >
          <div className="yl-grid yl-grid--stats">
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.deliveries}</div><div className="yl-stat__label">توصيلة</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.gross} ₪</div><div className="yl-stat__label">إجمالي محصّل</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.net} ₪</div><div className="yl-stat__label">صافي الكابتن</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.commission} ₪</div><div className="yl-stat__label">عمولة الشركة</div></div></div>
            <div className="yl-stat">
              <div>
                <div
                  className="yl-stat__value yl-num"
                  style={{ color: wallet.owed > 0 ? 'var(--danger)' : 'var(--success)' }}
                >
                  {wallet.owed} ₪
                </div>
                <div className="yl-stat__label">مستحقّ للشركة</div>
              </div>
            </div>
          </div>
        </Modal>
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
            ['التقييم', `${detail.rating} (${detail.ratingsCount})`],
            ['الرصيد المتوفّر للسحب', `${detail.balance} ₪`],
            ['تاريخ الانضمام', fmtDate(detail.createdAt)],
          ]}
        />
      )}
    </>
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
  const [avatar, setAvatar] = useState(captain.avatarUrl);

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
      setAvatar(data.avatarUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="تعديل حساب الكابتن" onClose={onClose}>
      <form onSubmit={save} className="yl-stack">
        <div className="yl-row">
          <Avatar src={avatarSrc(avatar)} name={form.name} size="lg" />
          <label className="yl-btn yl-btn--outline yl-btn--sm">
            تغيير الصورة
            <input type="file" accept="image/*" onChange={uploadAvatar} style={{ display: 'none' }} />
          </label>
        </div>

        <div className="yl-formgrid">
          <Field label="الاسم">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="رقم الجوال">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </Field>
          <Field label="المركبة">
            <Select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="لوحة المركبة">
            <Input value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} />
          </Field>
        </div>

        <Field label="كلمة سر جديدة" hint="اتركها فارغة لعدم التغيير">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••"
            autoComplete="new-password"
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="yl-btnrow">
          <Button variant="primary" type="submit" disabled={busy} loading={busy}>حفظ</Button>
          <Button type="button" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}
