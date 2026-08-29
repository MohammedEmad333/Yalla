// Card 105: السحب للتحديث (Pull-to-refresh) لنسخة أندرويد من لوحة الأدمن.
//
// درسان من الإخفاقات السابقة (توقّف التمرير كليًّا ثم إيماءة L):
//   1) لا preventDefault ولا مستمع غير-passive إطلاقًا — كلّها { passive: true }
//      فيستحيل (حسب المواصفة) أن تُعطّل قرار التمرير في المُركِّب (compositor).
//   2) لا نلمس overscroll-behavior على عنصر الجذر — فقد كان سببًا مرجّحًا لإرباك
//      كشف اتجاه التمرير في WebView (إيماءة L). WebView على أندرويد لا يملك
//      "سحب-للتحديث" أصليًّا نحتاج لكبته أصلًا.
//
// نربط المستمعات على حاوية المكوّن نفسها (لا window) لتبقى الآثار مُنحصرة. نتتبّع
// السحب النازل ونحن في أعلى الصفحة فقط لإظهار مؤشّر ثمّ إطلاق التحديث عند الإفلات.
// التمرير الصاعد (لأعلى الإصبع) لا يُفعّل أيّ حالة، فلا يتأثّر التمرير العاديّ أبدًا.

import { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';

const THRESHOLD = 64; // مسافة السحب (px) اللازمة لإطلاق التحديث
const MAX_PULL = 96; // أقصى إزاحة بصريّة للمحتوى أثناء السحب
const RESISTANCE = 0.5; // مقاومة السحب (نصف المسافة الفعليّة) لإحساس طبيعيّ
const DECIDE = 10; // عتبة الحركة (px) التي عندها نقرّر نمط الإيماءة

export default function PullToRefresh({ onRefresh, children }) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);

  const containerRef = useRef(null);
  const refs = useRef({ startY: 0, startX: 0, mode: 'idle', distance: 0, refreshing: false });
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const st = refs.current;
    const atTop = () => {
      const se = document.scrollingElement || document.documentElement;
      return (window.scrollY || (se && se.scrollTop) || 0) <= 0;
    };
    const setDist = (d) => {
      st.distance = d;
      setDistance(d);
    };

    function onStart(e) {
      if (st.refreshing) return;
      const t = e.touches[0];
      st.startY = t.clientY;
      st.startX = t.clientX;
      // نبدأ "غير محدّد" فقط إن كنّا في أعلى الصفحة، وإلّا فهي إيماءة تمرير عاديّ
      st.mode = atTop() ? 'undecided' : 'scroll';
    }

    function onMove(e) {
      if (st.refreshing || st.mode === 'scroll' || st.mode === 'idle') return;
      const t = e.touches[0];
      const dy = t.clientY - st.startY;
      const dx = t.clientX - st.startX;

      if (st.mode === 'undecided') {
        // أي حركة للأعلى أو أفقيّة → تمرير عاديّ، لا نتدخّل أبدًا في هذه الإيماءة
        if (dy <= -DECIDE || (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > DECIDE)) {
          st.mode = 'scroll';
          return;
        }
        if (dy >= DECIDE && atTop()) {
          st.mode = 'pull';
          setPulling(true);
        } else {
          return;
        }
      }

      if (st.mode === 'pull') {
        // إن غادرنا الأعلى أو انعكس الاتجاه نترك الإيماءة للتمرير العاديّ
        if (!atTop() || dy <= 0) {
          st.mode = 'scroll';
          setPulling(false);
          setDist(0);
          return;
        }
        // ملاحظة: لا preventDefault (المستمع passive) — التمرير لا يتعطّل أبدًا.
        setDist(Math.min(dy * RESISTANCE, MAX_PULL));
      }
    }

    async function onEnd() {
      setPulling(false);
      const wasPull = st.mode === 'pull';
      st.mode = 'idle';
      if (wasPull && st.distance >= THRESHOLD) {
        st.refreshing = true;
        setRefreshing(true);
        setDist(THRESHOLD);
        try {
          await onRefreshRef.current?.();
        } catch (_) {
          // نتجاهل — الصفحة تعرض أخطاءها بنفسها
        } finally {
          st.refreshing = false;
          setRefreshing(false);
          setDist(0);
        }
      } else {
        setDist(0);
      }
    }

    // كلّها passive:true على الحاوية — لا يمكنها تعطيل التمرير مهما حدث
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const progress = Math.min(distance / THRESHOLD, 1);
  const showIndicator = distance > 0 || refreshing;
  const settle = pulling ? 'none' : 'transform 0.2s ease, opacity 0.2s ease';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        aria-hidden={!showIndicator}
        style={{
          position: 'absolute',
          top: 8,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: showIndicator ? 1 : 0,
          transform: `translateY(${(refreshing ? THRESHOLD : distance) - 24}px)`,
          transition: settle,
          zIndex: 5,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: theme.color.card,
            boxShadow: theme.shadow.card,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <span
            className={refreshing ? 'yl-ptr-spin' : ''}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: `2.5px solid ${theme.color.outline}`,
              borderTopColor: theme.color.primary,
              display: 'block',
              transform: refreshing ? 'none' : `rotate(${progress * 270}deg)`,
              opacity: refreshing ? 1 : 0.4 + progress * 0.6,
            }}
          />
        </div>
      </div>

      {/* المحتوى — يُزاح للأسفل أثناء السحب فقط، وبلا أيّ تحويل عند السكون */}
      <div
        style={{
          transform:
            distance || refreshing ? `translateY(${refreshing ? THRESHOLD * 0.5 : distance}px)` : 'none',
          transition: settle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
