import { useEffect, useState } from 'react';
import { api } from '../api/client';

const EMPTY = {
  enabled: true,
  latestVersion: '1.0.7',
  minimumVersion: '1.0.6',
  forceUpdate: false,
  title: 'يتوفر إصدار جديد من Yalla',
  message: 'حدّث الآن للحصول على أحدث التحسينات وأفضل تجربة استخدام.',
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.mohammedemad333.yalla',
};

export default function AppUpdates() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { setForm({ ...EMPTY, ...(await api.get('/app-update')) }); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setError(''); setOk('');
    try {
      const saved = await api.patch('/app-update', form);
      setForm({ ...EMPTY, ...saved });
      setOk('تم حفظ إعدادات التحديث. ستُطبّق على المستخدمين عند فتح التطبيق أو العودة إليه.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function sendUpdateNotification() {
    setSending(true); setError(''); setOk('');
    try {
      const res = await api.post('/admin/notifications', {
        audience: 'all',
        title: `🚀 إصدار Yalla ${form.latestVersion} متوفر الآن`,
        body: `${form.message} افتح Google Play وحدّث التطبيق الآن.`,
        captainIds: [],
        userIds: [],
      });
      setOk(res?.message || 'تم إرسال إشعار التحديث لجميع المستخدمين والكباتن.');
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  }

  if (loading) return <div className="yl-empty">جارٍ تحميل إعدادات التحديث...</div>;

  return <div className="yl-stack">
    <div className="yl-pagehead">
      <div>
        <h1>تحديثات التطبيق</h1>
        <p className="yl-pagehead__sub">تحكّم برسالة الإصدار الجديد، أقل نسخة مسموحة، وهل التحديث اختياري أم إجباري.</p>
      </div>
      <div className="yl-pagehead__actions">
        <button type="button" className="yl-btn yl-btn--ghost" onClick={load}>تحديث البيانات</button>
      </div>
    </div>

    {error && <div className="yl-alert yl-alert--danger">{error}</div>}
    {ok && <div className="yl-alert yl-alert--success">{ok}</div>}

    <form className="yl-card yl-card--pad yl-stack" onSubmit={save}>
      <div className="yl-formgrid">
        <label className="yl-field">
          <span className="yl-label">أحدث إصدار منشور</span>
          <input
            className="yl-input"
            dir="ltr"
            inputMode="decimal"
            value={form.latestVersion}
            onChange={(e) => set('latestVersion', e.target.value)}
            placeholder="1.0.7"
            required
          />
        </label>

        <label className="yl-field">
          <span className="yl-label">أقل إصدار مسموح</span>
          <input
            className="yl-input"
            dir="ltr"
            inputMode="decimal"
            value={form.minimumVersion}
            onChange={(e) => set('minimumVersion', e.target.value)}
            placeholder="1.0.6"
            required
          />
          <small className="yl-hint">أي نسخة أقدم من هذا الرقم ستُجبر على التحديث حتى لو كان خيار التحديث الإجباري مغلقًا.</small>
        </label>
      </div>

      <label className="yl-field">
        <span className="yl-label">عنوان الرسالة</span>
        <input
          className="yl-input"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={120}
          required
        />
      </label>

      <label className="yl-field">
        <span className="yl-label">نص الرسالة</span>
        <textarea
          className="yl-textarea"
          rows="4"
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          maxLength={500}
          required
        />
        <small className="yl-hint">{form.message.length}/500</small>
      </label>

      <label className="yl-field">
        <span className="yl-label">رابط Google Play</span>
        <input
          className="yl-input"
          dir="ltr"
          type="url"
          value={form.androidStoreUrl}
          onChange={(e) => set('androidStoreUrl', e.target.value)}
          style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}
          required
        />
      </label>

      <div className="yl-stack yl-stack--sm">
        <label className="yl-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span>تفعيل فحص التحديث داخل التطبيق</span>
        </label>

        <label className="yl-check">
          <input type="checkbox" checked={form.forceUpdate} onChange={(e) => set('forceUpdate', e.target.checked)} />
          <span>إجبار جميع النسخ الأقدم من أحدث إصدار على التحديث</span>
        </label>
      </div>

      <div className="yl-alert">
        النسخة الحالية التي جهزناها للمتجر هي <b>1.0.7</b>. اترك التحديث غير إجباري أولًا، وبعد انتشار النسخة يمكنك رفع «أقل إصدار مسموح» عند الحاجة.
      </div>

      <div className="yl-btnrow">
        <button className="yl-btn yl-btn--primary" disabled={saving}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات التحديث'}
        </button>
        <button type="button" className="yl-btn yl-btn--outline" onClick={sendUpdateNotification} disabled={sending}>
          {sending ? 'جارٍ إرسال الإشعار...' : 'إرسال إشعار التحديث للجميع'}
        </button>
      </div>
    </form>
  </div>;
}
