import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './styles.css';
import { applyTheme } from './lib/theme.ts';

registerSW({ immediate: true });
applyTheme();
window.setInterval(() => applyTheme(), 10 * 60 * 1000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
