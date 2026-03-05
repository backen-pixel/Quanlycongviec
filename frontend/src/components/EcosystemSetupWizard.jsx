import { useState } from 'react';
import { Building2, Users, Briefcase, UserPlus, ChevronRight, ChevronLeft, Check, HelpCircle, X } from 'lucide-react';
import api from '../lib/api';

const DEPARTMENT_TEMPLATES = [
  { id: 'sales', icon: '📞', label: 'Tư vấn (Sales)', defaultCount: 3 },
  { id: 'design', icon: '🎨', label: 'Thiết kế (Design)', defaultCount: 2 },
  { id: 'production', icon: '🏭', label: 'Sản xuất (Production)', defaultCount: 5 },
  { id: 'installation', icon: '🔧', label: 'Lắp đặt (Installation)', defaultCount: 4 },
  { id: 'customer-care', icon: '💬', label: 'Chăm sóc KH', defaultCount: 2 },
  { id: 'accounting', icon: '💰', label: 'Kế toán', defaultCount: 1 },
];

export default function EcosystemSetupWizard({ onComplete, onSkip }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Division (Khối)
  const [divisions, setDivisions] = useState([{ name: '', description: '', director: '' }]);
  
  // Step 2: Companies (Công ty)
  const [companies, setCompanies] = useState([{ name: '', type: 'kitchen', divisionIndex: 0, director: '' }]);
  
  // Step 3: Departments (Phòng ban)
  const [selectedDepts, setSelectedDepts] = useState({
    sales: true,
    design: true,
    production: true,
    installation: true,
    'customer-care': false,
    accounting: false,
  });
  
  // Step 4: Confirm
  const [showHelp, setShowHelp] = useState(false);

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Call API to create all units in batch
      await api.post('/ecosystem/setup-wizard', {
        divisions,
        companies,
        departments: Object.entries(selectedDepts)
          .filter(([_, enabled]) => enabled)
          .map(([id]) => DEPARTMENT_TEMPLATES.find(d => d.id === id)),
      });
      
      onComplete();
    } catch (error) {
      console.error('Setup failed:', error);
      alert('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 text-white rounded-2xl mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Thiết Lập Cấu Trúc Công Ty</h1>
          <p className="text-gray-600">Tạo Khối, Công ty và Phòng ban trong 4 bước đơn giản</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Bước {step}/4</span>
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span className={step >= 1 ? 'text-blue-600 font-medium' : ''}>Khối</span>
            <span className={step >= 2 ? 'text-blue-600 font-medium' : ''}>Công ty</span>
            <span className={step >= 3 ? 'text-blue-600 font-medium' : ''}>Phòng ban</span>
            <span className={step >= 4 ? 'text-blue-600 font-medium' : ''}>Xác nhận</span>
          </div>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            {step === 1 && <Step1Divisions divisions={divisions} setDivisions={setDivisions} />}
            {step === 2 && <Step2Companies companies={companies} setCompanies={setCompanies} divisions={divisions} />}
            {step === 3 && <Step3Departments selectedDepts={selectedDepts} setSelectedDepts={setSelectedDepts} />}
            {step === 4 && <Step4Confirm divisions={divisions} companies={companies} selectedDepts={selectedDepts} />}
          </div>

          {/* Actions */}
          <div className="bg-gray-50 px-8 py-4 flex items-center justify-between border-t">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Quay lại
                </button>
              )}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
              >
                <HelpCircle className="w-4 h-4" />
                Trợ giúp
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onSkip && step === 1 && (
                <button
                  onClick={onSkip}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 transition"
                >
                  Bỏ qua hướng dẫn
                </button>
              )}
              
              {step < 4 ? (
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow-sm"
                >
                  Tiếp tục
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Hoàn tất
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Help Panel */}
        {showHelp && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                Trợ giúp - Bước {step}
              </h3>
              <button onClick={() => setShowHelp(false)} className="text-blue-600 hover:text-blue-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-blue-800 space-y-2">
              {step === 1 && (
                <>
                  <p><strong>Khối là gì?</strong> Khối là nhóm các công ty (ví dụ: Miền Nam, Miền Bắc, Miền Trung).</p>
                  <p><strong>Ví dụ:</strong> Công ty bạn có chi nhánh ở nhiều vùng → Tạo 3 Khối: Miền Nam, Miền Bắc, Miền Trung.</p>
                  <p><strong>Nếu chỉ có 1 văn phòng:</strong> Tạo 1 Khối tên "Văn phòng chính" hoặc "Trụ sở".</p>
                </>
              )}
              {step === 2 && (
                <>
                  <p><strong>Công ty là gì?</strong> Công ty là đơn vị kinh doanh (ví dụ: Công ty Tủ bếp A, Công ty Đồ gỗ B).</p>
                  <p><strong>Ví dụ:</strong> Trong Khối Miền Nam, bạn có 3 công ty: A (Tủ bếp), B (Đồ gỗ), C (Nội thất).</p>
                  <p><strong>Nếu chỉ có 1 công ty:</strong> Tạo 1 công ty với tên doanh nghiệp của bạn.</p>
                </>
              )}
              {step === 3 && (
                <>
                  <p><strong>Phòng ban là gì?</strong> Các bộ phận trong công ty (Tư vấn, Thiết kế, Sản xuất...).</p>
                  <p><strong>Mặc định:</strong> Chúng tôi đề xuất 4 phòng ban phổ biến nhất cho ngành tủ bếp.</p>
                  <p><strong>Tùy chỉnh:</strong> Bạn có thể bỏ chọn hoặc thêm phòng ban tùy chỉnh sau.</p>
                </>
              )}
              {step === 4 && (
                <>
                  <p><strong>Xem lại:</strong> Kiểm tra thông tin trước khi tạo.</p>
                  <p><strong>Sửa:</strong> Bấm "Quay lại" để chỉnh sửa.</p>
                  <p><strong>Sau khi tạo:</strong> Bạn có thể thêm nhân viên, chỉnh sửa hoặc xóa bất kỳ đơn vị nào.</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== STEP 1: DIVISIONS ========== */
function Step1Divisions({ divisions, setDivisions }) {
  const addDivision = () => setDivisions([...divisions, { name: '', description: '', director: '' }]);
  const removeDivision = (index) => setDivisions(divisions.filter((_, i) => i !== index));
  const updateDivision = (index, field, value) => {
    const updated = [...divisions];
    updated[index][field] = value;
    setDivisions(updated);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tạo Khối</h2>
          <p className="text-gray-600">Khối là nhóm các công ty (VD: Miền Nam, Miền Bắc)</p>
        </div>
      </div>

      <div className="space-y-4">
        {divisions.map((div, index) => (
          <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Khối #{index + 1}</span>
              {divisions.length > 1 && (
                <button
                  onClick={() => removeDivision(index)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Xóa
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên Khối <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={div.name}
                  onChange={(e) => updateDivision(index, 'name', e.target.value)}
                  placeholder="VD: Khối Miền Nam"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả (tùy chọn)</label>
                <input
                  type="text"
                  value={div.description}
                  onChange={(e) => updateDivision(index, 'description', e.target.value)}
                  placeholder="VD: Quản lý các công ty phía Nam"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addDivision}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-blue-500 hover:text-blue-600 transition flex items-center justify-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          Thêm Khối
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
        <p className="text-sm text-blue-800">
          💡 <strong>Mẹo:</strong> Nếu công ty bạn chỉ có 1 văn phòng, tạo 1 Khối tên "Trụ sở chính" hoặc "Văn phòng".
        </p>
      </div>
    </div>
  );
}

/* ========== STEP 2: COMPANIES ========== */
function Step2Companies({ companies, setCompanies, divisions }) {
  const addCompany = () => setCompanies([...companies, { name: '', type: 'kitchen', divisionIndex: 0, director: '' }]);
  const removeCompany = (index) => setCompanies(companies.filter((_, i) => i !== index));
  const updateCompany = (index, field, value) => {
    const updated = [...companies];
    updated[index][field] = value;
    setCompanies(updated);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
          <Briefcase className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tạo Công ty</h2>
          <p className="text-gray-600">Các đơn vị kinh doanh trong Khối</p>
        </div>
      </div>

      <div className="space-y-4">
        {companies.map((company, index) => (
          <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Công ty #{index + 1}</span>
              {companies.length > 1 && (
                <button
                  onClick={() => removeCompany(index)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Xóa
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Thuộc Khối <span className="text-red-500">*</span>
                </label>
                <select
                  value={company.divisionIndex}
                  onChange={(e) => updateCompany(index, 'divisionIndex', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {divisions.map((div, i) => (
                    <option key={i} value={i}>
                      {div.name || `Khối #${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên Công ty <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={company.name}
                  onChange={(e) => updateCompany(index, 'name', e.target.value)}
                  placeholder="VD: Công ty Tủ Bếp A"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại hình</label>
                <div className="grid grid-cols-2 gap-2">
                  {['kitchen', 'furniture', 'interior', 'other'].map((type) => (
                    <label key={type} className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                      <input
                        type="radio"
                        name={`company-type-${index}`}
                        value={type}
                        checked={company.type === type}
                        onChange={(e) => updateCompany(index, 'type', e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm">
                        {type === 'kitchen' && '🍳 Tủ bếp'}
                        {type === 'furniture' && '🪑 Đồ gỗ'}
                        {type === 'interior' && '🏠 Nội thất'}
                        {type === 'other' && '📦 Khác'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addCompany}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-purple-500 hover:text-purple-600 transition flex items-center justify-center gap-2"
        >
          <Briefcase className="w-4 h-4" />
          Thêm Công ty
        </button>
      </div>
    </div>
  );
}

/* ========== STEP 3: DEPARTMENTS ========== */
function Step3Departments({ selectedDepts, setSelectedDepts }) {
  const toggleDept = (id) => setSelectedDepts({ ...selectedDepts, [id]: !selectedDepts[id] });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Chọn Phòng ban</h2>
          <p className="text-gray-600">Các phòng ban cần có trong mỗi Công ty</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEPARTMENT_TEMPLATES.map((dept) => (
          <label
            key={dept.id}
            className={`
              p-4 border-2 rounded-xl cursor-pointer transition
              ${selectedDepts[dept.id] 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedDepts[dept.id]}
                onChange={() => toggleDept(dept.id)}
                className="mt-1 w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{dept.icon}</span>
                  <span className="font-semibold text-gray-900">{dept.label}</span>
                </div>
                <p className="text-xs text-gray-600">Đề xuất: {dept.defaultCount} nhân viên</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
        <p className="text-sm text-green-800">
          ✓ <strong>Đã chọn:</strong> {Object.values(selectedDepts).filter(Boolean).length} phòng ban
        </p>
        <p className="text-sm text-green-700 mt-1">
          Bạn có thể thêm phòng ban tùy chỉnh sau khi hoàn tất thiết lập.
        </p>
      </div>
    </div>
  );
}

/* ========== STEP 4: CONFIRM ========== */
function Step4Confirm({ divisions, companies, selectedDepts }) {
  const selectedDeptsList = Object.entries(selectedDepts)
    .filter(([_, enabled]) => enabled)
    .map(([id]) => DEPARTMENT_TEMPLATES.find(d => d.id === id));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
          <Check className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Xác nhận</h2>
          <p className="text-gray-600">Kiểm tra thông tin trước khi tạo</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Divisions */}
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Khối ({divisions.length})
          </h3>
          <ul className="space-y-1">
            {divisions.map((div, i) => (
              <li key={i} className="text-sm text-blue-800">
                • {div.name || `Khối #${i + 1}`}
                {div.description && <span className="text-blue-600"> - {div.description}</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* Companies */}
        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
          <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Công ty ({companies.length})
          </h3>
          <ul className="space-y-1">
            {companies.map((company, i) => (
              <li key={i} className="text-sm text-purple-800">
                • {company.name || `Công ty #${i + 1}`}
                <span className="text-purple-600">
                  {' '}(thuộc {divisions[company.divisionIndex]?.name || `Khối #${company.divisionIndex + 1}`})
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Departments */}
        <div className="p-4 bg-green-50 rounded-xl border border-green-200">
          <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Phòng ban cho mỗi Công ty ({selectedDeptsList.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {selectedDeptsList.map((dept) => (
              <span key={dept.id} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-green-300 rounded-full text-sm text-green-800">
                <span>{dept.icon}</span>
                {dept.label}
              </span>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">📊 Tổng kết</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{divisions.length}</div>
              <div className="text-xs text-gray-600">Khối</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{companies.length}</div>
              <div className="text-xs text-gray-600">Công ty</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{companies.length * selectedDeptsList.length}</div>
              <div className="text-xs text-gray-600">Phòng ban</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <p className="text-sm text-amber-800">
            ⚠️ <strong>Lưu ý:</strong> Sau khi tạo, bạn có thể thêm nhân viên, chỉnh sửa hoặc xóa bất kỳ đơn vị nào.
          </p>
        </div>
      </div>
    </div>
  );
}
