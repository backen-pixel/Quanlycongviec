import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../lib/api';
import {useAuth} from '../lib/auth';
const Context=createContext({});
export function ProductionPlanBoardProvider({projects,children}){
  const {user}=useAuth();
  const ids=useMemo(()=>[...new Set(projects.map(p=>p.id).filter(Boolean))].sort().join(','),[projects]);
  const identity=[user?.id,user?.userId,user?.company_id,user?.role,ids].join('|');
  const [state,setState]=useState({});
  useEffect(()=>{
    let cancelled=false;
    const list=ids.split(',').filter(Boolean);
    setState({identity,items:{}});
    async function load(){
      const next={};
      try{
        for(let i=0;i<list.length;i+=30){const r=await api.get('/work-plans/board',{params:{ids:list.slice(i,i+30).join(',')}});if(cancelled)return;if(!r.data.enabled){setState({identity,items:{}});return;}for(const p of r.data.items)next[p.project_id]=p;}
        if(!cancelled)setState({identity,items:next});
      }catch{if(!cancelled)setState({identity,items:Object.fromEntries(list.map(id=>[id,{error:true}]))});}
    }
    load();
    const timer=setInterval(load,60000);
    window.addEventListener('focus',load);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',load);};
  },[identity]);
  return <Context.Provider value={state.identity===identity?state.items:{}}>{children}</Context.Provider>;
}
export function useProductionPlanBoard(id){return useContext(Context)[id];}
export function ProductionPlanBoardCard({id}){
  const plan=useProductionPlanBoard(id);
  if(!plan)return null;
  const href=`/sx/projects/${id}/plan`;
  if(plan.state==='none')return plan.scope==='project'?<Link data-sx-quick-btn to={href} onClick={e=>e.stopPropagation()} className="block mb-2 text-[11px] text-indigo-700 underline">Lập kế hoạch SX từ mẫu</Link>:null;
  if(plan.error)return <div className="text-xs text-red-700">Chưa tải được tiến độ kế hoạch SX</div>;
  return <div data-sx-quick-btn className="rounded border border-indigo-100 bg-indigo-50/60 p-2 mb-2 text-[11px] space-y-1" onClick={e=>e.stopPropagation()}>
    <Link to={href} className="font-semibold text-indigo-700 underline">{plan.state==='draft'?'Kế hoạch chưa duyệt':'Mở kế hoạch SX'}</Link>
    {plan.state==='approved'&&<>
      {plan.template_name&&<div title={plan.template_name} className="truncate">Mẫu: {plan.template_name}</div>}
      <div>{plan.scope==='assigned'?'Việc của bạn: ':''}Hoàn thành {plan.completed}/{plan.total}{plan.waived>0?` · Miễn trừ ${plan.waived}`:''}</div>
      <div className={plan.overdue?'text-red-700 font-semibold':'text-slate-600'}>Quá hạn: {plan.overdue}{plan.needs_review?` · Cần kiểm tra lại: ${plan.needs_review}`:''}</div>
      <div>Hạn SX: {new Date(plan.deadline).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'})}</div>
      <div>{plan.complete?(plan.scope==='assigned'?'Đã xong phần việc của bạn':'Đã xong các việc SX'):plan.blocked?'Đang chờ việc trước':`Công đoạn có thể thực hiện: ${plan.open_stages.map(s=>s.name).join(', ')||'—'}`}</div>
    </>}
  </div>;
}
