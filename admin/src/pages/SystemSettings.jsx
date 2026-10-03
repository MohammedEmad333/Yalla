import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function SystemSettings() {
  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/settings/admin/order-maintenance')
      .then(setState)
      .catch((e) => setMessage(e.message));
  }, []);

  async function toggle() {
    if (!state || saving) return;
    const next = !state.enabled;
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.patch('/settings/admin/order-maintenance', {
        enabled: next,
        message: state.message,
      });
      setState(updated);
      setMessage(next ? 'تم تشغيل وضع الصيانة ومنع إنشاء الطلبات.' : 'تم إيقاف وضع الصيانة وفتح الطلبات.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveMessage() {
    if (!state || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.patch('/settings/admin/order-maintenance', {
        enabled: state.enabled,
        message: state.message,
      });
      setState(updated);
      setMessage('تم حفظ رسالة الصيانة.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!state) {
    return <div className="yl-card"><div className="yl-empty">{message || 'جارٍ تحميل إعدادات النظام...'}</div></div>;
  }

  return <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }}>
    <div className="yl-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>وضع صيانة الطلبات</h2>
          <p style={{ marginBottom: 0, opacity: .75 }}>
            عند تشغيله تظهر رسالة الصيانة في تطبيق العميل ويتم منع إنشاء الطلبات من الخادم أيضًا.
          </p>
        </div>
        <div style={{
          padding: '8px 14px', borderRadius: 999,
          background: state.enabled ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
          fontWeight: 800,
        }}>
          {state.enabled ? 'الصيانة مفعّلة' : 'الطلبات مفتوحة'}
        </div>
      </div>

      <button
        type="button"
        className={`yl-btn ${state.enabled ? '' : 'yl-btn--primary'}`}
        style={{ width: '100%', marginTop: 18 }}
        disabled={saving}
        onClick={toggle}
      >
        {saving ? 'جارٍ الحفظ...' : state.enabled ? 'إيقاف وضع الصيانة وفتح الطلبات' : 'تشغيل وضع الصيانة وإيقاف الطلبات'}
      </button>
    </div>

    <div className="yl-card" style={{ padding: 20 }}>
      <h3 style={{ marginTop: 0 }}>رسالة الصيانة للمستخدم</h3>
      <textarea
        className="yl-input"
        style={{ width: '100%', minHeight: 120, resize: 'vertical' }}
        value={state.message || ''}
        onChange={(e) => setState((old) => ({ ...old, message: e.target.value }))}
      />
      <button type="button" className="yl-btn yl-btn--primary" style={{ marginTop: 12 }} disabled={saving} onClick={saveMessage}>
        حفظ الرسالة
      </button>
      {state.updatedAt && <div style={{ marginTop: 10, opacity: .6, fontSize: 13 }}>
        آخر تحديث: {new Date(state.updatedAt).toLocaleString('ar')}
      </div>}
    </div>

    {message && <div className="yl-card" style={{ padding: 14 }}>{message}</div>}
  </div>;
}
