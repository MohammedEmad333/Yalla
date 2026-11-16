import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Alert, Badge, Button, Card, Loading, PageHeader, TableWrap } from '../components/ui';

const FIELDS = [
  ['sent', 'تم إرسالها'],
  ['duplicate', 'منع تكرار'],
  ['in_flight', 'قيد الإرسال'],
  ['retried', 'إعادة المحاولة'],
  ['rate_limited', 'تقييد Telegram 429'],
  ['failed', 'إخفاقات'],
];

export default function TelegramOperations() {
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh(windowDays = days) {
    setLoading(true);
    setError('');
    try { setMetrics(await api.get('/admin/telegram/metrics?days=' + windowDays)); }
    catch (err) { setMetrics(null); setError(err.message || 'تعذر تحميل الإحصاءات'); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(days); }, [days]);

  const failures = (metrics?.total?.failed || 0) + (metrics?.total?.rate_limited || 0);
  const status = !metrics ? 'غير متاح'
    : (metrics.stalled > 0 || failures > 0 ? 'تحتاج مراجعة' : 'لا توجد إخفاقات مسجلة');

  return <div>
    <PageHeader title="مراقبة إشعارات Telegram" subtitle="ملخصات تشغيل آمنة دون بيانات الكباتن والعملاء">
      <Button onClick={() => refresh()} disabled={loading}>تحديث</Button>
    </PageHeader>
    {error && <Alert tone="error">{error}</Alert>}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {[1, 7, 30].map(d => <Button key={d} variant={days === d ? 'primary' : 'secondary'} onClick={() => setDays(d)}>
        {d === 1 ? 'يوم' : d === 7 ? '7 أيام' : '30 يومًا'}
      </Button>)}
    </div>
    {loading && !metrics && <Loading />}
    {metrics && <>
      <div className="yl-grid yl-grid--4" style={{ marginBottom: 16 }}>
        <Card><b>حالة الإشعارات</b><div><Badge tone={failures || metrics.stalled ? 'warning' : 'success'}>{status}</Badge></div></Card>
        <Card><b>إرسالات ناجحة</b><div style={{ fontSize: 28, fontWeight: 800 }}>{metrics.total.sent}</div></Card>
        <Card><b>فشل أو تقييد</b><div style={{ fontSize: 28, fontWeight: 800 }}>{failures}</div></Card>
        <Card><b>محاولات عالقة</b><div style={{ fontSize: 28, fontWeight: 800 }}>{metrics.stalled}</div></Card>
      </div>
      <Card>
        <b>نسبة الإخفاقات المسجلة: {metrics.failureRatePercent}%</b>
        <p className="yl-muted">آخر تحديث: {new Date(metrics.asOf).toLocaleString('ar-PS')}</p>
        <p className="yl-muted">هذه عدادات تقريبية تعتمد على التسجيل بأفضل جهد. المحاولات العالقة ليست دليلًا على فشل الإرسال. عند ظهور إخفاقات راجع سجلات الخدمة، و429، واتصال MongoDB قبل أي تدخل.</p>
      </Card>
      <div style={{ height: 16 }} />
      <Card title="مؤشرات الإرسال حسب النوع">
        <TableWrap>
          <thead><tr><th>المؤشر</th><th>إسناد طلب</th><th>تغيير الحالة</th><th>المجموع</th></tr></thead>
          <tbody>{FIELDS.map(([key, label]) => <tr key={key}>
            <td>{label}</td><td>{metrics.byKind.assigned[key] || 0}</td>
            <td>{metrics.byKind.status[key] || 0}</td><td>{metrics.total[key] || 0}</td>
          </tr>)}</tbody>
        </TableWrap>
      </Card>
      <div style={{ height: 16 }} />
      <Card title="توزيع الأيام">
        {!metrics.daily.length ? <p className="yl-muted">لا توجد عدادات مسجلة خلال هذه المدة.</p> :
        <TableWrap>
          <thead><tr><th>اليوم</th><th>نجاح</th><th>إخفاق</th><th>تقييد 429</th><th>إعادة محاولة</th></tr></thead>
          <tbody>{metrics.daily.map(d => <tr key={d.day}>
            <td>{d.day}</td><td>{d.sent}</td><td>{d.failed}</td>
            <td>{d.rate_limited}</td><td>{d.retried}</td>
          </tr>)}</tbody>
        </TableWrap>}
      </Card>
    </>}
  </div>;
}
