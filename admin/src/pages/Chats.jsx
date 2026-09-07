// مراقبة محادثات الطلبات (Card 32 + Card 45)
// يعرض الأدمن المحادثات الجارية بين الزبائن والكباتن، يدخل أيّها، يشارك برسالة
// تظهر بشارة «الإدارة»، ويصدّر نسخة CSV من المحادثة (حتى بعد انتهائها).

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API } from '../api/client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
} from '../components/ui';
import { IconChat, IconChevron, IconDownload, IconPhone, IconSend, IconTrash } from '../components/icons';

// دور المُرسِل: التسمية ونغمة الشارة وموضع الفقاعة
const ROLE_META = {
  user: { label: 'صاحب الطلب', tone: 'info', me: false },
  captain: { label: 'الكابتن', tone: 'success', me: false },
  admin: { label: 'الإدارة', tone: 'brand', me: true },
};

// Card 93: طرف محادثة (اسم + زرّ اتصال هاتفي مباشر إن توفّر رقمه)
function Party({ label, name, phone }) {
  return (
    <span className="yl-row" style={{ gap: 6 }}>
      <span className="yl-hint">{label}:</span>
      <b>{name || '—'}</b>
      {phone && (
        <a className="yl-btn yl-btn--soft yl-btn--sm" href={`tel:${phone}`} title={`اتصال بـ ${name || ''}`}>
          <IconPhone size={16} />
          اتصال
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
    // Card 94: حُذفت رسالة — أزِلها فورًا من العرض
    socket.on('chat:message_deleted', (d) => {
      setMessages((prev) => prev.filter((m) => m._id !== d.id));
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

  // Card 94: حذف رسالة واحدة نهائيًا من أي محادثة
  async function deleteMessage(orderId, messageId) {
    if (!window.confirm('حذف هذه الرسالة نهائيًا؟ لا يمكن التراجع.')) return;
    try {
      const res = await fetch(`${API}/api/admin/chats/${orderId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'تعذّر حذف الرسالة');
      }
      // الإزالة تصل أيضًا عبر حدث chat:message_deleted، ونزيلها هنا فورًا احتياطًا
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
      loadChats();
    } catch (err) {
      alert(err.message);
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
    <>
      <PageHeader
        title="محادثات الطلبات"
        subtitle="متابعة المحادثات الجارية بين الزبائن والكباتن والمشاركة فيها وتصديرها"
      />

      <div className="yl-convo" data-open={!!active}>
        {/* قائمة المحادثات (Card 45) */}
        <Card className="yl-convo__list" title={`المحادثات الجارية (${chats.length})`} pad={false}>
          {chats.length === 0 ? (
            <EmptyState icon={<IconChat size={26} />} title="لا توجد محادثات جارية" />
          ) : (
            <div className="yl-list" style={{ padding: 'var(--s-2)' }}>
              {chats.map((c) => (
                <button
                  key={c.orderId}
                  className="yl-listitem"
                  aria-current={active === c.orderId}
                  onClick={() => openChat(c.orderId)}
                >
                  <span className="yl-listitem__main">
                    <span className="yl-listitem__title">
                      #{c.orderId.slice(-5)} · {c.user?.name || '—'} ↔ {c.captain?.name || '—'}
                    </span>
                    <span className="yl-listitem__sub">{c.lastText}</span>
                  </span>
                  {c.messages > 0 && <span className="yl-unread">{c.messages}</span>}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* نافذة المحادثة */}
        <Card className="yl-convo__panel" pad={false}>
          {!active ? (
            <EmptyState icon={<IconChat size={26} />} title="اختر محادثة لعرضها" />
          ) : (
            <>
              <header className="yl-card__head">
                <div>
                  <div className="yl-row">
                    <span className="yl-hide-lg">
                      <IconButton label="رجوع للقائمة" small onClick={() => setActive(null)}>
                        <IconChevron size={18} style={{ transform: 'scaleX(-1)' }} />
                      </IconButton>
                    </span>
                    <b>طلب #{active.slice(-5)}</b>
                  </div>
                  {/* Card 93: كل طرف مع زرّ اتصال هاتفي مباشر */}
                  <div className="yl-row" style={{ marginTop: 6, gap: 'var(--s-4)' }}>
                    <Party label="الزبون" name={activeChat?.user?.name} phone={activeChat?.user?.phone} />
                    <Party label="الكابتن" name={activeChat?.captain?.name} phone={activeChat?.captain?.phone} />
                  </div>
                </div>
                <Button size="sm" variant="soft" icon={<IconDownload size={16} />} onClick={() => exportCsv(active)}>
                  تصدير CSV
                </Button>
              </header>

              <div className="yl-thread yl-convo__body">
                {messages.length === 0 && <p className="yl-muted">لا رسائل</p>}
                {messages.map((m) => {
                  const meta = ROLE_META[m.senderRole] || ROLE_META.user;
                  return (
                    <div key={m._id} className={`yl-bubble ${meta.me ? 'yl-bubble--out' : 'yl-bubble--in'}`}>
                      <div className="yl-row yl-row--between" style={{ gap: 'var(--s-3)' }}>
                        <Badge tone={meta.me ? 'neutral' : meta.tone}>{meta.label}</Badge>
                        {/* Card 94: حذف أي رسالة عن طريق الأدمن */}
                        <button
                          className="yl-bubble__del"
                          title="حذف الرسالة نهائيًا"
                          onClick={() => deleteMessage(m.order || active, m._id)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                      <div style={{ marginTop: 4 }}>{m.text}</div>
                      <span className="yl-bubble__meta">{fmtTime(m.createdAt)}</span>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="yl-convo__composer">
                <Input
                  placeholder="اكتب رسالة كأدمن…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <Button type="submit" variant="primary" icon={<IconSend size={18} />} aria-label="إرسال">
                  <span className="yl-hide-xs">إرسال</span>
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
