import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { FileUploadButton } from '../components/FileUpload';
import {
  Plus, ChevronDown, ChevronRight, X, User, FileText, GitBranch, 
  AlertCircle, CheckCircle, ArrowRight, Home, Building2, FileCode, 
  Zap, Lock, MapPin, DollarSign, Flag, Phone, Mail, MapPinIcon, Save, ArrowLeft
} from 'lucide-react';

const STEPS = [
  { id: 'info', name: 'Thông Tin', desc: 'Dự án & khách hàng', icon: FileText },
  { id: 'flow', name: 'Quy Trình', desc: 'Chọn luồng sản xuất', icon: GitBranch },
  { id: 'files', name: 'Tệp Đính Kèm', desc: 'Báo giá & tài liệu', icon: FileCode },
];

export default function CreateProjectNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowDetail, setFlowDetail] = useState(null);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [expandedSteps, setExpandedSteps] = useState({});
  const [expandedProcesses, setExpandedProcesses] = useState({});
  const [activeStep, setActiveStep] = useState('info');
  const [errors, setErrors] = useState({});

  const stepIndex = STEPS.findIndex(s => s.id === activeStep);

  useEffect(() => {
    setForm({ name: '', description: '', customer_id: '', install_address: '', estimated_value: '', priority: 'medium' });
    setSelectedFlow(null);
    setFlowDetail(null);
    setQuotationFiles([]);
    setExpandedSteps({});
    setExpandedProcesses({});

    Promise.all([
      api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
      api.get('/flows').then(r => {
        const list = r.data.flows || [];
        setFlows(list);
        const def = list.find(f => f.is_default);
        if (def) selectFlow(def);
      }).catch(() => setFlows([])),
    ]);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectFlow = async (flow) => {
    setSelectedFlow(flow);
    try {
      const { data } = await api.get(`/flows/${flow.id}`);
      setFlowDetail(data.flow);
    } catch { setFlowDetail(null); }
  };

  const createCustomer = async () => {
    if (!newCust.full_name || !newCust.phone) return;
    try {
      const { data } = await api.post('/customers', newCust);
      setCustomers(c => [data.customer, ...c]);
      setForm(f => ({ ...f, customer_id: data.customer.id }));
      setShowNewCustomer(false);
      setNewCust({ full_name: '', phone: '', email: '', city: '' });
    } catch {}
  };

  const validateForm = () => {
    const newErrors = {};
    if (!form.name?.trim()) newErrors.name = 'Tên dự án là bắt buộc';
    if (!form.customer_id) newErrors.customer_id = 'Vui lòng chọn khách hàng';
    if (!selectedFlow) newErrors.flow = 'Vui lòng chọn luồng quy trình';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (activeStep === 'info' && !validateForm()) return;
    const idx = STEPS.findIndex(s => s.id === activeStep);
    if (idx < STEPS.length - 1) setActiveStep(STEPS[idx + 1].id);
  };

  const handlePrev = () => {
    const idx = STEPS.findIndex(s => s.id === activeStep);
    if (idx > 0) setActiveStep(STEPS[idx - 1].id);
  };

  const handleCancel = () => {
    if (confirm('Hủy tạo dự án? Dữ liệu sẽ không được lưu.')) {
      navigate('/projects');
    }
  };

  const submit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        customer_id: form.customer_id,
        install_address: form.install_address || null,
        estimated_value: form.estimated_value ? +form.estimated_value : null,
        priority: form.priority || 'medium',
        flow_id: selectedFlow.id,
        flow_assignments: (flowDetail?.steps || []).filter(s => s.company_unit_id).map(s => ({
          flow_step_id: s.id, // Flow step ID for loading tasks
          division_unit_id: s.division_unit_id,
          company_unit_id: s.company_unit_id,
          template_set_id: s.template_set_id || null,
          order_index: s.order_index,
        })),
        quotation_files: quotationFiles,
      };
      const { data } = await api.post('/projects/create-with-flow', payload);
      navigate(`/projects/${data.project.id}`);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi tạo dự án');
    }
    setLoading(false);
  };

  const selectedCustomer = customers.find(c => c.id === form.customer_id);
  const taskCount = (flowDetail?.steps || []).reduce((sum, step) =>
    sum + (step.processes || []).reduce((pSum, proc) => pSum + (proc.task_count || 0), 0), 0
  );

  return (
    <div className="fixed inset-0 flex bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100 overflow-hidden">
      {/* SIDEBAR - LEFT NAVIGATION */}
      <div className="w-72 bg-white shadow-2xl flex flex-col border-r border-purple-100">
        {/* Logo Section */}
        <div className="p-8 border-b border-purple-100 bg-gradient-to-r from-purple-600 to-indigo-600">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-white shadow-md flex items-center justify-center">
              <Plus className="h-6 w-6 text-purple-600 font-bold" />
            </div>
            <h1 className="text-xl font-bold text-white">Tạo Dự Án</h1>
          </div>
          <p className="text-purple-100 text-sm">Thêm dự án mới vào hệ thống</p>
        </div>

        {/* Progress Steps */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3">
          {STEPS.map((step, idx) => {
            const isActive = activeStep === step.id;
            const isCompleted = STEPS.findIndex(s => s.id === activeStep) > idx;
            
            return (
              <button
                key={step.id}
                onClick={() => isCompleted && setActiveStep(step.id)}
                className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg scale-105'
                    : isCompleted
                    ? 'bg-green-50 border border-green-200 text-green-900 hover:bg-green-100'
                    : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                } ${isCompleted && !isActive ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                    isActive ? 'bg-white/20 text-white' : isCompleted ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {isCompleted ? <CheckCircle className="h-5 w-5" /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm ${isActive ? 'text-white' : ''}`}>{step.name}</div>
                    <div className={`text-xs ${isActive ? 'text-purple-100' : isCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                      {step.desc}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="p-6 border-t border-purple-100 bg-purple-50">
          <div className="text-xs text-purple-700 space-y-2">
            <p className="font-semibold">💡 Gợi ý:</p>
            <ul className="space-y-1 text-purple-600">
              <li>✓ Điền đầy đủ thông tin</li>
              <li>✓ Chọn quy trình phù hợp</li>
              <li>✓ Tải lên tài liệu cần thiết</li>
            </ul>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT - RIGHT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOP HEADER */}
        <div className="bg-white border-b border-purple-100 px-10 py-6 shadow-sm flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {STEPS[stepIndex].name}
            </h2>
            <p className="text-gray-500 text-sm mt-1">{STEPS[stepIndex].desc}</p>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-purple-600 uppercase tracking-widest">
              Bước {stepIndex + 1} / {STEPS.length}
            </div>
            <div className="w-32 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-500"
                style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div className="max-w-3xl">
            {/* STEP 1: THÔNG TIN */}
            {activeStep === 'info' && (
              <div className="space-y-8 animate-fadeIn">
                {/* Project Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    📌 Tên Dự Án <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.name || ''}
                    onChange={e => set('name', e.target.value)}
                    placeholder="VD: Tủ bếp nhôm kính cho anh Minh"
                    className={`w-full px-4 py-3 rounded-xl border-2 transition-all focus:outline-none text-base font-medium ${
                      errors.name
                        ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                        : 'border-purple-200 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200'
                    }`}
                  />
                  {errors.name && (
                    <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
                      <AlertCircle className="h-4 w-4" /> {errors.name}
                    </div>
                  )}
                </div>

                {/* Customer Selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-900">
                      👤 Khách Hàng <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(!showNewCustomer)}
                      className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Thêm mới
                    </button>
                  </div>

                  {showNewCustomer && (
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 mb-4 border border-purple-200 space-y-4">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Plus className="h-5 w-5 text-purple-600" /> Khách Hàng Mới
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          value={newCust.full_name}
                          onChange={e => setNewCust(c => ({ ...c, full_name: e.target.value }))}
                          placeholder="Họ tên"
                          className="px-3 py-2.5 rounded-lg border border-purple-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                        <input
                          value={newCust.phone}
                          onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))}
                          placeholder="Điện thoại"
                          className="px-3 py-2.5 rounded-lg border border-purple-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                        <input
                          value={newCust.email}
                          onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))}
                          placeholder="Email"
                          className="px-3 py-2.5 rounded-lg border border-purple-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                        <input
                          value={newCust.city}
                          onChange={e => setNewCust(c => ({ ...c, city: e.target.value }))}
                          placeholder="Thành phố"
                          className="px-3 py-2.5 rounded-lg border border-purple-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={createCustomer}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
                        >
                          Tạo
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewCustomer(false)}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}

                  <select
                    value={form.customer_id || ''}
                    onChange={e => set('customer_id', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border-2 transition-all focus:outline-none text-base ${
                      errors.customer_id
                        ? 'border-red-300 bg-red-50 focus:border-red-500'
                        : 'border-purple-200 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200'
                    }`}
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} • {c.phone}
                      </option>
                    ))}
                  </select>
                  {errors.customer_id && (
                    <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
                      <AlertCircle className="h-4 w-4" /> {errors.customer_id}
                    </div>
                  )}
                </div>

                {/* Customer Info Card */}
                {selectedCustomer && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 shadow-sm hover:shadow-md transition">
                    <h4 className="font-semibold text-green-900 mb-4 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" /> Thông Tin Khách Hàng
                    </h4>
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs font-semibold text-green-700 uppercase mb-2">Tên</p>
                        <p className="text-sm font-bold text-green-900">{selectedCustomer.full_name}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-green-700 uppercase mb-2">Điện thoại</p>
                        <p className="text-sm font-bold text-green-900">{selectedCustomer.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-green-700 uppercase mb-2">Email</p>
                        <p className="text-sm font-bold text-green-900 truncate">{selectedCustomer.email || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Address */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-600" /> Địa Chỉ Lắp Đặt
                  </label>
                  <textarea
                    value={form.install_address || ''}
                    onChange={e => set('install_address', e.target.value)}
                    placeholder="Nhập địa chỉ chi tiết..."
                    rows="2"
                    className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  />
                </div>

                {/* Description & Value Grid */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">📝 Mô Tả</label>
                    <textarea
                      value={form.description || ''}
                      onChange={e => set('description', e.target.value)}
                      placeholder="Mô tả chi tiết dự án..."
                      rows="3"
                      className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-purple-600" /> Giá Trị Dự Tính (VND)
                      </label>
                      <input
                        value={form.estimated_value || ''}
                        onChange={e => set('estimated_value', e.target.value)}
                        placeholder="0"
                        type="number"
                        className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Flag className="h-4 w-4 text-purple-600" /> Mức Độ Ưu Tiên
                      </label>
                      <select
                        value={form.priority || 'medium'}
                        onChange={e => set('priority', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                      >
                        <option value="low">🟢 Thấp</option>
                        <option value="medium">🟡 Trung Bình</option>
                        <option value="high">🔴 Cao</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: QUY TRÌNH */}
            {activeStep === 'flow' && (
              <div className="space-y-8 animate-fadeIn">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-4">
                    🔄 Chọn Luồng Quy Trình <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {flows.map(flow => (
                      <button
                        key={flow.id}
                        onClick={() => selectFlow(flow)}
                        className={`p-5 rounded-xl border-2 transition-all text-left ${
                          selectedFlow?.id === flow.id
                            ? 'border-purple-500 bg-purple-50 shadow-lg ring-2 ring-purple-300'
                            : 'border-gray-200 hover:border-purple-300 bg-white hover:shadow-md'
                        }`}
                      >
                        <p className="font-bold text-gray-900 mb-1">{flow.name}</p>
                        <p className="text-xs text-gray-500 mb-3">{flow.description || 'Luồng sản xuất'}</p>
                        {flow.is_default && (
                          <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">
                            ⭐ Mặc định
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {errors.flow && (
                    <div className="flex items-center gap-2 mt-3 text-red-600 text-sm">
                      <AlertCircle className="h-4 w-4" /> {errors.flow}
                    </div>
                  )}
                </div>

                {/* Flow Detail */}
                {flowDetail && (
                  <div className="space-y-6 pt-6 border-t-2 border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-yellow-500" /> Cấu Trúc: {selectedFlow.name}
                    </h3>

                    <div className="space-y-3">
                      {(flowDetail.steps || []).map((step, sidx) => (
                        <div key={step.id} className="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-purple-300 transition">
                          <button
                            onClick={() => setExpandedSteps(p => ({ ...p, [step.id]: !p[step.id] }))}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className="text-2xl font-bold text-purple-600 w-8 text-center">{sidx + 1}</div>
                              <div>
                                <h4 className="font-bold text-gray-900">{step.name}</h4>
                                <p className="text-xs text-gray-500">{step.description || 'Bước quy trình'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {(() => {
                                // Đếm số quy trình unique (gộp theo tên)
                                const uniqueNames = new Set((step.processes || []).map(p => p.name));
                                return uniqueNames.size > 0 && (
                                  <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-semibold">
                                    {uniqueNames.size} bộ phận
                                  </span>
                                );
                              })()}
                              {expandedSteps[step.id] ? (
                                <ChevronDown className="h-5 w-5 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                          </button>

                          {expandedSteps[step.id] && (() => {
                            // Gộp các quy trình cùng tên
                            const processMap = {};
                            (step.processes || []).forEach(proc => {
                              if (!processMap[proc.name]) {
                                processMap[proc.name] = {
                                  id: proc.id, // Sử dụng ID của process đầu tiên
                                  name: proc.name,
                                  task_count: 0,
                                  tasks: []
                                };
                              }
                              processMap[proc.name].task_count += proc.task_count || 0;
                              processMap[proc.name].tasks = processMap[proc.name].tasks.concat(proc.tasks || []);
                            });
                            const uniqueProcesses = Object.values(processMap);

                            return (
                              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-2">
                                {uniqueProcesses.map((proc) => (
                                  <div key={proc.id}>
                                    <button
                                      onClick={() => setExpandedProcesses(p => ({ ...p, [proc.id]: !p[proc.id] }))}
                                      className="w-full text-left p-3 rounded-lg bg-white hover:bg-gray-100 transition border border-gray-200"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          {expandedProcesses[proc.id] ? (
                                            <ChevronDown className="h-4 w-4 text-gray-400" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 text-gray-400" />
                                          )}
                                          <span className="font-medium text-gray-900">{proc.name}</span>
                                        </div>
                                        {proc.task_count > 0 && (
                                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">
                                            {proc.task_count} task
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                    {expandedProcesses[proc.id] && proc.task_count > 0 && (
                                      <div className="mt-2 ml-8 space-y-2 border-l-2 border-gray-300 pl-3">
                                        {(proc.tasks || []).map((task, idx) => (
                                          <div key={task.id} className="flex items-center gap-3 py-1">
                                            <span className="text-xs font-bold text-gray-400 w-6 text-center">{idx + 1}</span>
                                            <span className="font-semibold text-gray-900 flex-1">{task.name}</span>
                                            <span className="text-xs text-purple-600 font-medium whitespace-nowrap">
                                              {task.assignee_field ? '👤 ' + task.assignee_field.replace(/_/g, ' ') : '○ Chưa gán'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>

                    {/* Summary */}
                    <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-6 border-2 border-emerald-300 mt-6">
                      <p className="text-sm text-gray-700 mb-2 font-semibold">✅ Luồng này sẽ tạo tự động:</p>
                      <p className="text-4xl font-bold text-emerald-700">{taskCount} nhiệm vụ</p>
                      <p className="text-xs text-gray-600 mt-3">Các nhiệm vụ sẽ được phân công tự động theo từng giai đoạ</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: TỆP */}
            {activeStep === 'files' && (
              <div className="space-y-8 animate-fadeIn">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FileCode className="h-5 w-5 text-purple-600" /> Báo Giá & Tài Liệu
                  </label>
                  <div className="bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 rounded-2xl p-12 border-3 border-dashed border-purple-300 text-center hover:border-purple-400 transition">
                    <div className="flex flex-col items-center">
                      <div className="h-16 w-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-purple-600" />
                      </div>
                      <FileUploadButton
                        onUpload={(files) => {
                          setQuotationFiles(prev => [...prev, ...files]);
                        }}
                        maxSize={10}
                        maxFiles={5}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                      />
                      <p className="text-sm text-gray-600 mt-4 font-medium">
                        Tối đa 5 tệp, mỗi tệp dưới 10MB
                      </p>
                      <p className="text-xs text-gray-500 mt-1">PDF • Word • Excel • Hình ảnh</p>
                    </div>
                  </div>
                </div>

                {quotationFiles.length > 0 && (
                  <div className="border-t-2 border-gray-200 pt-8">
                    <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      Tệp Đã Upload ({quotationFiles.length})
                    </h4>
                    <div className="space-y-2">
                      {quotationFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition">
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setQuotationFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="p-2 hover:bg-red-100 rounded-lg transition ml-2"
                          >
                            <X className="h-5 w-5 text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border-l-4 border-blue-500 mt-8">
                  <p className="text-sm text-blue-900 leading-relaxed">
                    💡 <strong>Gợi ý:</strong> Tải lên báo giá, bản vẽ kỹ thuật hoặc các tài liệu liên quan để giúp team hiểu rõ yêu cầu dự án.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER BUTTONS */}
        <div className="bg-white border-t border-purple-100 px-10 py-6 flex items-center justify-between shadow-lg">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition"
          >
            Hủy
          </button>
          <div className="flex gap-3">
            {stepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Quay Lại
              </button>
            )}
            {stepIndex < STEPS.length - 1 && (
              <button
                onClick={handleNext}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl font-semibold transition flex items-center gap-2 shadow-md"
              >
                Tiếp Tục <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {stepIndex === STEPS.length - 1 && (
              <button
                onClick={submit}
                disabled={loading}
                className="px-8 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition flex items-center gap-2 shadow-md disabled:shadow-none"
              >
                <Save className="h-4 w-4" />
                {loading ? 'Đang tạo...' : 'Tạo Dự Án'}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}