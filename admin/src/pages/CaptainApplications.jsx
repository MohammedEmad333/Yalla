// Card 79: توثيق الكباتن — تبويبان:
//  (1) طلبات التوثيق: طلبات التسجيل من التطبيق مع مستنداتها، قبول (إنشاء حساب)
//      أو رفض (حذف الطلب نهائيًا).
//  (2) بيانات الكباتن: البيانات الحسّاسة (رقم الهوية/تاريخ الميلاد/المستندات).

import { useEffect, useState } from 'react';
import { api, API } from '../api/client';
import { vehicleLabel } from '../vehicles';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  PageHeader,
  TableWrap,
} from '../components/ui';
import { IconCheck, IconClose, IconIdCard, IconImage } from '../components/icons';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

// عنوان صورة كامل من مسار نسبيّ
const imgUrl = (u) => (!u ? '' : u.startsWith('http') ? u : `${API}${u}`);

// معاينة مستند قابلة للفتح في تبويب جديد
function DocThumb({ url, label, big }) {
  if (!url) {
    return (
      <span className="yl-doc yl-doc--empty" title={label}>
        <IconImage size={20} />
      </span>
    );
  }
  return (
    <a
      className={`yl-doc ${big ? 'yl-doc--big' : ''}`}
      href={imgUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
      title={`فتح ${label}`}
    >
      <img src={imgUrl(url)} alt={label} loading="lazy" />
    </a>
  );
}

export default function CaptainApplications() {
  const [tab, setTab] = useState('applications'); // applications | data

  return (
    <>
      <PageHeader
        title="توثيق الكباتن"
        subtitle="مراجعة طلبات تسجيل الكباتن من التطبيق واعتمادها، وبياناتهم الحسّاسة"
      />

      <div className="yl-chips" style={{ marginBottom: 'var(--s-4)' }}>
        <Chip active={tab === 'applications'} onClick={() => setTab('applications')}>
          طلبات التوثيق
        </Chip>
        <Chip active={tab === 'data'} onClick={() => setTab('data')}>
          بيانات الكباتن
        </Chip>
      </div>

      {tab === 'applications' ? <ApplicationsTab /> : <CaptainsDataTab />}
    </>
  );
}

// ── تبويب طلبات التوثيق ─────────────────────────────────────────
function ApplicationsTab() {
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState('');

  const load = () => api.get('/admin/captain-applications?status=pending').then(setApps);
  useEffect(() => { load(); }, []);

  async function approve(a) {
    if (!window.confirm(`اعتماد الكابتن "${a.fullName}" وإنشاء حسابه؟`)) return;
    setBusy(a.id);
    try {
      await api.post(`/admin/captain-applications/${a.id}/approve`);
      setApps((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  async function reject(a) {
    if (!window.confirm(`رفض طلب "${a.fullName}" وحذفه نهائيًا؟ لا يمكن التراجع.`)) return;
    setBusy(a.id);
    try {
      await api.post(`/admin/captain-applications/${a.id}/reject`);
      setApps((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy('');
    }
  }

  if (apps.length === 0) {
    return (
      <EmptyState icon={<IconIdCard size={26} />} title="لا توجد طلبات توثيق معلّقة">
        ستظهر هنا طلبات الكباتن الجدد القادمة من التطبيق.
      </EmptyState>
    );
  }

  return (
    <div className="yl-grid yl-grid--wide">
      {apps.map((a) => (
        <Card key={a.id}>
          <div className="yl-row yl-row--between" style={{ marginBottom: 'var(--s-3)' }}>
            <b style={{ fontSize: 'var(--fs-lg)' }}>{a.fullName}</b>
            <Badge tone="warning">قيد التوثيق</Badge>
          </div>

          <dl className="yl-deflist">
            <div><dt>الهاتف</dt><dd className="yl-num">{a.phone}</dd></div>
            <div><dt>رقم الهوية</dt><dd className="yl-num">{a.nationalId}</dd></div>
            <div><dt>تاريخ الميلاد</dt><dd>{fmtDate(a.birthDate)}</dd></div>
            <div><dt>المركبة</dt><dd>{vehicleLabel(a.vehicleType)}</dd></div>
          </dl>

          <div className="yl-row" style={{ margin: 'var(--s-4) 0' }}>
            <div className="yl-stack yl-stack--sm" style={{ alignItems: 'center' }}>
              <span className="yl-hint">صورة الهوية</span>
              <DocThumb url={a.idPhotoUrl} label="صورة الهوية" big />
            </div>
            <div className="yl-stack yl-stack--sm" style={{ alignItems: 'center' }}>
              <span className="yl-hint">سيلفي مع الهوية</span>
              <DocThumb url={a.selfieUrl} label="السيلفي" big />
            </div>
          </div>

          <div className="yl-btnrow">
            <Button
              variant="success"
              icon={<IconCheck size={18} />}
              disabled={busy === a.id}
              onClick={() => approve(a)}
              style={{ flex: 1 }}
            >
              قبول وإنشاء الحساب
            </Button>
            <Button
              variant="danger"
              icon={<IconClose size={18} />}
              disabled={busy === a.id}
              onClick={() => reject(a)}
            >
              رفض
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── تبويب بيانات الكباتن الحسّاسة ───────────────────────────────
function CaptainsDataTab() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/admin/captains/data').then(setRows); }, []);

  if (rows.length === 0) {
    return <EmptyState icon={<IconIdCard size={26} />} title="لا يوجد كباتن" />;
  }

  return (
    <TableWrap>
      <thead>
        <tr>
          <th>الاسم</th>
          <th>الهاتف</th>
          <th>رقم الهوية</th>
          <th>تاريخ الميلاد</th>
          <th>المصدر</th>
          <th>الهوية</th>
          <th>السيلفي</th>
          <th>الانضمام</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td data-label="الاسم"><b>{c.name}</b></td>
            <td data-label="الهاتف" className="yl-num">{c.phone}</td>
            <td data-label="رقم الهوية" className="yl-num">{c.nationalId || '—'}</td>
            <td data-label="تاريخ الميلاد">{fmtDate(c.birthDate)}</td>
            <td data-label="المصدر">
              <Badge tone={c.createdVia === 'app' ? 'info' : 'neutral'}>
                {c.createdVia === 'app' ? 'التطبيق' : 'الأدمن'}
              </Badge>
            </td>
            <td data-label="الهوية"><DocThumb url={c.idPhotoUrl} label="صورة الهوية" /></td>
            <td data-label="السيلفي"><DocThumb url={c.selfieUrl} label="السيلفي" /></td>
            <td data-label="الانضمام">{fmtDate(c.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
