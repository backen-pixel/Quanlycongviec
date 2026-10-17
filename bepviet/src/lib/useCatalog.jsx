import { createContext, useContext, useEffect, useState } from 'react';
import { duLieuTinh, layDanhMucSanPham } from './catalog';

// Tải một lần cho cả site, chia sẻ qua context — không trang nào gọi API lại.
// Khởi tạo bằng dữ liệu tĩnh nên giao diện có nội dung ngay từ khung hình đầu tiên.

const CatalogContext = createContext({ ...duLieuTinh(), dangTai: true });

export function CatalogProvider({ children }) {
  const [state, setState] = useState(() => ({ ...duLieuTinh(), dangTai: true }));

  useEffect(() => {
    let huy = false;
    layDanhMucSanPham().then((kq) => {
      if (!huy) setState({ ...kq, dangTai: false });
    });
    return () => {
      huy = true;
    };
  }, []);

  return <CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}
