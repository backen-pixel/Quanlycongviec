import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppVersionBanner from './components/AppVersionBanner.jsx'

if (import.meta.env.VITE_STAGING_MODE === '1') {
  const banner = document.createElement('div');
  banner.textContent = 'Môi trường thử nghiệm — chỉ dùng dữ liệu mẫu';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fef3c7;color:#78350f;text-align:center;padding:6px;font-size:13px;pointer-events:none';
  document.body.appendChild(banner);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <AppVersionBanner />
  </StrictMode>,
)
