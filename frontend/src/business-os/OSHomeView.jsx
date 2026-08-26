import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Gauge,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
} from 'lucide-react';
import { COMPANY_LIFECYCLE } from './osConfig';

function MetricCard({ label, value, hint, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">{value}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{hint}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function OperationalStatus({ status }) {
  const meta = {
    sla_overdue: ['Quá SLA', 'bg-red-50 text-red-700 ring-red-200'],
    sla_at_risk: ['Sắp quá SLA', 'bg-amber-50 text-amber-800 ring-amber-200'],
    task_blocked: ['Task đang chặn', 'bg-orange-50 text-orange-800 ring-orange-200'],
    waiting_conversion: ['Chờ chuyển Deal', 'bg-violet-50 text-violet-700 ring-violet-200'],
    waiting_route_selection: ['Chờ chọn lộ trình', 'bg-violet-50 text-violet-700 ring-violet-200'],
    ready: ['Sẵn sàng', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
    missing_information: ['Thiếu thông tin', 'bg-slate-100 text-slate-700 ring-slate-200'],
    completed: ['Đã hoàn thành', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
  }[status] || ['Đang xử lý', 'bg-blue-50 text-blue-700 ring-blue-200'];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ring-1 ${meta[1]}`}>{meta[0]}</span>;
}

export default function OSHomeView({ data, refreshing, onRefresh }) {
  const companyName = data?.company?.short_name || data?.company?.name || 'Doanh nghiệp';
  const summary = data?.summary || {};
  const records = data?.records || [];
  const rolloutEnabled = data?.rollout?.enabled === true;
  const allModulesEnabled = data?.rollout?.all_modules_enabled === true;
  const urgentCount = (summary.sla_overdue || 0) + (summary.sla_at_risk || 0) + (summary.blocked_records || 0);
  const stages = summary.stage_counts || {};

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <section className="relative overflow-hidden rounded-[28px] bg-[#0f172a] px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10 lg:py-9">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-96 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-200">
                <Sparkles className="h-3.5 w-3.5" /> Command Center
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-extrabold ${rolloutEnabled ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200' : 'border-slate-500/30 bg-white/5 text-slate-300'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${rolloutEnabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {rolloutEnabled ? 'Đang vận hành pilot' : 'Chế độ quan sát'}
              </span>
            </div>
            <p className="mt-5 text-sm font-semibold text-slate-400">Chào buổi làm việc · {companyName}</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl lg:text-[42px] lg:leading-[1.08]">
              Biết việc cần xử lý,<br className="hidden sm:block" /> trước khi nó trở thành vấn đề.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Ngoại lệ, công việc tiếp theo, sức khỏe quy trình và quyết định quan trọng được gom về một nơi — có người chịu trách nhiệm và nguồn dữ liệu rõ ràng.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/business-os/sales" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-slate-950 hover:bg-slate-100">
              {rolloutEnabled ? 'Mở Sales Pilot' : 'Mở dữ liệu Sales'} <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-60">
              <CircleDot className={`h-4 w-4 ${refreshing ? 'animate-pulse' : ''}`} /> Cập nhật dữ liệu
            </button>
          </div>
        </div>
      </section>

      {!rolloutEnabled && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center">
          <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-amber-950">Business OS chưa điều khiển dữ liệu của công ty này</p>
            <p className="mt-0.5 text-xs leading-5 text-amber-800">Anh vẫn xem được kiến trúc mới; mọi thao tác nghiệp vụ tiếp tục chạy ở phần mềm hiện tại cho đến khi công ty được duyệt pilot.</p>
          </div>
          <Link to="/crm/dashboard" className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-900">Mở CRM cũ <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-red-500">Ưu tiên hôm nay</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Cần xử lý ngay</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">{urgentCount} ngoại lệ được phát hiện</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Quá SLA" value={summary.sla_overdue || 0} hint="Cần recovery plan và escalation" icon={AlertTriangle} tone="red" />
          <MetricCard label="Có nguy cơ trễ" value={summary.sla_at_risk || 0} hint="Xử lý trước khi vi phạm SLA" icon={Clock3} tone="amber" />
          <MetricCard label="Hồ sơ bị chặn" value={summary.blocked_records || 0} hint="Thiếu thông tin hoặc task bắt buộc" icon={Gauge} tone="amber" />
          <MetricCard label="Đã thành Deal" value={stages.deal || 0} hint="Kết quả từ luồng Sales pilot" icon={CheckCircle2} tone="emerald" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-extrabold text-slate-950">Vòng đời doanh nghiệp</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">Một luồng dữ liệu xuyên suốt từ khách hàng tới sau bán.</p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">{allModulesEnabled ? 'Toàn bộ module đã mở · Sales có process gate mới' : 'Sales đang pilot · các phase sau mở theo gate'}</span>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-6">
          {COMPANY_LIFECYCLE.map(([key, name, flow], index) => (
            <div key={key} className="relative bg-white px-4 py-5">
              {index < COMPANY_LIFECYCLE.length - 1 && <ChevronRight className="absolute -right-3 top-7 z-10 hidden h-6 w-6 rounded-full border border-slate-200 bg-white p-1 text-slate-400 xl:block" />}
              <div className="flex items-center justify-between">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black ${index === 0 ? 'bg-blue-600 text-white' : allModulesEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{String(index + 1).padStart(2, '0')}</span>
                <span className={`h-2 w-2 rounded-full ${index === 0 || allModulesEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <p className="mt-3 text-xs font-extrabold text-slate-900">{name}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{flow}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(350px,0.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-extrabold text-slate-950">Hàng đợi ưu tiên</h2>
              <p className="mt-1 text-xs text-slate-500">Xếp theo SLA, blocker và hành động tiếp theo.</p>
            </div>
            <Link to="/business-os/sales" className="text-xs font-extrabold text-blue-700">Xem Sales <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>
          </div>
          {records.length ? (
            <div className="divide-y divide-slate-100">
              {records.slice(0, 6).map((record) => (
                <Link key={record.id} to={`/crm/leads/${record.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-blue-50/40">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Target className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-slate-900">{record.title}</span>
                    <span className="mt-1 block truncate text-[11px] text-slate-500">{record.current_stage_name} · {record.owner?.full_name || 'Chưa gán người phụ trách'}</span>
                  </span>
                  <OperationalStatus status={record.operational_status} />
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Target className="h-6 w-6" /></span>
              <h3 className="mt-4 text-sm font-extrabold text-slate-900">Chưa có hồ sơ cần xử lý</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Khi Lead đầu tiên được tạo, hệ thống sẽ tự xếp ưu tiên dựa trên SLA, thông tin thiếu và công việc đang chặn.</p>
              <Link to="/crm/dashboard" className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white hover:bg-blue-700">Tạo Lead trong CRM <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="border-b border-violet-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200"><Bot className="h-5 w-5" /></span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200">Read · Recommend</span>
            </div>
            <h2 className="mt-4 text-sm font-extrabold text-slate-950">AI Brief cho điều hành</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Tóm tắt có nguồn, chỉ đề xuất và không tự thực hiện hành động nhạy cảm.</p>
          </div>
          <div className="space-y-3 p-5">
            <div className="rounded-xl border border-violet-100 bg-white p-3.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600">Tình hình</p>
              <p className="mt-2 text-xs leading-5 text-slate-700">
                {records.length
                  ? `Có ${records.length} hồ sơ Sales đang được theo dõi; ${urgentCount} ngoại lệ cần được xem trước.`
                  : 'Chưa có hồ sơ Sales trong công ty đang chọn. Dữ liệu quy trình và quyền truy cập đã sẵn sàng.'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="flex items-center gap-2 text-xs font-extrabold text-slate-900"><TrendingUp className="h-4 w-4 text-emerald-600" /> Hành động đề xuất</p>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-600">Tạo một Lead UAT có owner và khu vực, hoàn tất Qualification rồi kiểm tra event chuyển Deal.</p>
            </div>
            <Link to="/business-os/ai" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-violet-700">
              Mở AI Agent Center <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Controlled rollout</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Lộ trình mở toàn hệ sinh thái</h2>
          </div>
          <span className="text-xs text-slate-500">Mỗi module chỉ mở sau khi đạt gate dữ liệu và vận hành</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['01', 'Sales foundation', 'Pilot', 'Lead → Qualification → Deal', 'emerald'],
            ['02', 'Sales end-to-end', allModulesEnabled ? 'Đã mở Gateway' : 'Kế tiếp', 'Survey → Design → Quote → Order', allModulesEnabled ? 'emerald' : 'blue'],
            ['03', 'Project & Operations', allModulesEnabled ? 'Đã mở Gateway' : 'Đã thiết kế', 'Handover → Production → Install', allModulesEnabled ? 'emerald' : 'slate'],
            ['04', 'Finance, Customer & AI', allModulesEnabled ? 'Đã mở Gateway' : 'Theo gate', 'Outcome → Service → Intelligence', allModulesEnabled ? 'emerald' : 'slate'],
          ].map(([number, title, status, description, tone]) => (
            <div key={number} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-400">{number}</span>
                <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : tone === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{status}</span>
              </div>
              <p className="mt-5 text-xs font-extrabold text-slate-900">{title}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
