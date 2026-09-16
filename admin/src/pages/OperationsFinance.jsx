import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Alert, Badge, Button, Card, EmptyState, Loading, PageHeader, TableWrap } from '../components/ui';

const money = (v) => `${Number(v || 0).toFixed(2)} ₪`;

export default function OperationsFinance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [finance, setFinance] = useState({});
  const [settlements, setSettlements] = useState([]);

  async function load() {
    setLoading(true); setError('');
    try {
      const [a, f, s] = await Promise.all([
        api.get('/features/admin/operations-alerts'),
        api.get('/features/admin/finance'),
        api.get('/features/admin/merchant-settlements'),
      ]);
      setAlerts(Array.isArray(a) ? a : []);
      setFinance(f || {});
      setSettlements(Array.isArray(s) ? s : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function process(id, status) {
    try {
      await api.patch(`/features/admin/merchant-settlements/${id}`, { status });
      await load();
    } catch (e) { setError(e.message); }
  }

  if (loading) return <Loading />;
  const orders = finance.orders || {};
  const ms = finance.merchantSettlements || {};

  return <>
    <PageHeader title="مركز العمليات والمال" subtitle="تنبيهات فورية + صورة مالية موحدة للمنصة">
      <Button onClick={load}>تحديث</Button>
    </PageHeader>
    <Alert tone="error">{error}</Alert>

    <div className="yl-grid yl-grid--4">
      <Card><b>دخل الإدارة</b><h2>{money(orders.adminCredit)}</h2><span>من الطلبات المسلّمة</span></Card>
      <Card><b>صافي الكباتن</b><h2>{money(orders.captainNet)}</h2><span>إجمالي المستحقات المحسوبة</span></Card>
      <Card><b>مبيعات المتاجر</b><h2>{money(orders.merchantSales)}</h2><span>{orders.orders || 0} طلب مسلم</span></Card>
      <Card><b>تسويات معلقة</b><h2>{money(ms.pending?.total)}</h2><span>{ms.pending?.count || 0} طلب دفع</span></Card>
    </div>

    <Card title={`تنبيهات العمليات (${alerts.length})`}>
      {alerts.length === 0 ? <EmptyState title="لا توجد تنبيهات حرجة">الطلبات ضمن الحدود الطبيعية حاليًا.</EmptyState> :
        <TableWrap><thead><tr><th>النوع</th><th>الطلب</th><th>التنبيه</th><th>الخطورة</th></tr></thead><tbody>
          {alerts.map((a, i) => <tr key={`${a.orderId}-${a.type}-${i}`}>
            <td data-label="النوع">{a.type}</td><td data-label="الطلب">{String(a.orderId).slice(-8)}</td>
            <td data-label="التنبيه">{a.message}</td>
            <td data-label="الخطورة"><Badge tone={a.severity === 'critical' ? 'danger' : 'warning'}>{a.severity === 'critical' ? 'حرج' : 'تنبيه'}</Badge></td>
          </tr>)}
        </tbody></TableWrap>}
    </Card>

    <Card title="تسويات الشركاء">
      {settlements.length === 0 ? <EmptyState title="لا توجد طلبات سحب" /> :
        <TableWrap><thead><tr><th>المتجر</th><th>الشريك</th><th>المبلغ</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>
          {settlements.map((s) => <tr key={s._id}>
            <td data-label="المتجر">{s.restaurant?.name || '-'}</td>
            <td data-label="الشريك">{s.merchant?.name || '-'}<br/><small>{s.merchant?.phone || ''}</small></td>
            <td data-label="المبلغ">{money(s.amount)}</td>
            <td data-label="الحالة"><Badge tone={s.status === 'paid' ? 'success' : s.status === 'rejected' ? 'danger' : 'warning'}>{s.status}</Badge></td>
            <td data-label="إجراء">{s.status === 'pending' && <div className="yl-btnrow"><Button variant="success" size="sm" onClick={() => process(s._id, 'paid')}>تم الدفع</Button><Button variant="danger" size="sm" onClick={() => process(s._id, 'rejected')}>رفض</Button></div>}</td>
          </tr>)}
        </tbody></TableWrap>}
    </Card>
  </>;
}
