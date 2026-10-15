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
    let generation=0;
    async function load(){
      const request=++generation;
      const next={};
      try{
        for(let i=0;i<list.length;i+=30){const r=await api.get('/work-plans/board',{params:{ids:list.slice(i,i+30).join(',')}});if(cancelled||request!==generation)return;if(!r.data.enabled){setState({identity,items:Object.fromEntries(list.map(id=>[id,{state:'disabled'}]))});return;}for(const p of r.data.items)next[p.project_id]=p;}
        for(const id of list)if(!next[id])next[id]={state:'unavailable'};
        if(!cancelled&&request===generation)setState({identity,items:next});
      }catch{if(!cancelled&&request===generation)setState({identity,items:Object.fromEntries(list.map(id=>[id,{error:true}]))});}
    }
    load();
    const timer=setInterval(load,60000);
    window.addEventListener('focus',load);
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',load);};
  },[identity]);
  return <Context.Provider value={state.identity===identity?state.items:{}}>{children}</Context.Provider>;
}
export function useProductionPlanBoard(id){return useContext(Context)[id];}
export function ProductionPlanAutoBoard({projects}){
  const plans=useContext(Context);
  const columns=new Map();let pending=0,failed=0,legacy=0;
  for(const project of projects){
    const plan=plans[project.id];
    if(!plan){pending++;continue;}
    if(plan.error){failed++;continue;}
    if(plan.state!=='approved'||!plan.progression){legacy++;continue;}
    const progress=plan.progression;
    // Only group projects whose complete ordered stage definitions agree.
    const key=progress.complete?'complete':`${JSON.stringify(progress.stages.map(s=>[s.id,s.name]))}:${progress.current.id}`;
    if(!columns.has(key))columns.set(key,{name:progress.complete?'Hoàn tất sản xuất':progress.current.name,
      group:progress.complete?'':JSON.stringify(progress.stages.map(s=>[s.id,s.name])),
      order:progress.complete?Number.MAX_SAFE_INTEGER:progress.stages.findIndex(s=>s.id===progress.current.id),
      complete:progress.complete,items:[]});
    columns.get(key).items.push({project,plan});
  }
  return <section className="space-y-3" aria-label="Bảng tự chuyển công đoạn theo kế hoạch">
    <p className="text-sm text-slate-600">Thẻ tự chuyển theo thứ tự công đoạn trong kế hoạch đã duyệt khi mọi nhiệm vụ đã xong hoặc được miễn trừ. Mỗi dự án có công đoạn riêng; các khâu song song ghi trên thẻ. Cập nhật mỗi phút và khi quay lại cửa sổ.</p>
    {!!pending&&<p role="status">Đang đọc kế hoạch của {pending} dự án.</p>}
    {!!failed&&<p role="alert" className="text-red-700">Chưa đọc được {failed} dự án. Không thể xác định công đoạn.</p>}
    {!!legacy&&<p className="text-sm">{legacy} dự án chưa có kế hoạch đã duyệt hoặc chỉ có quyền xem phần việc cá nhân. Xem các dự án này trong Kanban hiện có.</p>}
    <div className="flex gap-3 overflow-x-auto pb-3">{[...columns.entries()].sort(([,a],[,b])=>Number(a.complete)-Number(b.complete)||a.group.localeCompare(b.group)||a.order-b.order).map(([key,col])=><div key={key} className="w-72 shrink-0 rounded-lg bg-slate-100 p-3 space-y-3">
      <h3 className="font-semibold">{col.name} · {col.items.length}</h3>
      {col.items.map(({project,plan})=><article key={project.id} className="rounded border bg-white p-3 space-y-2">
        <Link className="font-semibold text-indigo-700 underline" to={`/sx/projects/${project.id}/plan`}>{project.name||project.code||'Dự án'}</Link>
        <div>Hoàn thành {plan.completed}/{plan.total}{plan.waived?` · Miễn trừ ${plan.waived}`:''}</div>
        {plan.progression.current&&<div>Khâu hiện tại: {plan.progression.current.closed}/{plan.progression.current.total} nhiệm vụ đã đóng</div>}
        {!!plan.progression.parallel.length&&<div>Song song: {plan.progression.parallel.map(s=>s.name).join(', ')}</div>}
        {!!plan.needs_review&&<div className="text-amber-700">Cần kiểm tra lại: {plan.needs_review}</div>}
        {!!plan.overdue&&<div className="text-red-700">Quá hạn: {plan.overdue}</div>}
      </article>)}
    </div>)}</div>
    {!columns.size&&!pending&&!failed&&<p>Chưa có kế hoạch được phép hiển thị trên bảng công đoạn.</p>}
  </section>;
}
export function ProductionPlanBoardCard({id}){
  const plan=useProductionPlanBoard(id);
  if(!plan)return null;
  if(['disabled','unavailable'].includes(plan.state))return null;
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
