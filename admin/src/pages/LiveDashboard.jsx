// لوحة التحكّم اللحظية (Admin Panel)
// تعرض الطلبات النشطة والكباتن المتاحين، وتتيح إسناد الطلب لكابتن.
// تعتمد على Socket.io لاستقبال التحديثات فورًا دون إعادة تحميل.

import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { vehicleLabel } from '../vehicles';
import { useAuth } from '../auth/AuthContext';
import { statusLabel, statusTone } from '../status';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
} from '../components/ui';
import {
  IconBike,
  IconBolt,
  IconCheck,
  IconChevron,
  IconClock,
  IconClose,
  IconEdit,
  IconOrders,
  IconPin,
  IconPlus,
  IconStar,
  IconUsers,
  IconWallet,
} from '../components/icons';

// Card 110: هل يقع الطلب ضمن نطاق مناطق الأدمن؟ (مدينة الاستلام أو التسليم)
// نطاق فارغ = أدمن كامل الصلاحية يرى كل الطلبات.
const orderInRegions = (order, regions) => {
  if (!Array.isArray(regions) || regions.length === 0) return true;
  return regions.includes(order?.pickup?.city) || regions.includes(order?.dropoff?.city);
};

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// اسم صاحب الطلب كاملًا (الاسم الأول + اسم العائلة إن وُجد)
const fullName = (u) => [u?.name, u?.lastName].filter(Boolean).join(' ') || '—';

// Card 52: هل الطلب مجدول لوقت لاحق لم يحن بعد؟
const isScheduledPending = (o) =>
  o?.status === 'pending' &&
  o?.scheduledAt &&
  !o?.scheduledActivated &&
  new Date(o.scheduledAt).getTime() > Date.now();

// تنسيق وقت مختصر (يوم/شهر ساعة:دقيقة) لعرض المخطط الزمني
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

// بناء أسطر العنوان المُفصّل (المدينة/الحي/الشارع/التفاصيل/الملاحظة)
const addressLines = (loc) => {
  if (!loc) return [];
  const parts = [
    ['المدينة', loc.city],
    ['الحي', loc.neighborhood],
    ['الشارع', loc.street],
    ['التفاصيل', loc.details],
    ['ملاحظة', loc.note],
  ].filter(([, v]) => v && String(v).trim());
  if (parts.length === 0 && loc.address) return [['العنوان', loc.address]];
  return parts;
};

// لوحة كل تفاصيل الطلب (Card 29): الأسعار والمسافة والزمن ووصف الشحنة
// والعناوين المُفصّلة والمخطط الزمني وسبب الإلغاء إن وُجد.
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
    <div className="yl-orderdetails">
      {/* الأرقام: الأسعار والمسافة والزمن */}
      <div className="yl-grid yl-grid--stats">
        <Detail label="السعر التقريبي" value={money(o.price)} />
        {finalPrice > 0 && <Detail label="السعر النهائي" value={money(finalPrice)} />}
        {(Number(o.commission) || 0) > 0 && <Detail label="عمولة الشركة" value={money(o.commission)} />}
        {(Number(o.captainNet) || 0) > 0 && <Detail label="صافي الكابتن" value={money(o.captainNet)} />}
        <Detail label="المسافة" value={`${o.distanceKm ?? 0} كم`} />
        <Detail label="الزمن التقديري" value={`${o.etaMinutes ?? 0} دقيقة`} />
      </div>

      {/* Card 52: موعد الطلب المجدول (إن وُجد) */}
      {o.scheduledAt && (
        <p className="yl-soft">
          <b>مجدول للتنفيذ:</b> {fmtTime(o.scheduledAt)}
          {o.scheduledActivated ? ' (حان موعده)' : ''}
        </p>
      )}

      {/* Card 110: أصناف طلب المطعم إن وُجدت */}
      {o.store?.restaurant && (
        <div className="yl-card yl-card--flat yl-card--pad" style={{ marginTop: 'var(--s-3)' }}>
          <b>{o.store.name}</b>
          <div className="yl-stack yl-stack--sm" style={{ marginTop: 'var(--s-2)' }}>
            {(o.store.items || []).map((it, i) => (
              <div className="yl-row yl-row--between" key={i}>
                <span>{it.qty}× {it.name}</span>
                <span className="yl-num">{(Number(it.price) || 0) * (Number(it.qty) || 0)} ₪</span>
              </div>
            ))}
            <div className="yl-row yl-row--between">
              <b>قيمة الأصناف</b>
              <b className="yl-num">{o.store.itemsTotal || 0} ₪</b>
            </div>
          </div>
        </div>
      )}

      {o.packageNote && <p className="yl-soft"><b>وصف الشحنة:</b> {o.packageNote}</p>}

      {/* العناوين المُفصّلة لنقطتَي الاستلام والتسليم */}
      <div className="yl-split yl-split--even">
        <AddressBlock title="تفاصيل الاستلام" loc={o.pickup} />
        <AddressBlock title="تفاصيل التسليم" loc={o.dropoff} />
      </div>

      {/* المخطط الزمني */}
      {steps.length > 0 && (
        <div style={{ marginTop: 'var(--s-3)' }}>
          <b className="yl-label">المخطط الزمني</b>
          <div className="yl-stack yl-stack--sm" style={{ marginTop: 'var(--s-2)' }}>
            {steps.map(([label, t]) => (
              <div className="yl-row yl-row--between" key={label}>
                <span>{label}</span>
                <span className="yl-muted yl-num">{fmtTime(t)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {o.status === 'cancelled' && o.cancelReason && (
        <Alert tone="error">سبب الإلغاء: {o.cancelReason}</Alert>
      )}
    </div>
  );
}

// خليّة «تسمية: قيمة» داخل شبكة الأرقام
function Detail({ label, value }) {
  return (
    <div className="yl-stat" style={{ padding: 'var(--s-3)' }}>
      <div>
        <div className="yl-stat__value yl-num" style={{ fontSize: 'var(--fs-lg)' }}>{value}</div>
        <div className="yl-stat__label">{label}</div>
      </div>
    </div>
  );
}

// كتلة عنوان مُفصّل (+ جهة الاتصال إن وُجدت)
function AddressBlock({ title, loc }) {
  const lines = addressLines(loc);
  if (lines.length === 0) return null;
  return (
    <div style={{ marginTop: 'var(--s-3)' }}>
      <b className="yl-label">{title}</b>
      <dl className="yl-deflist" style={{ marginTop: 'var(--s-2)' }}>
        {lines.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
        {(loc?.contactName || loc?.contactPhone) && (
          <div>
            <dt>جهة الاتصال</dt>
            <dd>{[loc.contactName, loc.contactPhone].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export default function LiveDashboard() {
  const [orders, setOrders] = useState([]);       // الطلبات النشطة
  const [captains, setCaptains] = useState([]);    // كل الكباتن المعتمَدين مع حالتهم
  const [selected, setSelected] = useState({});    // {orderId: captainId} للإسناد
  const [expanded, setExpanded] = useState({});    // {orderId: bool} عرض كل التفاصيل (Card 29)
  const [delayed, setDelayed] = useState({});      // {orderId: warning} الطلبات المتأخّرة (Card 40)
  const [timeouts, setTimeouts] = useState({});    // {orderId: info} طلبات لم يقبلها الكابتن خلال المهلة (Card 54)
  const [priceEdit, setPriceEdit] = useState({}); // Card 74: {orderId: value} تحرير السعر التقريبي
  const [showCreate, setShowCreate] = useState(false); // Card 68: نافذة إنشاء طلب من الأدمن
  const [neighborhoods, setNeighborhoods] = useState({}); // Card 109: {المدينة: [الأحياء]} لمنتقي العنوان
  const [autoAssignOn, setAutoAssignOn] = useState(false); // الإسناد التلقائي (بثّ لكل الكباتن)
  const [autoBusy, setAutoBusy] = useState(false);        // أثناء تبديل الإسناد التلقائي
  const token = localStorage.getItem('token');     // توكن الأدمن
  // Card 110: نطاق مناطق الأدمن — يفلتر الأحداث اللحظية لتوافق ما يجلبه REST المفلتَر
  const { admin } = useAuth();
  const regions = useMemo(() => admin?.regions || [], [admin]);

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
    // الإسناد التلقائي: نجلب حالته الحاليّة لعرض المفتاح في الترويسة
    fetch(`${API}/api/admin/settings`, { headers })
      .then((r) => r.json())
      .then((s) => setAutoAssignOn(!!s?.autoAssignBroadcast))
      .catch(() => {});
    // Card 68 + Card 109: نجلب الأحياء مُجمّعة حسب المدينة لمنتقي المدينة ثمّ الحي
    fetch(`${API}/api/neighborhoods?grouped=1`).then((r) => r.json()).then(setNeighborhoods).catch(() => {});

    socket.connect();

    // طلب جديد أنشأه مستخدم (أو عاد للمجمّع بعد رفض) -> أضِفه أعلى القائمة فورًا.
    // نُزيل أي نسخة سابقة بنفس المعرّف تفاديًا للتكرار عند تسابق الأحداث.
    socket.on('order:created', (order) => {
      // Card 110: أدمن المناطق لا يرى إلّا طلبات نطاقه
      if (!orderInRegions(order, regions)) return;
      setOrders((prev) => [order, ...prev.filter((o) => o._id !== order._id)]);
    });

    // تحديث حالة طلب -> استبدله في القائمة (أو أزِله إن اكتمل)
    socket.on('order:status_updated', (order) => {
      // Card 110: تجاهل تحديثات الطلبات خارج نطاق أدمن المناطق
      if (!orderInRegions(order, regions)) return;
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

    // Card 54: انتهت مهلة قبول الكابتن -> نُنبّه الأدمن بأنّ الطلب عاد بلا كابتن مُسنَد.
    socket.on('order:assign_timeout', (payload) => {
      if (!payload?.orderId) return;
      setTimeouts((prev) => ({ ...prev, [payload.orderId]: payload }));
    });

    return () => socket.disconnect(); // تنظيف عند مغادرة الصفحة
  }, [socket, token, regions]);

  // تبديل الإسناد التلقائي (بثّ الطلبات لكل الكباتن). عند التفعيل يبثّ الخادم
  // كل الطلبات المعلّقة القائمة فورًا للكباتن، ويأخذها أوّل من يقبل.
  async function toggleAutoAssign() {
    const next = !autoAssignOn;
    setAutoBusy(true);
    setAutoAssignOn(next); // تفاؤليًّا
    try {
      const res = await fetch(`${API}/api/admin/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ autoAssignBroadcast: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || 'تعذّر تحديث الإعداد');
      setAutoAssignOn(!!data.autoAssignBroadcast);
      if (data.autoAssignBroadcast) {
        alert(
          `تم تفعيل الإسناد التلقائي ✅\nتُبثّ الطلبات الآن لكل الكباتن مع إشعار، ويأخذها أوّل من يقبل.` +
          (data.broadcasted ? `\nبُثّ ${data.broadcasted} طلبًا معلّقًا حاليًّا.` : '')
        );
      }
    } catch (err) {
      setAutoAssignOn(!next); // تراجع عند الفشل
      alert(err.message || 'تعذّر تحديث الإعداد');
    } finally {
      setAutoBusy(false);
    }
  }

  // Card 74: حفظ السعر التقريبي (سقف الطلب) الجديد — الخادم يبثّ التحديث لحظيًا
  async function savePrice(orderId) {
    const raw = priceEdit[orderId];
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) return alert('أدخل سعرًا صحيحًا');
    const res = await fetch(`${API}/api/orders/${orderId}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ price }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return alert(data?.message || 'تعذّر تعديل السعر');
    }
    // نغلق المحرّر — التحديث يصل عبر حدث order:status_updated فيُحدَّث السعر تلقائيًا
    setPriceEdit((p) => { const n = { ...p }; delete n[orderId]; return n; });
  }

  // يحدّث رصيد صاحب الطلب في الحالة المحلية لكل الطلبات التي تخصّه (Card 87/88)
  function setUserBalance(userId, balance) {
    setOrders((prev) =>
      prev.map((o) =>
        o.user?._id === userId ? { ...o, user: { ...o.user, balance } } : o
      )
    );
  }

  // Card 81: إضافة رصيد لحساب خارجي مؤقّت ليكفي لدفع قيمة طلبه
  async function creditExternal(o) {
    const userId = o.user?._id;
    if (!userId) return;
    const raw = window.prompt(`المبلغ المراد إضافته لرصيد صاحب الطلب (₪):`, String(o.price));
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return alert('أدخل مبلغًا صحيحًا');
    const res = await fetch(`${API}/api/admin/users/${userId}/wallet/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return alert(data?.message || 'تعذّر إضافة الرصيد');
    // Card 87: نعرض الرصيد المحدّث فورًا في اللوحة بعد الإضافة
    setUserBalance(userId, data.balance);
    alert(`تمت إضافة الرصيد. الرصيد الحالي: ${data.balance} ₪`);
  }

  // Card 87: تعديل رصيد الحساب الخارجي على قيمة محدّدة (بعد إضافته)
  async function editBalance(o) {
    const userId = o.user?._id;
    if (!userId) return;
    const current = Number(o.user?.balance) || 0;
    const raw = window.prompt(`الرصيد الجديد لصاحب الطلب (₪):`, String(current));
    if (raw == null) return;
    const balance = Number(raw);
    if (!Number.isFinite(balance) || balance < 0) return alert('أدخل رصيدًا صحيحًا');
    const res = await fetch(`${API}/api/admin/users/${userId}/wallet/balance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ balance }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return alert(data?.message || 'تعذّر تعديل الرصيد');
    setUserBalance(userId, data.balance);
    alert(`تم تعديل الرصيد. الرصيد الحالي: ${data.balance} ₪`);
  }

  // Card 82: إرسال رمز التسليم إلى إشعارات الكابتن المُسنَد
  async function sendCode(orderId) {
    const res = await fetch(`${API}/api/orders/${orderId}/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return alert(data?.message || 'تعذّر إرسال الرمز');
    alert('أُرسل رمز التسليم إلى إشعارات الكابتن');
  }

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

  // إغلاق طلب عالق إداريًّا (تم التسليم) — لتصفية الطلبات القديمة التي تعذّر
  // إغلاقها عبر التدفّق العادي (مثل طلبات ما قبل ميزة رمز التسليم). إغلاق إداريّ
  // فقط بلا تسوية مالية؛ الخادم يحرّر الكابتن المُسنَد فيعود متاحًا.
  async function forceComplete(orderId) {
    if (!window.confirm(
      'إغلاق الطلب إداريًّا كـ«تم التسليم»؟\n\n' +
      'يُستخدم للطلبات القديمة العالقة فقط. لا تُخصَم أي مبالغ من المحفظة ولا تُصرَف ' +
      'نسبة للكابتن (تُسوّى نقدًا). سيتحرّر الكابتن المُسنَد إن وُجد ويعود متاحًا.'
    )) return;

    const res = await fetch(`${API}/api/orders/${orderId}/force-complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return alert(data?.message || 'تعذّر إغلاق الطلب');
    }
    // النجاح يصل عبر حدث order:status_updated فيُزال من القائمة تلقائيًا
  }

  return (
    <>
      <PageHeader
        title="اللوحة اللحظية"
        subtitle="متابعة الطلبات النشطة وإسناد الكباتن في الوقت الفعلي"
      >
        {/* الإسناد التلقائي: يبثّ الطلبات لكل الكباتن ليأخذها أوّل من يقبل */}
        <Button
          variant={autoAssignOn ? 'success' : 'outline'}
          onClick={toggleAutoAssign}
          disabled={autoBusy}
          title="عند التفعيل تُرسَل الطلبات لكل الكباتن مع إشعار (حتى لو الهاتف مغلق)، ويأخذها أوّل من يقبل ثم تختفي من الباقين"
          icon={<IconBolt size={18} />}
        >
          {autoBusy ? '…' : `الإسناد التلقائي: ${autoAssignOn ? 'مفعّل' : 'متوقّف'}`}
        </Button>
        {/* Card 68: إنشاء طلب من لوحة الأدمن */}
        <Button variant="primary" icon={<IconPlus size={18} />} onClick={() => setShowCreate(true)}>
          إنشاء طلب
        </Button>
      </PageHeader>

      {/* ملخّص سريع: الطلبات النشطة والكباتن المتصلون ونطاق الأدمن */}
      <div className="yl-grid yl-grid--stats" style={{ marginBottom: 'var(--s-5)' }}>
        <div className="yl-stat">
          <span className="yl-stat__icon" style={{ background: 'var(--brand-tint)', color: 'var(--brand-deep)' }}>
            <IconOrders size={22} />
          </span>
          <div>
            <div className="yl-stat__value yl-num">{orders.length}</div>
            <div className="yl-stat__label">طلبات نشطة</div>
          </div>
        </div>
        <div className="yl-stat">
          <span className="yl-stat__icon" style={{ background: 'var(--success-tint)', color: 'var(--success)' }}>
            <IconUsers size={22} />
          </span>
          <div>
            <div className="yl-stat__value yl-num">{onlineCount} / {captains.length}</div>
            <div className="yl-stat__label">كباتن متصلون</div>
          </div>
        </div>
        {/* Card 110: نطاق مناطق الأدمن (يظهر لأدمن المناطق فقط) */}
        {regions.length > 0 && (
          <div className="yl-stat">
            <span className="yl-stat__icon" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)' }}>
              <IconPin size={22} />
            </span>
            <div>
              <div className="yl-stat__value" style={{ fontSize: 'var(--fs-lg)' }}>{regions.join('، ')}</div>
              <div className="yl-stat__label">نطاق الإشراف</div>
            </div>
          </div>
        )}
      </div>

      {/* Card 68: نافذة إنشاء طلب نيابةً عن صاحب الطلب */}
      {showCreate && (
        <CreateOrderModal
          token={token}
          neighborhoods={neighborhoods}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Card 54: طلبات لم يقبلها الكابتن خلال المهلة وعادت للمجمّع */}
      {Object.keys(timeouts).length > 0 && (
        <div className="yl-alert yl-alert--warning yl-banner">
          <div>
            <b>طلبات لم يقبلها الكابتن خلال المهلة ({Object.keys(timeouts).length})</b>
            <div>عادت بلا كابتن مُسنَد، يُرجى إعادة إسنادها.</div>
            {Object.values(timeouts).map((t) => (
              <div className="yl-row" key={t.orderId}>
                <span>
                  #{t.orderId?.slice(-5)}
                  {t.captain?.name ? ` · الكابتن: ${t.captain.name}${t.captain.phone ? ` (${t.captain.phone})` : ''}` : ''}
                </span>
                <button
                  className="yl-link"
                  onClick={() => setTimeouts((p) => { const n = { ...p }; delete n[t.orderId]; return n; })}
                >
                  تجاهل
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card 40: طلبات متأخّرة عن زمنها التقديري */}
      {Object.keys(delayed).length > 0 && (
        <div className="yl-alert yl-alert--error yl-banner">
          <div>
            <b>طلبات متأخّرة عن زمنها التقديري ({Object.keys(delayed).length})</b>
            <div>يُرجى مراجعة الكابتن المسؤول عن كل طلب.</div>
            {Object.values(delayed).map((d) => (
              <div className="yl-row" key={d.orderId}>
                <span>
                  #{d.orderId?.slice(-5)}
                  {d.captain?.name ? ` · الكابتن: ${d.captain.name}${d.captain.phone ? ` (${d.captain.phone})` : ''}` : ''}
                </span>
                <button
                  className="yl-link"
                  onClick={() => setDelayed((p) => { const n = { ...p }; delete n[d.orderId]; return n; })}
                >
                  تجاهل
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="yl-split yl-split--rev">
        {/* عمود الطلبات النشطة */}
        <section className="yl-stack">
          <h2 className="yl-section-title">الطلبات النشطة ({orders.length})</h2>
          {orders.length === 0 && (
            <EmptyState icon={<IconOrders size={26} />} title="لا توجد طلبات حاليًا" />
          )}

          {orders.map((o) => (
            <Card key={o._id} className="yl-order" data-status={o.status}>
              <div className="yl-row yl-row--between" style={{ marginBottom: 'var(--s-3)' }}>
                <div className="yl-row">
                  <b className="yl-num" style={{ fontSize: 'var(--fs-lg)' }}>#{o._id?.slice(-5)}</b>
                  <Badge tone={statusTone(o.status)} dot>{statusLabel(o.status)}</Badge>
                  {/* Card 52: طلب مجدول لوقت لاحق */}
                  {isScheduledPending(o) && (
                    <Badge tone="info">مجدول · {fmtTime(o.scheduledAt)}</Badge>
                  )}
                  {/* مبثوث لكل الكباتن (الإسناد التلقائي) */}
                  {o.broadcast && o.status === 'pending' && <Badge tone="brand">مبثوث</Badge>}
                  {/* Card 40: تأخّر الطلب */}
                  {delayed[o._id] && <Badge tone="danger">متأخّر</Badge>}
                </div>

                <div className="yl-btnrow">
                  {/* إلغاء متاح قبل الاستلام فقط */}
                  {['pending', 'assigned', 'accepted'].includes(o.status) && (
                    <Button size="sm" variant="danger" onClick={() => cancelOrder(o._id)} icon={<IconClose size={16} />}>
                      إلغاء
                    </Button>
                  )}
                  {/* إغلاق إداريّ للطلبات العالقة */}
                  {['assigned', 'accepted', 'picked_up'].includes(o.status) && (
                    <Button size="sm" variant="success" onClick={() => forceComplete(o._id)} icon={<IconCheck size={16} />}>
                      إغلاق
                    </Button>
                  )}
                </div>
              </div>

              <dl className="yl-deflist">
                {o.user && (
                  <div>
                    <dt>صاحب الطلب</dt>
                    <dd>{fullName(o.user)}{o.user?.phone ? ` · ${o.user.phone}` : ''}</dd>
                  </div>
                )}
                {/* Card 88: رصيد محفظة صاحب الطلب */}
                {o.user && (
                  <div><dt>رصيده</dt><dd className="yl-num">{Number(o.user.balance) || 0} ₪</dd></div>
                )}
                <div><dt>استلام</dt><dd>{o.pickup?.address}</dd></div>
                <div><dt>تسليم</dt><dd>{o.dropoff?.address}</dd></div>
                {o.captain && (
                  <div>
                    <dt>الكابتن</dt>
                    <dd>{o.captain?.name}{o.captain?.phone ? ` · ${o.captain.phone}` : ''}</dd>
                  </div>
                )}
                {/* Card 73: رمز التسليم يظهر للأدمن ليعطيه لصاحب الطلب عند الحاجة */}
                {o.deliveryCode && (
                  <div>
                    <dt>رمز التسليم</dt>
                    <dd><span className="yl-code">{o.deliveryCode}</span></dd>
                  </div>
                )}
              </dl>

              {/* Card 74: السعر التقريبي (السقف) قابل للتعديل من الأدمن */}
              <div className="yl-row" style={{ marginTop: 'var(--s-3)' }}>
                <span className="yl-label">السعر التقريبي (السقف)</span>
                {priceEdit[o._id] === undefined ? (
                  <>
                    <b className="yl-num">{o.price} ₪</b>
                    <IconButton
                      label="تعديل السعر التقريبي"
                      small
                      onClick={() => setPriceEdit((p) => ({ ...p, [o._id]: String(o.price) }))}
                    >
                      <IconEdit size={16} />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Input
                      type="number"
                      min="1"
                      style={{ width: 110 }}
                      value={priceEdit[o._id]}
                      onChange={(e) => setPriceEdit((p) => ({ ...p, [o._id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && savePrice(o._id)}
                      autoFocus
                    />
                    <Button size="sm" variant="primary" onClick={() => savePrice(o._id)}>حفظ</Button>
                    <Button
                      size="sm"
                      onClick={() => setPriceEdit((p) => { const n = { ...p }; delete n[o._id]; return n; })}
                    >
                      إلغاء
                    </Button>
                  </>
                )}
              </div>

              {/* Card 81 + 82 + 87: إجراءات الحسابات الخارجية وإرسال الرمز للكابتن */}
              {(o.user?.isExternal || (o.captain && o.deliveryCode)) && (
                <div className="yl-btnrow" style={{ marginTop: 'var(--s-3)' }}>
                  {o.user?.isExternal && (
                    <Button size="sm" variant="success" icon={<IconWallet size={16} />} onClick={() => creditExternal(o)}>
                      أضف رصيدًا لصاحب الطلب
                    </Button>
                  )}
                  {o.user?.isExternal && (
                    <Button size="sm" variant="soft" icon={<IconEdit size={16} />} onClick={() => editBalance(o)}>
                      تعديل الرصيد
                    </Button>
                  )}
                  {o.captain && o.deliveryCode && (
                    <Button size="sm" variant="soft" onClick={() => sendCode(o._id)}>
                      أرسل الرمز للكابتن
                    </Button>
                  )}
                </div>
              )}

              {/* Card 29: إظهار/إخفاء كل تفاصيل الطلب */}
              <button
                className="yl-disclosure"
                onClick={() => setExpanded((p) => ({ ...p, [o._id]: !p[o._id] }))}
              >
                <IconChevron
                  size={16}
                  style={{ transform: expanded[o._id] ? 'rotate(90deg)' : 'rotate(-90deg)' }}
                />
                {expanded[o._id] ? 'إخفاء التفاصيل' : 'عرض كل التفاصيل'}
              </button>

              {expanded[o._id] && <OrderDetails order={o} />}

              {/* Card 52: الطلب المجدول لا يُسنَد قبل موعده */}
              {isScheduledPending(o) && (
                <Alert tone="info">
                  هذا الطلب مجدول للتنفيذ في {fmtTime(o.scheduledAt)} — ستُتاح أدوات الإسناد تلقائيًا عند حلول موعده.
                </Alert>
              )}

              {/* الإسناد متاح فقط للطلبات المعلّقة (وغير المجدولة مستقبلًا) */}
              {o.status === 'pending' && !isScheduledPending(o) && (
                <div className="yl-assign">
                  <Select
                    value={selected[o._id] || ''}
                    onChange={(e) => setSelected((p) => ({ ...p, [o._id]: e.target.value }))}
                  >
                    <option value="">— اختر كابتن —</option>
                    {/* Card 34/35: يجوز إسناد كابتن غير متصل (يُوقَظ بالإشعار).
                        Card 95: يجوز إسناد أكثر من طلب لنفس الكابتن تحت الحدّ الأقصى. */}
                    {captains.filter((c) => c.assignable).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.online ? '● ' : '○ '}{c.name} ({vehicleLabel(c.vehicleType)})
                        {c.activeOrdersCount > 0 ? ` — ${c.activeOrdersCount} طلبات` : ''}
                        {c.online ? '' : ' — غير متصل'}
                      </option>
                    ))}
                  </Select>
                  <Button variant="primary" onClick={() => assign(o._id)}>إسناد</Button>
                  <Button variant="soft" icon={<IconBolt size={16} />} onClick={() => autoAssign(o._id)} title="أقرب كابتن متاح">
                    تلقائي
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </section>

        {/* عمود الكباتن — كلّهم مع علامة تمييز الحالة (Card 35) */}
        <aside className="yl-stack">
          <h2 className="yl-section-title">الكباتن ({captains.length})</h2>
          <Card pad={false}>
            {captains.length === 0 ? (
              <EmptyState icon={<IconUsers size={26} />} title="لا يوجد كباتن معتمَدون" />
            ) : (
              <div className="yl-list" style={{ padding: 'var(--s-2)' }}>
                {captains.map((c) => {
                  // Card 95: الكابتن مشغول إن كان لديه طلب نشط واحد على الأقل
                  const activeCount = c.activeOrdersCount || 0;
                  const busy = c.status === 'busy' || activeCount > 0;
                  const tone = busy ? 'warning' : c.online ? 'success' : 'neutral';
                  const label = busy ? 'مشغول' : c.online ? 'متصل' : 'غير متصل';
                  return (
                    <div className="yl-listitem" key={c._id}>
                      <span className="yl-avatar" style={{ background: 'var(--bg-sunken)', color: 'var(--text-soft)' }}>
                        <IconBike size={20} />
                      </span>
                      <span className="yl-listitem__main">
                        <span className="yl-listitem__title">{c.name}</span>
                        <span className="yl-listitem__sub">
                          {vehicleLabel(c.vehicleType)} · <IconStar size={12} /> {c.rating}
                        </span>
                      </span>
                      <div className="yl-stack yl-stack--sm" style={{ alignItems: 'flex-end' }}>
                        <Badge tone={tone} dot>{label}</Badge>
                        {/* Card 95: عدد الطلبات النشطة المُسنَدة للكابتن */}
                        {activeCount > 0 && <span className="yl-hint">{activeCount} طلب نشط</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

// Card 68: نافذة إنشاء طلب من الأدمن — اسم صاحب الطلب وهاتفه + تفاصيل نقطتَي
// الاستلام والتسليم. يُنشأ الطلب pending فيظهر في اللوحة فورًا عبر order:created.
function CreateOrderModal({ token, neighborhoods, onClose }) {
  // Card 109: neighborhoods = {المدينة: [الأحياء]}؛ نختار المدينة ثمّ الحي
  const cities = Object.keys(neighborhoods || {});
  const emptyPoint = { city: '', neighborhood: '', street: '', details: '', note: '' };
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [pickup, setPickup] = useState({ ...emptyPoint });
  const [dropoff, setDropoff] = useState({ ...emptyPoint });
  const [packageNote, setPackageNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!contactName.trim()) return setError('اسم صاحب الطلب مطلوب');
    if (!contactPhone.trim()) return setError('رقم جوال صاحب الطلب مطلوب');
    if (!pickup.city || !pickup.neighborhood) return setError('اختر مدينة وحي الاستلام');
    if (!dropoff.city || !dropoff.neighborhood) return setError('اختر مدينة وحي التسليم');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/orders/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contactName, contactPhone, pickup, dropoff, packageNote }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'تعذّر إنشاء الطلب');
      }
      onClose(); // الطلب يظهر في اللوحة تلقائيًا عبر حدث order:created
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // حقول نقطة (استلام/تسليم): المدينة ← الحي ← الشارع ← التفاصيل ← ملاحظة
  const pointFields = (label, point, setPoint) => (
    <div className="yl-stack yl-stack--sm">
      <b className="yl-label">{label}</b>
      {/* Card 109: المدينة قبل الحي — تغيير المدينة يُصفّر الحي */}
      <Select
        value={point.city}
        onChange={(e) => setPoint((p) => ({ ...p, city: e.target.value, neighborhood: '' }))}
      >
        <option value="">— اختر المدينة —</option>
        {cities.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>
      <Select
        value={point.neighborhood}
        onChange={(e) => setPoint((p) => ({ ...p, neighborhood: e.target.value }))}
        disabled={!point.city}
      >
        <option value="">— اختر الحي —</option>
        {(neighborhoods[point.city] || []).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </Select>
      <Input placeholder="الشارع" value={point.street}
        onChange={(e) => setPoint((p) => ({ ...p, street: e.target.value }))} />
      <Input placeholder="العنوان بالتفاصيل" value={point.details}
        onChange={(e) => setPoint((p) => ({ ...p, details: e.target.value }))} />
      <Input placeholder="ملاحظة (اختياري)" value={point.note}
        onChange={(e) => setPoint((p) => ({ ...p, note: e.target.value }))} />
    </div>
  );

  return (
    <Modal
      title="إنشاء طلب جديد"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={submit} disabled={saving} loading={saving}>
            {saving ? 'جارٍ الإنشاء…' : 'إنشاء الطلب'}
          </Button>
          <Button onClick={onClose}>إلغاء</Button>
        </>
      }
    >
      <div className="yl-stack">
        <div className="yl-formgrid">
          <Field label="اسم صاحب الطلب">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="رقم الجوال">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" />
          </Field>
        </div>

        <div className="yl-split yl-split--even">
          {pointFields('نقطة الاستلام', pickup, setPickup)}
          {pointFields('نقطة التسليم', dropoff, setDropoff)}
        </div>

        <Field label="وصف الشحنة (اختياري)">
          <Input
            placeholder="وصف مختصر لما يُوصَّل"
            value={packageNote}
            onChange={(e) => setPackageNote(e.target.value)}
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
