// Card 105: السحب للتحديث (Pull-to-refresh) لنسخة أندرويد من لوحة الأدمن.
//
// مكوّن مستقلّ بلا أيّ مكتبة خارجية: يستمع للمسّ (touch) على مستوى النافذة،
// ولا يُفعَّل إلّا عندما تكون الصفحة في أعلاها (scrollY ≤ 0) وكانت الإيماءة
// عموديّة نزولًا — فلا يتعارض مع تمرير الجداول الأفقي. عند تجاوز عتبة السحب
// يُشغّل onRefresh() ويُظهر مؤشّر تحميل دوّار حتى ينتهي.
//
// على الويب العادي (بلا لمس) لا يحدث شيء — الأحداث اللمسيّة لا تُطلَق أصلًا.

import { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';

const THRESHOLD = 64; // مسافة السحب (px) اللازمة لإطلاق التحديث
const MAX_PULL = 96; // أقصى إزاحة بصريّة للمحتوى أثناء السحب
const RESISTANCE = 0.5; // مقاومة السحب (نصف المسافة الفعليّة) لإحساس طبيعيّ

export default function PullToRefresh({ onRefresh, children }) {
  const [distance, setDistance] = useState(0); // إزاحة السحب الحاليّة (للعرض)
  const [refreshing, setRefreshing] = useState(false); // هل يجري التحديث الآن؟
  const [dragging, setDragging] = useState(false); // هل الإصبع على الشاشة الآن؟

  // نُبقي القيم المتغيّرة في مراجع حتى نربط مستمعي اللمس مرّة واحدة فقط
  // (لا نُعيد ربطها مع كلّ حركة إصبع) ونقرأ أحدث قيمة داخل المعالِجات.
  const refs = useRef({ startY: 0, startX: 0, active: false, distance: 0, refreshing: false });
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const st = refs.current;
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    const setDist = (d) => {
      st.distance = d;
      setDistance(d);
    };

    function onStart(e) {
      if (st.refreshing || !atTop()) {
        st.active = false;
        return;
      }
      const t = e.touches[0];
      st.startY = t.clientY;
      st.startX = t.clientX;
      st.active = true;
    }

    function onMove(e) {
      if (!st.active || st.refreshing) return;
      const t = e.touches[0];
      const dy = t.clientY - st.startY;
      const dx = t.clientX - st.startX;
      // نتجاهل الإيماءات الأفقيّة (تمرير الجداول) أو الصعود
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        if (st.distance !== 0) setDist(0);
        return;
      }
      // إن غادرت الصفحة أعلاها أثناء السحب نُلغي
      if (!atTop()) {
        st.active = false;
        setDist(0);
        setDragging(false);
        return;
      }
      if (!st.distance) setDragging(true);
      // نمنع تمرير الصفحة/توهّج الأندرويد الافتراضيّ أثناء السحب
      if (e.cancelable) e.preventDefault();
      setDist(Math.min(dy * RESISTANCE, MAX_PULL));
    }

    async function onEnd() {
      if (!st.active) return;
      st.active = false;
      setDragging(false);
      if (st.distance >= THRESHOLD) {
        st.refreshing = true;
        setRefreshing(true);
        setDist(THRESHOLD); // نُثبّت المؤشّر أثناء التحديث
        try {
          await onRefreshRef.current?.();
        } catch (_) {
          // نتجاهل أخطاء التحديث — الصفحة تعرض أخطاءها بنفسها
        } finally {
          st.refreshing = false;
          setRefreshing(false);
          setDist(0);
        }
      } else {
        setDist(0);
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const progress = Math.min(distance / THRESHOLD, 1);
  const showIndicator = distance > 0 || refreshing;
  const settle = dragging ? 'none' : 'transform 0.2s ease, opacity 0.2s ease';

  return (
    <div style={{ position: 'relative' }}>
      {/* مؤشّر السحب/التحميل — يظهر ويتحرّك مع السحب */}
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

      {/* المحتوى — يُزاح للأسفل أثناء السحب لإحساس طبيعيّ */}
      <div
        style={{
          transform: `translateY(${refreshing ? THRESHOLD * 0.5 : distance}px)`,
          transition: settle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
