import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import ProcessTaskEditor from '../components/ProcessTaskEditor';
import {
  Plus, ChevronDown, ChevronRight, X, CheckSquare, User, ClipboardList, Layers,
  FileText, StickyNote, GitBranch, Star, ArrowRight, Clock, Building2, Save, AlertCircle
} from 'lucide-react';

export default function CreateProject() {
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [flows, setFlows] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowDetail, setFlowDetail] = useState(null);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [expandedSteps, setExpandedSteps] = useState({});
  const [expandedProcesses, setExpandedProcesses] = useState({});
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'flow' | 'files'
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm({ name: '', description: '', customer_id: '', install_address: '', estimated_value: '', priority: 'medium' });
    setSelectedFlow(null);
    setFlowDetail(null);
    setQuotationFiles([]);
    setExpandedSteps({});
    setExpandedProcesses({});

    Promise.all([
      api.get('/customers').then(r => setCustomers(r.data.customers || [])).catch(() => {}),
      api.get('/users').then(r => setUsers(r.data.users || [])).catch(() => {}),
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

  const toggleStep = (id) => setExpandedSteps(p => ({ ...p, [id]: !p[id] }));
  const toggleProcess = (id) => setExpandedProcesses(p => ({ ...p, [id]: !p[id] }));

  const validateForm = () => {
    const newErrors = {};
    if (!form.name?.trim()) newErrors.name = 'Tên dự án là bắt buộc';
    if (!form.customer_id) newErrors.customer_id = 'Vui lòng chọn khách hàng';
    if (!selectedFlow) newErrors.flow = 'Vui lòng chọn luồng quy trình';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = async () => {
    if (!validateForm()) {
      setActiveTab('info');
      return;
    }

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
          division_unit_id: s.division_unit_id,
          company_unit_id: s.company_unit_id,
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

  const handleCancel = () => {
    if (confirm('Hủy tạo dự án mới? Dữ liệu sẽ không được lưu.')) {
      navigate('/projects');
    }
  };

  const selectedCustomer = customers.find(c => c.id === form.customer_id);
  const taskCount = (flowDetail?.steps || []).reduce((sum, step) =>
    sum + (step.processes || []).reduce((pSum, proc) => pSum + (proc.task_count || 0), 0), 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 -mx-6 -my-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Plus className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tạo Dự Án Mới</h1>
              <p className="text-sm text-gray-500">Nhập thông tin cơ bản và chọn luồng quy trình</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
          >
            Hủy
          </button>
        </div>
      </div>

      <div className="px-8 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-1 mb-8 bg-white rounded-xl p-1 shadow-sm">
            {[
              { id: 'info', label: '📋 Thông Tin', icon: FileText },
              { id: 'flow', label: '🔄 Quy Trình', icon: GitBranch },
              { id: 'files', label: '📎 Tệp Đính Kèm', icon: Layers }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm transition ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* TAB 1: THÔNG TIN */}
            {activeTab === 'info' && (
              <div className="p-8 space-y-8">
                {/* Tên Dự Án */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    📌 Tên Dự Án <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.name || ''}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Nhập tên dự án..."
                    className={`w-full px-4 py-3 rounded-xl border-2 transition focus:outline-none text-base ${
                      errors.name
                        ? 'border-red-300 bg-red-50 focus:border-red-500'
                        : 'border-gray-200 bg-white focus:border-blue-500'
                    }`}
                  />
                  {errors.name && <p className="text-red-600 text-sm mt-2 flex items-center gap-1"><AlertCircle className="h-4 w-4" /> {errors.name}</p>}
                </div>

                {/* Khách Hàng */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-900">
                      👤 Khách Hàng <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(!showNewCustomer)}
                      className="text-xs text-blue-600 font-medium cursor-pointer hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" /> Thêm mới
                    </button>
                  </div>

                  {showNewCustomer && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 mb-4 border border-blue-200 space-y-4">
                      <h4 className="font-semibold text-gray-900">Tạo Khách Hàng Mới</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          value={newCust.full_name}
                          onChange={e => setNewCust(c => ({ ...c, full_name: e.target.value }))}
                          placeholder="Họ tên *"
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                        />
                        <input
                          value={newCust.phone}
                          onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))}
                          placeholder="SĐT *"
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                        />
                        <input
                          value={newCust.email}
                          onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))}
                          placeholder="Email"
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                        />
                        <input
                          value={newCust.city}
                          onChange={e => setNewCust(c => ({ ...c, city: e.target.value }))}
                          placeholder="Thành phố"
                          className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={createCustomer}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer transition"
                        >
                          Tạo Khách Hàng
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewCustomer(false)}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm cursor-pointer transition"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}

                  <select
                    value={form.customer_id || ''}
                    onChange={e => set('customer_id', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border-2 transition focus:outline-none text-base ${
                      errors.customer_id
                        ? 'border-red-300 bg-red-50 focus:border-red-500'
                        : 'border-gray-200 bg-white focus:border-blue-500'
                    }`}
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} • {c.phone}
                      </option>
                    ))}
                  </select>
                  {errors.customer_id && <p className="text-red-600 text-sm mt-2 flex items-center gap-1"><AlertCircle className="h-4 w-4" /> {errors.customer_id}</p>}
                </div>

                {/* Địa Chỉ Lắp Đặt */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    📍 Địa Chỉ Lắp Đặt
                  </label>
                  <textarea
                    value={form.install_address || ''}
                    onChange={e => set('install_address', e.target.value)}
                    placeholder="Nhập địa chỉ lắp đặt..."
                    rows="2"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>

                {/* Grid: Mô Tả + Giá Trị */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      📝 Mô Tả
                    </label>
                    <textarea
                      value={form.description || ''}
                      onChange={e => set('description', e.target.value)}
                      placeholder="Mô tả chi tiết dự án..."
                      rows="3"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3">
                        💰 Giá Trị Dự Tính (VND)
                      </label>
                      <input
                        value={form.estimated_value || ''}
                        onChange={e => set('estimated_value', e.target.value)}
                        placeholder="0"
                        type="number"
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3">
                        ⭐ Mức Độ Ưu Tiên
                      </label>
                      <select
                        value={form.priority || 'medium'}
                        onChange={e => set('priority', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-base"
                      >
                        <option value="low">🟢 Thấp</option>
                        <option value="medium">🟡 Trung Bình</option>
                        <option value="high">🔴 Cao</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Customer Card */}
                {selectedCustomer && (
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Thông Tin Khách Hàng
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Tên</p>
                        <p className="font-semibold text-gray-900">{selectedCustomer.full_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Điện thoại</p>
                        <p className="font-semibold text-gray-900">{selectedCustomer.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Email</p>
                        <p className="font-semibold text-gray-900 truncate">{selectedCustomer.email || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: QUY TRÌNH */}
            {activeTab === 'flow' && (
              <div className="p-8 space-y-6">
                {/* Flow Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-4">
                    🔄 Chọn Luồng Quy Trình <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {flows.map(flow => (
                      <button
                        key={flow.id}
                        onClick={() => selectFlow(flow)}
                        className={`p-4 rounded-xl border-2 transition text-left ${
                          selectedFlow?.id === flow.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <p className="font-semibold text-gray-900">{flow.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{flow.description || 'Không có mô tả'}</p>
                        {flow.is_default && (
                          <div className="mt-2 inline-block text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            ⭐ Mặc định
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  {errors.flow && <p className="text-red-600 text-sm flex items-center gap-1 mb-4"><AlertCircle className="h-4 w-4" /> {errors.flow}</p>}
                </div>

                {/* Flow Detail */}
                {flowDetail && (
                  <div className="border-t pt-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <ArrowRight className="h-5 w-5 text-blue-600" />
                      Cấu Trúc Luồng: {selectedFlow.name}
                    </h3>

                    <div className="space-y-4">
                      {(flowDetail.steps || []).map((step, sidx) => (
                        <div key={step.id} className="border border-gray-200 rounded-xl overflow-hidden bg-gradient-to-r from-gray-50 to-white">
                          {/* Step Header */}
                          <button
                            onClick={() => toggleStep(step.id)}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-100 transition"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className="text-2xl font-bold text-blue-600 w-8 text-center">{sidx + 1}</div>
                              <div>
                                <h4 className="font-semibold text-gray-900">{step.name}</h4>
                                <p className="text-xs text-gray-500">{step.description || 'Bước quy trình'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {(step.processes || []).length > 0 && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                                  {(step.processes || []).length} bộ phận
                                </span>
                              )}
                              {expandedSteps[step.id] ? (
                                <ChevronDown className="h-5 w-5 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                          </button>

                          {/* Step Content */}
                          {expandedSteps[step.id] && (
                            <div className="border-t border-gray-200 px-6 py-4 space-y-3 bg-white">
                              {(step.processes || []).map((proc) => (
                                <button
                                  key={proc.id}
                                  onClick={() => toggleProcess(proc.id)}
                                  className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-1">
                                      {expandedProcesses[proc.id] ? (
                                        <ChevronDown className="h-4 w-4 text-gray-400" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-gray-400" />
                                      )}
                                      <span className="font-medium text-gray-900">{proc.name}</span>
                                    </div>
                                    {proc.task_count > 0 && (
                                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">
                                        {proc.task_count} nhiệm vụ
                                      </span>
                                    )}
                                  </div>

                                  {expandedProcesses[proc.id] && proc.task_count > 0 && (
                                    <div className="mt-3 pl-6 space-y-2 border-l border-gray-300">
                                      {(proc.tasks || []).map(task => (
                                        <p key={task.id} className="text-sm text-gray-600">• {task.name}</p>
                                      ))}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Summary Card */}
                    <div className="mt-6 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200">
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>✅ Luồng này sẽ tạo tự động:</strong>
                      </p>
                      <p className="text-2xl font-bold text-emerald-700">{taskCount} nhiệm vụ</p>
                      <p className="text-xs text-gray-600 mt-2">
                        Các nhiệm vụ sẽ được phân công theo từng giai đoạn tương ứng
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TỆP ĐÍNH KÈM */}
            {activeTab === 'files' && (
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-4">
                    📎 Báo Giá & Tài Liệu
                  </label>
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-8 border-2 border-dashed border-amber-300 text-center">
                    <FileUploadButton
                      onUpload={(files) => {
                        setQuotationFiles(prev => [...prev, ...files]);
                      }}
                      maxSize={10}
                      maxFiles={5}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png"
                    />
                    <p className="text-sm text-gray-600 mt-4">
                      Tối đa 5 tệp, mỗi tệp dưới 10MB (PDF, Word, Excel, hình ảnh)
                    </p>
                  </div>
                </div>

                {quotationFiles.length > 0 && (
                  <div className="border-t pt-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Tệp Đã Upload ({quotationFiles.length})</h4>
                    <div className="space-y-2">
                      {quotationFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setQuotationFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="p-2 hover:bg-gray-200 rounded-lg transition"
                          >
                            <X className="h-5 w-5 text-gray-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                  <p className="text-sm text-blue-900">
                    💡 <strong>Mẹo:</strong> Tải lên báo giá và tài liệu liên quan sẽ giúp bạn theo dõi dự án dễ dàng hơn.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-4 mt-8 justify-between">
            <button
              onClick={handleCancel}
              className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition"
            >
              Hủy
            </button>
            <div className="flex gap-3">
              {activeTab !== 'info' && (
                <button
                  onClick={() => {
                    const tabs = ['info', 'flow', 'files'];
                    const currentIdx = tabs.indexOf(activeTab);
                    if (currentIdx > 0) setActiveTab(tabs[currentIdx - 1]);
                  }}
                  className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition"
                >
                  ← Quay Lại
                </button>
              )}
              {activeTab !== 'files' && (
                <button
                  onClick={() => {
                    const tabs = ['info', 'flow', 'files'];
                    const currentIdx = tabs.indexOf(activeTab);
                    if (currentIdx < tabs.length - 1) setActiveTab(tabs[currentIdx + 1]);
                  }}
                  className="px-8 py-3 bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600 text-white rounded-xl font-semibold transition"
                >
                  Tiếp Tục →
                </button>
              )}
              {activeTab === 'files' && (
                <button
                  onClick={submit}
                  disabled={loading}
                  className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition flex items-center gap-2"
                >
                  <Save className="h-5 w-5" />
                  {loading ? 'Đang tạo...' : 'Tạo Dự Án'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
