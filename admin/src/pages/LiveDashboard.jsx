// لوحة التحكّم اللحظية (Admin Panel)
// تعرض الطلبات النشطة والكباتن المتاحين، وتتيح إسناد الطلب لكابتن.
// تعتمد على Socket.io لاستقبال التحديثات فورًا دون إعادة تحميل.

import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

    // جلب الطلبات النشطة والكباتن المتاحين
    fetch(`${API}/api/orders/active`, { headers })
      .then((r) => r.json())
      .then(setOrders);
    fetch(`${API}/api/orders/available-captains`, { headers })
      .then((r) => r.json())
      .then(setCaptains);

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
    });

    // تغيّر توفّر كابتن -> حدّث قائمة الكباتن
    socket.on('captain:status_changed', ({ captainId, status }) => {
      setCaptains((prev) =>
        status === 'online'
          ? prev // (تبسيط: نعيد الجلب في تطبيق حقيقي)
          : prev.filter((c) => c._id !== captainId)
      );
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

  // لون شارة الحالة
  const statusColor = (s) =>
    ({ pending: '#f59e0b', assigned: '#3b82f6', accepted: '#8b5cf6', picked_up: '#06b6d4' }[s] || '#6b7280');

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1>🛵 يلا — لوحة التحكّم اللحظية</h1>
        <span style={styles.badge}>الكباتن المتاحون: {captains.length}</span>
      </header>

      <div style={styles.grid}>
        {/* عمود الطلبات النشطة */}
        <section style={styles.col}>
          <h2>الطلبات النشطة ({orders.length})</h2>
          {orders.length === 0 && <p style={styles.muted}>لا توجد طلبات حاليًا</p>}

          {orders.map((o) => (
            <div key={o._id} style={styles.card}>
              <div style={styles.cardTop}>
                <strong>#{o._id?.slice(-5)}</strong>
                <span style={{ ...styles.status, background: statusColor(o.status) }}>
                  {o.status}
                </span>
              </div>

              <p>📍 <b>استلام:</b> {o.pickup?.address}</p>
              <p>🏁 <b>تسليم:</b> {o.dropoff?.address}</p>
              {o.captain && <p>🧑‍✈️ <b>الكابتن:</b> {o.captain?.name}</p>}

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
          <h2>الكباتن المتاحون</h2>
          {captains.map((c) => (
            <div key={c._id} style={styles.captainCard}>
              <span style={styles.dot} />
              <div>
                <strong>{c.name}</strong>
                <div style={styles.muted}>{c.vehicleType} · ⭐ {c.rating}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

// أنماط مضمّنة مبسّطة للـ MVP (استبدلها بـ CSS/Tailwind لاحقًا)
const styles = {
  page: { fontFamily: 'system-ui', direction: 'rtl', padding: 24, background: '#f8fafc', minHeight: '100vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  badge: { background: '#dcfce7', color: '#166534', padding: '6px 12px', borderRadius: 20, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 },
  col: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  status: { color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  assignRow: { display: 'flex', gap: 8, marginTop: 12 },
  select: { flex: 1, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' },
  btn: { background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' },
  btnAuto: { background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  captainCard: { background: '#fff', borderRadius: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: '50%', background: '#22c55e' },
  muted: { color: '#94a3b8', fontSize: 13 },
};
