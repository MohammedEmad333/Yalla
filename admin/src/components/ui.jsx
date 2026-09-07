// مكوّنات واجهة مشتركة (Yalla Console) — أغلفة رفيعة حول أصناف CSS في
// src/styles/components.css. الهدف: صفحات بلا أنماط سطريّة، ومظهر موحّد
// وسلوك متجاوب على الجوال والحاسوب دون تكرار.

import { useEffect } from 'react';
import { IconClose, IconSearch } from './icons';

/* ترويسة صفحة: عنوان + وصف + أزرار إجراءات */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="yl-pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="yl-pagehead__sub">{subtitle}</p>}
      </div>
      {children && <div className="yl-pagehead__actions">{children}</div>}
    </div>
  );
}

/* زرّ موحّد: variant = primary | secondary | outline | ghost | soft | success | danger | warning */
export function Button({
  variant = 'outline',
  size,
  block,
  icon,
  loading,
  children,
  className = '',
  ...rest
}) {
  const classes = [
    'yl-btn',
    `yl-btn--${variant}`,
    size ? `yl-btn--${size}` : '',
    block ? 'yl-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...rest}>
      {loading ? <span className="yl-spinner" style={{ width: 16, height: 16 }} /> : icon}
      {children}
    </button>
  );
}

/* زرّ أيقونة مربّع (بلا نصّ) — يحتاج label للوصوليّة */
export function IconButton({ label, small, children, className = '', ...rest }) {
  return (
    <button
      className={`yl-iconbtn ${small ? 'yl-iconbtn--sm' : ''} ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/* بطاقة: إمّا بمحتوى حرّ (pad) أو بترويسة + جسم */
export function Card({ title, actions, pad = true, children, className = '', ...rest }) {
  if (!title && !actions) {
    return (
      <section className={`yl-card ${pad ? 'yl-card--pad' : ''} ${className}`} {...rest}>
        {children}
      </section>
    );
  }
  return (
    <section className={`yl-card ${className}`} {...rest}>
      <header className="yl-card__head">
        <h2 className="yl-card__title">{title}</h2>
        {actions && <div className="yl-btnrow">{actions}</div>}
      </header>
      {children && <div className={pad ? 'yl-card__body' : ''}>{children}</div>}
    </section>
  );
}

/* حقل نموذج: تسمية + مدخل + تلميح */
export function Field({ label, hint, children }) {
  return (
    <label className="yl-field">
      {label && <span className="yl-label">{label}</span>}
      {children}
      {hint && <span className="yl-hint">{hint}</span>}
    </label>
  );
}

export const Input = ({ className = '', ...p }) => <input className={`yl-input ${className}`} {...p} />;
export const Textarea = ({ className = '', ...p }) => (
  <textarea className={`yl-textarea ${className}`} {...p} />
);
export const Select = ({ className = '', children, ...p }) => (
  <select className={`yl-select ${className}`} {...p}>
    {children}
  </select>
);

/* حقل بحث بأيقونة */
export function SearchInput({ className = '', ...p }) {
  return (
    <div className={`yl-search ${className}`}>
      <span className="yl-search__icon">
        <IconSearch size={18} />
      </span>
      <input className="yl-input" type="search" {...p} />
    </div>
  );
}

/* مفتاح تبديل */
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="yl-switch">
      <input type="checkbox" checked={!!checked} onChange={onChange} disabled={disabled} />
      <span className="yl-switch__track">
        <span className="yl-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

/* مربّع اختيار مع تسمية */
export function Checkbox({ checked, onChange, label, ...rest }) {
  return (
    <label className="yl-check">
      <input type="checkbox" checked={!!checked} onChange={onChange} {...rest} />
      <span>{label}</span>
    </label>
  );
}

/* شارة حالة: tone = neutral | success | danger | warning | info | brand */
export function Badge({ tone = 'neutral', dot, children }) {
  return (
    <span className={`yl-badge ${tone === 'neutral' ? '' : `yl-badge--${tone}`}`}>
      {dot && <span className="yl-badge__dot" />}
      {children}
    </span>
  );
}

/* رقاقة فلترة قابلة للتحديد */
export function Chip({ active, children, ...rest }) {
  return (
    <button type="button" className="yl-chip" aria-pressed={!!active} {...rest}>
      {children}
    </button>
  );
}

/* تنبيه: tone = error | success | warning | info */
export function Alert({ tone = 'info', children }) {
  if (!children) return null;
  return <div className={`yl-alert yl-alert--${tone}`}>{children}</div>;
}

/* حالة فارغة موحّدة */
export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="yl-empty">
      {icon && <div className="yl-empty__icon">{icon}</div>}
      <div className="yl-empty__title">{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* مؤشّر تحميل بعرض كامل */
export function Loading({ label = '...جارٍ التحميل' }) {
  return (
    <div className="yl-empty">
      <span className="yl-spinner" style={{ color: 'var(--brand)' }} />
      <span>{label}</span>
    </div>
  );
}

/* هيكل عظميّ لعناصر قيد التحميل */
export function Skeleton({ height = 14, width = '100%', radius }) {
  return <div className="yl-skeleton" style={{ height, width, borderRadius: radius }} />;
}

/* جدول متجاوب: على الجوال تتحوّل الصفوف إلى بطاقات (يتطلّب data-label لكل خليّة) */
export function TableWrap({ cards = true, children }) {
  return (
    <div className={`yl-tablewrap ${cards ? 'yl-tablewrap--cards' : ''}`}>
      <table className="yl-table">{children}</table>
    </div>
  );
}

/* نافذة منبثقة — تصير ورقة سفليّة على الجوال، وتُغلق بمفتاح Escape */
export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="yl-modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="yl-modal__panel" onClick={(e) => e.stopPropagation()}>
        <header className="yl-card__head">
          <h2 className="yl-card__title">{title}</h2>
          <IconButton label="إغلاق" onClick={onClose} small>
            <IconClose size={18} />
          </IconButton>
        </header>
        <div className="yl-card__body">{children}</div>
        {footer && <div className="yl-card__foot yl-btnrow">{footer}</div>}
      </div>
    </div>
  );
}

/* الحرف الأوّل من الاسم داخل دائرة (بديل الصورة الشخصية) */
export function Avatar({ name = '', src, size }) {
  const cls = `yl-avatar ${size ? `yl-avatar--${size}` : ''}`;
  if (src) return <img className={cls} src={src} alt={name} />;
  return <span className={cls}>{(name || '؟').trim().charAt(0)}</span>;
}
