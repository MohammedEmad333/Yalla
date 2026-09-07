// أيقونات SVG مضمّنة (بلا مكتبة خارجية) — خطّية بسمك موحّد لتبدو كعائلة واحدة.
// كلّها ترث اللون من `currentColor` فتتبع لون العنصر الحاوي تلقائيًّا.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size = 20, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base} {...rest}>
      {children}
    </svg>
  );
}

export const IconMenu = (p) => (
  <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
);
export const IconClose = (p) => (
  <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
);
export const IconSearch = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
);
export const IconRefresh = (p) => (
  <Svg {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></Svg>
);
export const IconDashboard = (p) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></Svg>
);
export const IconOrders = (p) => (
  <Svg {...p}><path d="M8 3h8a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" /><path d="M9 8h6M9 12h6" /></Svg>
);
export const IconChat = (p) => (
  <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" /></Svg>
);
export const IconSupport = (p) => (
  <Svg {...p}><path d="M4 13v-1a8 8 0 1 1 16 0v1" /><rect x="2.5" y="13" width="4" height="6" rx="2" /><rect x="17.5" y="13" width="4" height="6" rx="2" /><path d="M19 19v.5a2.5 2.5 0 0 1-2.5 2.5H13" /></Svg>
);
export const IconMegaphone = (p) => (
  <Svg {...p}><path d="M3 10v4a1 1 0 0 0 1 1h3l7 4V5L7 9H4a1 1 0 0 0-1 1Z" /><path d="M18 9a4 4 0 0 1 0 6" /></Svg>
);
export const IconStore = (p) => (
  <Svg {...p}><path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" /><path d="M3 9l1.6-4.2A2 2 0 0 1 6.5 3.5h11a2 2 0 0 1 1.9 1.3L21 9" /><path d="M9 21v-6h6v6" /></Svg>
);
export const IconWallet = (p) => (
  <Svg {...p}><path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" /><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M16 14h2" /></Svg>
);
export const IconCashOut = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M8.5 13.5 12 17l3.5-3.5" /></Svg>
);
export const IconUsers = (p) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.4A6 6 0 0 1 21 20" /></Svg>
);
export const IconIdCard = (p) => (
  <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16.2a3.4 3.4 0 0 1 6 0M14 10h4M14 14h4" /></Svg>
);
export const IconChart = (p) => (
  <Svg {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 20v-6M12.5 20V9M17 20v-9.5" /></Svg>
);
export const IconLogout = (p) => (
  <Svg {...p}><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8 6 12l4 4M6 12h9" /></Svg>
);
export const IconPlus = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconTrash = (p) => (
  <Svg {...p}><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M6.5 7 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" /></Svg>
);
export const IconCheck = (p) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Svg>
);
export const IconEdit = (p) => (
  <Svg {...p}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 6.5 3 3" /></Svg>
);
export const IconSend = (p) => (
  <Svg {...p}><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z" /></Svg>
);
export const IconPhone = (p) => (
  <Svg {...p}><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" /></Svg>
);
export const IconPin = (p) => (
  <Svg {...p}><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></Svg>
);
export const IconClock = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3 1.8" /></Svg>
);
export const IconDownload = (p) => (
  <Svg {...p}><path d="M12 4v11M8 11.5 12 15.5l4-4" /><path d="M4 19h16" /></Svg>
);
export const IconFilter = (p) => (
  <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>
);
export const IconBolt = (p) => (
  <Svg {...p}><path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z" /></Svg>
);
export const IconChevron = (p) => (
  <Svg {...p}><path d="m14 6-6 6 6 6" /></Svg>
);
export const IconStar = (p) => (
  <Svg {...p}><path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8L12 4Z" /></Svg>
);
export const IconBike = (p) => (
  <Svg {...p}><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="17" r="3" /><path d="M8.5 17h6l-3-8h-2M13 6h3l1.5 4M11.5 9 9 13" /></Svg>
);
export const IconImage = (p) => (
  <Svg {...p}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="8.5" cy="10" r="1.6" /><path d="m4 17 4.5-4.5 3.5 3L15.5 12 20 16.5" /></Svg>
);
export const IconSun = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
);
export const IconMoon = (p) => (
  <Svg {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></Svg>
);
export const IconAuto = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" /></Svg>
);
