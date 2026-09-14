import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui';

export default function AdminAccount() {
  const { updateAdmin } = useAuth();
  const [form, setForm] = useState({ phone: '', currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/account').then((a) => setForm((f) => ({ ...f, phone: a.phone || '' }))).catch((e) => setError(e.message));
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  async function save(e) {
    e.preventDefault(); setError(''); setMessage('');
    if (!form.currentPassword) return setError('أدخل كلمة السر الحالية للتأكيد');
    if (form.newPassword && form.newPassword !== form.confirm) return setError('تأكيد كلمة السر الجديدة غير مطابق');
    setBusy(true);
    try {
      const admin = await api.patch('/admin/account', {
        phone: form.phone,
        currentPassword: form.currentPassword,
        ...(form.newPassword ? { newPassword: form.newPassword } : {}),
      });
      updateAdmin(admin);
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirm: '' }));
      setMessage('تم تحديث حساب الأدمن بنجاح');
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  }

  return <>
    <PageHeader title="حساب الأدمن" subtitle="تغيير رقم تسجيل الدخول وكلمة السر بأمان" />
    <Card>
      <form className="yl-stack" onSubmit={save} style={{ maxWidth: 620 }}>
        {error && <Alert tone="error">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}
        <Field label="رقم الجوال"><Input value={form.phone} onChange={set('phone')} inputMode="tel" required /></Field>
        <Field label="كلمة السر الحالية" hint="مطلوبة لحفظ أي تغيير"><Input type="password" value={form.currentPassword} onChange={set('currentPassword')} required /></Field>
        <Field label="كلمة السر الجديدة" hint="اتركها فارغة إن كنت تريد تغيير الرقم فقط"><Input type="password" value={form.newPassword} onChange={set('newPassword')} minLength="6" /></Field>
        <Field label="تأكيد كلمة السر الجديدة"><Input type="password" value={form.confirm} onChange={set('confirm')} /></Field>
        <Button type="submit" variant="primary" loading={busy} disabled={busy}>حفظ التغييرات</Button>
      </form>
    </Card>
  </>;
}
