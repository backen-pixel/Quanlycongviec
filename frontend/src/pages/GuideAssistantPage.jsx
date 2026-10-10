/**
 * MÀN HÌNH RIÊNG CHO TRỢ LÝ HƯỚNG DẪN (CopilotKit).
 *
 * Trước đây hai tab này nằm nhờ trong màn hình "AI Bot trong chat". Cùng một chỗ nhưng là HAI
 * sản phẩm khác hẳn nhau, và việc để chung gây hiểu nhầm ngay từ tiêu đề: trang kia mở đầu bằng
 * “Tạo các luồng AI tự động đăng tin vào chat phòng ban / nhóm” và một thẻ trạng thái
 * “OpenAI sẵn sàng” — cả hai đều không nói gì về trợ lý này.
 *
 *                      AI Assistant (chat)          Trợ lý hướng dẫn (đây)
 *   Chạy ở            backend routes/aiChatBot      backend routes/guide/copilotkit
 *   Model             OpenAI                        Anthropic
 *   Kích hoạt         theo lịch, tự đăng tin         người dùng hỏi
 *   Kho kiến thức     không                          316 chunk + bộ nhớ kinh nghiệm
 *
 * Tách trang thay vì tách nhóm tab: một tiêu đề riêng, một trạng thái riêng, và người vào đây
 * không phải lướt qua ba tab của con bot kia để tới phần mình cần.
 */
import { useCallback, useState } from 'react';
import { Compass, BookOpen, Lightbulb, Users, CheckCircle2, AlertTriangle } from 'lucide-react';
import GuideAssistantSettingsTab from './GuideAssistantSettingsTab';
import GuideKnowledgeTab from './GuideKnowledgeTab';
import GuideExperienceTab from './GuideExperienceTab';
import GuideUsersTab from './GuideUsersTab';

export default function GuideAssistantPage() {
  const [tab, setTab] = useState('settings'); // 'settings' | 'knowledge' | 'experience' | 'users'
  const [toast, setToast] = useState(null);

  // Cùng chữ ký với `showToast` của màn hình AI Bot ('err' = lỗi) — hai tab con dùng chung
  // component, đổi chữ ký ở đây là chúng báo lỗi bằng màu xanh.
  const showToast = useCallback((text, kind = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center text-2xl shrink-0">
            🧭
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Trợ lý hướng dẫn</h1>
            <p className="text-sm text-gray-500">
              Trợ lý đọc màn hình người dùng đang xem, chỉ đường và thao tác hộ — chạy trên CopilotKit
            </p>
          </div>
        </div>
      </div>

      {/* Nói rõ nó KHÁC con bot chat, ngay chỗ dễ nhầm nhất. */}
      <div className="mb-4 px-4 py-3 rounded-xl bg-white border border-gray-200 flex items-center gap-3 text-sm">
        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-base shrink-0">🤖</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">Không phải AI Bot trong chat</div>
          <div className="text-xs text-gray-500">
            Con bot kia chạy theo lịch và tự đăng tin vào chat phòng ban. Trợ lý này chỉ hoạt động khi
            người dùng hỏi, và có kho kiến thức riêng về giao diện hệ thống.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('settings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
            tab === 'settings' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Compass className="h-4 w-4" /> Tinh chỉnh
        </button>
        <button
          onClick={() => setTab('knowledge')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
            tab === 'knowledge' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <BookOpen className="h-4 w-4" /> Kiến thức
        </button>
        {/* Kinh nghiệm đứng SAU kiến thức, cố ý: kiến thức là thứ người viết, kinh nghiệm là thứ
            trợ lý tự học từ đó. Đảo thứ tự là gợi ý sai về quan hệ giữa hai kho. */}
        <button
          onClick={() => setTab('experience')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
            tab === 'experience' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Lightbulb className="h-4 w-4" /> Kinh nghiệm
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
            tab === 'users' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Users className="h-4 w-4" /> Người dùng
        </button>
      </div>

      {tab === 'settings' && <GuideAssistantSettingsTab showToast={showToast} />}
      {tab === 'knowledge' && <GuideKnowledgeTab showToast={showToast} />}
      {tab === 'experience' && <GuideExperienceTab showToast={showToast} />}
      {tab === 'users' && <GuideUsersTab showToast={showToast} />}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[10070] px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.kind === 'err' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}
        >
          {toast.kind === 'err' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
