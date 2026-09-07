// صفحة إدارة المطاعم وقوائم الطعام (Card 110)
// عمودان على الحاسوب (قائمة المطاعم + محرّر المطعم وقائمته)، ومكدّسان على الجوال.
// ما يُحفظ هنا يظهر فورًا في تبويب «المطاعم» داخل تطبيق الزبون.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Loading,
  PageHeader,
  Select,
  TableWrap,
} from '../components/ui';
import { IconPlus, IconStore, IconTrash } from '../components/icons';

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
  const editorRef = useRef(null);

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

  // فتح مطعم للتحرير + جلب قائمته (وعلى الجوال ننتقل للمحرّر)
  async function openRestaurant(r, scroll = false) {
    setSelected(r);
    setForm({ ...EMPTY_RESTAURANT, ...r });
    setItem(EMPTY_ITEM);
    setMessage('');
    setError('');
    if (scroll) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  // مُحدِّث حقول النموذج (تغيير المدينة يُصفّر الحي)
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value, ...(key === 'city' ? { neighborhood: '' } : {}) }));
  };

  const statusOf = (r) =>
    !r.active
      ? { tone: 'neutral', text: 'معطّل' }
      : r.isOpen
        ? { tone: 'success', text: 'مفتوح' }
        : { tone: 'warning', text: 'مغلق' };

  return (
    <>
      <PageHeader
        title="المطاعم"
        subtitle="أضف المطاعم وقوائم طعامها — تظهر مباشرةً في تبويب «المطاعم» داخل تطبيق الزبون"
      >
        <Button variant="primary" icon={<IconPlus size={18} />} onClick={startNew}>
          مطعم جديد
        </Button>
      </PageHeader>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <div className="yl-split" style={{ marginTop: 'var(--s-4)' }}>
        {/* ── قائمة المطاعم ── */}
        <Card title={`المطاعم (${restaurants.length})`} pad={false}>
          {loading ? (
            <Loading />
          ) : restaurants.length === 0 ? (
            <EmptyState
              icon={<IconStore size={26} />}
              title="لا توجد مطاعم بعد"
              action={
                <Button variant="primary" onClick={startNew}>
                  إضافة أوّل مطعم
                </Button>
              }
            />
          ) : (
            <div className="yl-list" style={{ padding: 'var(--s-2)' }}>
              {restaurants.map((r) => {
                const s = statusOf(r);
                return (
                  <button
                    key={r._id}
                    className="yl-listitem"
                    aria-current={selected?._id === r._id}
                    onClick={() => openRestaurant(r, true)}
                  >
                    <span className="yl-avatar">
                      <IconStore size={20} />
                    </span>
                    <span className="yl-listitem__main">
                      <span className="yl-listitem__title">{r.name}</span>
                      <span className="yl-listitem__sub">
                        {r.category}
                        {r.address ? ` · ${r.address}` : ''}
                      </span>
                    </span>
                    <Badge tone={s.tone}>{s.text}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── محرّر المطعم + قائمته ── */}
        <div className="yl-stack" ref={editorRef}>
          <Card
            title={selected ? `تعديل: ${selected.name}` : 'مطعم جديد'}
            actions={
              selected && (
                <Button variant="danger" size="sm" icon={<IconTrash size={16} />} onClick={() => removeRestaurant(selected)}>
                  حذف المطعم
                </Button>
              )
            }
          >
            <div className="yl-formgrid">
              <Field label="الاسم">
                <Input value={form.name} onChange={set('name')} placeholder="مثال: مشاوي الفروج" />
              </Field>
              <Field label="التصنيف">
                <Input value={form.category} onChange={set('category')} placeholder="مشاوي، بيتزا، حلويات..." />
              </Field>
              <Field label="المدينة">
                <Select value={form.city} onChange={set('city')}>
                  <option value="">— اختر —</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="الحي" hint="يحدّد موقع المطعم وأجرة التوصيل">
                <Select value={form.neighborhood} onChange={set('neighborhood')} disabled={!form.city}>
                  <option value="">— اختر —</option>
                  {(hoods[form.city] || []).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </Field>
              <Field label="الشارع">
                <Input value={form.street} onChange={set('street')} />
              </Field>
              <Field label="الهاتف">
                <Input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="05X XXX XXXX" />
              </Field>
              <Field label="الحدّ الأدنى للطلب (₪)">
                <Input type="number" min="0" value={form.minOrder} onChange={set('minOrder')} />
              </Field>
              <Field label="زمن التحضير (دقيقة)">
                <Input type="number" min="0" value={form.prepMinutes} onChange={set('prepMinutes')} />
              </Field>
              <Field label="رابط صورة الغلاف">
                <Input value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://..." dir="ltr" />
              </Field>
              <Field label="الوصف">
                <Input value={form.description} onChange={set('description')} placeholder="وصف مختصر يظهر للزبون" />
              </Field>
            </div>

            <div className="yl-row" style={{ marginTop: 'var(--s-5)', gap: 'var(--s-5)' }}>
              <Checkbox checked={form.isOpen} onChange={set('isOpen')} label="مفتوح الآن" />
              <Checkbox checked={form.active} onChange={set('active')} label="مفعّل (ظاهر للزبائن)" />
              <span className="yl-spacer" />
              <Button variant="primary" onClick={saveRestaurant} disabled={saving} loading={saving}>
                {saving ? '...جارٍ الحفظ' : selected ? 'حفظ التعديلات' : 'إضافة المطعم'}
              </Button>
            </div>
          </Card>

          {/* ── قائمة الطعام ── */}
          <Card title={`قائمة الطعام${selected ? ` (${menu.length} صنفًا)` : ''}`}>
            {!selected ? (
              <p className="yl-muted">احفظ المطعم أولًا لتتمكّن من إضافة الأصناف.</p>
            ) : (
              <>
                <div className="yl-formgrid" style={{ marginBottom: 'var(--s-4)' }}>
                  <Field label="اسم الصنف">
                    <Input
                      value={item.name}
                      onChange={(e) => setItem({ ...item, name: e.target.value })}
                      placeholder="شاورما دجاج"
                    />
                  </Field>
                  <Field label="السعر (₪)">
                    <Input
                      type="number"
                      min="0"
                      value={item.price}
                      onChange={(e) => setItem({ ...item, price: e.target.value })}
                    />
                  </Field>
                  <Field label="القسم">
                    <Input
                      value={item.category}
                      onChange={(e) => setItem({ ...item, category: e.target.value })}
                      placeholder="ساندويشات"
                    />
                  </Field>
                  <Field label="وصف (اختياري)">
                    <Input
                      value={item.description}
                      onChange={(e) => setItem({ ...item, description: e.target.value })}
                    />
                  </Field>
                </div>
                <Button variant="primary" icon={<IconPlus size={18} />} onClick={addItem}>
                  إضافة الصنف
                </Button>

                <div style={{ marginTop: 'var(--s-5)' }}>
                  {menu.length === 0 ? (
                    <EmptyState icon={<IconStore size={26} />} title="لا أصناف بعد">
                      أضف أصناف القائمة ليتمكّن الزبون من الطلب.
                    </EmptyState>
                  ) : (
                    <TableWrap>
                      <thead>
                        <tr>
                          <th>الصنف</th>
                          <th>القسم</th>
                          <th>السعر</th>
                          <th>الحالة</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {menu.map((it) => (
                          <tr key={it._id}>
                            <td data-label="الصنف">
                              <b>{it.name}</b>
                              {it.description && (
                                <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>
                                  {it.description}
                                </div>
                              )}
                            </td>
                            <td data-label="القسم">{it.category || '—'}</td>
                            <td data-label="السعر" className="yl-num">{it.price} ₪</td>
                            <td data-label="الحالة">
                              <Badge tone={it.available ? 'success' : 'danger'}>
                                {it.available ? 'متاح' : 'غير متاح'}
                              </Badge>
                            </td>
                            <td data-label="إجراءات" className="yl-td-actions">
                              <div className="yl-btnrow">
                                <Button size="sm" onClick={() => toggleItem(it)}>
                                  {it.available ? 'إيقاف' : 'تفعيل'}
                                </Button>
                                <IconButton label="حذف الصنف" small onClick={() => removeItem(it)}>
                                  <IconTrash size={18} />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
