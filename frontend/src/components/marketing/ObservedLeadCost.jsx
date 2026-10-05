import { observedCpqlResult } from './observedCpqlState.mjs';
const money = n => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} đ`;
const reasons = {
  NO_CLOSED_DAY: 'Chưa có ngày hoàn tất để đối chiếu.',
  TRIAL_NOT_STARTED: 'Kỳ đo chưa bắt đầu.',
  SPEND_UNAVAILABLE: 'Chi tiêu chưa đủ hoặc quyền nguồn đã thay đổi.',
  OBSERVED_RECORDS_NOT_RECONCILED: 'Các hồ sơ đã nhận còn thiếu đối soát với nguồn.',
  CENSUS_STALE: 'Cần quét lại nguồn khách để cập nhật đối soát.',
  COHORT_UNRESOLVED: 'Còn hồ sơ trùng, mâu thuẫn hoặc chưa xác định được nguồn.',
};
export default function ObservedLeadCost({ report }) {
  const x = observedCpqlResult(report);
  return <section aria-label="Chi phí trên khách đã đối soát" className="rounded-lg border border-slate-200 p-3 space-y-2">
    <h3 className="font-semibold">Chi phí/khách đã đối soát — tạm tính</h3>
    <p className="text-xl font-semibold">{x?.status === 'AVAILABLE_PROVISIONAL' ? money(x.costPerQualifiedLeadVnd) : x?.status === 'NO_QUALIFIED_LEADS' ? 'Chưa có khách hợp lệ để chia chi phí' : 'Chưa đủ dữ liệu'}</p>
    {x && x.status !== 'UNAVAILABLE' && <p className="text-sm">{money(x.spendVnd)} chi quảng cáo / {x.qualifiedLeads} khách đã xác minh. {x.pendingQualification} khách còn chờ xác minh.</p>}
    <p className="text-sm text-slate-600">Tiền gồm toàn bộ tài khoản Facebook của kỳ, kể cả phần không tạo khách. Mẫu số chỉ gồm khách từ biểu mẫu quảng cáo đã nhận, khử trùng, xác minh và đối soát; có thể thay đổi khi bổ sung hồ sơ.</p>
    <p className="text-sm text-amber-900">Chưa xác minh đủ mọi nguồn khách. Số tạm tính này chưa chứng minh toàn đợt đạt mục tiêu 250.000 đồng/khách và chưa dùng để tự tăng ngân sách.</p>
    {!!x?.reasons.length && <ul className="list-disc pl-5 text-sm text-amber-800">{x.reasons.map(code => <li key={code}>{reasons[code] || 'Cần kiểm tra thêm dữ liệu đối soát.'}</li>)}</ul>}
  </section>;
}
