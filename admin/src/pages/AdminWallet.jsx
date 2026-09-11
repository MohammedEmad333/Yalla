import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Alert, EmptyState, Loading, PageHeader, TableWrap } from '../components/ui';
import { IconWallet } from '../components/icons';

const money = (value) => `${Number(value || 0).toLocaleString('ar-EG')} ₪`;
const date = (value) =>
  value ? new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function AdminWallet() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/wallet').then(setWallet).catch((e) => setError(e.message));
  }, []);

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
          <div className="yl-grid yl-grid--stats">
            <div className="yl-stat"><span className="yl-stat__icon"><IconWallet size={22} /></span><div><div className="yl-stat__value yl-num">{money(wallet.balance)}</div><div className="yl-stat__label">الرصيد الكلي</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{money(wallet.itemsRevenue)}</div><div className="yl-stat__label">قيمة الأصناف</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{money(wallet.commissionRevenue)}</div><div className="yl-stat__label">عمولات التوصيل</div></div></div>
            <div className="yl-stat"><div><div className="yl-stat__value yl-num">{wallet.transactionsCount || 0}</div><div className="yl-stat__label">طلبات مسلّمة</div></div></div>
          </div>

          {wallet.transactions?.length ? (
            <TableWrap>
              <thead><tr><th>الطلب</th><th>المطعم</th><th>الزبون</th><th>الأصناف</th><th>العمولة</th><th>الإجمالي</th><th>التاريخ</th></tr></thead>
              <tbody>
                {wallet.transactions.map((tx) => (
                  <tr key={tx.orderId}>
                    <td data-label="الطلب" className="yl-num">#{String(tx.orderId).slice(-6)}</td>
                    <td data-label="المطعم">{tx.restaurantName || 'طلب توصيل'}</td>
                    <td data-label="الزبون">{[tx.customer?.name, tx.customer?.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td data-label="الأصناف" className="yl-num">{money(tx.itemsAmount)}</td>
                    <td data-label="العمولة" className="yl-num">{money(tx.commissionAmount)}</td>
                    <td data-label="الإجمالي"><b className="yl-num">{money(tx.amount)}</b></td>
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
