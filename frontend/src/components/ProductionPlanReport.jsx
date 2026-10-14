import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
export default function ProductionPlanReport({date,companyId}) {
  const [state,setState]=useState({loading:true});
  useEffect(()=>{
    let cancelled=false; setState({loading:true});
    api.get('/work-plans/report',{params:{date,company_id:companyId}})
      .then(r=>{if(!cancelled)setState({data:r.data});})
      .catch(e=>{if(!cancelled)setState({error:e.response?.data?.error||'Không đọc được báo cáo kế hoạch SX'});});
    return ()=>{cancelled=true;};
  },[date,companyId]);
  if(state.data?.enabled===false)return null;
  const data=state.data;
  const labels={due_in_day:'Đến hạn trong ngày',completed_in_day:'Hoàn thành trong ngày',due_completed_on_time:'Việc đến hạn đã xong đúng hạn',overdue_at_cutoff:'Tổng việc quá hạn tại mốc báo cáo',needs_review:'Cần kiểm tra lại'};
  return <section className="rounded-xl border bg-white p-4 space-y-3">
    <h2 className="font-semibold">Kế hoạch sản xuất — {date}</h2>
    {state.loading&&<p>Đang đọc lịch sử kế hoạch…</p>}
    {state.error&&<p role="alert" className="text-red-700">{state.error}</p>}
    {data&&<><p className="text-sm text-gray-600">Mốc báo cáo: {new Date(data.cutoff_at).toLocaleString('vi-VN')}. Đọc dữ liệu: {new Date(data.read_at).toLocaleString('vi-VN')}. Chỉ gồm kế hoạch linh hoạt đã duyệt; nhiệm vụ cũ chưa nằm trong bảng này.</p>
      <table className="w-full text-sm"><tbody>{Object.entries(labels).map(([key,label])=><tr key={key}><th className="text-left p-1 font-normal">{label}</th><td className="text-right">{data.totals[key]}</td></tr>)}</tbody></table>
      {data.tasks.filter(t=>t.overdue||t.status==='needs_review').slice(0,10).map(t=><p key={`${t.project_id}:${t.id}`} className="text-sm"><Link className="text-blue-700 underline" to={`/sx/projects/${t.project_id}/plan`}>{t.name}</Link> — {t.status==='needs_review'?'Cần kiểm tra lại':'Quá hạn'} · {new Date(t.deadline).toLocaleString('vi-VN')}</p>)}
    </>}
  </section>;
}
