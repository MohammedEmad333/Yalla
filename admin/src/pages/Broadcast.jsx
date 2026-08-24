// صفحة إرسال الرسائل/الإشعارات الجماعية (Card 66)
// يرسل الأدمن رسالة للجميع، أو لكل الكباتن، أو لكل الزبائن، أو لمستلِمين محدّدين.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { theme } from '../theme';

const AUDIENCES = [
  { key: 'all', label: 'الجميع' },
  { key: 'captains', label: 'كل الكباتن' },
  { key: 'users', label: 'كل الزبائن' },
  { key: 'specific', label: 'مستلِمون محدّدون' },
];

export default function Broadcast() {
  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [captains, setCaptains] = useState([]);
  const [users, setUsers] = useState([]);
  const [pickedCaptains, setPickedCaptains] = useState({}); // {id: true}
  const [pickedUsers, setPickedUsers] = useState({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // نجلب القوائم مرّة واحدة (تُستخدم عند اختيار "محدّدون")
  useEffect(() => {
    api.get('/admin/captains').then(setCaptains).catch(() => {});
    api.get('/admin/users').then(setUsers).catch(() => {});
  }, []);

  const captainIds = useMemo(
    () => Object.keys(pickedCaptains).filter((id) => pickedCaptains[id]),
    [pickedCaptains]
  );
  const userIds = useMemo(
    () => Object.keys(pickedUsers).filter((id) => pickedUsers[id]),
    [pickedUsers]
  );

  async function send() {
    setError('');
    setResult(null);
    if (!title.trim()) return setError('عنوان الرسالة مطلوب');
    if (audience === 'specific' && captainIds.length === 0 && userIds.length === 0) {
      return setError('اختر مستلِمًا واحدًا على الأقلّ');
    }
    setSending(true);
    try {
      const res = await api.post('/admin/notifications', {
        audience,
        title: title.trim(),
        body: body.trim(),
        captainIds,
        userIds,
      });
      setResult(res.message || 'تم الإرسال');
      setTitle('');
      setBody('');
      setPickedCaptains({});
      setPickedUsers({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>الرسائل والإشعارات</h1>
      <p style={styles.subtitle}>أرسل رسالة أو إشعارًا للجميع أو لكباتن/زبائن محدّدين</p>

      <div style={styles.card}>
        <label style={styles.label}>الجمهور</label>
        <div style={styles.audienceRow}>
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              style={styles.audienceBtn(audience === a.key)}
              onClick={() => setAudience(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>

        {audience === 'specific' && (
          <div style={styles.pickers}>
            <RecipientPicker
              title={`الكباتن (${captainIds.length})`}
              items={captains}
              picked={pickedCaptains}
              onToggle={(id) => setPickedCaptains((p) => ({ ...p, [id]: !p[id] }))}
            />
            <RecipientPicker
              title={`الزبائن (${userIds.length})`}
              items={users}
              picked={pickedUsers}
              onToggle={(id) => setPickedUsers((p) => ({ ...p, [id]: !p[id] }))}
            />
          </div>
        )}

        <label style={styles.label}>العنوان</label>
        <input
          style={styles.input}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان الرسالة"
        />

        <label style={styles.label}>النص</label>
        <textarea
          style={styles.textarea}
          value={body}
          maxLength={1000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="نص الرسالة (اختياري)"
          rows={4}
        />

        {error && <div style={styles.error}>{error}</div>}
        {result && <div style={styles.success}>{result}</div>}

        <button style={styles.sendBtn} onClick={send} disabled={sending}>
          {sending ? 'جارٍ الإرسال…' : 'إرسال'}
        </button>
      </div>
    </div>
  );
}

function RecipientPicker({ title, items, picked, onToggle }) {
  const [q, setQ] = useState('');
  const filtered = items.filter(
    (it) => !q || (it.name || '').includes(q) || (it.phone || '').includes(q)
  );
  return (
    <div style={styles.picker}>
      <div style={styles.pickerTitle}>{title}</div>
      <input
        style={styles.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="بحث بالاسم أو الهاتف"
      />
      <div style={styles.pickerList}>
        {filtered.length === 0 && <div style={styles.pickerEmpty}>لا نتائج</div>}
        {filtered.map((it) => (
          <label key={it._id} style={styles.pickerItem}>
            <input type="checkbox" checked={!!picked[it._id]} onChange={() => onToggle(it._id)} />
            <span>{it.name} <span style={styles.pickerPhone}>{it.phone}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 900, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  card: {
    background: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: 24,
    boxShadow: theme.shadow.card,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: { fontSize: 14, fontWeight: 600, color: theme.color.onSurface, marginTop: 8 },
  audienceRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  audienceBtn: (active) => ({
    padding: '8px 18px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    border: 'none',
    fontSize: 14,
    background: active ? theme.color.primary : theme.color.surfaceContainer,
    color: active ? theme.color.onPrimary : theme.color.muted,
  }),
  pickers: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 8 },
  picker: {
    border: `1px solid ${theme.color.outline}`,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  pickerTitle: { fontWeight: 700, marginBottom: 8, fontSize: 14 },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.outlineStrong}`,
    marginBottom: 8,
    fontSize: 13,
  },
  pickerList: { maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 },
  pickerEmpty: { color: theme.color.muted, fontSize: 13, padding: 8 },
  pickerItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' },
  pickerPhone: { color: theme.color.muted, fontSize: 12 },
  input: {
    padding: '10px 12px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.outlineStrong}`,
    fontSize: 14,
    fontFamily: theme.font,
  },
  textarea: {
    padding: '10px 12px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.outlineStrong}`,
    fontSize: 14,
    fontFamily: theme.font,
    resize: 'vertical',
  },
  error: {
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: theme.radius.sm,
    padding: '8px 12px',
    fontSize: 13,
    marginTop: 8,
  },
  success: {
    background: '#dcfce7',
    color: '#166534',
    borderRadius: theme.radius.sm,
    padding: '8px 12px',
    fontSize: 13,
    marginTop: 8,
  },
  sendBtn: {
    marginTop: 16,
    background: theme.color.primary,
    color: theme.color.onPrimary,
    border: 'none',
    padding: '12px 24px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 600,
    alignSelf: 'flex-start',
  },
};
