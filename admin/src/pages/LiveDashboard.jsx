// لوحة التحكّم اللحظية (Admin Panel)
// تعرض الطلبات النشطة والكباتن المتاحين، وتتيح إسناد الطلب لكابتن.
// تعتمد على Socket.io لاستقبال التحديثات فورًا دون إعادة تحميل.

import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { theme, orderStatusColor } from '../theme';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// اسم صاحب الطلب كاملًا (الاسم الأول + اسم العائلة إن وُجد)
const fullName = (u) => [u?.name, u?.lastName].filter(Boolean).join(' ') || '—';

const STATUS_AR = {
  pending: 'بانتظار',
  assigned: 'مُسنَد',
  accepted: 'مقبول',
  picked_up: 'جارٍ التوصيل',
  delivered: 'مسلّم',
  cancelled: 'ملغى',
};

// تنسيق وقت مختصر (يوم/شهر ساعة:دقيقة) لعرض المخطط الزمني
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

// بناء أسطر العنوان المُفصّل (الحي/الشارع/التفاصيل/الملاحظة) لنقطة استلام أو تسليم
const addressLines = (loc) => {
  if (!loc) return [];
  const parts = [
    ['الحي', loc.neighborhood],
    ['الشارع', loc.street],
    ['التفاصيل', loc.details],
    ['ملاحظة', loc.note],
  ].filter(([, v]) => v && String(v).trim());
  if (parts.length === 0 && loc.address) return [['العنوان', loc.address]];
  return parts;
};

// لوحة كل تفاصيل الطلب (Card 29): تُعرض عند طلب الأدمن، وتضمّ الأسعار والمسافة
// والزمن ووصف الشحنة والعناوين المُفصّلة والمخطط الزمني وسبب الإلغاء إن وُجد.
function OrderDetails({ order: o }) {
  const finalPrice = Number(o.finalPrice) || 0;
  const timeline = o.timeline || {};
  const steps = [
    ['أُنشئ', o.createdAt],
    ['أُسنِد', timeline.assignedAt],
    ['قُبِل', timeline.acceptedAt],
    ['استُلم', timeline.pickedUpAt],
    ['سُلّم', timeline.deliveredAt],
    ['أُلغي', timeline.cancelledAt],
  ].filter(([, t]) => t);

  const money = (v) => `${Number(v) || 0} ₪`;

  return (
    <div style={styles.details}>
      {/* الأرقام: الأسعار والمسافة والزمن */}
      <div style={styles.detailGrid}>
        <Detail label="السعر التقريبي" value={money(o.price)} />
        {finalPrice > 0 && <Detail label="السعر النهائي" value={money(finalPrice)} />}
        {(Number(o.commission) || 0) > 0 && <Detail label="عمولة الشركة" value={money(o.commission)} />}
        {(Number(o.captainNet) || 0) > 0 && <Detail label="صافي الكابتن" value={money(o.captainNet)} />}
        <Detail label="المسافة" value={`${o.distanceKm ?? 0} كم`} />
        <Detail label="الزمن التقديري" value={`${o.etaMinutes ?? 0} دقيقة`} />
      </div>

      {o.packageNote && <p style={styles.line}>📦 <b>وصف الشحنة:</b> {o.packageNote}</p>}

      {/* العناوين المُفصّلة لنقطتَي الاستلام والتسليم */}
      <AddressBlock title="📍 تفاصيل الاستلام" loc={o.pickup} />
      <AddressBlock title="🏁 تفاصيل التسليم" loc={o.dropoff} />

      {/* المخطط الزمني */}
      {steps.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <b style={styles.detailHead}>المخطط الزمني</b>
          {steps.map(([label, t]) => (
            <p key={label} style={styles.timelineRow}>
              <span>{label}</span>
              <span style={styles.timelineTime}>{fmtTime(t)}</span>
            </p>
          ))}
        </div>
      )}

      {o.status === 'cancelled' && o.cancelReason && (
        <p style={styles.line}>🚫 <b>سبب الإلغاء:</b> {o.cancelReason}</p>
      )}
    </div>
  );
}

// سطر «تسمية: قيمة» داخل شبكة الأرقام
function Detail({ label, value }) {
  return (
    <div style={styles.detailCell}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

// كتلة عنوان مُفصّل (الحي/الشارع/التفاصيل/الملاحظة + جهة الاتصال إن وُجدت)
function AddressBlock({ title, loc }) {
  const lines = addressLines(loc);
  if (lines.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <b style={styles.detailHead}>{title}</b>
      {lines.map(([label, value]) => (
        <p key={label} style={styles.line}><b>{label}:</b> {value}</p>
      ))}
      {(loc?.contactName || loc?.contactPhone) && (
        <p style={styles.line}>
          <b>جهة الاتصال:</b> {[loc.contactName, loc.contactPhone].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function LiveDashboard() {
  const [orders, setOrders] = useState([]);       // الطلبات النشطة
  const [captains, setCaptains] = useState([]);    // كل الكباتن المعتمَدين مع حالتهم
  const [selected, setSelected] = useState({});    // {orderId: captainId} للإسناد
  const [expanded, setExpanded] = useState({});    // {orderId: bool} عرض كل التفاصيل (Card 29)
  const [delayed, setDelayed] = useState({});      // {orderId: warning} الطلبات المتأخّرة (Card 40)
  const token = localStorage.getItem('token');     // توكن الأدمن

  // عدد الكباتن المتصلين (لعرضه في الترويسة)
  const onlineCount = captains.filter((c) => c.online).length;

  // إنشاء اتصال السوكت مرة واحدة (مع تمرير التوكن في المصادقة)
  const socket = useMemo(
    () => io(API, { auth: { token }, autoConnect: false }),
    [token]
  );

  // ── التحميل الأولي عبر REST ثم الاشتراك في الأحداث اللحظية ──────
  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };

    const loadOrders = () =>
      fetch(`${API}/api/orders/active`, { headers }).then((r) => r.json()).then(setOrders);
    // Card 34/35: نجلب كل الكباتن المعتمَدين (متصلين وغير متصلين) مع علامة الحالة،
    // ليتمكّن الأدمن من الإسناد لكابتن غير متصل ورؤية تمييز واضح لحالته.
    const loadCaptains = () =>
      fetch(`${API}/api/orders/assignable-captains`, { headers }).then((r) => r.json()).then(setCaptains);

    loadOrders();
    loadCaptains();

    socket.connect();

    // طلب جديد أنشأه مستخدم (أو عاد للمجمّع بعد رفض) -> أضِفه أعلى القائمة فورًا.
    // نُزيل أي نسخة سابقة بنفس المعرّف تفاديًا للتكرار عند تسابق الأحداث.
    socket.on('order:created', (order) => {
      setOrders((prev) => [order, ...prev.filter((o) => o._id !== order._id)]);
    });

    // تحديث حالة طلب -> استبدله في القائمة (أو أزِله إن اكتمل)
    socket.on('order:status_updated', (order) => {
      setOrders((prev) => {
        const done = ['delivered', 'cancelled'].includes(order.status);
        const others = prev.filter((o) => o._id !== order._id);
        return done ? others : [order, ...others];
      });
      // الإسناد/التسليم/الإلغاء يغيّر توفّر الكباتن → أعِد جلب المتاحين
      loadCaptains();
    });

    // تغيّر توفّر كابتن (اتصال/انفصال) -> أعِد جلب المتاحين من الخادم.
    // أبسط وأصحّ من التعديل اليدوي: يُظهر الكابتن فور اتصاله دون تحديث الصفحة.
    socket.on('captain:status_changed', () => {
      loadCaptains();
    });

    // Card 40: طلب تجاوز زمنه التقديري -> نُبرزه في اللوحة لمراجعة الكابتن.
    socket.on('order:delayed', (payload) => {
      if (!payload?.orderId) return;
      setDelayed((prev) => ({ ...prev, [payload.orderId]: payload }));
    });

    return () => socket.disconnect(); // تنظيف عند مغادرة الصفحة
  }, [socket, token]);

  // إسناد طلب لكابتن عبر REST (الخادم يبثّ الإشعارات تلقائيًا)
  async function assign(orderId) {
    const captainId = selected[orderId];
    if (!captainId) return alert('اختر كابتن أولًا');

    await fetch(`${API}/api/orders/${orderId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ captainId }),
    });
    // لا نحدّث الحالة يدويًا — سيصلنا حدث order:status_updated
  }

  // إسناد تلقائي لأقرب كابتن (يعتمد فهرس 2dsphere في الخادم)
  async function autoAssign(orderId) {
    const res = await fetch(`${API}/api/orders/${orderId}/auto-assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    if (res.status === 409) {
      alert('لا يوجد كابتن متاح قريب حاليًا — جرّب الإسناد اليدوي');
    }
    // النجاح يصل عبر حدث order:status_updated
  }

  // إلغاء/حذف طلب عالق. الخادم يحرّر الكابتن المُسنَد تلقائيًا (releaseCaptain)
  // فيعود متاحًا. مسموح للحالات: بانتظار/مُسنَد/مقبول (ليس بعد الاستلام).
  async function cancelOrder(orderId) {
    if (!window.confirm('هل تريد إلغاء هذا الطلب؟ سيتحرّر الكابتن المُسنَد إن وُجد ويعود متاحًا.')) return;

    const res = await fetch(`${API}/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'ألغاه الأدمن من اللوحة' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return alert(data?.message || 'تعذّر إلغاء الطلب');
    }
    // النجاح يصل عبر حدث order:status_updated فيُزال من القائمة تلقائيًا
  }

  return (
    <div className="yl-page" style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={{ margin: 0 }}>اللوحة اللحظية</h1>
          <p style={styles.subtitle}>متابعة الطلبات النشطة وإسناد الكباتن في الوقت الفعلي</p>
        </div>
        <span style={styles.badge}>
          <span style={styles.pulse} /> المتصلون: {onlineCount} / {captains.length}
        </span>
      </header>

      {/* Card 40: تنبيه الطلبات المتأخّرة عن زمنها التقديري */}
      {Object.keys(delayed).length > 0 && (
        <div style={styles.delayBanner}>
          <b>⚠️ طلبات متأخّرة عن زمنها التقديري ({Object.keys(delayed).length})</b>
          <span style={{ fontSize: 13 }}> — يُرجى مراجعة الكابتن المسؤول عن كل طلب.</span>
          {Object.values(delayed).map((d) => (
            <div key={d.orderId} style={styles.delayItem}>
              #{d.orderId?.slice(-5)}
              {d.captain?.name ? ` · الكابتن: ${d.captain.name}${d.captain.phone ? ` (${d.captain.phone})` : ''}` : ''}
              <button style={styles.delayDismiss} onClick={() => setDelayed((p) => {
                const n = { ...p }; delete n[d.orderId]; return n;
              })}>تجاهل</button>
            </div>
          ))}
        </div>
      )}

      <div className="yl-dashboard-grid" style={styles.grid}>
        {/* عمود الطلبات النشطة */}
        <section style={styles.col}>
          <h2 style={styles.colTitle}>الطلبات النشطة ({orders.length})</h2>
          {orders.length === 0 && <p style={styles.empty}>لا توجد طلبات حاليًا</p>}

          {orders.map((o) => (
            <div key={o._id} style={styles.card(orderStatusColor(o.status))}>
              <div style={styles.cardTop}>
                <strong style={styles.orderId}>#{o._id?.slice(-5)}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={styles.status(orderStatusColor(o.status))}>
                    {STATUS_AR[o.status] || o.status}
                  </span>
                  {/* Card 40: علامة تأخّر الطلب */}
                  {delayed[o._id] && <span style={styles.delayTag} title="تجاوز الزمن التقديري">⏱️ متأخّر</span>}
                  {/* إلغاء متاح قبل الاستلام فقط */}
                  {['pending', 'assigned', 'accepted'].includes(o.status) && (
                    <button onClick={() => cancelOrder(o._id)} style={styles.cancelBtn} title="إلغاء الطلب">
                      ✕ إلغاء
                    </button>
                  )}
                </div>
              </div>

              {o.user && (
                <p style={styles.line}>
                  👤 <b>صاحب الطلب:</b> {fullName(o.user)}
                  {o.user?.phone ? ` · ${o.user.phone}` : ''}
                </p>
              )}
              <p style={styles.line}>📍 <b>استلام:</b> {o.pickup?.address}</p>
              <p style={styles.line}>🏁 <b>تسليم:</b> {o.dropoff?.address}</p>
              {o.captain && (
                <p style={styles.line}>
                  🧑‍✈️ <b>الكابتن:</b> {o.captain?.name}
                  {o.captain?.phone ? ` · ${o.captain.phone}` : ''}
                </p>
              )}

              {/* زرّ إظهار/إخفاء كل تفاصيل الطلب (Card 29) */}
              <button
                onClick={() => setExpanded((p) => ({ ...p, [o._id]: !p[o._id] }))}
                style={styles.detailsToggle}
              >
                {expanded[o._id] ? '▲ إخفاء التفاصيل' : '▼ عرض كل التفاصيل'}
              </button>

              {expanded[o._id] && <OrderDetails order={o} />}

              {/* الإسناد متاح فقط للطلبات في حالة الانتظار */}
              {o.status === 'pending' && (
                <div style={styles.assignRow}>
                  <select
                    value={selected[o._id] || ''}
                    onChange={(e) => setSelected((p) => ({ ...p, [o._id]: e.target.value }))}
                    style={styles.select}
                  >
                    <option value="">— اختر كابتن —</option>
                    {/* Card 34/35: يُسمح بإسناد كابتن غير متصل (يُوقَظ بالإشعار)؛ المشغول مستبعَد */}
                    {captains.filter((c) => c.assignable).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.online ? '🟢' : '⚪'} {c.name} ({c.vehicleType === 'bicycle' ? 'دراجة' : 'موتوسيكل'})
                        {c.online ? '' : ' — غير متصل'}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => assign(o._id)} style={styles.btn}>إسناد</button>
                  {/* زر الإسناد التلقائي لأقرب كابتن */}
                  <button onClick={() => autoAssign(o._id)} style={styles.btnAuto} title="أقرب كابتن متاح">
                    ⚡ تلقائي
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* عمود الكباتن — كلّهم مع علامة تمييز الحالة (Card 35) */}
        <aside style={styles.col}>
          <h2 style={styles.colTitle}>الكباتن ({captains.length})</h2>
          {captains.length === 0 && <p style={styles.empty}>لا يوجد كباتن معتمَدون</p>}
          {captains.map((c) => {
            const dotColor = c.busy ? '#f59e0b' : c.online ? theme.color.success : '#94a3b8';
            const label = c.busy ? 'مشغول' : c.online ? 'متصل' : 'غير متصل';
            return (
              <div key={c._id} style={styles.captainCard}>
                <span style={{ ...styles.dot, background: dotColor, boxShadow: `0 0 0 3px ${dotColor}22` }} />
                <div>
                  <strong>{c.name}</strong>
                  <div style={styles.captainMeta}>
                    {c.vehicleType === 'bicycle' ? 'دراجة' : 'موتوسيكل'} · ⭐ {c.rating} · {label}
                  </div>
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

const styles = {
  page: { fontFamily: theme.font, direction: 'rtl', padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 16,
    flexWrap: 'wrap',
  },
  subtitle: { color: theme.color.muted, margin: '4px 0 0', fontSize: 14 },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: theme.color.secondarySoft,
    color: theme.color.secondaryDeep,
    padding: '8px 14px',
    borderRadius: theme.radius.pill,
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: 'nowrap',
  },
  pulse: { width: 8, height: 8, borderRadius: '50%', background: theme.color.secondary, boxShadow: `0 0 0 3px ${theme.color.secondary}33` },
  // Card 40: بانر تنبيه الطلبات المتأخّرة
  delayBanner: {
    background: '#fef3c7',
    border: '1px solid #f59e0b',
    color: '#92400e',
    borderRadius: theme.radius.md,
    padding: '12px 16px',
    marginBottom: 20,
  },
  delayItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    fontSize: 13,
  },
  delayDismiss: {
    background: 'transparent',
    border: '1px solid #92400e',
    color: '#92400e',
    borderRadius: theme.radius.pill,
    padding: '2px 10px',
    cursor: 'pointer',
    fontSize: 12,
    marginInlineStart: 'auto',
  },
  delayTag: {
    background: '#f59e0b',
    color: '#fff',
    padding: '3px 10px',
    borderRadius: theme.radius.pill,
    fontSize: 12,
    fontWeight: 600,
  },
  grid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 },
  col: { display: 'flex', flexDirection: 'column', gap: 12 },
  colTitle: { fontSize: 18, margin: '0 0 4px' },
  empty: {
    color: theme.color.muted,
    background: theme.color.card,
    borderRadius: theme.radius.md,
    padding: 20,
    textAlign: 'center',
    border: `1px dashed ${theme.color.outlineStrong}`,
  },
  // البطاقة بخطّ حالة على الحافّة الأمامية (اليمنى في RTL) — كما في دليل التصميم
  card: (statusColor) => ({
    background: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: 18,
    boxShadow: theme.shadow.card,
    borderRight: `4px solid ${statusColor}`,
  }),
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderId: { fontSize: 16, color: theme.color.onSurface },
  cancelBtn: {
    background: 'transparent',
    color: theme.color.error,
    border: `1px solid ${theme.color.error}`,
    padding: '4px 10px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    fontSize: 12,
  },
  status: (bg) => ({
    color: theme.color.onPrimary,
    background: bg,
    padding: '3px 12px',
    borderRadius: theme.radius.pill,
    fontSize: 12,
    fontWeight: 600,
  }),
  line: { margin: '4px 0', fontSize: 14, color: theme.color.onSurfaceVariant },
  // زرّ إظهار/إخفاء التفاصيل (Card 29)
  detailsToggle: {
    marginTop: 10,
    background: 'transparent',
    color: theme.color.primary,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  // لوحة كل التفاصيل (Card 29)
  details: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px dashed ${theme.color.outlineStrong}`,
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
    marginBottom: 8,
  },
  detailCell: {
    display: 'flex',
    flexDirection: 'column',
    background: theme.color.secondarySoft,
    borderRadius: theme.radius.sm,
    padding: '6px 10px',
  },
  detailLabel: { color: theme.color.muted, fontSize: 12 },
  detailValue: { color: theme.color.onSurface, fontSize: 15, fontWeight: 700 },
  detailHead: { display: 'block', fontSize: 13, color: theme.color.onSurface, margin: '2px 0 4px' },
  timelineRow: {
    display: 'flex',
    justifyContent: 'space-between',
    margin: '2px 0',
    fontSize: 13,
    color: theme.color.onSurfaceVariant,
  },
  timelineTime: { color: theme.color.muted },
  assignRow: { display: 'flex', gap: 8, marginTop: 14 },
  select: { flex: 1, padding: 10, borderRadius: theme.radius.sm, border: `1px solid ${theme.color.outlineStrong}` },
  btn: {
    background: theme.color.primary,
    color: theme.color.onPrimary,
    border: 'none',
    padding: '9px 18px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
  },
  btnAuto: {
    background: theme.color.secondary,
    color: theme.color.onSecondary,
    border: 'none',
    padding: '9px 14px',
    borderRadius: theme.radius.pill,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  captainCard: {
    background: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: 14,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    boxShadow: theme.shadow.card,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: theme.color.success,
    boxShadow: `0 0 0 3px ${theme.color.successSoft}`,
    flexShrink: 0,
  },
  captainMeta: { color: theme.color.muted, fontSize: 13, marginTop: 2 },
};
