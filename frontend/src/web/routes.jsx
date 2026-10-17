import { Suspense } from 'react';
import { Route } from 'react-router-dom';
import { lazyWithRetry } from '../lib/lazyWithRetry';

// Website bán hàng công khai (/web) — không cần đăng nhập.
// Khai báo gọn trong một file để App.jsx chỉ cần chèn {WEB_ROUTES}.
const WebLayout = lazyWithRetry(() => import('./WebLayout'));
const TrangChu = lazyWithRetry(() => import('./pages/TrangChu'));
const SanPham = lazyWithRetry(() => import('./pages/SanPham'));
const LienHe = lazyWithRetry(() => import('./pages/LienHe'));

const Tai = ({ children }) => (
  <Suspense fallback={<div className="p-10 text-center text-sm text-stone-500">Đang tải…</div>}>{children}</Suspense>
);

export const WEB_ROUTES = (
  <Route path="/web" element={<Tai><WebLayout /></Tai>}>
    <Route index element={<Tai><TrangChu /></Tai>} />
    <Route path="san-pham" element={<Tai><SanPham /></Tai>} />
    <Route path="lien-he" element={<Tai><LienHe /></Tai>} />
  </Route>
);
