import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  BookOpen, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Users, Target, Award, ChevronDown, ChevronUp, Info,
  Activity, BarChart2, Phone, FileText, Zap, DollarSign,
  CalendarCheck, UserCheck, ArrowRight, ShieldCheck, FlaskConical,
  Sparkles,
} from 'lucide-react';
import { KPI_GROUP_A_TEST_LEADS } from '../lib/kpiGroupATestMatrix';
import { dispatchKpiExplain } from '../lib/kpiPersonalLedgerHints';

// ── Data ────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    id: 'all',
    label: 'Tất cả KPI',
    icon: BarChart2,
    color: 'indigo',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  {
    id: 'sales_admin',
    label: 'Sales Admin / Telesales',
    icon: Phone,
    color: 'blue',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'sales',
    label: 'Kinh doanh',
    icon: TrendingUp,
    color: 'emerald',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'deal',
    label: 'Tư vấn / Deal',
    icon: Award,
    color: 'purple',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
  },
];

export const KPI_DEFS = [
  {
    code: 'A1',
    group: 'A',
    name: 'Phản hồi lead trong 15 phút',
    weight: 12,
    target: '≥ 90% lead',
    targetNote: '90% số lead của bạn phải được phản hồi trong vòng 15 phút kể từ lúc tạo',
    formula: 'increasing',
    applies: ['sales_admin'],
    icon: Clock,
    groupColor: 'blue',
    isGating: false,
    howMeasured: 'Hệ thống đo % lead có first_touch_time trong vòng 15 phút kể từ created_at trong tháng.',
    actions: [
      'Bật thông báo lead mới trên điện thoại/máy tính',
      'Khi có lead mới → gọi điện ngay, ghi activity trong CRM với loại "Gọi điện"',
      'Không để lead chờ quá 15 phút dù bất kỳ lý do gì',
      'Nếu đang bận, nhờ đồng nghiệp xử lý tạm và bàn giao lại',
    ],
    mistakes: ['Ghi note trong CRM nhưng không chọn loại hoạt động', 'Chờ hết cuộc họp mới gọi lại'],
  },
  {
    code: 'A2',
    group: 'A',
    name: 'Thời gian phản hồi trung bình',
    weight: 4,
    target: '≤ 15 phút (TB tháng)',
    targetNote: 'Trung bình thời gian phản hồi tất cả lead trong tháng phải ≤ 15 phút',
    formula: 'duration',
    applies: ['sales_admin'],
    icon: Clock,
    groupColor: 'blue',
    isGating: false,
    howMeasured: 'Trung bình số phút từ created_at đến first_touch_time của tất cả lead trong tháng.',
    actions: [
      'Ưu tiên lead mới nhất khi bắt đầu ca làm việc',
      'Đặt báo thức nhắc nhở kiểm tra lead mỗi giờ',
      'Một lead phản hồi 2 giờ sẽ kéo trung bình của cả tháng lên cao',
    ],
    mistakes: ['Để cuối ngày mới xử lý hàng loạt lead tích lũy'],
  },
  {
    code: 'A3',
    group: 'A',
    name: 'Tỷ lệ lead hoàn thiện thông tin',
    weight: 7,
    target: '≥ 95% lead',
    targetNote: '95% lead bạn quản lý phải đủ 6 trường thông tin bắt buộc',
    formula: 'increasing',
    applies: ['sales_admin'],
    icon: FileText,
    groupColor: 'blue',
    isGating: false,
    howMeasured: 'Đếm % lead có info_complete = true (6 trường bắt buộc trong DB) và mọi nhiệm vụ CRM bật “bắt buộc file/ghi chú” trên lead đó đã hoàn thành kèm minh chứng (ghi chú task hoặc đính kèm).',
    infoFields: ['Số điện thoại', 'Khách hàng (customer_id)', 'Khu vực (region_id)', 'Giá trị ước tính > 0', 'Thời gian thi công dự kiến', 'Địa chỉ lắp đặt'],
    actions: [
      'Sau mỗi cuộc gọi, cập nhật ngay thông tin thu thập được vào CRM',
      'Kiểm tra danh sách lead còn thiếu thông tin cuối mỗi ngày',
      'Nếu khách chưa cung cấp, ghi rõ vào note và theo dõi cuộc gọi sau',
    ],
    mistakes: ['Để lead ở trạng thái "đang xử lý" mà không cập nhật thông tin'],
  },
  {
    code: 'A4',
    group: 'A',
    name: 'Hoàn thành task đúng hạn',
    weight: 7,
    target: '≥ 95% task (Gating: phải ≥ 80%)',
    targetNote: '95% task có deadline trong tháng phải hoàn thành đúng hoặc trước hạn',
    formula: 'increasing',
    applies: ['sales'],
    icon: CheckCircle2,
    groupColor: 'red',
    isGating: true,
    howMeasured: '% task của bạn có deadline trong tháng mà completed_at ≤ deadline và status = completed.',
    actions: [
      'Xem danh sách task của mình mỗi sáng, sắp xếp theo deadline',
      'Khi hoàn thành task, đánh dấu ngay trong CRM (không để cuối tuần)',
      'Nếu task sắp hết hạn và gặp khó khăn → báo quản lý ngay, đừng im lặng',
      'Không nhận task mới khi task cũ chưa xử lý xong',
    ],
    mistakes: [
      'Hoàn thành task nhưng quên đánh dấu trong CRM → bị tính là chưa xong',
      'Để task quá hạn rồi mới báo cáo',
    ],
    criticalNote: 'Nếu tỷ lệ này xuống dưới 80%, TOÀN BỘ điểm tháng bị giới hạn tối đa 70/100 — dù các KPI khác đều đạt 100%.',
  },
  {
    code: 'A5',
    group: 'A',
    name: 'Chuyển stage đúng SLA',
    weight: 3,
    target: '≥ 90% transitions',
    targetNote: '90% lần chuyển stage phải trong giới hạn SLA của stage đó',
    formula: 'increasing',
    applies: ['deal'],
    icon: ArrowRight,
    groupColor: 'blue',
    isGating: false,
    howMeasured: '% hàng trong crm_lead_stage_history mà thời gian ở stage (exited_at - entered_at) ≤ sla_days × 86400 giây.',
    actions: [
      'Kiểm tra cột "Ngày ở stage" trong danh sách deal mỗi ngày',
      'Deal sắp hết SLA → đẩy sang bước tiếp hoặc ghi nhận lý do chờ với quản lý',
      'Xem cài đặt SLA từng stage trong Pipeline Settings để biết giới hạn',
    ],
    mistakes: ['Để deal "đóng băng" ở một stage vì chờ khách mà không ghi nhận'],
  },
  {
    code: 'A6',
    group: 'A',
    name: 'Số lead đang quá hạn SLA',
    weight: 2,
    target: '≤ 5 lead',
    targetNote: 'Tổng số lead active đang vượt quá thời gian SLA của stage phải dưới 5',
    formula: 'decreasing',
    applies: ['sales_admin', 'sales', 'deal'],
    icon: AlertTriangle,
    groupColor: 'orange',
    isGating: false,
    howMeasured: 'Đếm số lead chưa thắng/thua mà (now - stage_entered_at) > sla_days của stage hiện tại.',
    actions: [
      'Rà soát lead cũ mỗi tuần, xử lý hoặc đóng những lead không còn tiềm năng',
      'Đừng giữ lead "zombie" chỉ để đẹp pipeline',
      'Lead nào không liên lạc được sau 3 lần → đổi trạng thái lost hoặc cold',
    ],
    mistakes: ['Giữ hàng trăm lead cũ không tiếp xúc trong CRM'],
  },
  {
    code: 'B1',
    group: 'B',
    name: 'Tỷ lệ minh chứng tiếp xúc',
    weight: 7,
    target: '≥ 70% lead',
    targetNote: '70% lead của bạn phải có ghi âm gắn lead trong tháng, hoặc hoàn thành đúng nhiệm vụ CRM được cấu hình (ghi chú KH / minh chứng liên hệ).',
    formula: 'increasing',
    applies: ['sales_admin'],
    icon: Phone,
    groupColor: 'green',
    isGating: false,
    howMeasured:
      '% lead (type=lead) có ≥1 file ghi âm gắn lead trong kỳ HOẶC có ≥1 nhiệm vụ CRM trong kỳ được tick «Ghi chú KH» hoặc «Minh chứng liên hệ» đã hoàn thành đúng quy tắc (ghi chú / file).',
    actions: [
      'Upload/ghép ghi âm cuộc gọi với lead (tab Ghi âm CRM hoặc trang Cuộc gọi & ghi âm).',
      'Hoặc: tại Cấu hình KPI → Bộ nhiệm vụ CRM, tick «Ghi chú khách hàng» và/hoặc «Minh chứng liên hệ» trên nhiệm vụ mẫu — khi NV hoàn thành đúng yêu cầu, lead được tính.',
      'Không cần gõ activity call/zalo/outcome như trước.',
    ],
    mistakes: [
      'Không gắn ghi âm với lead, và không bật nhiệm vụ minh chứng trên mẫu — B1 sẽ thấp.',
      'Bật «Minh chứng liên hệ» nhưng hoàn thành task không ghi chú / không đính kèm.',
    ],
  },
  {
    code: 'B2',
    group: 'B',
    name: 'Tỷ lệ lead → Đặt lịch khảo sát',
    weight: 8,
    target: '≥ 40% lead mới',
    targetNote: '40% lead mới trong tháng phải tiến tới giai đoạn khảo sát',
    formula: 'increasing',
    applies: ['sales'],
    icon: CalendarCheck,
    groupColor: 'green',
    isGating: false,
    howMeasured: 'Tính % lead đã vào giai đoạn survey_scheduled hoặc survey_done trong tháng.',
    actions: [
      'Sau khi đủ thông tin và khách quan tâm → đề xuất lịch khảo sát ngay trong cùng cuộc gọi',
      'Không để lead ở trạng thái "warm" quá 3 ngày mà không hành động',
      'Chuẩn bị sẵn 3 khung giờ trống để đề xuất lịch khảo sát',
    ],
    mistakes: ['Để khách "suy nghĩ thêm" mà không đặt lịch cụ thể'],
  },
  {
    code: 'B3',
    group: 'B',
    name: 'Tỷ lệ Khảo sát → Báo giá',
    weight: 7,
    target: '≥ 85% khảo sát',
    targetNote: '85% deal đã hoàn thành khảo sát phải tiến tới giai đoạn báo giá',
    formula: 'increasing',
    applies: ['deal'],
    icon: FileText,
    groupColor: 'green',
    isGating: false,
    howMeasured: 'Số deal từ survey_done chuyển sang quoted/negotiating/contract_signed chia tổng survey_done trong tháng.',
    actions: [
      'Sau khảo sát xong → lên báo giá trong tối đa 3 ngày (xem B5)',
      'Không để deal ở survey_done quá 3 ngày mà chưa chuyển sang báo giá',
      'Nếu thiếu thông tin kỹ thuật → liên hệ bộ phận thiết kế ngay hôm đó',
    ],
    mistakes: ['Khảo sát xong nhưng chờ "báo giá chính xác" rồi mới báo → kéo dài quá lâu'],
  },
  {
    code: 'B4',
    group: 'B',
    name: 'Win Rate — Tỷ lệ chốt hợp đồng',
    weight: 18,
    target: '≥ 25% báo giá (tốt nhất: 35%)',
    targetNote: '25% số deal đã báo giá phải ký được hợp đồng',
    formula: 'increasing',
    applies: ['deal'],
    icon: Award,
    groupColor: 'green',
    isGating: false,
    howMeasured: 'Số deal vào contract_signed chia số deal đã vào quoted trong tháng.',
    actions: [
      'Deal đang ở negotiating > 7 ngày → chủ động hẹn gặp trực tiếp hoặc gọi video call',
      'Chuẩn bị 2-3 phương án giá/gói để khách lựa chọn, không chỉ 1 phương án',
      'Hiểu lý do từ chối → điều chỉnh đề xuất hoặc escalate cho quản lý',
      'Báo cáo deal có nguy cơ mất sớm cho quản lý (không chờ đến khi chắc chắn mất)',
    ],
    mistakes: [
      'Chờ khách gọi lại mà không chủ động follow up',
      'Báo giá chỉ qua tin nhắn, không gặp mặt hay giải thích giá trị',
    ],
  },
  {
    code: 'B5',
    group: 'B',
    name: 'Tốc độ từ Khảo sát → Báo giá',
    weight: 5,
    target: '≤ 3 ngày (TB tháng)',
    targetNote: 'Trung bình từ khi khảo sát xong đến khi gửi báo giá phải ≤ 3 ngày',
    formula: 'duration',
    applies: ['deal'],
    icon: Zap,
    groupColor: 'green',
    isGating: false,
    howMeasured: 'Trung bình ngày từ survey_done đến quoted cho tất cả deal trong tháng.',
    actions: [
      'Chuẩn bị sẵn template báo giá cho từng loại sản phẩm',
      'Sau khảo sát → gửi báo giá ngay hôm đó hoặc sáng hôm sau',
      'Nếu cần bản vẽ kỹ thuật → yêu cầu ngay khi đi khảo sát, đừng chờ về mới hỏi',
    ],
    mistakes: ['Về văn phòng rồi mới bắt đầu hỏi thông tin kỹ thuật → chậm 1-2 ngày'],
  },
  {
    code: 'C1',
    group: 'C',
    name: 'Doanh thu ký hợp đồng trong tháng',
    weight: 15,
    target: '≥ 1 tỷ VND / tháng',
    targetNote: 'Tổng giá trị hợp đồng ký được trong tháng phải đạt 1 tỷ đồng',
    formula: 'revenue',
    applies: ['deal'],
    icon: DollarSign,
    groupColor: 'amber',
    isGating: false,
    howMeasured: 'Tổng estimated_value của các lead có chuyển sang contract_signed trong tháng (theo owner).',
    actions: [
      'Đảm bảo estimated_value được cập nhật chính xác sau khảo sát (không để 0 hoặc ước lượng sai)',
      'Ưu tiên deal giá trị cao trong pipeline, đừng bỏ qua vì "khách khó"',
      'Theo dõi tiến độ doanh thu thực tế từ giữa tháng, không chờ cuối tháng mới kiểm tra',
    ],
    mistakes: [
      'Để estimated_value trống hoặc điền sai → điểm C1 không phản ánh thực tế',
      'Chỉ tập trung deal nhỏ/dễ mà bỏ qua deal lớn cần nỗ lực hơn',
    ],
  },
  {
    code: 'C2',
    group: 'C',
    name: 'Giá trị hợp đồng trung bình',
    weight: 2,
    target: '≥ 200 triệu VND / HĐ',
    targetNote: 'Mỗi hợp đồng ký trung bình phải đạt 200 triệu đồng',
    formula: 'revenue',
    applies: ['deal'],
    icon: DollarSign,
    groupColor: 'amber',
    isGating: false,
    howMeasured: 'Tổng C1 chia số hợp đồng ký được trong tháng.',
    actions: [
      'Tư vấn đầy đủ giải pháp, không chỉ đề xuất phương án rẻ nhất',
      'Khi phù hợp, giới thiệu thêm hạng mục để tăng giá trị dự án',
      'Đừng giảm giá quá nhiều — báo cáo cho quản lý nếu cần hỗ trợ đàm phán',
    ],
    mistakes: ['Chỉ nhắm vào deal nhỏ để đạt số lượng, kéo giá trị trung bình xuống'],
  },
  {
    code: 'C3',
    group: 'C',
    name: 'Số lượng lead mới trong tháng',
    weight: 2,
    target: '≥ 30 lead / tháng',
    targetNote: 'Tạo hoặc được phân ít nhất 30 lead mới mỗi tháng',
    formula: 'quantity',
    applies: ['sales_admin'],
    icon: Users,
    groupColor: 'amber',
    isGating: false,
    howMeasured: 'Đếm tổng lead mới trong tháng mà bạn là owner.',
    actions: [
      'Khai thác đa kênh: fanpage, zalo OA, giới thiệu, telesales từ danh sách cũ',
      'Mọi khách hàng tiềm năng phải được tạo lead trong CRM ngay, không để "ngoài hệ thống"',
      'Theo dõi tiến độ lead mỗi tuần — 30 lead = ~7-8 lead mỗi tuần',
    ],
    mistakes: ['Tạo lead vào ngày cuối tháng dồn dập để đủ số → chất lượng thấp'],
  },
  {
    code: 'C4',
    group: 'C',
    name: 'Tỷ lệ deal thất bại',
    weight: 1,
    target: '≤ 15% deal',
    targetNote: 'Không quá 15% deal trong tháng bị chuyển sang trạng thái "lost"',
    formula: 'decreasing',
    applies: ['sales_admin', 'sales', 'deal'],
    icon: AlertTriangle,
    groupColor: 'red',
    isGating: false,
    howMeasured: '% lead/deal trong tháng mà có chuyển sang stage "lost" chia tổng deal có trong tháng.',
    actions: [
      'Khi deal có nguy cơ lost → báo quản lý sớm để được hỗ trợ',
      'Ghi rõ lý do lost để cải thiện — "khách không có nhu cầu" hay "giá cao" hay "chọn đối thủ"?',
      'Tránh đóng deal vội chỉ để "dọn pipeline" — mỗi deal lost đều ảnh hưởng điểm',
    ],
    mistakes: ['Đóng deal lost hàng loạt cuối tháng vì "dọn dẹp CRM"'],
  },
];

const SCORING_RULES = [
  { formula: 'Tăng / Số lượng / Doanh thu', rule: 'ratio = thực tế ÷ mục tiêu', example: 'A1: thực tế 100% / mục tiêu 90% = ratio 1.11' },
  { formula: 'Giảm / Thời gian', rule: 'ratio = mục tiêu ÷ thực tế', example: 'A2: mục tiêu 15 phút / thực tế 12 phút = ratio 1.25 (cap 1.2)' },
  { formula: 'Điểm = ratio × trọng số', rule: 'Tối đa vượt 20% (ratio ≤ 1.2)', example: 'A1 W=12 × 1.11 = 13.3 điểm' },
];

const DAILY = [
  { time: 'Đầu giờ sáng', icon: '🌅', items: ['Xem task hôm nay, sắp xếp theo deadline (A4)', 'Kiểm tra lead mới được phân về (A1)', 'Xem deal nào gần hết SLA (A5)'] },
  { time: 'Trong ngày', icon: '⚡', items: ['Phản hồi lead mới trong 15 phút (A1)', 'Ghi âm hoặc hoàn thành NV có tick ghi chú/minh chứng (B1)', 'Cập nhật thông tin lead sau mỗi cuộc gọi (A3)'] },
  { time: 'Cuối ngày', icon: '🌙', items: ['Đánh dấu task hoàn thành trong CRM (A4)', 'Kiểm tra lead còn thiếu thông tin (A3)', 'Ghi chú kế hoạch ngày mai cho deal quan trọng'] },
];

const WEEKLY = [
  'Rà soát lead quá SLA stage — xử lý hoặc đóng (A6)',
  'Kiểm tra deal ở "negotiating" > 7 ngày → hành động cụ thể (B4)',
  'Họp brief với quản lý về deal có nguy cơ mất (C4)',
  'Xem tiến độ doanh thu tháng so với target 1 tỷ (C1)',
  'Kiểm tra tỷ lệ task đúng hạn của tuần (A4)',
];

// ── Helpers ────────────────────────────────────────────────────────────────

const GROUP_META = {
  A: { label: 'Nhóm A — Hoạt động & Quy trình', total: 35, color: 'blue', desc: 'Đo lường kỷ luật làm việc hàng ngày' },
  B: { label: 'Nhóm B — Pipeline & Chuyển đổi', total: 45, color: 'emerald', desc: 'Đo lường hiệu quả bán hàng' },
  C: { label: 'Nhóm C — Kết quả & Chất lượng', total: 20, color: 'amber', desc: 'Đo lường đầu ra cuối cùng' },
};

const GROUP_COLORS = {
  blue: { bg: 'bg-blue-600', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  emerald: { bg: 'bg-emerald-600', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
  amber: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  red: { bg: 'bg-red-600', light: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  orange: { bg: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
  green: { bg: 'bg-green-600', light: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', badge: 'bg-green-100 text-green-700' },
};

const ROLE_COLORS = {
  sales_admin: GROUP_COLORS.blue,
  sales: GROUP_COLORS.emerald,
  deal: { bg: 'bg-purple-600', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
};

const ROLE_LABELS = {
  sales_admin: 'Sales Admin',
  sales: 'Kinh doanh',
  deal: 'Tư vấn/Deal',
};

function WeightBar({ weight, max = 18 }) {
  const pct = Math.round((weight / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-6 text-right">{weight}</span>
    </div>
  );
}

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || GROUP_COLORS.blue;
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiDetailCard({ kpi }) {
  const [open, setOpen] = useState(false);
  const gc = GROUP_COLORS[kpi.groupColor] || GROUP_COLORS.blue;

  return (
    <div className={`rounded-xl border ${kpi.isGating ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
      >
        {/* Code badge */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${gc.bg} flex items-center justify-center`}>
          <span className="text-white text-sm font-bold">{kpi.code}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900">{kpi.name}</span>
            {kpi.isGating && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> GATING
              </span>
            )}
            {kpi.applies.map(r => <RoleBadge key={r} role={r} />)}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-gray-500">
              <span className="font-medium text-indigo-600">Mục tiêu:</span> {kpi.target}
            </span>
            <WeightBar weight={kpi.weight} />
          </div>
        </div>

        <div className="flex-shrink-0 text-gray-400 mt-1">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
          {/* Target note */}
          <div className={`rounded-lg p-3 ${gc.light} border ${gc.border}`}>
            <p className={`text-sm font-medium ${gc.text}`}>{kpi.targetNote}</p>
          </div>

          {/* Critical note for gating */}
          {kpi.criticalNote && (
            <div className="rounded-lg p-3 bg-red-50 border border-red-200">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{kpi.criticalNote}</p>
              </div>
            </div>
          )}

          {/* How measured */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Info className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hệ thống đo như thế nào</span>
            </div>
            <p className="text-sm text-gray-600">{kpi.howMeasured}</p>
          </div>

          {/* Info fields for A3 */}
          {kpi.infoFields && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">6 trường bắt buộc</p>
              <div className="grid grid-cols-2 gap-1.5">
                {kpi.infoFields.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm text-gray-700">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hành động cụ thể</span>
            </div>
            <ul className="space-y-1.5">
              {kpi.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </div>

          {/* Common mistakes */}
          {kpi.mistakes && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lỗi hay gặp</span>
              </div>
              <ul className="space-y-1">
                {kpi.mistakes.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                    <span className="flex-shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI explainer */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => dispatchKpiExplain(kpi)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 px-3 py-2 text-xs font-semibold text-white shadow-sm cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" /> Hỏi AI giải thích cách tính KPI {kpi.code}
            </button>
            <p className="mt-1 text-[10px] text-center text-gray-400">Cần OPENAI_API_KEY trên server</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────

function GroupSection({ group, kpis }) {
  const meta = GROUP_META[group];
  const gc = GROUP_COLORS[meta.color];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${gc.bg} flex items-center justify-center flex-shrink-0`}>
          <span className="text-white font-bold text-sm">{group}</span>
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{meta.label}</h3>
          <p className="text-xs text-gray-500">{meta.desc} · Tổng trọng số: <strong>{meta.total}</strong></p>
        </div>
      </div>
      <div className="space-y-2">
        {kpis.map(k => <KpiDetailCard key={k.code} kpi={k} />)}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function KpiGuidePage() {
  const { user } = useAuth();
  const [activeRole, setActiveRole] = useState('all');
  const [activeSection, setActiveSection] = useState('standards');

  const filteredKpis = KPI_DEFS.filter(k =>
    activeRole === 'all' ||
    k.applies.includes(activeRole) ||
    k.applies.includes('all')
  );

  const kpisByGroup = {
    A: filteredKpis.filter(k => k.group === 'A'),
    B: filteredKpis.filter(k => k.group === 'B'),
    C: filteredKpis.filter(k => k.group === 'C'),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Hướng dẫn & Tiêu chuẩn KPI</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Quy tắc, mục tiêu và hành động cụ thể để đạt điểm KPI hàng tháng
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => dispatchKpiExplain((filteredKpis && filteredKpis[0]) || KPI_DEFS[0])}
                className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold flex items-center gap-1 shadow-sm cursor-pointer"
                title="Mở Trợ lý AI để giải thích KPI đầu tiên đang lọc"
              >
                <Sparkles className="h-3.5 w-3.5" /> Hỏi AI
              </button>
              <Link to="/crm/kpi/sales-admin"
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors">
                Dashboard Sales
              </Link>
              <Link to="/crm/kpi/deal"
                className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 font-medium hover:bg-purple-100 transition-colors">
                Dashboard Deal
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Gating alert */}
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-800 mb-1">Cảnh báo quan trọng — KPI Gating (A4)</p>
              <p className="text-sm text-red-700">
                Nếu tỷ lệ hoàn thành task đúng hạn (A4) xuống dưới <strong>80%</strong>,
                toàn bộ điểm tháng bị giới hạn tối đa <strong>70/100</strong> —
                dù tất cả KPI khác đạt 100%. Đây là điều kiện tiên quyết.
              </p>
            </div>
          </div>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { id: 'standards', label: 'Tiêu chuẩn KPI', icon: Target },
            { id: 'scoring', label: 'Cách tính điểm', icon: BarChart2 },
            { id: 'checklist', label: 'Checklist thực hiện', icon: CheckCircle2 },
            { id: 'summary', label: 'Bảng tóm tắt', icon: FileText },
            { id: 'test-a', label: 'Lead test nhóm A', icon: FlaskConical },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-sm font-medium transition-colors ${
                activeSection === s.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* ── Section: Tiêu chuẩn ───────────────────────────────── */}
        {activeSection === 'standards' && (
          <div className="space-y-6">
            {/* Role filter */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Lọc theo vai trò của bạn</p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRole(r.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      activeRole === r.id
                        ? `${r.bg} ${r.text} ${r.border}`
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <r.icon className="h-3.5 w-3.5" />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Groups */}
            {(['A', 'B', 'C']).map(g =>
              kpisByGroup[g].length > 0
                ? <GroupSection key={g} group={g} kpis={kpisByGroup[g]} />
                : null
            )}
          </div>
        )}

        {/* ── Section: Cách tính điểm ───────────────────────────── */}
        {activeSection === 'scoring' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-bold text-gray-900">Công thức tính điểm từng KPI</h3>
              <div className="space-y-3">
                {SCORING_RULES.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{r.formula}</p>
                      <p className="text-sm text-indigo-600 font-mono">{r.rule}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Ví dụ: {r.example}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4">
                <p className="text-sm text-indigo-800 font-medium mb-2">Ví dụ thực tế — Tính điểm A4 (Task đúng hạn)</p>
                <div className="space-y-1 text-sm text-indigo-700">
                  <p>• Trọng số (W) = 7 &nbsp;|&nbsp; Mục tiêu = 95% &nbsp;|&nbsp; Thực tế = 92%</p>
                  <p>• Ratio = 92 ÷ 95 = <strong>0.968</strong></p>
                  <p>• Điểm = 0.968 × 7 = <strong>6.78 / 7 điểm</strong></p>
                  <p>• A4 = 92% nên <strong>KHÔNG kích hoạt gating</strong> (phải &lt; 80% mới kích hoạt)</p>
                </div>
              </div>

              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-800 font-medium mb-2">Ví dụ — A4 kích hoạt Gating</p>
                <div className="space-y-1 text-sm text-red-700">
                  <p>• Thực tế A4 = 75% (dưới ngưỡng 80%)</p>
                  <p>• Điểm các KPI khác: tổng 88 điểm</p>
                  <p>• Kết quả: <strong>min(88, 70) = 70 điểm tối đa</strong> — bị mất 18 điểm</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-bold text-gray-900">Lịch tính điểm</h3>
              <div className="space-y-2">
                {[
                  { time: '01:00 mỗi đêm', desc: 'Hệ thống tự động tính lại điểm tất cả nhân viên', badge: 'Auto', color: 'bg-blue-100 text-blue-700' },
                  { time: 'Ngày 1–3 tháng mới', desc: 'Tính lại điểm tháng trước lần cuối để chốt kết quả', badge: 'Chốt', color: 'bg-amber-100 text-amber-700' },
                  { time: 'Bất kỳ lúc nào', desc: 'Nhân viên hoặc quản lý bấm nút "Tính lại" trên dashboard', badge: 'Thủ công', color: 'bg-gray-100 text-gray-700' },
                  { time: 'Kỳ "Đã đóng"', desc: 'Không tính lại nữa — điểm đã được chốt chính thức', badge: 'Khóa', color: 'bg-red-100 text-red-700' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${item.color}`}>{item.badge}</span>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{item.time}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-3">Cách xem điểm của mình</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                  <Link to="/crm/kpi/sales-admin" className="text-indigo-600 hover:underline font-medium">KPI Sales Admin</Link>
                  <span className="text-gray-400">— dành cho nhóm A1–A4, B1, C3</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                  <Link to="/crm/kpi/deal" className="text-indigo-600 hover:underline font-medium">KPI Deal</Link>
                  <span className="text-gray-400">— dành cho nhóm B3–B5, A5, C1–C2</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Section: Checklist ────────────────────────────────── */}
        {activeSection === 'checklist' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {DAILY.map((block, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{block.icon}</span>
                    <span className="font-semibold text-gray-900 text-sm">{block.time}</span>
                  </div>
                  <ul className="space-y-2">
                    {block.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-indigo-500" />
                Checklist hàng tuần
              </h3>
              <ul className="space-y-2">
                {WEEKLY.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5">
              <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                5 quy tắc vàng để không bao giờ bị điểm thấp
              </h3>
              <ol className="space-y-2">
                {[
                  'Luôn ghi activity vào CRM ngay sau khi tương tác — không để "ghi sau"',
                  'Hoàn thành task và đánh dấu đúng ngay khi xong — không để cuối tuần',
                  'Phản hồi lead mới trong 15 phút dù đang làm gì',
                  'Báo quản lý sớm khi task/deal có nguy cơ trễ — đừng im lặng',
                  'Điền đủ 6 trường thông tin cho mỗi lead trước khi chuyển sang lead tiếp theo',
                ].map((r, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-indigo-800">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ── Section: Bảng tóm tắt ─────────────────────────────── */}
        {activeSection === 'summary' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Tổng KPI', value: '15', sub: 'chỉ số' },
                { label: 'Tổng điểm', value: '100', sub: 'điểm tối đa' },
                { label: 'Gating KPI', value: 'A4', sub: '< 80% → cap 70đ' },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-sm font-medium text-gray-700">{s.label}</p>
                  <p className="text-xs text-gray-400">{s.sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Code</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Tên KPI</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700">W</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Mục tiêu</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Áp dụng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(['A', 'B', 'C']).flatMap(g => {
                    const groupKpis = KPI_DEFS.filter(k => k.group === g);
                    const meta = GROUP_META[g];
                    const gc = GROUP_COLORS[meta.color];
                    return [
                      <tr key={`group-${g}`} className={gc.light}>
                        <td colSpan={5} className={`px-4 py-2 text-xs font-bold ${gc.text} uppercase tracking-wide`}>
                          {meta.label} — Trọng số {meta.total}
                        </td>
                      </tr>,
                      ...groupKpis.map(k => (
                        <tr key={k.code} className={k.isGating ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex w-8 h-6 items-center justify-center rounded text-xs font-bold text-white ${GROUP_COLORS[k.groupColor]?.bg || 'bg-gray-600'}`}>
                                {k.code}
                              </span>
                              {k.isGating && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-900">{k.name}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-gray-700">{k.weight}</td>
                          <td className="px-4 py-2.5 text-gray-600">{k.target}</td>
                          <td className="px-4 py-2.5 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {k.applies.map(r => <RoleBadge key={r} role={r} />)}
                            </div>
                          </td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400 text-center">
              Áp dụng từ tháng 5/2026 · Target do quản lý cấu hình trong Cài đặt KPI · Hệ thống tính lại tự động lúc 01:00 mỗi đêm
            </p>
          </div>
        )}

        {/* ── Section: Lead test seed 164 (KPI nhóm A) ─────────────────────── */}
        {activeSection === 'test-a' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold mb-1 flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                Điểm KPI Nhóm A không gắn từng lead trong database
              </p>
              <p className="text-amber-800/95 leading-relaxed">
                Hệ thống lưu <strong>kpi_scores</strong> theo <strong>nhân viên + kỳ</strong> (A1…A6: actual, target, điểm = tỷ lệ × trọng số, cap 120% weight).
                Mỗi lead chỉ làm thay đổi <strong>tử/mẫu số</strong> của các công thức đó. Cột dưới đây mô tả ảnh hưởng lên A1–A6 (ký hiệu: ✓ tử = giúp chỉ số, ✗ = làm xấu hoặc không vào tử, “+1 đếm” = A6 snapshot).
                Điểm theo từng deal (sổ cái) xem tại <Link to="/crm/kpi/scorecard" className="underline font-medium">Scorecard</Link> nếu có bản ghi <code className="text-xs bg-amber-100 px-1 rounded">crm_kpi_ledger</code>.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Mã</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Tên hiển thị</th>
                    <th className="text-center px-1 py-2 font-semibold text-gray-600">A1</th>
                    <th className="text-center px-1 py-2 font-semibold text-gray-600">A2</th>
                    <th className="text-center px-1 py-2 font-semibold text-gray-600">A3</th>
                    <th className="text-center px-1 py-2 font-semibold text-gray-600">A4</th>
                    <th className="text-center px-1 py-2 font-semibold text-gray-600">A5</th>
                    <th className="text-center px-1 py-2 font-semibold text-gray-600">A6</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 min-w-[140px]">Gợi ý cải thiện (lead tương tự)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {KPI_GROUP_A_TEST_LEADS.map((row) => (
                    <tr key={row.code} className="hover:bg-gray-50 align-top">
                      <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{row.code}</td>
                      <td className="px-3 py-2 text-gray-900">{row.title}</td>
                      <td className="px-1 py-2 text-center text-[11px]">{row.a1}</td>
                      <td className="px-1 py-2 text-center text-[11px]">{row.a2}</td>
                      <td className="px-1 py-2 text-center text-[11px]">{row.a3}</td>
                      <td className="px-1 py-2 text-center text-[11px]">{row.a4}</td>
                      <td className="px-1 py-2 text-center text-[11px]">{row.a5}</td>
                      <td className="px-1 py-2 text-center text-[11px]">{row.a6}</td>
                      <td className="px-3 py-2 text-gray-600 leading-snug">{row.improve}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500">
              Seed SQL: <code className="bg-gray-100 px-1 rounded">database/164_seed_kpi_group_a_test_cases.sql</code>
              · Owner mặc định: <strong>test.kpi@tubep.vn</strong> · Sau seed: <strong>POST /api/kpi/recompute</strong> (hoặc Cài đặt KPI → tính lại) cho tháng chứa dữ liệu.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
