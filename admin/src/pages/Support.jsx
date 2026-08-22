// التواصل المباشر بين الزبائن والأدمن (Card 46)
// يعرض سلاسل الدعم (زبون لكل سلسلة) مع عدّاد غير المقروء، ويتيح للأدمن الردّ مباشرة.

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { theme } from '../theme';
import { API } from '../api/client';

function fmtTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function Support() {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);   // userId المفتوح
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const token = localStorage.getItem('token');
  const bottomRef = useRef(null);
  const activeRef = useRef(null);

  const socket = useMemo(() => io(API, { auth: { token }, autoConnect: false }), [token]);
  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadThreads = () =>
    fetch(`${API}/api/admin/support`, { headers: authHeaders }).then((r) => r.json()).then(setThreads);

  useEffect(() => {
    loadThreads();
    socket.connect();
    socket.on('support:message', (m) => {
      // إن كانت تخصّ السلسلة المفتوحة أضِفها؛ ثمّ حدّث القائمة دائمًا
      if (m.user === activeRef.current) setMessages((prev) => [...prev, m]);
      loadThreads();
    });
    // Card 56: حُذفت رسالة نهائيًا -> أزِلها من العرض وحدّث القائمة
    socket.on('support:message_deleted', (p) => {
      setMessages((prev) => prev.filter((m) => m._id !== p.deletedId));
      loadThreads();
    });
    return () => socket.disconnect();
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openThread(userId) {
    setActive(userId);
    activeRef.current = userId;
    setMessages([]);
    const data = await fetch(`${API}/api/admin/support/${userId}/messages`, { headers: authHeaders })
      .then((r) => r.json());
    setMessages(Array.isArray(data) ? data : []);
    loadThreads(); // لتصفير عدّاد غير المقروء
    setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
  }

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !active) return;
    setText('');
    try {
      const res = await fetch(`${API}/api/admin/support/${active}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ text: body }),
      });
      const msg = await res.json();
      if (!res.ok) throw new Error(msg?.message || 'تعذّر الإرسال');
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
    } catch (err) {
      alert(err.message);
      setText(body);
    }
  }

  // Card 56: حذف رسالة نهائيًا (بعد تأكيد). الحذف يبثّه الخادم فتُزال من كل اللوحات.
  async function deleteMessage(id) {
    if (!window.confirm('حذف هذه الرسالة نهائيًا؟ لا يمكن التراجع.')) return;
    try {
      const res = await fetch(`${API}/api/admin/support/messages/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.message || 'تعذّر الحذف');
      }
      setMessages((prev) => prev.filter((m) => m._id !== id));
      loadThreads();
    } catch (err) {
      alert(err.message);
    }
  }

  const activeThread = threads.find((t) => t.userId === active);

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>الدعم والتواصل</h1>
      <p style={styles.subtitle}>
        التواصل المباشر بين الزبائن والإدارة والردّ على استفساراتهم — تُحذف الرسائل المقروءة تلقائيًا بعد يوم، ويمكنك حذف أي رسالة نهائيًا.
      </p>

      <div className="yl-two-col" style={styles.grid}>
        <aside style={styles.list}>
          <div style={styles.listHead}>
            المحادثات ({threads.length})
            <button style={styles.reload} onClick={loadThreads}>تحديث</button>
          </div>
          {threads.length === 0 && <p style={styles.empty}>لا توجد رسائل بعد</p>}
          {threads.map((t) => (
            <button key={t.userId} style={styles.item(active === t.userId)} onClick={() => openThread(t.userId)}>
              <div style={styles.itemTop}>
                <b>{t.name}</b>
                {t.unread > 0 && <span style={styles.badge}>{t.unread}</span>}
              </div>
              <div style={styles.sub}>{t.phone}</div>
              <div style={styles.preview}>
                {t.lastSender === 'admin' ? 'أنت: ' : ''}{t.lastText}
              </div>
            </button>
          ))}
        </aside>

        <section style={styles.thread}>
          {!active && <div style={styles.placeholder}>اختر محادثة للردّ عليها</div>}
          {active && (
            <>
              <div style={styles.threadHead}>
                <b>{activeThread?.name}</b>
                <span style={styles.sub}>{activeThread?.phone}</span>
              </div>
              <div style={styles.messages}>
                {messages.length === 0 && <p style={styles.empty}>لا رسائل</p>}
                {messages.map((m) => {
                  const me = m.senderRole === 'admin';
                  return (
                    <div key={m._id} style={styles.msgRow(me)}>
                      <div style={styles.bubble(me)}>
                        <div>{m.text}</div>
                        <div style={styles.bubbleFoot}>
                          <span style={styles.msgTime}>{me ? '🛡️ الإدارة' : '👤 الزبون'} · {fmtTime(m.createdAt)}</span>
                          <button style={styles.delBtn} title="حذف الرسالة نهائيًا" onClick={() => deleteMessage(m._id)}>🗑</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} style={styles.composer}>
                <input
                  style={styles.input}
                  placeholder="اكتب ردّك للزبون…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" style={styles.sendBtn}>إرسال</button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: { direction: 'rtl', fontFamily: theme.font, padding: 32, maxWidth: 1200, margin: '0 auto' },
  subtitle: { color: theme.color.muted, margin: '0 0 16px', fontSize: 14 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'start' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  listHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, marginBottom: 4 },
  reload: {
    padding: '5px 12px', borderRadius: theme.radius.pill, cursor: 'pointer',
    border: `1px solid ${theme.color.outlineStrong}`, background: theme.color.card, fontSize: 12,
  },
  empty: {
    color: theme.color.muted, background: theme.color.card, borderRadius: theme.radius.md,
    padding: 16, textAlign: 'center', border: `1px dashed ${theme.color.outlineStrong}`,
  },
  item: (active) => ({
    textAlign: 'right', cursor: 'pointer', border: `1px solid ${active ? theme.color.primary : theme.color.outline}`,
    background: active ? theme.color.secondarySoft : theme.color.card, borderRadius: theme.radius.md,
    padding: 12, display: 'flex', flexDirection: 'column', gap: 4,
  }),
  itemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  badge: { background: theme.color.error, color: '#fff', borderRadius: theme.radius.pill, padding: '1px 8px', fontSize: 11 },
  sub: { color: theme.color.muted, fontSize: 12 },
  preview: { fontSize: 12, color: theme.color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  thread: {
    background: theme.color.card, borderRadius: theme.radius.lg, boxShadow: theme.shadow.card,
    minHeight: 420, display: 'flex', flexDirection: 'column',
  },
  placeholder: { margin: 'auto', color: theme.color.muted, padding: 40 },
  threadHead: {
    display: 'flex', gap: 10, alignItems: 'baseline',
    padding: 16, borderBottom: `1px solid ${theme.color.outline}`,
  },
  messages: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 460 },
  msgRow: (me) => ({ display: 'flex', justifyContent: me ? 'flex-start' : 'flex-end' }),
  bubble: (me) => ({
    background: me ? theme.color.secondarySoft : '#eff6ff', borderRadius: theme.radius.md,
    padding: '8px 12px', maxWidth: '75%', border: `1px solid ${theme.color.outline}`,
  }),
  msgTime: { fontSize: 10, color: theme.color.muted, marginTop: 2, textAlign: 'left' },
  bubbleFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  delBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13,
    opacity: 0.6, padding: 0, lineHeight: 1,
  },
  composer: { display: 'flex', gap: 8, padding: 16, borderTop: `1px solid ${theme.color.outline}` },
  input: { flex: 1, padding: '10px 14px', borderRadius: theme.radius.pill, border: `1px solid ${theme.color.outlineStrong}` },
  sendBtn: {
    background: theme.color.primary, color: theme.color.onPrimary, border: 'none',
    padding: '10px 20px', borderRadius: theme.radius.pill, cursor: 'pointer',
  },
};
