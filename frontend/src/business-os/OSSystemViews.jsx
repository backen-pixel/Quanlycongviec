import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Workflow,
  Wrench,
} from 'lucide-react';
import QualificationContractEditor from './QualificationContractEditor';
import QualificationAutomationEditor from './QualificationAutomationEditor';

const ACCENTS = {
  blue: { pill: 'bg-blue-50 text-blue-700', icon: 'bg-blue-600 text-white', soft: 'bg-blue-50 text-blue-700 border-blue-100' },
  orange: { pill: 'bg-orange-50 text-orange-700', icon: 'bg-orange-600 text-white', soft: 'bg-orange-50 text-orange-700 border-orange-100' },
  amber: { pill: 'bg-amber-50 text-amber-700', icon: 'bg-amber-500 text-white', soft: 'bg-amber-50 text-amber-700 border-amber-100' },
  emerald: { pill: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-600 text-white', soft: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  violet: { pill: 'bg-violet-50 text-violet-700', icon: 'bg-violet-600 text-white', soft: 'bg-violet-50 text-violet-700 border-violet-100' },
  cyan: { pill: 'bg-cyan-50 text-cyan-700', icon: 'bg-cyan-600 text-white', soft: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
  indigo: { pill: 'bg-indigo-50 text-indigo-700', icon: 'bg-indigo-600 text-white', soft: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
};

export function OSWorkspaceView({ blueprint, rollout }) {
  const Icon = blueprint.icon;
  const accent = ACCENTS[blueprint.accent] || ACCENTS.blue;

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <section className="flex flex-col gap-6 rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div className="flex items-start gap-4">
          <span className={`hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg sm:flex ${accent.icon}`}><Icon className="h-7 w-7" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] ${accent.pill}`}>{blueprint.eyebrow}</span>
              {rollout?.all_modules_enabled && <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-extrabold text-emerald-700">Gateway đang hoạt động</span>}
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">{blueprint.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{blueprint.description}</p>
          </div>
        </div>
        <Link to={blueprint.legacyRoute} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-slate-800">
          {blueprint.primaryAction} <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {blueprint.metrics.map(([label, value, hint], index) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-slate-400">{label}</span>
              <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-blue-500' : 'bg-slate-300'}`} />
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">Bản đồ không gian</h3>
              <p className="mt-1 text-xs text-slate-500">Các màn hình được tổ chức theo quyết định người dùng cần đưa ra.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-slate-600">Blueprint đã chốt</span>
          </div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
            {blueprint.lanes.map(([title, description], index) => (
              <div key={title} className="group bg-white p-5 transition hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${accent.soft}`}><span className="text-xs font-black">{String(index + 1).padStart(2, '0')}</span></span>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                </div>
                <h4 className="mt-5 text-sm font-extrabold text-slate-900">{title}</h4>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className={`rounded-2xl border p-5 ${accent.soft}`}>
            <div className="flex items-center justify-between gap-2">
              <Wrench className="h-5 w-5" />
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide">{rollout?.all_modules_enabled ? 'Gateway active' : 'Compatibility mode'}</span>
            </div>
            <h3 className="mt-4 text-sm font-extrabold text-slate-950">Giao diện mới, dữ liệu an toàn</h3>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{rollout?.all_modules_enabled ? 'Không gian đã được mở cho ABC. Mọi hành động tiếp tục đi qua API, quyền và dữ liệu thật hiện tại để anh dùng ngay mà không tạo nguồn dữ liệu thứ hai.' : 'Không gian này đã có kiến trúc và luồng quyết định. Trong lúc chưa đạt gate, nút hành động mở đúng công cụ hiện tại thay vì tạo nguồn dữ liệu thứ hai.'}</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Điều kiện để mở</p>
            <div className="mt-4 space-y-3">
              {['Nguồn dữ liệu và owner được chốt', 'Event/SLA có thể đối chiếu', 'Quyền backend được kiểm chứng', 'Có đường quay lại hệ thống cũ'].map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-[11px] font-semibold leading-5 text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {item}</div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const AGENTS = [
  ['Sales Copilot', 'Lead & Deal', 'Thiếu dữ liệu, follow-up và rủi ro SLA', '/business-os/sales'],
  ['Project Coordinator', 'Dự án', 'Blocker, deadline và điểm nghẽn thực thi', '/business-os/operations'],
  ['Work Assistant', 'Công việc', 'Việc trễ, việc đang chặn và hàng đợi ưu tiên', '/business-os/work'],
  ['Finance Analyst', 'Tài chính', 'Công nợ, thiếu hóa đơn và dòng tiền', '/business-os/finance'],
  ['Executive Analyst', 'Điều hành', 'Giải thích chỉ số và truy ngược hồ sơ nguồn', '/business-os/reports'],
];

export function OSAIView({ data }) {
  const records = data?.records || [];
  const summary = data?.summary || {};
  const priorities = records
    .filter((record) => record.operational_status !== 'completed')
    .slice(0, 12)
    .map((record) => {
      if (record.sla_status === 'overdue') return { ...record, reason: 'Đã quá hạn SLA Qualification', tone: 'bg-red-50 text-red-700' };
      if (record.sla_status === 'at_risk') return { ...record, reason: 'SLA sắp đến hạn', tone: 'bg-amber-50 text-amber-700' };
      if (record.blocking_task_count > 0) return { ...record, reason: `${record.blocking_task_count} công việc đang chặn`, tone: 'bg-orange-50 text-orange-700' };
      if (record.missing_requirement_labels?.length) return { ...record, reason: `Thiếu ${record.missing_requirement_labels.length} thông tin`, tone: 'bg-blue-50 text-blue-700' };
      return { ...record, reason: 'Cần xác định hành động tiếp theo', tone: 'bg-slate-100 text-slate-600' };
    });
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#15102d] via-[#24134f] to-[#312e81] p-7 text-white shadow-[0_24px_70px_rgba(49,46,129,0.2)] lg:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-100"><Sparkles className="h-3.5 w-3.5" /> Governed AI</span>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] sm:text-4xl">AI làm việc trong quy trình,<br className="hidden sm:block" /> không đứng ngoài hệ thống.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-violet-100/80">Mọi đề xuất phải có nguồn, đúng phạm vi quyền và được kiểm soát trước khi trở thành hành động nghiệp vụ.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between"><Bot className="h-6 w-6 text-violet-200" /><span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[9px] font-extrabold text-emerald-200">READ · RECOMMEND</span></div>
            <p className="mt-4 text-sm font-extrabold">Brief hiện tại</p>
            <p className="mt-2 text-xs leading-5 text-violet-100/75">{records.length ? `${records.length} hồ sơ Sales, ${priorities.length} hồ sơ ưu tiên và ${(summary.sla_overdue || 0) + (summary.sla_at_risk || 0)} cảnh báo SLA cần xem.` : 'Chưa có Lead trong phạm vi dữ liệu đang chọn để phân tích.'}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['01', 'Read', 'Đọc trong đúng permission scope', Check, 'bg-emerald-50 text-emerald-700'],
          ['02', 'Recommend', 'Đề xuất có evidence và confidence', BrainCircuit, 'bg-blue-50 text-blue-700'],
          ['03', 'Draft', 'Chuẩn bị nhưng chưa gửi hoặc ghi', FileCheck2, 'bg-amber-50 text-amber-700'],
          ['04', 'Execute', 'Chỉ command allowlist có kiểm soát', Play, 'bg-slate-100 text-slate-500'],
        ].map(([number, title, description, Icon, tone], index) => (
          <div key={title} className={`rounded-2xl border p-4 ${index < 2 ? 'border-violet-200 bg-white' : 'border-slate-200 bg-slate-50/80'}`}>
            <div className="flex items-center justify-between"><span className="text-[10px] font-black text-slate-400">{number}</span><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span></div>
            <p className="mt-4 text-sm font-extrabold text-slate-900">{title}</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.6fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-extrabold text-slate-950">Hàng đợi khuyến nghị có bằng chứng</h3><p className="mt-1 text-xs text-slate-500">Mỗi dòng mở về đúng hồ sơ nguồn để người phụ trách kiểm tra và quyết định.</p></div>
          <div className="divide-y divide-slate-100">
            {priorities.map((record) => (
              <Link key={record.id} to={`/crm/leads/${record.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-violet-50/40 sm:grid-cols-[minmax(190px,0.8fr)_130px_minmax(220px,1fr)_24px] sm:items-center">
                <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{record.title}</p><p className="mt-1 truncate text-[10px] text-slate-500">{record.customer?.full_name || record.code || 'Hồ sơ Sales'}</p></div>
                <span className="text-[10px] font-bold text-slate-500">{record.owner?.full_name || 'Chưa gán owner'}</span>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold ${record.tone}`}>{record.reason}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
            {!priorities.length && <div className="p-8 text-center text-xs font-semibold text-emerald-700"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />Không có hồ sơ Sales cần ưu tiên trong dữ liệu hiện tại.</div>}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><LockKeyhole className="h-5 w-5" /></div>
          <h3 className="mt-4 text-sm font-extrabold text-slate-950">Ranh giới không được vượt qua</h3>
          <div className="mt-4 space-y-3">
            {['Không ghi trực tiếp vào cơ sở dữ liệu', 'Không tự Won/Lost hoặc duyệt báo giá', 'Không truy cập ngoài công ty và quyền người dùng', 'Không chạy action thiếu idempotency và audit', 'Hành động nhạy cảm luôn cần người duyệt'].map((item) => (
              <p key={item} className="flex items-start gap-2 text-[11px] font-semibold leading-5 text-slate-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />{item}</p>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-extrabold text-slate-950">Các trợ lý theo không gian</h3><p className="mt-1 text-xs text-slate-500">Mở đúng module để xem dữ liệu nguồn mà trợ lý sử dụng.</p></div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
          {AGENTS.map(([name, scope, description, to]) => <Link key={name} to={to} className="bg-white p-4 hover:bg-slate-50"><p className="text-xs font-extrabold text-slate-900">{name}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wide text-violet-600">{scope}</p><p className="mt-3 text-[10px] leading-4 text-slate-500">{description}</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-700">Mở dữ liệu <ArrowRight className="h-3.5 w-3.5" /></span></Link>)}
        </div>
      </section>
    </div>
  );
}

const PROCESS_STAGES = [
  ['Lead', 'Ghi nhận và phân công', 'Owner + response SLA'],
  ['Qualification', 'Xác minh cơ hội', 'Stage Contract theo công ty'],
  ['Deal', 'Cơ hội đã xác nhận', 'Value + next action'],
  ['Khảo sát', 'Thu thập hiện trạng', 'Lịch + biên bản'],
  ['Thiết kế', 'Giải pháp và phiên bản', 'Review + approval'],
  ['Kiểm tra TK có sẵn', 'Nhánh khách đã có bản vẽ', 'File + kiểm tra kỹ thuật'],
  ['Báo giá', 'Thương mại và điều khoản', 'Version + margin gate'],
  ['Đàm phán', 'Chốt điều kiện', 'Decision + forecast'],
  ['Đơn hàng', 'Cam kết hai bên', 'Snapshot + handover'],
];

export function OSAdminView({ data }) {
  const companyName = data?.company?.short_name || data?.company?.name || 'Công ty đang chọn';
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <section className="flex flex-col gap-5 rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div>
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-700">Process Studio</span>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">Thiết kế cách doanh nghiệp vận hành.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Quy trình, trách nhiệm, SLA, yêu cầu, automation, KPI và quyền AI được quản trị ở một nơi, có version và rollback.</p>
        </div>
        <div className="flex gap-2"><Link to="/workflow-hub" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700"><RotateCcw className="h-4 w-4" /> Trung tâm quy trình</Link><Link to="/workflow-settings" className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white"><Plus className="h-4 w-4" /> Cấu hình quy trình</Link></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Blueprint vận hành', data?.blueprint?.version ? `v${data.blueprint.version}` : '—', data?.blueprint?.name || 'Chưa gắn Blueprint', Workflow],
          ['Stage đang thực thi', '03', 'Lead · Qualification · Deal', GitBranch],
          ['Validation contract', 'Cấu hình', 'Bắt buộc · tuỳ chọn · ẩn', FileCheck2],
          ['Storage mode', data?.storage_mode === 'business_os_kernel' ? 'Native' : 'Compat', 'Chuyển đổi không gián đoạn', Activity],
        ].map(([label, value, hint, Icon]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-slate-400">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-[10px] text-slate-500">{hint}</p></div>)}
      </section>

      <QualificationContractEditor
        companyId={data?.company?.id}
        canConfigure={data?.permissions?.can_configure === true}
      />

      <QualificationAutomationEditor
        companyId={data?.company?.id}
        canConfigure={data?.permissions?.can_configure === true}
      />

      <QualificationAutomationEditor
        companyId={data?.company?.id}
        canConfigure={data?.permissions?.can_configure === true}
        stageKey="survey"
        stageLabel="Khảo sát"
      />

      <QualificationAutomationEditor
        companyId={data?.company?.id}
        canConfigure={data?.permissions?.can_configure === true}
        stageKey="design"
        stageLabel="Thiết kế"
      />

      <QualificationAutomationEditor
        companyId={data?.company?.id}
        canConfigure={data?.permissions?.can_configure === true}
        stageKey="design_review"
        stageLabel="Kiểm tra thiết kế có sẵn"
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid min-h-[520px] xl:grid-cols-[250px_minmax(0,1fr)_340px]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Quy trình</p><Plus className="h-4 w-4 text-slate-400" /></div>
            <Link to="/business-os/sales" className="mt-4 block w-full rounded-xl border border-blue-200 bg-white p-3 text-left shadow-sm"><p className="text-xs font-extrabold text-slate-900">Sales lifecycle</p><p className="mt-1 text-[10px] text-slate-500">Version 1 · {companyName}</p><span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-extrabold text-emerald-700">Đang kết nối dữ liệu</span></Link>
            {[['Project delivery', '/business-os/operations'], ['Production control', '/sx/pipeline-settings'], ['Customer service', '/business-os/customers']].map(([name, to]) => <Link key={name} to={to} className="mt-2 block w-full rounded-xl border border-transparent p-3 text-left hover:bg-white"><p className="text-xs font-bold text-slate-700">{name}</p><p className="mt-1 text-[10px] text-slate-400">Mở không gian cấu hình</p></Link>)}
          </aside>

          <div className="min-w-0 p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-950">Sales lifecycle · v1</h3><p className="mt-1 text-xs text-slate-500">{companyName} · dữ liệu đang kết nối</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-extrabold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Hợp lệ</span></div>
            <div className="mt-6 flex gap-3 overflow-x-auto pb-3">
              {PROCESS_STAGES.map(([name, description, contract], index) => (
                <div key={name} className={`relative w-[170px] shrink-0 rounded-2xl border p-4 ${index < 3 ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white'}`}>
                  {index < PROCESS_STAGES.length - 1 && <ChevronRight className="absolute -right-3 top-1/2 z-10 h-6 w-6 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-1 text-slate-400" />}
                  <div className="flex items-center justify-between"><span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black ${index < 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>{index < 3 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleDashed className="h-4 w-4 text-slate-400" />}</div>
                  <p className="mt-4 text-xs font-extrabold text-slate-900">{name}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p><p className="mt-4 border-t border-slate-200 pt-3 text-[9px] font-bold leading-4 text-slate-500">{contract}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center"><GitBranch className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-xs font-extrabold text-slate-700">Transition canvas</p><p className="mt-1 text-[10px] text-slate-500">Rule, approval và automation được validate trước khi publish.</p></div>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50/70 p-5 xl:border-l xl:border-t-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Stage inspector</p><h3 className="mt-2 text-sm font-extrabold text-slate-950">Qualification</h3>
            <div className="mt-5 space-y-4">
              {[
                ['Owner', 'Sales owner', UserCheck],
                ['SLA', 'Theo business calendar', Clock3],
                ['Requirements', 'Bắt buộc + tuỳ chọn theo công ty', FileCheck2],
                ['Task gate', 'Không còn task blocking', CheckCircle2],
                ['Automation', 'Event + idempotency', Activity],
                ['AI', 'Read & Recommend', Sparkles],
              ].map(([label, value, Icon]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div><p className="mt-1.5 text-xs font-bold text-slate-800">{value}</p></div>)}
            </div>
            <div className="mt-5 grid gap-2"><Link to="/approval-rules" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700"><ShieldCheck className="h-3.5 w-3.5" /> Luật phê duyệt</Link><Link to="/workflow-hub" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-extrabold text-white"><Play className="h-3.5 w-3.5" /> Kiểm tra cấu hình</Link></div>
          </aside>
        </div>
      </section>
    </div>
  );
}
