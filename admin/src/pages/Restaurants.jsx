// صفحة إدارة المطاعم وقوائم الطعام (Card 110)
// عمودان على الحاسوب (قائمة المطاعم + محرّر المطعم وقائمته)، ومكدّسان على الجوال.
// ما يُحفظ هنا يظهر فورًا في تبويب «المطاعم» داخل تطبيق الزبون.

import { useEffect, useRef, useState } from 'react';
import { api, API } from '../api/client';
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
  Modal,
  PageHeader,
  Select,
  TableWrap,
} from '../components/ui';
import { IconPlus, IconStore, IconTrash } from '../components/icons';

// الصور تُخزَّن في قاعدة البيانات وتُخدَم من /files/<id> — نضيف عنوان الـ API
// للمسار النسبيّ (تمامًا كما في صفحة المستخدمين)، ونترك الروابط الخارجيّة كما هي.
const imageSrc = (url) => (url ? (url.startsWith('http') ? url : `${API}${url}`) : '');

// نصغّر الصورة ونحوّلها إلى WebP قبل الرفع. هذا يمنع تخزين صور كاميرا
// بحجم عدّة ميغابايت بينما التطبيق يعرضها داخل بطاقة صغيرة.
async function optimizeImage(file, maxDimension = 1400, quality = 0.78) {
  if (!file?.type?.startsWith('image/')) throw new Error('اختر ملف صورة صالحًا');

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close?.();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );
    if (!blob) return file;

    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    // بعض الأجهزة لا تفكّ HEIC داخل المتصفح؛ نرسل الأصل ليعالجه الخادم كما كان.
    return file;
  }
}

// رفع صورة (multipart) إلى مسار أدمن ويُعيد رابطها — مشترك بين المطعم والصنف.
async function uploadImageTo(path, file) {
  const optimized = await optimizeImage(file);
  const fd = new FormData();
  fd.append('image', optimized);
  const res = await fetch(`${API}/api${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: fd,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'تعذّر رفع الصورة');
  return data.imageUrl;
}

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
  openTime: '',
  closeTime: '',
  isOpen: true,
  active: true,
};

// تصنيفات مقترحة للمطاعم (قابلة للكتابة الحرّة أيضًا) — تظهر كرقائق فلترة في التطبيق.
const CATEGORY_SUGGESTIONS = [
  'مطاعم',
  'مشاوي',
  'شاورما',
  'بيتزا',
  'برجر',
  'دجاج',
  'حلويات',
  'كافيه',
  'مخبوزات',
  'سوبرماركت',
  'عصائر ومشروبات',
];

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
  const [coverBusy, setCoverBusy] = useState(false); // رفع صورة الغلاف جارٍ
  const [editingItem, setEditingItem] = useState(null); // الصنف المفتوح للتعديل (Modal)
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

  // رفع صورة غلاف المطعم من الجهاز (تُحفظ في قاعدة البيانات) — يتطلّب حفظ المطعم أولًا
  async function uploadCover(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // نسمح بإعادة اختيار الملفّ نفسه لاحقًا
    if (!file) return;
    if (!selected) return setError('احفظ المطعم أولًا ثمّ ارفع صورته');
    setError('');
    setMessage('');
    setCoverBusy(true);
    try {
      const imageUrl = await uploadImageTo(`/admin/restaurants/${selected._id}/image`, file);
      setForm((f) => ({ ...f, imageUrl }));
      setMessage('تم تحديث صورة المطعم');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCoverBusy(false);
    }
  }

  // إعادة جلب قائمة المطعم المفتوح
  async function reloadMenu() {
    if (!selected) return;
    setMenu(await api.get(`/admin/restaurants/${selected._id}/menu`));
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
              <Field label="التصنيف" hint="اختر أو اكتب تصنيفًا">
                <Input
                  value={form.category}
                  onChange={set('category')}
                  placeholder="مطاعم، كافيه، مخبوزات..."
                  list="yl-restaurant-categories"
                />
                <datalist id="yl-restaurant-categories">
                  {CATEGORY_SUGGESTIONS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
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
              <Field label="وقت الفتح" hint="اتركه فارغًا لِ«طوال اليوم»">
                <Input type="time" value={form.openTime || ''} onChange={set('openTime')} dir="ltr" />
              </Field>
              <Field label="وقت الإغلاق">
                <Input type="time" value={form.closeTime || ''} onChange={set('closeTime')} dir="ltr" />
              </Field>
              <Field label="صورة الغلاف" hint={selected ? 'ارفع من الجهاز أو الصق رابطًا' : 'احفظ المطعم أولًا لرفع صورة'}>
                <div className="yl-row" style={{ gap: 'var(--s-3)', alignItems: 'center' }}>
                  {imageSrc(form.imageUrl) ? (
                    <img
                      src={imageSrc(form.imageUrl)}
                      alt=""
                      style={{ width: 56, height: 56, borderRadius: 'var(--r-2)', objectFit: 'cover', flex: 'none' }}
                    />
                  ) : (
                    <span className="yl-avatar" style={{ width: 56, height: 56 }}>
                      <IconStore size={22} />
                    </span>
                  )}
                  <label
                    className="yl-btn yl-btn--outline yl-btn--sm"
                    aria-disabled={!selected || coverBusy}
                    style={!selected || coverBusy ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
                  >
                    {coverBusy ? '...جارٍ الرفع' : 'رفع من الجهاز'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={uploadCover}
                      disabled={!selected || coverBusy}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                <Input
                  value={form.imageUrl}
                  onChange={set('imageUrl')}
                  placeholder="https://... (اختياري)"
                  dir="ltr"
                  style={{ marginTop: 'var(--s-2)' }}
                />
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
                              <div className="yl-row" style={{ gap: 'var(--s-3)', alignItems: 'center' }}>
                                {imageSrc(it.imageUrl) ? (
                                  <img
                                    src={imageSrc(it.imageUrl)}
                                    alt=""
                                    style={{ width: 40, height: 40, borderRadius: 'var(--r-2)', objectFit: 'cover', flex: 'none' }}
                                  />
                                ) : (
                                  <span className="yl-avatar" style={{ width: 40, height: 40 }}>
                                    <IconStore size={16} />
                                  </span>
                                )}
                                <span>
                                  <b>{it.name}</b>
                                  {it.description && (
                                    <div className="yl-muted" style={{ fontSize: 'var(--fs-sm)' }}>
                                      {it.description}
                                    </div>
                                  )}
                                </span>
                              </div>
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
                                <Button size="sm" onClick={() => setEditingItem(it)}>
                                  تعديل
                                </Button>
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

      {editingItem && (
        <MenuItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            setEditingItem(null);
            await reloadMenu();
          }}
        />
      )}
    </>
  );
}

// نافذة تعديل صنف: تعدّل الاسم/السعر/القسم/الوصف/التوفّر، وترفع صورة للصنف من الجهاز.
function MenuItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: item.name || '',
    price: item.price ?? '',
    category: item.category || '',
    description: item.description || '',
    available: item.available !== false,
  });
  const [imageUrl, setImageUrl] = useState(item.imageUrl || '');
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [error, setError] = useState('');

  const upd = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function uploadItemImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setImgBusy(true);
    try {
      const url = await uploadImageTo(`/admin/menu-items/${item._id}/image`, file);
      setImageUrl(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setImgBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('اسم الصنف مطلوب');
    if (!(Number(form.price) > 0)) return setError('سعر الصنف مطلوب');
    setBusy(true);
    try {
      await api.patch(`/admin/menu-items/${item._id}`, {
        name: form.name.trim(),
        price: Number(form.price),
        category: form.category.trim(),
        description: form.description.trim(),
        available: form.available,
        imageUrl,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`تعديل الصنف: ${item.name}`} onClose={onClose}>
      <form onSubmit={save} className="yl-stack">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="yl-row" style={{ gap: 'var(--s-3)', alignItems: 'center' }}>
          {imageSrc(imageUrl) ? (
            <img
              src={imageSrc(imageUrl)}
              alt=""
              style={{ width: 64, height: 64, borderRadius: 'var(--r-2)', objectFit: 'cover', flex: 'none' }}
            />
          ) : (
            <span className="yl-avatar" style={{ width: 64, height: 64 }}>
              <IconStore size={24} />
            </span>
          )}
          <label
            className="yl-btn yl-btn--outline yl-btn--sm"
            aria-disabled={imgBusy}
            style={imgBusy ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
          >
            {imgBusy ? '...جارٍ الرفع' : 'رفع صورة من الجهاز'}
            <input type="file" accept="image/*" onChange={uploadItemImage} disabled={imgBusy} style={{ display: 'none' }} />
          </label>
        </div>

        <div className="yl-formgrid">
          <Field label="اسم الصنف">
            <Input value={form.name} onChange={upd('name')} required />
          </Field>
          <Field label="السعر (₪)">
            <Input type="number" min="0" value={form.price} onChange={upd('price')} required />
          </Field>
          <Field label="القسم">
            <Input value={form.category} onChange={upd('category')} placeholder="ساندويشات" />
          </Field>
          <Field label="الوصف">
            <Input value={form.description} onChange={upd('description')} />
          </Field>
        </div>

        <Checkbox checked={form.available} onChange={upd('available')} label="متاح للطلب" />

        <div className="yl-row" style={{ gap: 'var(--s-3)', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" variant="primary" disabled={busy} loading={busy}>
            {busy ? '...جارٍ الحفظ' : 'حفظ التعديلات'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
