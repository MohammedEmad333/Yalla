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

export default function LiveDashboard() {
  const [orders, setOrders] = useState([]);       // الطلبات النشطة
  const [captains, setCaptains] = useState([]);    // الكباتن المتاحون
  const [selected, setSelected] = useState({});    // {orderId: captainId} للإسناد
  const token = localStorage.getItem('token');     // توكن الأدمن

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
    // نعيد جلب قائمة المتاحين من الخادم بدل التخمين — تعكس حالة online/busy الحقيقية
    const loadCaptains = () =>
      fetch(`${API}/api/orders/available-captains`, { headers }).then((r) => r.json()).then(setCaptains);

    loadOrders();
    loadCaptains();

    socket.connect();

    // طلب جديد أنشأه مستخدم -> أضِفه أعلى القائمة
    socket.on('order:created', (order) => {
      setOrders((prev) => [order, ...prev]);
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
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={{ margin: 0 }}>اللوحة اللحظية</h1>
          <p style={styles.subtitle}>متابعة الطلبات النشطة وإسناد الكباتن في الوقت الفعلي</p>
        </div>
        <span style={styles.badge}>
          <span style={styles.pulse} /> الكباتن المتاحون: {captains.length}
        </span>
      </header>

      <div style={styles.grid}>
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
              {o.captain && <p style={styles.line}>🧑‍✈️ <b>الكابتن:</b> {o.captain?.name}</p>}

              {/* الإسناد متاح فقط للطلبات في حالة الانتظار */}
              {o.status === 'pending' && (
                <div style={styles.assignRow}>
                  <select
                    value={selected[o._id] || ''}
                    onChange={(e) => setSelected((p) => ({ ...p, [o._id]: e.target.value }))}
                    style={styles.select}
                  >
                    <option value="">— اختر كابتن —</option>
                    {captains.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.vehicleType})
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

        {/* عمود الكباتن المتاحين */}
        <aside style={styles.col}>
          <h2 style={styles.colTitle}>الكباتن المتاحون</h2>
          {captains.length === 0 && <p style={styles.empty}>لا يوجد كباتن متصلون</p>}
          {captains.map((c) => (
            <div key={c._id} style={styles.captainCard}>
              <span style={styles.dot} />
              <div>
                <strong>{c.name}</strong>
                <div style={styles.captainMeta}>{c.vehicleType} · ⭐ {c.rating}</div>
              </div>
            </div>
          ))}
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
