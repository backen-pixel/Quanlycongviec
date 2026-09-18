/**
 * Nút ✨ mở Trợ lý hướng dẫn — phần DUY NHẤT trong bundle chính. Toàn bộ CopilotKit
 * (~vài trăm KB gzip) chỉ tải khi bấm nút lần đầu (`lazy()` + Suspense), nên trang login /
 * người chưa từng mở trợ lý không tốn băng thông cho thư viện này.
 *
 * Sau lần bấm đầu, panel giữ nguyên đã mount — CopilotPopup tự quản lý nút mở/đóng của nó
 * (xem appGuideCopilot.css: nút ✨ của ta ẩn đi, nhường chỗ cho nút mặc định của CopilotPopup).
 *
 * Ngoài nút ✨, panel còn mở được từ mục "Trợ lý AI" trong thanh chat nhanh — qua sự kiện
 * `guide:open` (xem lib/openGuide.js). Việc tải chậm vẫn giữ nguyên: chỉ khi có người thật sự
 * yêu cầu mở thì CopilotKit mới được tải về.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { EVENT_OPEN, EVENT_ASK_BAR } from './lib/openGuide';
import GuideAskBar from './GuideAskBar';
import './appGuideCopilot.css';

const AppGuideCopilotPanel = lazy(() => import('./AppGuideCopilotPanel'));

export default function AppGuideCopilot() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  /**
   * `guide:open` chỉ MOUNT trợ lý — TUYỆT ĐỐI không mở khung chat.
   *
   * Bản trước gọi `openPanelIfClosed()` ở đây, tức bấm hộ nút bật/tắt của thư viện khi panel
   * đang đóng. Hậu quả: mỗi câu hỏi gõ ở ô hỏi nổi đều bung khung chat ra — vì `askGuide()` phát
   * đúng sự kiện này để đảm bảo panel đã mount. Người dùng gõ một câu, khung chat tự mở đè lên
   * trang, dù cả tính năng đã chuyển sang trả lời trên nhân vật.
   *
   * Nay mở khung là việc của MỘT chỗ duy nhất: `openChatWindow()`, gắn với nút ☰ mà người dùng tự
   * bấm. Mount thì nhiều nơi kích hoạt được, mở thì chỉ người dùng.
   */
  useEffect(() => {
    const openPanel = () => setMounted(true);
    window.addEventListener(EVENT_OPEN, openPanel);
    return () => window.removeEventListener(EVENT_OPEN, openPanel);
  }, []);

  /**
   * Mở ô nhập = nạp thư viện luôn, không đợi tới lúc gửi.
   *
   * Người ta mở ô nhập là đã định hỏi. Nạp ngay lúc đó thì 634 KB tải xong trong lúc họ còn đang
   * gõ, câu hỏi đầu tiên không phải chờ. Vẫn giữ đúng nguyên tắc: ai không mở thì không tải.
   */
  useEffect(() => {
    const toggle = (e) => { if (e?.detail?.show !== false) setMounted(true); };
    window.addEventListener(EVENT_ASK_BAR, toggle);
    return () => window.removeEventListener(EVENT_ASK_BAR, toggle);
  }, []);

  if (!user) return null;

  return (
    <>
      {/* Luôn có mặt, mặc định THU GỌN thành một nút tròn. Không import CopilotKit (xem
          GuideAskBar.jsx) nên hiện được ngay cả khi thư viện chưa tải. */}
      <GuideAskBar />
      {/*
        KHÔNG còn nhân vật đứng chào lúc vào trang.
        Trước đây có `GuideMascotLauncher` — một ảnh tĩnh 146×132 px đứng 10 giây rồi tự tan, để
        người dùng có chỗ bấm trước khi bundle CopilotKit kịp tải. Nhưng nó chào MỌI người ở MỌI
        lần vào trang, kể cả người cả ngày không hỏi câu nào, và chào bằng cách đứng đè lên nội
        dung. Nút tròn của ô hỏi đã là lối vào đủ rõ mà không chiếm chỗ, nên nhân vật để dành cho
        lúc thật sự có việc: người dùng bắt đầu hỏi.
      */}
      {mounted && (
        <Suspense fallback={null}>
          <AppGuideCopilotPanel />
        </Suspense>
      )}
    </>
  );
}
