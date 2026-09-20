import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function RewardsSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/expansion/admin/rewards/settings')
      .then((data) => setForm({
        referralRewardPoints: Number(data.referralRewardPoints ?? 100),
        pointsPerIls: Number(data.pointsPerIls ?? 100),
        minRedeemPoints: Number(data.minRedeemPoints ?? 100),
        requireFirstCompletedOrder: data.requireFirstCompletedOrder !== false,
        enabled: data.enabled !== false,
      }))
      .catch((e) => setMessage(e.message));
  }, []);

  if (!form) return <div className="yl-card"><div className="yl-empty">{message || 'جارٍ تحميل إعدادات المكافآت...'}</div></div>;

  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const data = await api.patch('/expansion/admin/rewards/settings', form);
      setForm({
        referralRewardPoints: Number(data.referralRewardPoints),
        pointsPerIls: Number(data.pointsPerIls),
        minRedeemPoints: Number(data.minRedeemPoints),
        requireFirstCompletedOrder: data.requireFirstCompletedOrder !== false,
        enabled: data.enabled !== false,
      });
      setMessage('تم حفظ إعدادات المكافآت بنجاح.');
    } catch (e2) {
      setMessage(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return <div style={{ maxWidth: 760, margin: '0 auto' }}>
    <div className="yl-card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>برنامج نقاط Yalla والدعوات</h2>
      <p style={{ opacity: .75 }}>
        النقاط تُستخدم فقط كخصم عند إنشاء الطلبات، ولا يمكن تحويلها إلى رصيد محفظة أو سحبها. تحكم هنا بقيمتها ومكافأة الدعوة والحد الأدنى لاستخدامها في الطلب.
      </p>
      <form onSubmit={save} style={{ display: 'grid', gap: 16 }}>
        <label>مكافأة الدعوة لكل طرف (نقطة)
          <input className="yl-input" type="number" min="0" value={form.referralRewardPoints} onChange={(e) => set('referralRewardPoints', Number(e.target.value))} />
        </label>
        <label>عدد النقاط مقابل 1 شيكل خصم
          <input className="yl-input" type="number" min="1" value={form.pointsPerIls} onChange={(e) => set('pointsPerIls', Number(e.target.value))} />
        </label>
        <label>الحد الأدنى لاستخدام النقاط في الطلب (نقطة)
          <input className="yl-input" type="number" min="0" value={form.minRedeemPoints} onChange={(e) => set('minRedeemPoints', Number(e.target.value))} />
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" checked={form.requireFirstCompletedOrder} onChange={(e) => set('requireFirstCompletedOrder', e.target.checked)} />
          لا تمنح مكافأة الدعوة إلا بعد أول طلب مُسلّم
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          برنامج المكافآت مفعّل
        </label>
        <button className="yl-btn yl-btn--primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</button>
      </form>
      {message && <div style={{ marginTop: 14 }}>{message}</div>}
    </div>
  </div>;
}
