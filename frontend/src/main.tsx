import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Eruda mobile console — enabled with ?debug=1 or localStorage.debug=1.
// Gives a DevTools-like overlay on any mobile browser (console, network,
// elements, storage) without USB remote debugging.
(() => {
  const params = new URLSearchParams(window.location.search);
  const enable = params.get('debug') === '1' || localStorage.getItem('debug') === '1';
  if (!enable) return;
  if (params.get('debug') === '1') localStorage.setItem('debug', '1');
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda';
  s.onload = () => { (window as any).eruda?.init(); };
  document.head.appendChild(s);
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
