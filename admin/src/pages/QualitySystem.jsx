import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Alert, Badge, Button, Card, Input, Loading, PageHeader, Select, TableWrap } from '../components/ui';

export default function QualitySystem() {
  const [issues, setIssues] = useState([]);
  const [audit, setAudit] = useState([]);
  const [health, setHealth] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('all');

  async function load() {
    try {
      setError('');
      const [i, a, h, r] = await Promise.all([
        api.get(`/expansion/admin/issues${status === 'all' ? '' : `?status=${status}`}`),
        api.get('/expansion/admin/audit'),
        api.get('/expansion/admin/system-health'),
        api.get('/admin/restaurants'),
      ]);
      setIssues(i || []);
      setAudit(a || []);
      setHealth(h || null);
      setRestaurants(r || []);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  useEffect(() => { load(); }, [status]);

  async function updateIssue(issue, nextStatus, approvedRefund = 0) {
    setBusy(issue._id);
    try {
      await api.patch(`/expansion/admin/issues/${issue._id}`, {
        status: nextStatus,
        approvedRefund: Number(approvedRefund) || 0,
      });
      await load();
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(''); }
  }

  async function toggleMerchandising(row, field) {
    const current = row.merchandising || {};
    setBusy(row._id);
    try {
      await api.patch(`/expansion/admin/restaurants/${row._id}/merchandising`, {
        featured: field === 'featured' ? !current.featured : !!current.featured,
        popular: field === 'popular' ? !current.popular : !!current.popular,
        isNew: field === 'isNew' ? !current.isNew : !!current.isNew,
      });
      await load();
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(''); }
  }

  const openCount = useMemo(() => issues.filter((x) => ['open', 'reviewing'].includes(x.status)).length, [issues]);

  return (
    <div>
      <PageHeader title="الجودة والنظام" subtitle="الشكاوى والاستردادات، صحة الخدمات، سجل التدقيق، وإبراز المتاجر" />
      <Alert tone="error">{error}</Alert>

      <div className="yl-grid yl-grid--4" style={{ marginBottom: 16 }}>
        <Card><b>الشكاوى المفتوحة</b><div style={{ fontSize: 28, fontWeight: 900 }}>{openCount}</div></Card>
        <Card><b>API</b><div><Badge tone={health?.api === 'ok' ? 'success' : 'danger'}>{health?.api || '...'}</Badge></div></Card>
        <Card><b>MongoDB</b><div><Badge tone={health?.mongo === 'ok' ? 'success' : 'warning'}>{health?.mongo || '...'}</Badge></div></Card>
        <Card><b>ذاكرة الخادم</b><div style={{ fontSize: 20, fontWeight: 800 }}>{health?.memoryMb?.rss ?? '-'} MB</div></Card>
      </div>

      <Card title="الشكاوى والاستردادات" actions={
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">الكل</option><option value="open">مفتوحة</option><option value="reviewing">قيد المراجعة</option><option value="resolved">محلولة</option><option value="rejected">مرفوضة</option>
        </Select>
      }>
        {!issues.length ? <div className="yl-empty">لا توجد شكاوى</div> : <TableWrap>
          <thead><tr><th>الزبون</th><th>المشكلة</th><th>المطلوب</th><th>الحالة</th><th>الإجراء</th></tr></thead>
          <tbody>{issues.map((x) => <IssueRow key={x._id} issue={x} busy={busy === x._id} onUpdate={updateIssue} />)}</tbody>
        </TableWrap>}
      </Card>

      <div style={{ height: 16 }} />
      <Card title="إبراز المتاجر" pad={false}>
        <TableWrap>
          <thead><tr><th>المتجر</th><th>Featured</th><th>Popular</th><th>New</th></tr></thead>
          <tbody>{restaurants.map((r) => <tr key={r._id}>
            <td data-label="المتجر">{r.name}</td>
            <td data-label="Featured"><Button size="sm" variant={r.merchandising?.featured ? 'success' : 'outline'} disabled={busy === r._id} onClick={() => toggleMerchandising(r, 'featured')}>{r.merchandising?.featured ? 'مميز' : 'عادي'}</Button></td>
            <td data-label="Popular"><Button size="sm" variant={r.merchandising?.popular ? 'success' : 'outline'} disabled={busy === r._id} onClick={() => toggleMerchandising(r, 'popular')}>{r.merchandising?.popular ? 'شائع' : 'عادي'}</Button></td>
            <td data-label="New"><Button size="sm" variant={r.merchandising?.isNew ? 'success' : 'outline'} disabled={busy === r._id} onClick={() => toggleMerchandising(r, 'isNew')}>{r.merchandising?.isNew ? 'جديد' : 'عادي'}</Button></td>
          </tr>)}</tbody>
        </TableWrap>
      </Card>

      <div style={{ height: 16 }} />
      <Card title="سجل التدقيق" pad={false}>
        {!audit.length ? <Loading label="لا توجد أحداث" /> : <TableWrap>
          <thead><tr><th>الوقت</th><th>الأدمن</th><th>الإجراء</th><th>التفاصيل</th></tr></thead>
          <tbody>{audit.slice(0, 100).map((x) => <tr key={x._id}>
            <td data-label="الوقت">{new Date(x.createdAt).toLocaleString('ar')}</td>
            <td data-label="الأدمن">{x.actor?.name || '-'}</td>
            <td data-label="الإجراء"><code>{x.action}</code></td>
            <td data-label="التفاصيل">{x.summary || x.entityType}</td>
          </tr>)}</tbody>
        </TableWrap>}
      </Card>
    </div>
  );
}

function IssueRow({ issue, busy, onUpdate }) {
  const [refund, setRefund] = useState(issue.requestedRefund || 0);
  const tone = issue.status === 'resolved' ? 'success' : issue.status === 'rejected' ? 'danger' : issue.status === 'reviewing' ? 'warning' : 'info';
  return <tr>
    <td data-label="الزبون">{issue.user?.name || '-'}<br /><small>{issue.user?.phone}</small></td>
    <td data-label="المشكلة"><b>{issue.type}</b><br /><small>{issue.description}</small></td>
    <td data-label="المطلوب"><Input type="number" min="0" value={refund} onChange={(e) => setRefund(e.target.value)} style={{ width: 100 }} /></td>
    <td data-label="الحالة"><Badge tone={tone}>{issue.status}</Badge></td>
    <td data-label="الإجراء"><div className="yl-btnrow">
      {issue.status === 'open' && <Button size="sm" disabled={busy} onClick={() => onUpdate(issue, 'reviewing', 0)}>مراجعة</Button>}
      {!['resolved','rejected'].includes(issue.status) && <Button size="sm" variant="success" disabled={busy} onClick={() => onUpdate(issue, 'resolved', refund)}>حل + استرداد</Button>}
      {!['resolved','rejected'].includes(issue.status) && <Button size="sm" variant="danger" disabled={busy} onClick={() => onUpdate(issue, 'rejected', 0)}>رفض</Button>}
    </div></td>
  </tr>;
}
