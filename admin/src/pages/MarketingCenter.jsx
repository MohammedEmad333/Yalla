import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, TableWrap } from '../components/ui';

const EMPTY = {
  title: '', subtitle: '', imageUrl: '', restaurant: '', couponCode: '',
  active: true, startsAt: '', endsAt: '', sortOrder: 0,
};

export default function MarketingCenter() {
  const [banners, setBanners] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
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

  function edit(row) {
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

  function reset() { setEditing(null); setForm(EMPTY); }

  async function save() {
    if (!form.title.trim()) return setError('عنوان البانر مطلوب');
    setBusy(true); setError(''); setMessage('');
    try {
      const body = {
        ...form,
        restaurant: form.restaurant || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) await api.patch(`/expansion/admin/banners/${editing._id}`, body);
      else await api.post('/expansion/admin/banners', body);
      setMessage(editing ? 'تم تحديث البانر' : 'تم إنشاء البانر');
      reset();
      await load();
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  }

  async function remove(row) {
    if (!window.confirm(`حذف البانر «${row.title}»؟`)) return;
    try { await api.del(`/expansion/admin/banners/${row._id}`); await load(); }
    catch (e) { setError(e.message || String(e)); }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return <div>
    <PageHeader title="التسويق والعروض" subtitle="بانرات ديناميكية يمكن ربطها بمتجر أو كوبون بدون إصدار تطبيق جديد" />
    <Alert tone="error">{error}</Alert>
    <Alert tone="success">{message}</Alert>

    <Card title={editing ? 'تعديل البانر' : 'بانر جديد'} actions={editing && <Button onClick={reset}>إلغاء التعديل</Button>}>
      <div className="yl-formgrid">
        <Field label="العنوان"><Input value={form.title} onChange={set('title')} placeholder="عرض نهاية الأسبوع" /></Field>
        <Field label="النص الفرعي"><Input value={form.subtitle} onChange={set('subtitle')} placeholder="خصم لفترة محدودة" /></Field>
        <Field label="رابط الصورة"><Input value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://... أو /files/..." /></Field>
        <Field label="المتجر">
          <Select value={form.restaurant} onChange={set('restaurant')}>
            <option value="">كل المنصة / بلا متجر</option>
            {restaurants.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="كود الكوبون"><Input value={form.couponCode} onChange={set('couponCode')} /></Field>
        <Field label="الترتيب"><Input type="number" value={form.sortOrder} onChange={set('sortOrder')} /></Field>
        <Field label="البداية"><Input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} /></Field>
        <Field label="النهاية"><Input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} /></Field>
      </div>
      <label className="yl-check" style={{ marginTop: 12 }}><input type="checkbox" checked={form.active} onChange={set('active')} /><span>مفعّل</span></label>
      <div style={{ marginTop: 14 }}><Button variant="primary" loading={busy} onClick={save}>{editing ? 'حفظ التعديلات' : 'إنشاء البانر'}</Button></div>
    </Card>

    <div style={{ height: 16 }} />
    <Card title="البانرات الحالية" pad={false}>
      <TableWrap>
        <thead><tr><th>العنوان</th><th>الربط</th><th>الحالة</th><th>الترتيب</th><th>إجراءات</th></tr></thead>
        <tbody>{banners.map((b) => <tr key={b._id}>
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
