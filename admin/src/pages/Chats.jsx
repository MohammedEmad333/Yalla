// مراقبة محادثات الطلبات (Card 32 + Card 45)
// يعرض الأدمن المحادثات الجارية بين الزبائن والكباتن، يدخل أيّها، يشارك برسالة
// تظهر بأيقونة أدمن خاصّة 🛡️، ويصدّر نسخة CSV من المحادثة (حتى بعد انتهائها).

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { theme } from '../theme';
import { API } from '../api/client';

const ROLE_META = {
  user: { icon: '👤', label: 'صاحب الطلب', bg: '#eff6ff', me: false },
  captain: { icon: '🧑‍✈️', label: 'الكابتن', bg: '#f0fdf4', me: false },
  admin: { icon: '🛡️', label: 'الأدمن', bg: '#fef9c3', me: true }, // أيقونة الأدمن الخاصّة
};

// Card 93: طرف محادثة (أيقونة + اسم) مع زرّ اتصال هاتفي مباشر إن توفّر رقمه.
function Party({ icon, name, phone }) {
  return (
    <span style={styles.party}>
      <span>{icon}</span>
      <span>{name || '—'}</span>
      {phone && (
        <a href={`tel:${phone}`} style={styles.callBtn} title={`اتصال بـ ${name || ''} (${phone})`}>
          📞 اتصال
        </a>
      )}
    </span>
  );
}

function fmtTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export default function Chats() {
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);   // orderId المفتوح
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const token = localStorage.getItem('token');
  const bottomRef = useRef(null);

  const socket = useMemo(() => io(API, { auth: { token }, autoConnect: false }), [token]);
  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadChats = () =>
    fetch(`${API}/api/admin/chats`, { headers: authHeaders }).then((r) => r.json()).then(setChats);

  // تحميل قائمة المحادثات + الاشتراك في رسائل جديدة عبر السوكت
  useEffect(() => {
    loadChats();
    socket.connect();
    socket.on('chat:message', (m) => {
      // إن كانت الرسالة تخصّ المحادثة المفتوحة أضِفها فورًا
      setMessages((prev) => (m.order === active ? [...prev, m] : prev));
      loadChats();
    });
    return () => socket.disconnect();
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  // عند فتح محادثة: انضمّ لغرفة الطلب واجلب رسائلها
  async function openChat(orderId) {
    setActive(orderId);
    setMessages([]);
    socket.emit('order:join', { orderId }); // الانضمام لغرفة الطلب لبثّ لحظي
    const data = await fetch(`${API}/api/admin/chats/${orderId}/messages`, { headers: authHeaders })
      .then((r) => r.json());
    setMessages(Array.isArray(data) ? data : []);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
  }

  // مشاركة الأدمن برسالة
  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !active) return;
    setText('');
    try {
      const res = await fetch(`${API}/api/admin/chats/${active}/messages`, {
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

  // تصدير المحادثة CSV (تنزيل عبر blob مع ترويسة المصادقة)
  async function exportCsv(orderId) {
    const res = await fetch(`${API}/api/admin/chats/${orderId}/export`, { headers: authHeaders });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${orderId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const activeChat = chats.find((c) => c.orderId === active);

  return (
    <div className="yl-page" style={styles.page}>
      <h1 style={{ margin: '0 0 4px' }}>محادثات الطلبات</h1>
      <p style={styles.subtitle}>متابعة المحادثات الجارية بين الزبائن والكباتن والمشاركة فيها وتصديرها</p>

      <div className="yl-two-col" style={styles.grid}>
        {/* قائمة المحادثات (Card 45) */}
        <aside style={styles.list}>
          <div style={styles.listHead}>
            المحادثات الجارية ({chats.length})
            <button style={styles.reload} onClick={loadChats}>تحديث</button>
          </div>
          {chats.length === 0 && <p style={styles.empty}>لا توجد محادثات جارية</p>}
          {chats.map((c) => (
            <button
              key={c.orderId}
              style={styles.chatItem(active === c.orderId)}
              onClick={() => openChat(c.orderId)}
            >
              <div style={styles.chatItemTop}>
                <b>#{c.orderId.slice(-5)}</b>
                <span style={styles.count}>{c.messages}</span>
              </div>
              <div style={styles.parties}>
                {ROLE_META.user.icon} {c.user?.name || '—'} ↔ {ROLE_META.captain.icon} {c.captain?.name || '—'}
              </div>
              <div style={styles.preview}>{c.lastText}</div>
            </button>
          ))}
        </aside>

        {/* نافذة المحادثة */}
        <section style={styles.thread}>
          {!active && <div style={styles.placeholder}>اختر محادثة لعرضها</div>}
          {active && (
            <>
              <div style={styles.threadHead}>
                <div>
                  <b>طلب #{active.slice(-5)}</b>
                  {/* Card 93: أيقونة واسم كل طرف + زرّ اتصال هاتفي مباشر بجانبه */}
                  <div style={styles.partiesRow}>
                    <Party icon={ROLE_META.user.icon} name={activeChat?.user?.name} phone={activeChat?.user?.phone} />
                    <span style={styles.partySep}>↔</span>
                    <Party icon={ROLE_META.captain.icon} name={activeChat?.captain?.name} phone={activeChat?.captain?.phone} />
                  </div>
                </div>
                <button style={styles.exportBtn} onClick={() => exportCsv(active)}>⬇ تصدير CSV</button>
              </div>

              <div style={styles.messages}>
                {messages.length === 0 && <p style={styles.empty}>لا رسائل</p>}
                {messages.map((m) => {
                  const meta = ROLE_META[m.senderRole] || ROLE_META.user;
                  return (
                    <div key={m._id} style={styles.msgRow(meta.me)}>
                      <div style={styles.bubble(meta.bg, meta.me)}>
                        <div style={styles.msgSender}>{meta.icon} {meta.label}</div>
                        <div>{m.text}</div>
                        <div style={styles.msgTime}>{fmtTime(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} style={styles.composer}>
                <input
                  style={styles.input}
                  placeholder="اكتب رسالة كأدمن…"
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
  chatItem: (active) => ({
    textAlign: 'right', cursor: 'pointer', border: `1px solid ${active ? theme.color.primary : theme.color.outline}`,
    background: active ? theme.color.secondarySoft : theme.color.card, borderRadius: theme.radius.md,
    padding: 12, display: 'flex', flexDirection: 'column', gap: 4,
  }),
  chatItemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  count: { background: theme.color.primary, color: '#fff', borderRadius: theme.radius.pill, padding: '1px 8px', fontSize: 11 },
  parties: { fontSize: 13, color: theme.color.onSurfaceVariant },
  preview: { fontSize: 12, color: theme.color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  thread: {
    background: theme.color.card, borderRadius: theme.radius.lg, boxShadow: theme.shadow.card,
    minHeight: 420, display: 'flex', flexDirection: 'column',
  },
  placeholder: { margin: 'auto', color: theme.color.muted, padding: 40 },
  threadHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottom: `1px solid ${theme.color.outline}`,
  },
  sub: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  // Card 93: صفّ أطراف المحادثة مع أزرار الاتصال
  partiesRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  party: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: theme.color.onSurfaceVariant },
  partySep: { color: theme.color.muted },
  callBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: theme.color.success || '#16a34a', color: '#fff', textDecoration: 'none',
    padding: '3px 10px', borderRadius: theme.radius.pill, fontSize: 12, whiteSpace: 'nowrap',
  },
  exportBtn: {
    background: theme.color.secondary, color: theme.color.onSecondary, border: 'none',
    padding: '8px 14px', borderRadius: theme.radius.pill, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
  },
  messages: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 460 },
  msgRow: (me) => ({ display: 'flex', justifyContent: me ? 'flex-start' : 'flex-end' }),
  bubble: (bg, me) => ({
    background: bg, borderRadius: theme.radius.md, padding: '8px 12px', maxWidth: '75%',
    border: `1px solid ${me ? theme.color.warning || '#eab308' : theme.color.outline}`,
  }),
  msgSender: { fontSize: 11, color: theme.color.muted, marginBottom: 2 },
  msgTime: { fontSize: 10, color: theme.color.muted, marginTop: 2, textAlign: 'left' },
  composer: { display: 'flex', gap: 8, padding: 16, borderTop: `1px solid ${theme.color.outline}` },
  input: { flex: 1, padding: '10px 14px', borderRadius: theme.radius.pill, border: `1px solid ${theme.color.outlineStrong}` },
  sendBtn: {
    background: theme.color.primary, color: theme.color.onPrimary, border: 'none',
    padding: '10px 20px', borderRadius: theme.radius.pill, cursor: 'pointer',
  },
};
