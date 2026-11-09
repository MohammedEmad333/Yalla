import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Alert, Button, Field, Input, Modal, Select } from '../components/ui';

const emptyAddress = () => ({ city: '', neighborhood: '', street: '', details: '', note: '' });
const newKey = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export default function CreateAdminOrder({ onClose, onCreated }) {
  const [cities, setCities] = useState({});
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [pickup, setPickup] = useState(emptyAddress);
  const [dropoff, setDropoff] = useState(emptyAddress);
  const [packageNote, setPackageNote] = useState('');
  const [quote, setQuote] = useState(null);
  const [requestKey, setRequestKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/neighborhoods?grouped=1').then(setCities).catch((err) => setError(err.message));
  }, []);

  function invalidate() {
    setQuote(null);
    setError('');
    setRequestKey(newKey());
  }

  function changeAddress(setter, key, value) {
    invalidate();
    setter((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'city' ? { neighborhood: '' } : {}),
    }));
  }

  async function searchCustomers(e) {
    e.preventDefault();
    if (query.trim().length < 2) return setError('أدخل حرفين على الأقل للبحث');
    setSearching(true);
    setError('');
    try {
      const result = await api.get(`/admin/orders/customers?q=${encodeURIComponent(query.trim())}`);
      setCustomers(result);
      setSelectedUser('');
      invalidate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  const body = {
    userId: selectedUser,
    pickup,
    dropoff,
    packageNote,
  };

  async function preview(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setQuote(null);
    try {
      const result = await api.post('/admin/orders/preview', body);
      setQuote(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createOrder() {
    if (!quote?.sufficientBalance || !selectedUser) return;
    if (!window.confirm(`تأكيد إنشاء طلب للزبون ${quote.customerName} بسعر تقريبي ${quote.price} ₪ مع حجز المبلغ من محفظته؟`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/admin/orders', { ...body, requestKey });
      onCreated(result);
    } catch (err) {
      // Keep the same idempotency key for safe retry after a network error.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function locationFields(value, setter, title) {
    return (
      <fieldset className="yl-card yl-card--flat yl-card--pad" style={{ border: '1px solid var(--border)' }}>
        <legend style={{ fontWeight: 700 }}>{title}</legend>
        <div className="yl-formgrid">
          <Field label="المدينة">
            <Select required value={value.city} onChange={(e) => changeAddress(setter, 'city', e.target.value)}>
              <option value="">اختر المدينة</option>
              {Object.keys(cities).map((city) => <option key={city} value={city}>{city}</option>)}
            </Select>
          </Field>
          <Field label="الحي">
            <Select required disabled={!value.city} value={value.neighborhood} onChange={(e) => changeAddress(setter, 'neighborhood', e.target.value)}>
              <option value="">اختر الحي</option>
              {(cities[value.city] || []).map((hood) => <option key={hood} value={hood}>{hood}</option>)}
            </Select>
          </Field>
          <Field label="الشارع">
            <Input maxLength={150} value={value.street} onChange={(e) => changeAddress(setter, 'street', e.target.value)} />
          </Field>
          <Field label="تفاصيل الموقع">
            <Input maxLength={300} value={value.details} onChange={(e) => changeAddress(setter, 'details', e.target.value)} />
          </Field>
        </div>
        <Field label="ملاحظة للموقع">
          <Input maxLength={300} value={value.note} onChange={(e) => changeAddress(setter, 'note', e.target.value)} />
        </Field>
      </fieldset>
    );
  }

  return (
    <Modal title="إنشاء طلب توصيل" onClose={() => { if (!busy) onClose(); }}>
      <div className="yl-stack">
        <p className="yl-muted">طلب توصيل عادي لزبون مسجّل، يتم حجز الأجرة التقديرية من رصيده المتاح. لا يتم خصمها نهائيًا إلا عند التسليم.</p>
        <form onSubmit={searchCustomers} className="yl-stack yl-stack--sm">
          <Field label="ابحث عن الزبون بالاسم أو رقم الهاتف">
            <Input value={query} maxLength={60} onChange={(e) => { setQuery(e.target.value); setCustomers([]); setSelectedUser(''); invalidate(); }} placeholder="اسم الزبون أو هاتفه" />
          </Field>
          <Button type="submit" disabled={busy || searching} loading={searching}>بحث عن زبون</Button>
        </form>
        {customers.length > 0 && (
          <Field label="اختيار الزبون">
            <Select required value={selectedUser} onChange={(e) => { setSelectedUser(e.target.value); invalidate(); }}>
              <option value="">اختر الزبون من النتائج</option>
              {customers.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.phone}</option>)}
            </Select>
          </Field>
        )}
        {customers.length === 0 && query.trim().length >= 2 && <p className="yl-muted">ابحث عن زبون نشط أولًا. تظهر النتائج هنا.</p>}
        <form onSubmit={preview} className="yl-stack">
          {locationFields(pickup, setPickup, 'عنوان الاستلام')}
          {locationFields(dropoff, setDropoff, 'عنوان التسليم')}
          <Field label="وصف الشحنة (اختياري)">
            <Input maxLength={500} value={packageNote} onChange={(e) => { setPackageNote(e.target.value); invalidate(); }} placeholder="مثال: طرد صغير" />
          </Field>
          <Button type="submit" variant="soft" disabled={busy || !selectedUser || !pickup.neighborhood || !dropoff.neighborhood} loading={busy}>
            معاينة السعر والرصيد
          </Button>
        </form>
        {quote && (
          <div className="yl-card yl-card--flat yl-card--pad yl-stack yl-stack--sm">
            <b>مراجعة الطلب — {quote.customerName}</b>
            <span>المسافة التقديرية: {quote.distanceKm} كم</span>
            <span>الأجرة التقديرية: <b>{quote.price} ₪</b></span>
            <span>الرصيد المتاح: <b>{quote.availableBalance} ₪</b></span>
            {!quote.sufficientBalance && <Alert tone="error">الرصيد غير كافٍ. يجب شحن محفظة الزبون أولًا؛ لن يتم إنشاء طلب غير مدفوع.</Alert>}
            {quote.sufficientBalance && (
              <Button variant="primary" type="button" disabled={busy} loading={busy} onClick={createOrder}>تأكيد إنشاء الطلب</Button>
            )}
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="button" disabled={busy} onClick={onClose}>إغلاق</Button>
      </div>
    </Modal>
  );
}
