import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function SmartDispatch() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { setOrders(await api.get('/admin/dispatch/pending')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function inspect(order) {
    setSelected(order); setRecommendations(null); setError('');
    try { setRecommendations(await api.get(`/admin/dispatch/${order.id}/recommendations`)); }
    catch (e) { setError(e.message); }
  }

  async function assignBest() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const result = await api.post(`/admin/dispatch/${selected.id}/assign-best`, {});
      setRecommendations((current) => current ? { ...current, assigned: result.candidate } : current);
      await load();
      setSelected(null);
      setRecommendations(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div className="yl-stack">
    <div className="yl-pagehead">
      <div><h1>Smart Dispatch</h1><p>ترتيب الكباتن يعتمد على المسافة والحمل والتقييم وحداثة الموقع، وليس المسافة فقط.</p></div>
      <button className="yl-btn yl-btn--ghost" onClick={load}>تحديث</button>
    </div>
    {error && <div className="yl-alert yl-alert--danger">{error}</div>}

    <div className="yl-card">
      <h3>طلبات بانتظار الإسناد</h3>
      {loading ? <div className="yl-empty">جارٍ التحميل...</div> : orders.length === 0 ? <div className="yl-empty">لا توجد طلبات معلّقة.</div> : <div className="yl-tablewrap"><table className="yl-table">
        <thead><tr><th>الطلب</th><th>العميل</th><th>المسافة</th><th>المتجر</th><th></th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id}>
          <td>#{String(order.id).slice(-6)}</td>
          <td>{[order.user?.name, order.user?.lastName].filter(Boolean).join(' ') || '—'}</td>
          <td>{Number(order.distanceKm || 0).toFixed(1)} كم</td>
          <td>{order.store?.name || 'طلب توصيل'}</td>
          <td><button className="yl-btn yl-btn--ghost" onClick={() => inspect(order)}>ترتيب الكباتن</button></td>
        </tr>)}</tbody>
      </table></div>}
    </div>

    {selected && <div className="yl-card">
      <div className="yl-pagehead"><div><h3>أفضل الكباتن للطلب #{String(selected.id).slice(-6)}</h3><p>أقل Score هو الأفضل.</p></div>
        <button className="yl-btn yl-btn--primary" disabled={busy || !recommendations?.candidates?.length} onClick={assignBest}>{busy ? 'جارٍ الإسناد...' : 'إسناد أفضل كابتن'}</button>
      </div>
      {!recommendations ? <div className="yl-empty">جارٍ حساب المرشحين...</div> : recommendations.candidates.length === 0 ? <div className="yl-empty">لا يوجد كابتن مناسب حاليًا.</div> : <div className="yl-tablewrap"><table className="yl-table">
        <thead><tr><th>#</th><th>الكابتن</th><th>المسافة</th><th>طلبات نشطة</th><th>التقييم</th><th>GPS</th><th>Score</th><th>ETA</th></tr></thead>
        <tbody>{recommendations.candidates.map((c) => <tr key={c.id}>
          <td>{c.rank}</td><td>{c.name}</td><td>{c.distanceKm} كم</td><td>{c.activeOrdersCount}</td><td>{Number(c.rating || 0).toFixed(1)}</td><td>{c.locationAgeMinutes} د</td><td><b>{c.score}</b></td><td>{c.eta?.totalMinutes || '—'} د</td>
        </tr>)}</tbody>
      </table></div>}
    </div>}
  </div>;
}
