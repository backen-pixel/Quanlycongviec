import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CatalogProvider } from './lib/useCatalog';
import WebLayout from './WebLayout';
import TrangChu from './pages/TrangChu';
import SanPham from './pages/SanPham';
import LienHe from './pages/LienHe';

export default function App() {
  return (
    <BrowserRouter>
      <CatalogProvider>
      <Routes>
        <Route element={<WebLayout />}>
          <Route path="/" element={<TrangChu />} />
          <Route path="/san-pham" element={<SanPham />} />
          <Route path="/lien-he" element={<LienHe />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </CatalogProvider>
    </BrowserRouter>
  );
}
