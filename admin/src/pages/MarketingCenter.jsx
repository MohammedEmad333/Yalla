import { useEffect, useState } from 'react';
import { API, api } from '../api/client';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, TableWrap } from '../components/ui';

const EMPTY = {
  title: '', subtitle: '', imageUrl: '', restaurant: '', couponCode: '',
  active: true, startsAt: '', endsAt: '', sortOrder: 0,
};

function imageSrc(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') && API.startsWith('https://')) return `https://${raw.slice(7)}`;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export default function MarketingCenter() {
  const [banners, setBanners] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [localPreview, setLocalPreview] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [b, r] = await Promise.all([
        api.get('/expansion/admin/banners'),
        api.get('/admin/restaurants'),
      ]);
      setBanners(b || []);
      setRestaurants(r || []);
    } catch (e) { setError(e.message || String(e)); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  function clearPickedImage() {
    setImageFile(null);
    setLocalPreview('');
  }

  function edit(row) {
    clearPickedImage();
    setEditing(row);
    setForm({
      title: row.title || '', subtitle: row.subtitle || '', imageUrl: row.imageUrl || '',
      restaurant: row.restaurant?._id || row.restaurant || '', couponCode: row.couponCode || '',
      active: row.active !== false,
      startsAt: row.startsAt ? new Date(row.startsAt).toISOString().slice(0, 16) : '',
      endsAt: row.endsAt ? new Date(row.endsAt).toISOString().slice(0, 16) : '',
      sortOrder: row.sortOrder || 0,
    });
  }

  function reset() {
    clearPickedImage();
    setEditing(null);
    setForm(EMPTY);
  }

  function pickImage(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (!file) return;
    if (localPreview) URL.revokeObjectURL(localPreview);
    setImageFile(file);
    setLocalPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!form.title.trim()) return setError('عنوان الإعلان مطلوب');
    setBusy(true); setError(''); setMessage('');
    try {
      const body = {
        ...form,
        restaurant: form.restaurant || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        sortOrder: Number(form.sortOrder) || 0,
      };
      const saved = editing
        ? await api.patch(`/expansion/admin/banners/${editing._id}`, body)
        : await api.post('/expansion/admin/banners', body);

      if (imageFile) {
        await api.upload(`/admin/banners/${saved._id}/image`, imageFile);
      }

      setMessage(editing ? 'تم تحديث الإعلان' : 'تم إنشاء الإعلان');
      reset();
      await load();
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  }

  async function remove(row) {
    if (!window.confirm(`حذف الإعلان «${row.title}»؟`)) return;
    try {
      await api.del(`/expansion/admin/banners/${row._id}`);
      await load();
    } catch (e) { setError(e.message || String(e)); }
  }

  const set = (key) => (e) => setForm((f) => ({
    ...f,
    [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  const preview = localPreview || imageSrc(form.imageUrl);

  return <div>
    <PageHeader
      title="الإعلانات والعروض"
      subtitle="أضف بانرات متحركة تظهر تلقائيًا بين البحث وتصنيفات المتاجر بدون إصدار تطبيق جديد"
    />
    <Alert tone="error">{error}</Alert>
    <Alert tone="success">{message}</Alert>

    <Card title={editing ? 'تعديل الإعلان' : 'إعلان جديد'} actions={editing && <Button onClick={reset}>إلغاء التعديل</Button>}>
      <div className="yl-formgrid">
        <Field label="العنوان"><Input value={form.title} onChange={set('title')} placeholder="عرض نهاية الأسبوع" /></Field>
        <Field label="النص الفرعي"><Input value={form.subtitle} onChange={set('subtitle')} placeholder="خصم لفترة محدودة" /></Field>
        <Field label="المتجر">
          <Select value={form.restaurant} onChange={set('restaurant')}>
            <option value="">إعلان عام / بلا متجر</option>
            {restaurants.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="كود الكوبون"><Input value={form.couponCode} onChange={set('couponCode')} /></Field>
        <Field label="الترتيب"><Input type="number" value={form.sortOrder} onChange={set('sortOrder')} /></Field>
        <Field label="البداية"><Input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></Field>
        <Field label="النهاية"><Input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} /></Field>
        <Field label="رابط صورة خارجي (اختياري)">
          <Input value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://..." />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>صورة الإعلان</div>
        <div className="yl-row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {preview ? (
            <img
              src={preview}
              alt=""
              style={{ width: 190, height: 92, objectFit: 'cover', borderRadius: 16, border: '1px solid var(--border)' }}
            />
          ) : (
            <div className="yl-muted" style={{ width: 190, height: 92, borderRadius: 16, border: '1px dashed var(--border)', display: 'grid', placeItems: 'center' }}>
              لا توجد صورة
            </div>
          )}
          <label className="yl-btn yl-btn--outline" style={{ cursor: 'pointer' }}>
            رفع صورة من الجهاز
            <input type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
          </label>
          {imageFile && <span className="yl-muted">{imageFile.name}</span>}
        </div>
      </div>

      <label className="yl-check" style={{ marginTop: 16 }}>
        <input type="checkbox" checked={form.active} onChange={set('active')} />
        <span>مفعّل</span>
      </label>
      <div style={{ marginTop: 14 }}>
        <Button variant="primary" loading={busy} onClick={save}>{editing ? 'حفظ التعديلات' : 'إنشاء الإعلان'}</Button>
      </div>
    </Card>

    <div style={{ height: 16 }} />
    <Card title="الإعلانات الحالية" pad={false}>
      <TableWrap>
        <thead><tr><th>الصورة</th><th>العنوان</th><th>الربط</th><th>الحالة</th><th>الترتيب</th><th>إجراءات</th></tr></thead>
        <tbody>{banners.map((b) => <tr key={b._id}>
          <td data-label="الصورة">
            {imageSrc(b.imageUrl)
              ? <img src={imageSrc(b.imageUrl)} alt="" style={{ width: 86, height: 48, objectFit: 'cover', borderRadius: 10 }} />
              : <span className="yl-muted">—</span>}
          </td>
          <td data-label="العنوان"><b>{b.title}</b><br /><small>{b.subtitle}</small></td>
          <td data-label="الربط">{b.restaurant?.name || 'عام'}{b.couponCode ? ` · ${b.couponCode}` : ''}</td>
          <td data-label="الحالة"><Badge tone={b.active ? 'success' : 'neutral'}>{b.active ? 'مفعّل' : 'متوقف'}</Badge></td>
          <td data-label="الترتيب">{b.sortOrder || 0}</td>
          <td data-label="إجراءات"><div className="yl-btnrow"><Button size="sm" onClick={() => edit(b)}>تعديل</Button><Button size="sm" variant="danger" onClick={() => remove(b)}>حذف</Button></div></td>
        </tr>)}</tbody>
      </TableWrap>
    </Card>
  </div>;
}
