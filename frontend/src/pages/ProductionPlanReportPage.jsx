import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import ProductionPlanReport from '../components/ProductionPlanReport';
export default function ProductionPlanReportPage() {
  const {user}=useAuth();
  const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}));
  const [company,setCompany]=useState(user?.company_id||'');
  const [companies,setCompanies]=useState([]),[error,setError]=useState('');
  useEffect(()=>{
    if(user?.company_id)return;
    let cancelled=false;
    api.get('/companies',{params:{for_module:'production'}}).then(r=>{if(!cancelled)setCompanies(Array.isArray(r.data)?r.data:r.data.items||[]);}).catch(()=>{if(!cancelled)setError('Không tải được danh sách công ty');});
    return()=>{cancelled=true;};
  },[user?.company_id]);
  return <div className="p-4 space-y-4"><h1 className="text-2xl font-bold">Báo cáo kế hoạch sản xuất</h1>
    <p>Quản lý xem các dự án trong phạm vi quyền. Nhân viên xem nhiệm vụ được giao cho mình.</p>
    <div className="flex gap-4"><label>Ngày báo cáo <input aria-label="Ngày báo cáo" type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded p-1"/></label>
      {!user?.company_id&&<label>Công ty <select aria-label="Công ty" value={company} onChange={e=>setCompany(e.target.value)} className="border rounded p-1"><option value="">Chọn công ty</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    </div>{error&&<p role="alert">{error}</p>}{company&&date?<ProductionPlanReport date={date} companyId={company} showUnavailable/>:<p>Chọn ngày và công ty để xem báo cáo.</p>}
  </div>;
}
