import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

const EMPTY = {
  enabled: true,
  latestVersion: '1.0.7',
  minimumVersion: '1.0.6',
  forceUpdate: false,
  title: 'تحديث جديد لـ Yalla 🚀',
  message: 'نسخة جديدة من Yalla جاهزة! حدّث الآن للحصول على أداء أفضل، إصلاحات جديدة وتجربة أكثر سرعة واستقرارًا.',
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.mohammedemad333.yalla',
};

function compareVersions(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export default function AppUpdates() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const latestVersionValid = VERSION_RE.test(form.latestVersion.trim());
  const minimumVersionValid = VERSION_RE.test(form.minimumVersion.trim());
  const minimumNotNewer = latestVersionValid && minimumVersionValid
    ? compareVersions(form.minimumVersion, form.latestVersion) <= 0
    : false;
  const versionsValid = latestVersionValid && minimumVersionValid && minimumNotNewer;

  const updateMode = useMemo(() => {
    if (!form.enabled) return 'متوقف';
    if (form.forceUpdate) return 'إجباري لكل إصدار أقدم';
    if (form.minimumVersion === form.latestVersion) return 'إجباري لكل إصدار أقدم';
    return 'اختياري، مع إجبار الإصدارات الأقدم من الحد الأدنى';
  }, [form.enabled, form.forceUpdate, form.latestVersion, form.minimumVersion]);

  async function load() {
    setLoading(true); setError(''); setOk('');
    try { setForm({ ...EMPTY, ...(await api.get('/app-update')) }); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  function validateBeforeAction() {
    if (!latestVersionValid || !minimumVersionValid) {
      setError('اكتب أرقام الإصدارات بالصيغة الصحيحة، مثل 1.0.10.');
      return false;
    }
    if (!minimumNotNewer) {
      setError('«أقل إصدار مسموح» لا يمكن أن يكون أحدث من «أحدث إصدار منشور».');
      return false;
    }
    return true;
  }

  async function save(e) {
    e.preventDefault();
    setError(''); setOk('');
    if (!validateBeforeAction()) return;

    setSaving(true);
    try {
      const saved = await api.patch('/app-update', {
        ...form,
        latestVersion: form.latestVersion.trim(),
        minimumVersion: form.minimumVersion.trim(),
        title: form.title.trim(),
        message: form.message.trim(),
        androidStoreUrl: form.androidStoreUrl.trim(),
      });
      setForm({ ...EMPTY, ...saved });
      setOk('تم حفظ إعدادات التحديث. ستظهر للمستخدمين عند فتح التطبيق أو العودة إليه.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function sendUpdateNotification() {
    setError(''); setOk('');
    if (!validateBeforeAction()) return;

    setSending(true);
    try {
      const res = await api.post('/admin/notifications', {
        audience: 'all',
        title: form.title.trim(),
        body: form.message.trim(),
        captainIds: [],
        userIds: [],
      });
      setOk(res?.message || `تم إرسال إشعار الإصدار ${form.latestVersion} لجميع المستخدمين والكباتن.`);
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  }

  if (loading) return <div className="yl-empty">جارٍ تحميل إعدادات التحديث...</div>;

  return <div className="yl-stack">
    <div className="yl-pagehead">
      <div>
        <h1>تحديثات التطبيق</h1>
        <p className="yl-pagehead__sub">حدّد الإصدار المنشور، سياسة التحديث، والرسالة التي ستظهر للمستخدم بوضوح.</p>
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
          <span className="yl-label">أحدث إصدار منشور على Google Play</span>
          <input
            className="yl-input"
            dir="ltr"
            inputMode="decimal"
            value={form.latestVersion}
            onChange={(e) => set('latestVersion', e.target.value)}
            placeholder="1.0.10"
            aria-invalid={!latestVersionValid}
            required
          />
          <small className="yl-hint">الإصدار المتاح حاليًا للمستخدمين في المتجر، مثال: 1.0.10.</small>
        </label>

        <label className="yl-field">
          <span className="yl-label">أقل إصدار مسموح باستخدامه</span>
          <input
            className="yl-input"
            dir="ltr"
            inputMode="decimal"
            value={form.minimumVersion}
            onChange={(e) => set('minimumVersion', e.target.value)}
            placeholder="1.0.9"
            aria-invalid={!minimumVersionValid || !minimumNotNewer}
            required
          />
          <small className="yl-hint">أي إصدار أقدم من هذا الرقم سيُطلب منه التحديث إجباريًا.</small>
        </label>
      </div>

      {!versionsValid && (
        <div className="yl-alert yl-alert--danger">
          {!latestVersionValid || !minimumVersionValid
            ? 'صيغة الإصدار يجب أن تكون مثل 1.0.10.'
            : 'أقل إصدار مسموح يجب أن يساوي أحدث إصدار منشور أو يكون أقدم منه.'}
        </div>
      )}

      <label className="yl-field">
        <span className="yl-label">عنوان رسالة التحديث</span>
        <input
          className="yl-input"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={120}
          placeholder="تحديث جديد لـ Yalla 🚀"
          required
        />
        <small className="yl-hint">{form.title.length}/120</small>
      </label>

      <label className="yl-field">
        <span className="yl-label">نص رسالة التحديث</span>
        <textarea
          className="yl-textarea"
          rows="4"
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          maxLength={500}
          placeholder="اكتب باختصار ما الذي سيستفيد منه المستخدم بعد التحديث."
          required
        />
        <small className="yl-hint">{form.message.length}/500 — اجعل الرسالة قصيرة وواضحة ومباشرة.</small>
      </label>

      <div className="yl-alert">
        <b>معاينة الرسالة</b>
        <div style={{ marginTop: 8 }}><b>{form.title || 'عنوان التحديث'}</b></div>
        <div style={{ marginTop: 4 }}>{form.message || 'نص رسالة التحديث سيظهر هنا.'}</div>
      </div>

      <label className="yl-field">
        <span className="yl-label">رابط التحديث على Google Play</span>
        <input
          className="yl-input"
          dir="ltr"
          type="url"
          value={form.androidStoreUrl}
          onChange={(e) => set('androidStoreUrl', e.target.value)}
          style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}
          required
        />
        <small className="yl-hint">سيتم فتح هذا الرابط عندما يضغط المستخدم على زر التحديث.</small>
      </label>

      <div className="yl-stack yl-stack--sm">
        <label className="yl-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span>تفعيل فحص وجود تحديث داخل التطبيق</span>
        </label>

        <label className="yl-check">
          <input
            type="checkbox"
            checked={form.forceUpdate}
            onChange={(e) => set('forceUpdate', e.target.checked)}
            disabled={!form.enabled}
          />
          <span>إجبار كل الإصدارات الأقدم من أحدث إصدار منشور على التحديث</span>
        </label>
      </div>

      <div className={`yl-alert${form.forceUpdate && form.enabled ? ' yl-alert--danger' : ''}`}>
        <b>السياسة الحالية: {updateMode}</b>
        <div style={{ marginTop: 6 }}>
          الإصدار المنشور: <b>{form.latestVersion || '—'}</b> · أقل إصدار مسموح: <b>{form.minimumVersion || '—'}</b>
        </div>
        {form.enabled && !form.forceUpdate && (
          <div style={{ marginTop: 6 }}>
            الأفضل عند طرح إصدار جديد أن تبدأ بتحديث اختياري، ثم ترفع «أقل إصدار مسموح» فقط عند الحاجة لإيقاف الإصدارات القديمة.
          </div>
        )}
        {form.enabled && form.forceUpdate && (
          <div style={{ marginTop: 6 }}>
            تنبيه: كل مستخدم لديه إصدار أقدم من {form.latestVersion || 'الإصدار الحالي'} سيُمنع من المتابعة حتى يحدّث التطبيق.
          </div>
        )}
      </div>

      <div className="yl-btnrow">
        <button className="yl-btn yl-btn--primary" disabled={saving || !versionsValid}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات التحديث'}
        </button>
        <button
          type="button"
          className="yl-btn yl-btn--outline"
          onClick={sendUpdateNotification}
          disabled={sending || !versionsValid || !form.enabled}
        >
          {sending ? 'جارٍ إرسال الإشعار...' : `إرسال إشعار تحديث ${form.latestVersion || ''} للجميع`}
        </button>
      </div>
    </form>
  </div>;
}
