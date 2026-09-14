import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { Alert, Button, EmptyState, Input, Loading, PageHeader, SearchInput, Select, TableWrap } from '../components/ui';
import { IconWallet } from '../components/icons';

const money = (value) => `${Number(value || 0).toLocaleString('en-US')} ₪`;
const date = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function AdminWallet() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = () => new URLSearchParams({
    ...(q ? { q } : {}), ...(type !== 'all' ? { type } : {}),
    ...(from ? { from } : {}), ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  }).toString();

  const load = () => { setError(''); api.get(`/admin/wallet?${query()}`).then(setWallet).catch((e) => setError(e.message)); };

  useEffect(() => {
    load();
  }, []);

  async function exportCsv() {
    const res = await fetch(`${API}/api/admin/wallet/export?${query()}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (!res.ok) return setError('تعذّر تصدير سجل المحفظة');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'admin-wallet.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="محفظة الإدارة"
        subtitle="قيمة أصناف طلبات المطاعم وعمولة التوصيل المحوّلة عند التسليم"
      />
      {error && <Alert tone="error">{error}</Alert>}
      {!wallet && !error && <Loading />}

      {wallet && (
        <div className="yl-stack">
          <div className="yl-toolbar">
            <SearchInput placeholder="رقم الطلب، المتجر، الزبون أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">كل الحركات</option><option value="restaurant">طلبات المتاجر</option><option value="delivery">طلبات التوصيل</option>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
            <Button variant="primary" onClick={load}>بحث</Button>
            <Button onClick={exportCsv}>تصدير CSV</Button>
          </div>
          <div className="yl-grid yl-grid--stats">
            <div className="yl-stat"><span className="yl-stat__icon"><IconWallet size={22} /></span><div><div className="yl-stat__value yl-num">{money(wallet.balance)}</div><div className="yl-stat__label">الرصيد الكلي</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{money(wallet.itemsRevenue)}</div><div className="yl-stat__label">قيمة الأصناف</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{money(wallet.commissionRevenue)}</div><div className="yl-stat__label">عمولات التوصيل</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.transactionsCount || 0}</div><div className="yl-stat__label">طلبات مسلّمة</div></div></div>
          </div>

          {wallet.transactions?.length ? (
            <TableWrap>
              <thead><tr><th>الطلب</th><th>النوع</th><th>المتجر</th><th>الزبون</th><th>الكابتن</th><th>الأصناف</th><th>العمولة</th><th>الإجمالي</th><th>قبل</th><th>بعد</th><th>التاريخ</th></tr></thead>
              <tbody>
                {wallet.transactions.map((tx) => (
                  <tr key={tx.orderId}>
                    <td data-label="الطلب" className="yl-num">#{String(tx.orderId).slice(-6)}</td>
                    <td data-label="النوع">{tx.type === 'restaurant_settlement' ? 'تسوية متجر' : 'عمولة توصيل'}</td>
                    <td data-label="المطعم">{tx.restaurantName || 'طلب توصيل'}</td>
                    <td data-label="الزبون">{[tx.customer?.name, tx.customer?.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td data-label="الكابتن">{tx.captain?.name || '—'}</td>
                    <td data-label="الأصناف" className="yl-num">{money(tx.itemsAmount)}</td>
                    <td data-label="العمولة" className="yl-num">{money(tx.commissionAmount)}</td>
                    <td data-label="الإجمالي"><b className="yl-num">{money(tx.amount)}</b></td>
                    <td data-label="رصيد الإدارة قبل" className="yl-num">{tx.balanceBefore == null ? '—' : money(tx.balanceBefore)}</td>
                    <td data-label="رصيد الإدارة بعد" className="yl-num">{tx.balanceAfter == null ? '—' : money(tx.balanceAfter)}</td>
                    <td data-label="التاريخ">{date(tx.deliveredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState icon={<IconWallet size={28} />} title="لا توجد حركات بعد">
              ستظهر إيرادات الإدارة هنا بعد تسليم أول طلب.
            </EmptyState>
          )}
        </div>
      )}
    </>
  );
}
