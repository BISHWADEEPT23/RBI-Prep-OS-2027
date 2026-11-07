import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA service worker conditionally on web over HTTP/S (never in Electron file://, and avoid duplicate if VitePWA injected registerSW)
if (
  typeof window !== 'undefined' &&
  !window.electronAPI &&
  'serviceWorker' in navigator &&
  window.location.protocol.startsWith('http') &&
  !document.getElementById('vite-plugin-pwa:register-sw')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(<App />);
