// صفحة دخول الأدمن — بطاقة مركزيّة على خلفية متدرّجة بألوان العلامة.

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Field, Input } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, password);
      // بعد النجاح: AuthContext يحدّث الحالة و App يعرض اللوحة تلقائيًا
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="yl-login">
      <div className="yl-login__glow" aria-hidden="true" />
      <form onSubmit={handleSubmit} className="yl-card yl-login__card">
        <div className="yl-login__brand">
          <img src="/logo.png" alt="" width="52" height="52" />
          <div>
            <div className="yl-login__name">Yalla</div>
            <div className="yl-muted">لوحة التحكّم</div>
          </div>
        </div>

        <h1 className="yl-login__title">تسجيل الدخول</h1>
        <p className="yl-muted">أدخل بيانات حساب الأدمن للمتابعة</p>

        <div className="yl-stack" style={{ marginTop: 'var(--s-5)' }}>
          <Field label="رقم الهاتف">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="username"
              placeholder="05X XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>

          <Field label="كلمة المرور">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" variant="primary" size="lg" block loading={loading} disabled={loading}>
            {loading ? '...جارٍ الدخول' : 'دخول'}
          </Button>
        </div>
      </form>

      <p className="yl-login__foot">© {new Date().getFullYear()} يلا للتوصيل</p>
    </div>
  );
}
