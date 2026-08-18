// صفحة دخول الأدمن للوحة التحكّم.

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../theme';

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
      // بعد النجاح: AuthContext يحدّث الحالة والـ App يعرض اللوحة تلقائيًا
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.brand}>
          <img src="/logo.png" alt="Yalla" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
          <span style={styles.logo}>Yalla</span>
        </div>
        <h1 style={styles.title}>لوحة الأدمن</h1>
        <p style={styles.sub}>سجّل الدخول للمتابعة</p>

        <label style={styles.label}>رقم الهاتف</label>
        <input
          style={styles.input}
          type="tel"
          placeholder="05X XXX XXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <label style={styles.label}>كلمة المرور</label>
        <input
          style={styles.input}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" style={styles.btn} disabled={loading}>
          {loading ? '...جاري الدخول' : 'دخول'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    direction: 'rtl',
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 16,
    background: `radial-gradient(1200px 600px at 100% 0%, ${theme.color.primarySoft} 0%, ${theme.color.surface} 55%)`,
    fontFamily: theme.font,
  },
  card: {
    background: theme.color.card,
    padding: 36,
    borderRadius: theme.radius.xl,
    width: 380,
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: theme.shadow.card,
    border: `1px solid ${theme.color.outline}`,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' },
  logo: { fontSize: 30, fontWeight: 700, color: theme.color.primaryDeep, letterSpacing: '-0.02em' },
  title: { textAlign: 'center', margin: '10px 0 0', fontSize: 26 },
  sub: { textAlign: 'center', color: theme.color.muted, margin: '2px 0 14px', fontSize: 15 },
  label: { fontSize: 13, fontWeight: 600, color: theme.color.onSurfaceVariant, marginTop: 6 },
  input: {
    padding: '13px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.color.outlineStrong}`,
    fontSize: 15,
  },
  btn: {
    marginTop: 18,
    padding: 14,
    borderRadius: theme.radius.pill,
    border: 'none',
    background: theme.color.primary,
    color: theme.color.onPrimary,
    fontSize: 16,
    cursor: 'pointer',
    boxShadow: theme.shadow.float,
  },
  error: {
    color: theme.color.error,
    background: theme.color.errorSoft,
    fontSize: 14,
    textAlign: 'center',
    padding: '10px 12px',
    borderRadius: theme.radius.sm,
    marginTop: 10,
  },
};
