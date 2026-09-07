// نقطة دخول تطبيق React
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initThemeMode } from './theme-mode';

// تطبيق وضع العرض (فاتح/ليلي/حسب النظام) قبل أوّل رسم — يمنع وميض الأبيض ليلًا
initThemeMode();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
