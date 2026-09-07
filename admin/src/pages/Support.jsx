// التواصل المباشر بين الزبائن والأدمن (Card 46)
// يعرض سلاسل الدعم (زبون لكل سلسلة) مع عدّاد غير المقروء، ويتيح للأدمن الردّ مباشرة.

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API } from '../api/client';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
} from '../components/ui';
import { IconChevron, IconSend, IconSupport, IconTrash } from '../components/icons';

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
    <>
      <PageHeader
        title="الدعم والتواصل"
        subtitle="ردّ على استفسارات الزبائن — تُحذف الرسائل المقروءة تلقائيًا بعد يوم، ويمكنك حذف أيّ رسالة نهائيًا"
      />

      <div className="yl-convo" data-open={!!active}>
        {/* قائمة المحادثات */}
        <Card className="yl-convo__list" title={`المحادثات (${threads.length})`} pad={false}>
          {threads.length === 0 ? (
            <EmptyState icon={<IconSupport size={26} />} title="لا توجد رسائل بعد" />
          ) : (
            <div className="yl-list" style={{ padding: 'var(--s-2)' }}>
              {threads.map((t) => (
                <button
                  key={t.userId}
                  className="yl-listitem"
                  aria-current={active === t.userId}
                  onClick={() => openThread(t.userId)}
                >
                  <Avatar name={t.name} />
                  <span className="yl-listitem__main">
                    <span className="yl-listitem__title">{t.name}</span>
                    <span className="yl-listitem__sub">
                      {t.lastSender === 'admin' ? 'أنت: ' : ''}
                      {t.lastText}
                    </span>
                  </span>
                  {t.unread > 0 && <span className="yl-unread">{t.unread}</span>}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* نافذة المحادثة */}
        <Card className="yl-convo__panel" pad={false}>
          {!active ? (
            <EmptyState icon={<IconSupport size={26} />} title="اختر محادثة للردّ عليها" />
          ) : (
            <>
              <header className="yl-card__head">
                <div className="yl-row">
                  <span className="yl-hide-lg">
                    <IconButton label="رجوع للقائمة" small onClick={() => { setActive(null); activeRef.current = null; }}>
                      <IconChevron size={18} style={{ transform: 'scaleX(-1)' }} />
                    </IconButton>
                  </span>
                  <Avatar name={activeThread?.name} size="sm" />
                  <div>
                    <b>{activeThread?.name}</b>
                    <div className="yl-hint yl-num">{activeThread?.phone}</div>
                  </div>
                </div>
              </header>

              <div className="yl-thread yl-convo__body">
                {messages.length === 0 && <p className="yl-muted">لا رسائل</p>}
                {messages.map((m) => {
                  const me = m.senderRole === 'admin';
                  return (
                    <div key={m._id} className={`yl-bubble ${me ? 'yl-bubble--out' : 'yl-bubble--in'}`}>
                      <div>{m.text}</div>
                      <div className="yl-row" style={{ gap: 'var(--s-2)', justifyContent: 'space-between' }}>
                        <span className="yl-bubble__meta">
                          {me ? 'الإدارة' : 'الزبون'} · {fmtTime(m.createdAt)}
                        </span>
                        <button
                          className="yl-bubble__del"
                          title="حذف الرسالة نهائيًا"
                          onClick={() => deleteMessage(m._id)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="yl-convo__composer">
                <Input
                  placeholder="اكتب ردّك للزبون…"
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
