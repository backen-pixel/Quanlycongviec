import { useEffect, useState } from 'react';
import { discardReasonLabel, getDraftReport } from '../lib/aiReplyDrafts';

/** Pilot report: are AI drafts actually used by staff? Hidden unless the server allows this user. */
export default function AiDraftReportPanel() {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState(null);

  useEffect(() => {
    let alive = true;
    getDraftReport(days).then(r => { if (alive) setReport(r); });
    return () => { alive = false; };
  }, [days]);

  if (!report) return null;
  const stats = [
    ['Đã soạn', report.generated],
    ['Gửi nguyên văn', report.sent_unchanged],
    ['Sửa rồi gửi', report.sent_edited],
    ['Nhân viên bỏ', report.rejected],
    ['Chưa xử lý', report.pending],
    ['Bị luật loại', report.discarded],
  ];
  const reasons = Object.entries(report.discard_reasons || {}).sort((a, b) => b[1] - a[1]);

  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Bản nháp AI — thử nghiệm</h3>
        <div className="flex gap-1 text-xs">
          {[7, 30].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-md px-2 py-1 cursor-pointer ${days === d ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-100'}`}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-lg font-semibold text-gray-800">{value}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-600">
        Tỷ lệ dùng: <b>{report.use_rate_pct === null ? 'chưa có' : `${report.use_rate_pct}%`}</b> (số bản được gửi / số bản nhân viên đã quyết)
        {' · '}Chi phí: <b>{new Intl.NumberFormat('vi-VN').format(report.cost_vnd)} đ</b>
        {reasons.length > 0 && <> · Lý do loại: {reasons.map(([c, n]) => `${discardReasonLabel(c)} (${n})`).join(', ')}</>}
        {report.truncated && ' · Dữ liệu quá nhiều, chỉ tính 5.000 sự kiện đầu.'}
      </p>
    </section>
  );
}
