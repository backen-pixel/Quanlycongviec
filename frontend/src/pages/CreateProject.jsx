import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { FileUploadButton } from '../components/FileUpload';
import EmployeePicker from '../components/EmployeePicker';
import {
  Plus, ChevronDown, ChevronRight, X, CheckSquare, User, 
  FileText, Save, AlertCircle, MapPin, DollarSign, Flag, Building2, GitBranch, Layers, ListChecks
} from 'lucide-react';

// Format VND currency
const formatVND = (value) => {
  if (!value) return '';
  return new Intl.NumberFormat('vi-VN').format(value) + ' VND';
};

export default function CreateProject() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', description: '', customer_id: '', install_address: '', 
    estimated_value: '', priority: 'medium'
  });
  const [customers, setCustomers] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [flowDetail, setFlowDetail] = useState(null);
  const [templateSets, setTemplateSets] = useState({});
  const [selectedTemplateSets, setSelectedTemplateSets] = useState({});
  const [templateTasks, setTemplateTasks] = useState({});
  const [companyEmployees, setCompanyEmployees] = useState({});
  const [taskAssignees, setTaskAssignees] = useState({});
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '', email: '', city: '' });
  const [expandedSteps, setExpandedSteps] = useState({});
  const [expandedTasks, setExpandedTasks] = useState({});
  const [activeTab, setActiveTab] = useState('info');
  const [errors, setErrors] = useState({});

  useEffect(() => {
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

  const set = (k, v) => {
    if (k === 'estimated_value') {
      const numeric = v.replace(/[^\d]/g, '');
      setForm(f => ({ ...f, [k]: numeric }));
    } else {
      setForm(f => ({ ...f, [k]: v }));
    }
  };

  const selectFlow = async (flow) => {
    setSelectedFlow(flow);
    try {
      const { data } = await api.get(`/flows/${flow.id}`);
      setFlowDetail(data.flow);
      console.log('Flow detail:', data.flow); // DEBUG
      (data.flow?.steps || []).forEach(step => {
        console.log('Step:', step.name, 'company_unit_id:', step.company_unit_id); // DEBUG
        if (step.company_unit_id) {
          loadTemplateSets(step.company_unit_id);
          loadCompanyEmployees(step.company_unit_id);
        }
      });
    } catch (e) { 
      console.error('Error loading flow:', e); // DEBUG
      setFlowDetail(null); 
    }
  };

  const loadTemplateSets = async (companyUnitId) => {
    if (templateSets[companyUnitId]) return;
    try {
      const { data } = await api.get(`/company-templates/units/${companyUnitId}/template-sets`);
      setTemplateSets(prev => ({ ...prev, [companyUnitId]: data.sets || [] }));
      const defaultSet = (data.sets || []).find(s => s.is_default);
      if (defaultSet) {
        setSelectedTemplateSets(prev => ({ ...prev, [companyUnitId]: defaultSet.id }));
        loadTemplateTasks(defaultSet.id);
        loadCompanyEmployees(companyUnitId); // Load employees when auto-selecting default template
      }
    } catch {}
  };

  const loadTemplateTasks = async (templateSetId) => {
    if (templateTasks[templateSetId]) return;
    try {
      const { data } = await api.get(`/company-templates/template-sets/${templateSetId}/tasks`);
      setTemplateTasks(prev => ({ ...prev, [templateSetId]: data.tasks || [] }));
    } catch {}
  };

  const loadCompanyEmployees = async (companyUnitId) => {
    if (companyEmployees[companyUnitId]) return;
    try {
      // Use ecosystem/company-users endpoint which resolves:
      // ecosystem_units.id → departments.company_id → users
      const { data } = await api.get(`/users?company_unit_id=${companyUnitId}`);
      setCompanyEmployees(prev => ({ ...prev, [companyUnitId]: data.users || [] }));
    } catch (e) {
      console.error('Failed to load employees for unit:', companyUnitId, e);
    }
  };

  const handleTemplateSetChange = (companyUnitId, templateSetId) => {
    setSelectedTemplateSets(prev => ({ ...prev, [companyUnitId]: templateSetId }));
    if (templateSetId) {
      loadTemplateTasks(templateSetId);
      loadCompanyEmployees(companyUnitId); // Load employees for this company
    }
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
        flow_assignments: (flowDetail?.steps || [])
          .filter(s => s.company_unit_id)
          .map(s => ({
            division_unit_id: s.division_unit_id,
            company_unit_id: s.company_unit_id,
            template_set_id: selectedTemplateSets[s.company_unit_id] || null,
            order_index: s.order_index,
          })),
        quotation_files: quotationFiles,
        task_assignments: taskAssignees,
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tạo Dự Án Mới</h1>
          <p className="text-sm text-gray-600 mt-1">Nhập thông tin, chọn luồng và phân công nhiệm vụ</p>
        </div>
        <button
          onClick={handleCancel}
          className="h-9 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Hủy
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200">
        {[
          { id: 'info', label: '📋 Thông Tin', desc: 'Dự án & khách hàng' },
          { id: 'flow', label: '🔄 Quy Trình', desc: 'Luồng, nhiệm vụ & phân công' },
          { id: 'files', label: '📎 Tệp', desc: 'Báo giá & tài liệu' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div>{tab.label}</div>
            <div className="text-xs text-gray-500">{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* Content Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* TAB 1: THÔNG TIN */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Tên Dự Án <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name || ''}
                onChange={e => set('name', e.target.value)}
                placeholder="VD: Tủ bếp nhôm kính cho anh Minh"
                className={`w-full px-4 py-2 rounded-lg border transition focus:outline-none ${
                  errors.name
                    ? 'border-red-300 bg-red-50 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
                }`}
              />
              {errors.name && (
                <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" /> {errors.name}
                </div>
              )}
            </div>

            {/* Customer */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Khách Hàng <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(!showNewCustomer)}
                  className="text-xs text-blue-600 font-medium hover:text-blue-700"
                >
                  <Plus className="h-3.5 w-3.5 inline" /> Thêm mới
                </button>
              </div>

              {showNewCustomer && (
                <div className="bg-blue-50 rounded-lg p-4 mb-3 border border-blue-200 space-y-3">
                  <h4 className="font-semibold text-gray-900 text-sm">Khách Hàng Mới</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={newCust.full_name}
                      onChange={e => setNewCust(c => ({ ...c, full_name: e.target.value }))}
                      placeholder="Họ tên *"
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    />
                    <input
                      value={newCust.phone}
                      onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))}
                      placeholder="Điện thoại *"
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    />
                    <input
                      value={newCust.email}
                      onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))}
                      placeholder="Email"
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    />
                    <input
                      value={newCust.city}
                      onChange={e => setNewCust(c => ({ ...c, city: e.target.value }))}
                      placeholder="Thành phố"
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={createCustomer}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                      Tạo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(false)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              <select
                value={form.customer_id || ''}
                onChange={e => set('customer_id', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg border transition focus:outline-none ${
                  errors.customer_id
                    ? 'border-red-300 bg-red-50 focus:border-red-500'
                    : 'border-gray-300 focus:border-blue-500'
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
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                  <User className="h-4 w-4 text-green-600" /> Thông Tin Khách Hàng
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
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

            {/* Address & Details */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-600" /> Địa Chỉ Lắp Đặt
                </label>
                <textarea
                  value={form.install_address || ''}
                  onChange={e => set('install_address', e.target.value)}
                  placeholder="Nhập địa chỉ chi tiết..."
                  rows="2"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Mô Tả</label>
                <textarea
                  value={form.description || ''}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Mô tả chi tiết dự án..."
                  rows="3"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-600" /> Giá Trị Dự Tính
                  </label>
                  <input
                    value={formatVND(form.estimated_value)}
                    onChange={e => set('estimated_value', e.target.value)}
                    placeholder="VD: 50.000.000 VND"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Flag className="h-4 w-4 text-gray-600" /> Mức Độ Ưu Tiên
                  </label>
                  <select
                    value={form.priority || 'medium'}
                    onChange={e => set('priority', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500"
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

        {/* TAB 2: QUY TRÌNH */}
        {activeTab === 'flow' && (
          <div className="space-y-6">
            {/* Flow Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-gray-600" /> Chọn Luồng Quy Trình <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {flows.map(flow => (
                  <button
                    key={flow.id}
                    onClick={() => selectFlow(flow)}
                    className={`p-4 rounded-lg border-2 transition text-left ${
                      selectedFlow?.id === flow.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <p className="font-semibold text-gray-900 text-sm">{flow.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{flow.description || 'Luồng sản xuất'}</p>
                    {flow.is_default && (
                      <span className="inline-block text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded mt-2">
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

            {/* Flow Steps with Tasks & Assignees */}
            {flowDetail && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Cấu Trúc Luồng & Phân Công: {selectedFlow.name}
                </h3>
                <div className="space-y-3">
                  {(flowDetail.steps || []).map((step, idx) => {
                    const companyUnit = step.company; // Backend returns 'company' not 'company_unit'
                    const sets = templateSets[step.company_unit_id] || [];
                    const selectedSetId = selectedTemplateSets[step.company_unit_id];
                    const tasks = selectedSetId ? (templateTasks[selectedSetId] || []) : [];
                    const employees = companyEmployees[step.company_unit_id] || [];
                    
                    console.log('Rendering step:', step.name, {
                      company_unit_id: step.company_unit_id,
                      sets: sets.length,
                      selectedSetId,
                      tasks: tasks.length,
                      employees: employees.length
                    }); // DEBUG
                    
                    return (
                      <div key={step.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => {
                            setExpandedSteps(p => ({ ...p, [step.id]: !p[step.id] }));
                            // Load employees when expanding step
                            if (!expandedSteps[step.id] && step.company_unit_id) {
                              loadCompanyEmployees(step.company_unit_id);
                            }
                          }}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-xl font-bold text-blue-600 w-8 text-center">{idx + 1}</div>
                            <div className="text-left">
                              <h4 className="font-semibold text-gray-900 text-sm">{step.name}</h4>
                              <p className="text-xs text-gray-500">
                                {step.division?.name || 'N/A'} → {companyUnit?.name || 'Chưa chọn công ty'}
                              </p>
                            </div>
                          </div>
                          {expandedSteps[step.id] ? (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-400" />
                          )}
                        </button>

                        {expandedSteps[step.id] && (
                          <div className="border-t bg-gray-50 p-4 space-y-4">
                            {/* Show message if no company selected */}
                            {!step.company_unit_id && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                                <p className="text-sm text-yellow-700 font-medium">
                                  ⚠️ Bước này chưa được gán công ty
                                </p>
                                <p className="text-xs text-yellow-600 mt-1">
                                  Vui lòng vào "Quản lý luồng" để gán công ty cho bước này
                                </p>
                              </div>
                            )}

                            {/* Template Set Selection */}
                            {step.company_unit_id && sets.length > 0 && (
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                  <Layers className="h-3.5 w-3.5" /> Bộ Quy Trình
                                </label>
                                <select
                                  value={selectedSetId || ''}
                                  onChange={e => handleTemplateSetChange(step.company_unit_id, e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500 text-sm"
                                >
                                  <option value="">-- Chọn bộ quy trình --</option>
                                  {sets.map(set => (
                                    <option key={set.id} value={set.id}>
                                      {set.name} {set.is_default ? '⭐' : ''} ({set.task_count || 0} nhiệm vụ)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Show message if no template sets */}
                            {step.company_unit_id && sets.length === 0 && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                                <p className="text-sm text-blue-700 font-medium">
                                  📋 Công ty này chưa có bộ quy trình mẫu
                                </p>
                                <p className="text-xs text-blue-600 mt-1">
                                  Vui lòng tạo bộ quy trình trong "Bộ quy trình mẫu"
                                </p>
                              </div>
                            )}

                            {/* Tasks Grouped by Process (Stage) */}
                            {tasks.length > 0 && (
                              <div>
                                <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                  <CheckSquare className="h-4 w-4 text-blue-600" /> 
                                  Quy Trình & Nhiệm Vụ ({tasks.length} nhiệm vụ)
                                </h4>
                                
                                {/* Group tasks by stage */}
                                {(() => {
                                  const tasksByStage = {};
                                  tasks.forEach(task => {
                                    const stageSlug = task.stage?.slug || 'unknown';
                                    if (!tasksByStage[stageSlug]) {
                                      tasksByStage[stageSlug] = {
                                        stage: task.stage,
                                        tasks: []
                                      };
                                    }
                                    tasksByStage[stageSlug].tasks.push(task);
                                  });

                                  return Object.entries(tasksByStage).map(([stageSlug, group]) => (
                                    <div key={stageSlug} className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
                                      {/* Stage Header */}
                                      <div 
                                        className="px-3 py-2 font-semibold text-sm text-white flex items-center gap-2"
                                        style={{ backgroundColor: group.stage?.color || '#6b7280' }}
                                      >
                                        <span>{group.stage?.icon || '📋'}</span>
                                        <span>{group.stage?.name || 'N/A'}</span>
                                        <span className="ml-auto bg-white/20 px-2 py-0.5 rounded text-xs">
                                          {group.tasks.length} nhiệm vụ
                                        </span>
                                      </div>

                                      {/* Tasks in this stage */}
                                      <div className="p-3 bg-gray-50 space-y-2">
                                        {group.tasks.map((task, taskIdx) => {
                                          const taskChecklists = task.checklists || [];
                                          const taskName = task.title || task.name || '(không tên)';
                                          
                                          return (
                                            <div key={task.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                              {/* Task Header - Number + Name + Assignee on SAME ROW */}
                                              <div className="flex items-center gap-3 px-4 py-3">
                                                {/* Number badge */}
                                                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-sm shrink-0">
                                                  {taskIdx + 1}
                                                </div>
                                                {/* Task name - bold, large */}
                                                <span className="flex-1 font-bold text-gray-900 text-base leading-snug">
                                                  {taskName}
                                                </span>
                                                {/* Assignee Picker */}
                                                <div className="shrink-0 w-48">
                                                  <EmployeePicker
                                                    companyUnitId={step.company_unit_id}
                                                    value={taskAssignees[task.id] || ''}
                                                    onChange={(userId) => setTaskAssignees(prev => ({ ...prev, [task.id]: userId || '' }))}
                                                    placeholder="👤 Chưa gán"
                                                    size="sm"
                                                  />
                                                </div>
                                              </div>

                                              {/* Task Description */}
                                              {task.description && (
                                                <p className="text-xs text-gray-500 px-4 pb-2 pl-14">
                                                  {task.description}
                                                </p>
                                              )}

                                              {/* Checklists accordion */}
                                              {taskChecklists.length > 0 && (
                                                <div className="border-t border-gray-100">
                                                  <button
                                                    onClick={() => setExpandedTasks(p => ({ ...p, [task.id]: !p[task.id] }))}
                                                    className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors"
                                                  >
                                                    {expandedTasks[task.id] ? (
                                                      <ChevronDown className="h-3.5 w-3.5" />
                                                    ) : (
                                                      <ChevronRight className="h-3.5 w-3.5" />
                                                    )}
                                                    <ListChecks className="h-3.5 w-3.5" />
                                                    <span>Checklist ({taskChecklists.length})</span>
                                                  </button>

                                                  {expandedTasks[task.id] && (
                                                    <div className="px-4 pb-3 space-y-2 bg-purple-50/40">
                                                      {taskChecklists.map((check, checkIdx) => (
                                                        <div key={check.id} className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border border-purple-200 shadow-sm">
                                                          {/* Check number */}
                                                          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px] shrink-0">
                                                            {checkIdx + 1}
                                                          </div>
                                                          {/* Check title */}
                                                          <span className="flex-1 text-sm font-medium text-gray-800">
                                                            {check.title || check.label || check.name}
                                                          </span>
                                                          {/* Assignee Picker */}
                                                          <div className="shrink-0 w-40">
                                                            <EmployeePicker
                                                              companyUnitId={step.company_unit_id}
                                                              value={taskAssignees[`checklist_${check.id}`] || ''}
                                                              onChange={(userId) => setTaskAssignees(prev => ({ ...prev, [`checklist_${check.id}`]: userId || '' }))}
                                                              placeholder="👤 Chưa gán"
                                                              size="sm"
                                                            />
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TỆP */}
        {activeTab === 'files' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Báo Giá & Tài Liệu</label>
              <div className="bg-gray-50 rounded-lg p-8 border-2 border-dashed border-gray-300 text-center">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <FileUploadButton
                  onFilesUploaded={(files) => setQuotationFiles(prev => [...prev, ...files])}
                  multiple={true}
                />
                <p className="text-sm text-gray-600 mt-3">
                  PDF, Word, Excel, JPG, PNG
                </p>
              </div>
            </div>

            {quotationFiles.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3 text-sm">Tệp Đã Upload ({quotationFiles.length})</h4>
                <div className="space-y-2">
                  {quotationFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setQuotationFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 hover:bg-gray-200 rounded-lg"
                      >
                        <X className="h-5 w-5 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex gap-3 justify-between">
        <button
          onClick={handleCancel}
          className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold"
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
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold"
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
              className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold"
            >
              Tiếp Tục →
            </button>
          )}
          {activeTab === 'files' && (
            <button
              onClick={submit}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {loading ? 'Đang tạo...' : 'Tạo Dự Án'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}