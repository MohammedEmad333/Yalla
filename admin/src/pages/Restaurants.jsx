// صفحة إدارة المطاعم وقوائم الطعام (Card 110)
// يضيف الأدمن مطعمًا (اسم/تصنيف/مدينة وحي/حدّ أدنى/زمن تحضير/صورة)، ثمّ يدير
// أصناف قائمته. ما يُضاف هنا يظهر فورًا في تبويب «المطاعم» داخل تطبيق الزبون.

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { theme } from '../theme';

// قالب مطعم جديد فارغ
const EMPTY_RESTAURANT = {
  name: '',
  description: '',
  category: 'مطاعم',
  imageUrl: '',
  phone: '',
  city: '',
  neighborhood: '',
  street: '',
  minOrder: 0,
  prepMinutes: 15,
  isOpen: true,
  active: true,
};

const EMPTY_ITEM = { name: '', description: '', category: '', price: '', available: true };

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [hoods, setHoods] = useState({}); // {المدينة: [الأحياء]}
  const [selected, setSelected] = useState(null); // المطعم المفتوح للتحرير
  const [form, setForm] = useState(EMPTY_RESTAURANT);
  const [menu, setMenu] = useState([]);
  const [item, setItem] = useState(EMPTY_ITEM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
    api.get('/neighborhoods?grouped=1').then(setHoods).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      setRestaurants(await api.get('/admin/restaurants'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // فتح مطعم للتحرير + جلب قائمته
  async function openRestaurant(r) {
    setSelected(r);
    setForm({ ...EMPTY_RESTAURANT, ...r });
    setItem(EMPTY_ITEM);
    setMessage('');
    setError('');
    try {
      setMenu(await api.get(`/admin/restaurants/${r._id}/menu`));
    } catch (err) {
      setError(err.message);
    }
  }

  // بدء إضافة مطعم جديد
  function startNew() {
    setSelected(null);
    setForm(EMPTY_RESTAURANT);
    setMenu([]);
    setItem(EMPTY_ITEM);
    setMessage('');
    setError('');
  }

  async function saveRestaurant() {
    setError('');
    setMessage('');
    if (!form.name.trim()) return setError('اسم المطعم مطلوب');
    setSaving(true);
    try {
      const body = {
        ...form,
        minOrder: Number(form.minOrder) || 0,
        prepMinutes: Number(form.prepMinutes) || 0,
      };
      const saved = selected
        ? await api.patch(`/admin/restaurants/${selected._id}`, body)
        : await api.post('/admin/restaurants', body);
      setMessage(selected ? 'تم حفظ التعديلات' : 'تمت إضافة المطعم');
      await load();
      await openRestaurant(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeRestaurant(r) {
    if (!window.confirm(`حذف «${r.name}» وكلّ أصناف قائمته؟`)) return;
    try {
      await api.del(`/admin/restaurants/${r._id}`);
      startNew();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addItem() {
    setError('');
    if (!selected) return setError('احفظ المطعم أولًا ثمّ أضف أصناف القائمة');
    if (!item.name.trim()) return setError('اسم الصنف مطلوب');
    if (!(Number(item.price) > 0)) return setError('سعر الصنف مطلوب');
    try {
      await api.post(`/admin/restaurants/${selected._id}/menu`, {
        ...item,
        price: Number(item.price),
      });
      setItem(EMPTY_ITEM);
      setMenu(await api.get(`/admin/restaurants/${selected._id}/menu`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleItem(it) {
    try {
      await api.patch(`/admin/menu-items/${it._id}`, { available: !it.available });
      setMenu(await api.get(`/admin/restaurants/${selected._id}/menu`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeItem(it) {
    if (!window.confirm(`حذف الصنف «${it.name}»؟`)) return;
    try {
      await api.del(`/admin/menu-items/${it._id}`);
      setMenu(await api.get(`/admin/restaurants/${selected._id}/menu`));
    } catch (err) {
      setError(err.message);
    }
  }

  const cities = Object.keys(hoods);
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value, ...(key === 'city' ? { neighborhood: '' } : {}) }));
  };

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>المطاعم</h1>
      <p style={styles.subtitle}>
        أضف المطاعم وقوائم طعامها — تظهر مباشرةً في تبويب «المطاعم» داخل تطبيق الزبون
      </p>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <div style={styles.grid}>
        {/* عمود قائمة المطاعم */}
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <b>المطاعم ({restaurants.length})</b>
            <button style={styles.primaryBtn} onClick={startNew}>
              + مطعم جديد
            </button>
          </div>

          {loading ? (
            <p style={styles.muted}>...جارٍ التحميل</p>
          ) : restaurants.length === 0 ? (
            <p style={styles.muted}>لا توجد مطاعم بعد — ابدأ بإضافة مطعم</p>
          ) : (
            <ul style={styles.list}>
              {restaurants.map((r) => (
                <li key={r._id}>
                  <button
                    style={styles.listItem(selected?._id === r._id)}
                    onClick={() => openRestaurant(r)}
                  >
                    <span>
                      <b>{r.name}</b>
                      <span style={styles.muted}> · {r.category}</span>
                    </span>
                    <span style={styles.badge(r.active && r.isOpen)}>
                      {!r.active ? 'معطّل' : r.isOpen ? 'مفتوح' : 'مغلق'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* عمود التحرير: بيانات المطعم + قائمته */}
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <b>{selected ? `تعديل: ${selected.name}` : 'مطعم جديد'}</b>
            {selected && (
              <button style={styles.dangerBtn} onClick={() => removeRestaurant(selected)}>
                حذف المطعم
              </button>
            )}
          </div>

          <div style={styles.formGrid}>
            <Field label="الاسم">
              <input style={styles.input} value={form.name} onChange={set('name')} />
            </Field>
            <Field label="التصنيف">
              <input
                style={styles.input}
                value={form.category}
                onChange={set('category')}
                placeholder="مشاوي، بيتزا، حلويات..."
              />
            </Field>
            <Field label="المدينة">
              <select style={styles.input} value={form.city} onChange={set('city')}>
                <option value="">— اختر —</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الحي (يحدّد موقع المطعم)">
              <select
                style={styles.input}
                value={form.neighborhood}
                onChange={set('neighborhood')}
                disabled={!form.city}
              >
                <option value="">— اختر —</option>
                {(hoods[form.city] || []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الشارع">
              <input style={styles.input} value={form.street} onChange={set('street')} />
            </Field>
            <Field label="الهاتف">
              <input style={styles.input} value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="الحدّ الأدنى للطلب (₪)">
              <input
                style={styles.input}
                type="number"
                min="0"
                value={form.minOrder}
                onChange={set('minOrder')}
              />
            </Field>
            <Field label="زمن التحضير (دقيقة)">
              <input
                style={styles.input}
                type="number"
                min="0"
                value={form.prepMinutes}
                onChange={set('prepMinutes')}
              />
            </Field>
            <Field label="رابط صورة الغلاف">
              <input
                style={styles.input}
                value={form.imageUrl}
                onChange={set('imageUrl')}
                placeholder="https://..."
              />
            </Field>
            <Field label="الوصف">
              <input style={styles.input} value={form.description} onChange={set('description')} />
            </Field>
          </div>

          <div style={styles.switches}>
            <label style={styles.check}>
              <input type="checkbox" checked={!!form.isOpen} onChange={set('isOpen')} /> مفتوح الآن
            </label>
            <label style={styles.check}>
              <input type="checkbox" checked={!!form.active} onChange={set('active')} /> مفعّل (ظاهر
              للزبائن)
            </label>
            <button style={styles.primaryBtn} disabled={saving} onClick={saveRestaurant}>
              {saving ? '...جارٍ الحفظ' : selected ? 'حفظ التعديلات' : 'إضافة المطعم'}
            </button>
          </div>

          <hr style={styles.hr} />

          <b>قائمة الطعام {selected ? `(${menu.length} صنفًا)` : ''}</b>
          {!selected ? (
            <p style={styles.muted}>احفظ المطعم أولًا لتتمكّن من إضافة الأصناف</p>
          ) : (
            <>
              <div style={styles.itemRow}>
                <input
                  style={{ ...styles.input, flex: 2 }}
                  placeholder="اسم الصنف"
                  value={item.name}
                  onChange={(e) => setItem({ ...item, name: e.target.value })}
                />
                <input
                  style={{ ...styles.input, flex: 1 }}
                  placeholder="السعر ₪"
                  type="number"
                  min="0"
                  value={item.price}
                  onChange={(e) => setItem({ ...item, price: e.target.value })}
                />
                <input
                  style={{ ...styles.input, flex: 1 }}
                  placeholder="القسم"
                  value={item.category}
                  onChange={(e) => setItem({ ...item, category: e.target.value })}
                />
                <input
                  style={{ ...styles.input, flex: 2 }}
                  placeholder="وصف (اختياري)"
                  value={item.description}
                  onChange={(e) => setItem({ ...item, description: e.target.value })}
                />
                <button style={styles.primaryBtn} onClick={addItem}>
                  إضافة
                </button>
              </div>

              {menu.length === 0 ? (
                <p style={styles.muted}>لا أصناف بعد</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>الصنف</th>
                      <th style={styles.th}>القسم</th>
                      <th style={styles.th}>السعر</th>
                      <th style={styles.th}>الحالة</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {menu.map((it) => (
                      <tr key={it._id}>
                        <td style={styles.td}>
                          <b>{it.name}</b>
                          {it.description && <div style={styles.muted}>{it.description}</div>}
                        </td>
                        <td style={styles.td}>{it.category || '—'}</td>
                        <td style={styles.td}>{it.price} ₪</td>
                        <td style={styles.td}>
                          <span style={styles.badge(it.available)}>
                            {it.available ? 'متاح' : 'غير متاح'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <button style={styles.smallBtn} onClick={() => toggleItem(it)}>
                            {it.available ? 'إيقاف' : 'تفعيل'}
                          </button>
                          <button style={styles.dangerBtn} onClick={() => removeItem(it)}>
                            حذف
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// حقل في نموذج المطعم (عنوان + مدخل)
function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles = {
  page: { direction: 'rtl', padding: 24, fontFamily: theme.font, color: theme.color.onSurface },
  subtitle: { color: theme.color.muted, marginTop: 0, marginBottom: 16, fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 2.2fr', gap: 16 },
  card: {
    background: theme.color.card,
    border: `1px solid ${theme.color.outline}`,
    borderRadius: theme.radius.lg,
    boxShadow: theme.shadow.card,
    padding: 16,
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 },
  listItem: (active) => ({
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${active ? theme.color.primary : theme.color.outline}`,
    background: active ? theme.color.primarySoft : theme.color.card,
    cursor: 'pointer',
    fontFamily: theme.font,
    fontSize: 14,
    textAlign: 'right',
  }),
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  field: { display: 'grid', gap: 4 },
  label: { fontSize: 13, color: theme.color.muted },
  input: {
    padding: '9px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.color.outlineStrong}`,
    fontFamily: theme.font,
    fontSize: 14,
    background: theme.color.card,
    color: theme.color.onSurface,
    minWidth: 0,
  },
  switches: { display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 },
  primaryBtn: {
    background: theme.color.primary,
    color: theme.color.onPrimary,
    border: 'none',
    borderRadius: theme.radius.pill,
    padding: '9px 18px',
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: theme.font,
  },
  smallBtn: {
    background: theme.color.secondarySoft,
    color: theme.color.secondaryDeep,
    border: 'none',
    borderRadius: theme.radius.pill,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    marginInlineEnd: 6,
    fontFamily: theme.font,
  },
  dangerBtn: {
    background: theme.color.errorSoft,
    color: theme.color.error,
    border: 'none',
    borderRadius: theme.radius.pill,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: theme.font,
  },
  itemRow: { display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'right',
    padding: '8px 6px',
    borderBottom: `1px solid ${theme.color.outline}`,
    color: theme.color.muted,
    fontWeight: 600,
  },
  td: { padding: '8px 6px', borderBottom: `1px solid ${theme.color.outline}`, verticalAlign: 'top' },
  badge: (ok) => ({
    background: ok ? theme.color.successSoft : theme.color.errorSoft,
    color: ok ? theme.color.success : theme.color.error,
    borderRadius: theme.radius.pill,
    padding: '3px 10px',
    fontSize: 12,
    whiteSpace: 'nowrap',
  }),
  muted: { color: theme.color.muted, fontSize: 13 },
  hr: { border: 'none', borderTop: `1px solid ${theme.color.outline}`, margin: '18px 0 12px' },
  error: {
    background: theme.color.errorSoft,
    color: theme.color.error,
    padding: '10px 14px',
    borderRadius: theme.radius.md,
    marginBottom: 12,
  },
  success: {
    background: theme.color.successSoft,
    color: theme.color.success,
    padding: '10px 14px',
    borderRadius: theme.radius.md,
    marginBottom: 12,
  },
};
