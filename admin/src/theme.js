// نظام تصميم "Yalla Velocity" — مصدر واحد لألوان وقياسات لوحة الأدمن.
// مستخرَج من design/stitch/.../yalla_velocity/DESIGN.md ومطبَّق على واجهة React.

export const theme = {
  color: {
    // الأسطح والخلفيّات
    surface: '#f9f9fc',
    surfaceContainer: '#f3f3f6',
    card: '#ffffff',

    // النصوص
    onSurface: '#1a1c1e',
    onSurfaceVariant: '#5a4136',
    muted: '#6b6f76',

    // الأساسي (برتقالي — السرعة والطاقة)
    primary: '#ff6b00',
    primaryDeep: '#a04100',
    onPrimary: '#ffffff',
    primarySoft: '#ffe6d6',
    onPrimaryContainer: '#572000',

    // الثانوي (أزرق سماوي — الثقة والمسارات)
    secondary: '#00a2fd',
    secondaryDeep: '#00629d',
    onSecondary: '#ffffff',
    secondarySoft: '#d9edff',

    // الحالات
    success: '#1f9d55',
    successSoft: '#e6f6ec',
    warning: '#f59e0b',
    warningSoft: '#fff2df',
    error: '#ba1a1a',
    errorSoft: '#ffdad6',

    // الحدود
    outline: '#e8e4e1',
    outlineStrong: '#d8d2ce',
  },

  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 9999 },

  shadow: {
    soft: '0 1px 3px rgba(0,0,0,0.06)',
    card: '0 4px 20px rgba(0,0,0,0.05)',
    float: '0 8px 28px rgba(160,65,0,0.18)', // ظلّ مائل للبرتقالي للعناصر الفاعلة
  },

  font: "'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif",
};

// لون شارة/خطّ حالة الطلب (رمادي=انتظار، أزرق=مُسنَد، برتقالي=جارٍ، أخضر=مسلّم، أحمر=ملغى)
export const orderStatusColor = (s) =>
  ({
    pending: '#8a8f98',
    assigned: theme.color.secondary,
    accepted: theme.color.primary,
    picked_up: theme.color.primary,
    delivered: theme.color.success,
    cancelled: theme.color.error,
  }[s] || theme.color.muted);
