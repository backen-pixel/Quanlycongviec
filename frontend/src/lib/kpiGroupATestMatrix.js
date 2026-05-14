/**
 * Lead/deal seed `database/164_seed_kpi_group_a_test_cases.sql` (mã KPI-A-01 … 12).
 * Hệ thống KPI Nhóm A (kpi_scores) tổng hợp theo NHÂN VIÊN + KỲ — không lưu "điểm/lead".
 * Bảng này mô tả ảnh hưởng lên tử/mẫu số từng chỉ số A1–A6 và gợi ý xử lý lead tương tự.
 */
export const KPI_GROUP_A_TEST_LEADS = [
  { code: 'KPI-A-01', title: 'A1 ✓ cham 5p', a1: '✓ tử', a2: '↓ median', a3: '✓ tử', a4: '—', a5: '—', a6: '—', note: 'Lead mẫu tốt: phản hồi nhanh, đủ thông tin.', improve: 'Giữ nhịp: lead mới → cham trong 15 phút, cập nhật đủ 6 trường.' },
  { code: 'KPI-A-02', title: 'A1 ✗ cham 30p', a1: '✗ không tử', a2: '↑ median', a3: '✓ tử', a4: '—', a5: '—', a6: '—', note: 'Làm giảm % đúng SLA 15p và kéo median A2.', improve: 'Ưu tiên queue lead mới; dùng activity “gọi/Zalo” ngay sau tạo lead.' },
  { code: 'KPI-A-03', title: 'A1 ✗ chưa cham', a1: 'vào mẫu, không tử', a2: '—', a3: '✓ tử', a4: '—', a5: '—', a6: '—', note: 'Không có first_touch_time → không tính vào tử A1/A2 nhưng vẫn vào mẫu A1.', improve: 'Không để lead “mồ côi”: gán người backup hoặc tự cham trong ngày.' },
  { code: 'KPI-A-04', title: 'A1 ✓ biên 14p', a1: '✓ tử', a2: '↓ median', a3: '✓ tử', a4: '—', a5: '—', a6: '—', note: 'Biên an toàn dưới 15 phút.', improve: 'Giữ buffer 2–3 phút: tránh họp dài khi có lead mới.' },
  { code: 'KPI-A-05', title: 'A3 ✓ info đủ', a1: '—', a2: '—', a3: '✓ tử', a4: '± (có task đúng + task trễ)', a5: '—', a6: '—', note: 'Gắn crm_tasks follow-up: một done sớm, một done trễ → kéo A4.', improve: 'Lên lịch deadline thực tế; hoàn thành trước hạn hoặc đổi deadline kịp thời.' },
  { code: 'KPI-A-06', title: 'A3 ✗ thiếu địa chỉ', a1: '—', a2: '—', a3: '✗ không tử (info_complete)', a4: '—', a5: '—', a6: '—', note: 'Thiếu install_address.', improve: 'Sau khảo sát: nhập địa chỉ lắp đặt ngay vào lead.' },
  { code: 'KPI-A-07', title: 'A3 ✗ thiếu giá trị', a1: '—', a2: '—', a3: '✗ không tử', a4: '—', a5: '—', a6: '—', note: 'estimated_value = 0/null.', improve: 'Ước tính tối thiểu/ngân sách khách nói để field > 0.' },
  { code: 'KPI-A-08', title: 'A3 ✗ task thiếu evidence', a1: '—', a2: '—', a3: '✗ không tử', a4: '✗ (task quá hạn pending)', a5: '—', a6: '—', note: 'Nếu có cột completion_requires_file_or_note: task done thiếu note/file.', improve: 'Hoàn thành task kèm ghi chú hoặc đính kèm minh chứng; xử lý task trễ hạn.' },
  { code: 'KPI-A-09', title: 'A5 ✓ stage SLA OK', a1: '—', a2: '—', a3: '✓ tử', a4: '—', a5: '✓ tử', a6: '—', note: 'stage_history duration ≤ sla_days stage warm.', improve: 'Đẩy deal đúng nhịp pipeline; cấu hình sla_days cột hợp lý.' },
  { code: 'KPI-A-10', title: 'A5 ✗ stage SLA fail', a1: '—', a2: '—', a3: '✓ tử', a4: '—', a5: '✗ không tử', a6: '—', note: 'Ở quá lâu trong bước so với SLA.', improve: 'Họp nội bộ nhanh; chia nhỏ bước hoặc nâng SLA nếu nghiệp vụ cho phép.' },
  { code: 'KPI-A-11', title: 'A6 ✓ vượt SLA 3 ngày', a1: '—', a2: '—', a3: '✓ tử', a4: '—', a5: '—', a6: '+1 đếm', note: 'Snapshot: stage_entered_at quá sla_days.', improve: 'Chuyển stage hoặc xử lý lead “đứng cột” để giảm đếm A6.' },
  { code: 'KPI-A-12', title: 'A6 ✗ trong SLA', a1: '—', a2: '—', a3: '✓ tử', a4: '—', a5: '—', a6: '0', note: 'Chưa vượt SLA tại thời điểm hiện tại.', improve: 'Duy trì tiến độ; tránh để lead nóng lên A6.' },
];

/** Gợi ý cải thiện theo mã KPI (hiển thị khi % đạt thấp trên dashboard công ty). */
export const KPI_IMPROVEMENT_HINTS = {
  A1: 'Tăng tỷ lệ cham trong 15p: thông báo lead mới, phân ca trực, activity đầu tiên trong ngày.',
  A2: 'Giảm median phản hồi: xử lý lead cũ tích lũy, hạn chế để median bị kéo bởi vài lead rất chậm.',
  A3: 'Đủ 6 trường + minh chứng task bắt buộc: phone, KH, khu vực, giá trị>0, thời gian thi công, địa chỉ; task done có note/file.',
  A4: 'Follow-up đúng hạn: hoàn thành task trước deadline, đổi deadline khi cam kết thay đổi (A4 là KPI gating).',
  A5: 'Rút ngắn thời gian ở mỗi stage deal: họp chốt nhanh, SLA cột pipeline minh bạch.',
  A6: 'Giảm số lead/deal đang treo quá SLA: đẩy stage hoặc thua có lý do, tránh “đứng” lâu ở cột đang đo.',
};
