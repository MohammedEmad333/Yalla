// صفحة دخول الأدمن للوحة التحكّم.

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

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
        <h1 style={{ textAlign: 'center' }}>🛵 يلا — لوحة الأدمن</h1>
        <p style={styles.sub}>سجّل الدخول للمتابعة</p>

        <input
          style={styles.input}
          type="tel"
          placeholder="رقم الهاتف"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="كلمة المرور"
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
    background: '#0f172a',
    fontFamily: 'system-ui',
  },
  card: {
    background: '#fff',
    padding: 32,
    borderRadius: 16,
    width: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 10px 40px rgba(0,0,0,.3)',
  },
  sub: { textAlign: 'center', color: '#64748b', marginTop: -8 },
  input: { padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15 },
  btn: {
    padding: 12,
    borderRadius: 8,
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    fontSize: 16,
    cursor: 'pointer',
  },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
};
