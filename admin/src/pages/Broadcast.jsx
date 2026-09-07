// صفحة إرسال الرسائل/الإشعارات الجماعية (Card 66)
// يرسل الأدمن رسالة للجميع، أو لكل الكباتن، أو لكل الزبائن، أو لمستلِمين محدّدين.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Textarea,
} from '../components/ui';
import { IconSend } from '../components/icons';

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
    <>
      <PageHeader
        title="الرسائل والإشعارات"
        subtitle="أرسل رسالة أو إشعارًا للجميع أو لكباتن/زبائن محدّدين"
      />

      <Card>
        <Field label="الجمهور">
          <div className="yl-chips">
            {AUDIENCES.map((a) => (
              <Chip key={a.key} active={audience === a.key} onClick={() => setAudience(a.key)}>
                {a.label}
              </Chip>
            ))}
          </div>
        </Field>

        {audience === 'specific' && (
          <div className="yl-split yl-split--even" style={{ marginTop: 'var(--s-4)' }}>
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

        <div className="yl-stack" style={{ marginTop: 'var(--s-5)' }}>
          <Field label="العنوان">
            <Input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الرسالة"
            />
          </Field>

          <Field label="النص" hint={`${body.length}/1000`}>
            <Textarea
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              placeholder="نص الرسالة (اختياري)"
              rows={4}
            />
          </Field>

          {error && <Alert tone="error">{error}</Alert>}
          {result && <Alert tone="success">{result}</Alert>}

          <div className="yl-row">
            <span className="yl-spacer" />
            <Button
              variant="primary"
              icon={<IconSend size={18} />}
              onClick={send}
              disabled={sending}
              loading={sending}
            >
              {sending ? 'جارٍ الإرسال…' : 'إرسال'}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

// منتقي مستلِمين مع بحث — يُستخدم للكباتن والزبائن
function RecipientPicker({ title, items, picked, onToggle }) {
  const [q, setQ] = useState('');
  const filtered = items.filter(
    (it) => !q || (it.name || '').includes(q) || (it.phone || '').includes(q)
  );

  return (
    <div className="yl-card yl-card--flat" style={{ overflow: 'hidden' }}>
      <div className="yl-card__head" style={{ padding: 'var(--s-3) var(--s-4)' }}>
        <b>{title}</b>
      </div>
      <div style={{ padding: 'var(--s-3)' }}>
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف"
        />
      </div>
      <div className="yl-picker__list">
        {filtered.length === 0 && <p className="yl-muted" style={{ padding: 'var(--s-3)' }}>لا نتائج</p>}
        {filtered.map((it) => (
          <div key={it._id} style={{ padding: '2px var(--s-3)' }}>
            <Checkbox
              checked={!!picked[it._id]}
              onChange={() => onToggle(it._id)}
              label={
                <>
                  {it.name} <span className="yl-muted yl-num">{it.phone}</span>
                </>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
