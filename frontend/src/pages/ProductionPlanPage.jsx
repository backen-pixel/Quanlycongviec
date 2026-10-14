import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../lib/api';

const examples = {
  cabinet: { name:'Tủ bếp — ví dụ 7 ngày', names:['Chốt bản vẽ','Chuẩn bị vật tư','Gia công thùng','Gia công cánh','Lắp ráp','Kiểm tra','Đóng gói'], days:[1,1,2,2,1,1,1], deps:[[],[0],[1],[1],[2,3],[4],[5]] },
  glass: { name:'Cánh kính — ví dụ 6 ngày', names:['Chốt kích thước','Gia công kính','Gia công khung','Lắp kính vào khung','Kiểm tra','Đóng gói'], days:[1,2,1,1,1,1], deps:[[],[0],[0],[1,2],[3],[4]] },
};
const blank = () => ({ stages:[{id:'s1',name:'Công đoạn 1'}], tasks:[{id:'t1',stage_id:'s1',name:'Nhiệm vụ 1',hours:8,dependencies:[],required:true,assignee_id:null}], calendar:{weekdays:[1,2,3,4,5,6],shifts:[[8,12],[13,17]],holidays:[]} });
function example(key) { const e=examples[key]; return {...blank(), stages:e.names.map((name,i)=>({id:`s${i+1}`,name})), tasks:e.names.map((name,i)=>({id:`t${i+1}`,stage_id:`s${i+1}`,name,hours:e.days[i]*8,dependencies:e.deps[i].map(d=>`t${d+1}`),required:true,assignee_id:null}))}; }
const localInput = v => v ? new Date(Date.parse(v)+7*3600000).toISOString().slice(0,16) : '';
const date = v => v ? new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const css = 'border rounded px-2 py-1.5 w-full bg-white';
export default function ProductionPlanPage() {
  const {id}=useParams(); const url=`/work-plans/${id}`;
  const [data,setData]=useState(null), [graph,setGraph]=useState(blank), [deadline,setDeadline]=useState('');
  const [templates,setTemplates]=useState([]), [source,setSource]=useState(null), [users,setUsers]=useState([]);
  const [error,setError]=useState(''), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  const [reason,setReason]=useState(''), [mine,setMine]=useState(true), [acceptLate,setAcceptLate]=useState(false);
  const [templateName,setTemplateName]=useState(''), [history,setHistory]=useState(null), [editing,setEditing]=useState(false), [taskForm,setTaskForm]=useState({});
  async function reload() {
    setBusy(true);setError('');
    try { const r=await api.get(url);setData(r.data);setMine(!r.data.can_manage);const d=r.data.document?.draft||r.data.document?.active;
      setGraph(d?.graph||blank());setDeadline(localInput(d?.deadline));setSource(d?.source_template||null);setReason(d?.reason||'');setEditing(false);
      const t=await api.get(`${url}/templates`);setTemplates(t.data);
    } catch(e) {setError(e.response?.data?.error||'Không tải được kế hoạch');} finally {setBusy(false);}
  }
  useEffect(()=>{setData(null);setHistory(null);setTaskForm({});reload();api.get('/users').then(r=>setUsers(Array.isArray(r.data)?r.data:r.data.users||[])).catch(()=>setUsers([]));},[id]);
  async function command(body) {
    setBusy(true);setError('');setMessage('');
    try { const r=await api.post(`${url}/commands`,{...body,expected_revision:data.revision,command_id:crypto.randomUUID()});setData(r.data);setHistory(null);setMessage('Đã lưu');return true; }
    catch(e){setError(e.response?.data?.error||'Không lưu được. Tải lại để kiểm tra trước khi thử lại.');return false;}finally{setBusy(false);}
  }
  function changeGraph(fn){setGraph(fn);setEditing(true);}
  function task(id,patch){changeGraph(g=>({...g,tasks:g.tasks.map(t=>t.id===id?{...t,...patch}:t)}));}
  function calendar(patch){changeGraph(g=>({...g,calendar:{...g.calendar,...patch}}));}
  function loadTemplate(value){
    if(data.document?.active){setError('Dự án đã duyệt: chỉnh các nhiệm vụ hiện tại để giữ lịch sử, không thay toàn bộ mẫu.');return;}
    if(value.startsWith('example:')){setGraph(example(value.split(':')[1]));setSource(null);}
    else{const t=templates.find(t=>`${t.template_id}:${t.version}`===value);if(!t)return;setGraph(structuredClone(t.document.graph));setSource({id:t.template_id,version:t.version});}
    setEditing(true);
  }
  async function saveTemplate(){
    setBusy(true);setError('');
    try{const plan=data.document?.draft||data.document?.active;if(!plan)throw new Error('Cần lưu kế hoạch trước');
      const r=await api.post(`${url}/templates`,{name:templateName,graph:plan.graph,template_id:source?.id||crypto.randomUUID(),expected_version:source?.version||0,command_id:crypto.randomUUID()});
      setSource({id:r.data.id,version:r.data.version});const t=await api.get(`${url}/templates`);setTemplates(t.data);setMessage(`Đã xuất bản mẫu phiên bản ${r.data.version}. Dự án đang chạy giữ nguyên.`);
    }catch(e){setError(e.response?.data?.error||e.message);}finally{setBusy(false);}
  }
  const schedule=data?.schedule, preview=data?.preview;
  const visible=(schedule?.tasks||[]).filter(t=>!mine||t.assignee_id===data.actor_id).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||Number(b.ready)-Number(a.ready)||a.deadline.localeCompare(b.deadline));
  const userName=uid=>users.find(u=>u.id===uid)?.full_name||users.find(u=>u.id===uid)?.name||(uid?'Người đã giao':'Chưa giao');
  const formPatch=(id,patch)=>setTaskForm(f=>({...f,[id]:{...f[id],...patch}}));
  return <div className="p-4 max-w-7xl mx-auto space-y-5 text-sm">
    <div className="flex flex-wrap justify-between gap-3"><div><Link className="text-teal-700" to={`/sx/projects/${id}`}>← Dự án</Link><h1 className="text-2xl font-bold mt-2">Kế hoạch sản xuất</h1><p>Tính lịch ngược từ hạn hoàn thành sản xuất · giờ Việt Nam · phiên bản {data?.revision||0}</p></div><button className="border rounded px-3 py-2" disabled={busy} onClick={reload}>Tải lại</button></div>
    {error&&<p role="alert" className="bg-red-50 text-red-800 p-3 rounded">{error}</p>}{message&&<p role="status" className="bg-teal-50 p-3 rounded">{message}</p>}
    {!data&&<p>{busy?'Đang tải…':'Chưa tải được kế hoạch'}</p>}
    {data&&!schedule&&<p className="p-3 bg-amber-50">Dự án chưa có kế hoạch linh hoạt được duyệt. Nhiệm vụ hiện tại vẫn xem tại trang dự án.</p>}
    {schedule&&<section className="bg-white border rounded p-4 space-y-3"><div className="flex flex-wrap justify-between"><h2 className="font-bold text-lg">Nhiệm vụ đang thực hiện</h2><label><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/> Chỉ việc của tôi</label></div>
      <p>Hạn sản xuất: <b>{date(schedule.deadline)}</b> · Dự kiến xong: <b>{date(schedule.forecast_finish)}</b> · {schedule.tasks.filter(t=>t.overdue).length} việc trễ hạn</p>
      <p className="text-gray-600">Dự kiến dựa trên thứ tự và thời lượng; việc đang làm được tính đủ thời lượng. Chưa cân tải người/máy giữa các dự án.</p>
      {!schedule.feasible&&<p className="text-red-700">Dự kiến vượt hạn sản xuất. Quản lý cần xử lý việc chặn hoặc điều chỉnh kế hoạch.</p>}
      {schedule.collisions.length>0&&<p className="text-amber-800">Có {schedule.collisions.length} cặp nhiệm vụ cùng người bị trùng lịch.</p>}
      <div className="flex flex-wrap gap-2">{schedule.stages.map(s=><span className={`rounded px-3 py-1 ${s.complete?'bg-green-100':'bg-gray-100'}`} key={s.id}>{s.name}: {s.complete?'hoàn thành':'chưa xong'}</span>)}</div>
      {!visible.length&&<p>Không có nhiệm vụ trong bộ lọc này.</p>}
      {visible.map(t=>{const f=taskForm[t.id]||{};return <article className={`border rounded p-3 space-y-2 ${t.overdue?'border-red-300':''}`} key={t.id}>
        <div className="flex flex-wrap justify-between gap-2"><b>{t.name}</b><span>{t.needs_review?'Cần kiểm tra lại':t.status==='done'?(t.completed_late?'Hoàn thành trễ':'Hoàn thành'):t.status==='waived'?'Đã bỏ qua':t.overdue?'Trễ hạn':t.status==='doing'?'Đang làm':t.ready?'Có thể làm':'Chờ việc trước'}</span></div>
        <p>{userName(t.assignee_id)} · bắt đầu {date(t.planned_start)} · hạn {date(t.deadline)}</p>
        {!!t.dependencies.length&&<p>Việc trước: {t.dependencies.map(d=>schedule.tasks.find(x=>x.id===d)?.name).join(', ')}</p>}
        {t.evidence&&<p className="whitespace-pre-wrap">Minh chứng: {t.evidence}</p>}{t.reason&&<p>Lý do: {t.reason}</p>}
        {(data.can_manage||t.assignee_id===data.actor_id)&&<div className="space-y-2"><input aria-label={`Minh chứng ${t.name}`} className={css} placeholder="Minh chứng / đường dẫn tài liệu" value={f.evidence??t.evidence} onChange={e=>formPatch(t.id,{evidence:e.target.value})}/>
          {data.can_manage&&<><input aria-label={`Lý do ${t.name}`} className={css} placeholder="Lý do bỏ qua / mở lại" value={f.reason||''} onChange={e=>formPatch(t.id,{reason:e.target.value})}/><label><input type="checkbox" checked={!!f.reopen_successors} onChange={e=>formPatch(t.id,{reopen_successors:e.target.checked})}/> Đồng ý yêu cầu kiểm tra lại các việc sau đã hoàn thành</label></>}
          <div className="flex flex-wrap gap-2">{[['doing','Bắt đầu'],['done','Hoàn thành'],...(data.can_manage?[['pending','Mở lại'],['waived','Bỏ qua']]:[])].map(([status,label])=><button className="border rounded px-3 py-1" key={status} disabled={busy||(['doing','done'].includes(status)&&!t.ready)} onClick={()=>command({action:'task',task_id:t.id,status,evidence:f.evidence??t.evidence,reason:f.reason,reopen_successors:f.reopen_successors})}>{label}</button>)}</div>
        </div>}
      </article>;})}
    </section>}
    {data?.can_manage&&<section className="bg-white border rounded p-4 space-y-4"><h2 className="font-bold text-lg">Lập và điều chỉnh kế hoạch</h2><p>Chọn mẫu, chỉnh công đoạn/nhiệm vụ và giao người. Lưu nháp để xem lịch, sau đó duyệt để thực hiện.</p>
      <label className="block">Dùng quy trình mẫu<select className={css} defaultValue="" onChange={e=>loadTemplate(e.target.value)}><option value="">Chọn mẫu…</option>{templates.map(t=><option key={`${t.template_id}:${t.version}`} value={`${t.template_id}:${t.version}`}>{t.document.name} · v{t.version}</option>)}{Object.entries(examples).map(([key,e])=><option key={key} value={`example:${key}`}>{e.name}</option>)}</select></label>
      {source&&<p>Mẫu đang dùng: phiên bản {source.version}. Chỉnh ở đây chỉ áp dụng cho dự án này.</p>}
      <div className="grid sm:grid-cols-2 gap-3"><label>Hạn hoàn thành sản xuất<input type="datetime-local" className={css} value={deadline} onChange={e=>{setDeadline(e.target.value);setEditing(true);}}/></label><label>Lý do lập / đổi kế hoạch<input className={css} value={reason} onChange={e=>{setReason(e.target.value);setEditing(true);}}/></label></div>
      <fieldset className="border rounded p-3 space-y-2"><legend>Lịch làm việc</legend><div className="flex flex-wrap gap-3">{['CN','T2','T3','T4','T5','T6','T7'].map((name,d)=><label key={d}><input type="checkbox" checked={graph.calendar.weekdays.includes(d)} onChange={e=>calendar({weekdays:e.target.checked?[...graph.calendar.weekdays,d]:graph.calendar.weekdays.filter(x=>x!==d)})}/> {name}</label>)}</div>
        <p>Ca làm (giờ)</p>{graph.calendar.shifts.map((s,i)=><div className="flex gap-2 items-center" key={i}><input aria-label={`Ca ${i+1} bắt đầu`} type="number" step="0.25" value={s[0]} className={css} onChange={e=>calendar({shifts:graph.calendar.shifts.map((x,j)=>j===i?[Number(e.target.value),x[1]]:x)})}/><span>đến</span><input aria-label={`Ca ${i+1} kết thúc`} type="number" step="0.25" value={s[1]} className={css} onChange={e=>calendar({shifts:graph.calendar.shifts.map((x,j)=>j===i?[x[0],Number(e.target.value)]:x)})}/></div>)}
        <div className="flex gap-3"><button disabled={graph.calendar.shifts.length>=8} onClick={()=>calendar({shifts:[...graph.calendar.shifts,[18,20]]})}>+ Ca làm</button><button disabled={graph.calendar.shifts.length<=1} onClick={()=>calendar({shifts:graph.calendar.shifts.slice(0,-1)})}>Bỏ ca cuối</button></div>
        <label className="block">Ngày nghỉ (YYYY-MM-DD, cách nhau dấu phẩy)<input key={graph.calendar.holidays.join(',')} className={css} defaultValue={graph.calendar.holidays.join(',')} onChange={()=>setEditing(true)} onBlur={e=>calendar({holidays:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/></label>
      </fieldset>
      {graph.stages.map(s=><div className="border rounded p-3 space-y-3" key={s.id}><div className="flex gap-2"><input aria-label="Tên công đoạn" className={css} value={s.name} onChange={e=>changeGraph(g=>({...g,stages:g.stages.map(x=>x.id===s.id?{...x,name:e.target.value}:x)}))}/><button disabled={graph.tasks.some(t=>t.stage_id===s.id)} onClick={()=>changeGraph(g=>({...g,stages:g.stages.filter(x=>x.id!==s.id)}))}>Xóa công đoạn</button></div>
        {graph.tasks.filter(t=>t.stage_id===s.id).map(t=><div className="bg-gray-50 rounded p-3 space-y-2" key={t.id}><div className="grid md:grid-cols-4 gap-2"><label>Tên nhiệm vụ<input className={css} value={t.name} onChange={e=>task(t.id,{name:e.target.value})}/></label><label>Giờ làm việc<input type="number" step="0.25" min="0.25" className={css} value={t.hours} onChange={e=>task(t.id,{hours:Number(e.target.value)})}/></label><label>Vai trò<input className={css} value={t.role||''} onChange={e=>task(t.id,{role:e.target.value})}/></label><label>Người phụ trách<select className={css} value={t.assignee_id||''} onChange={e=>task(t.id,{assignee_id:e.target.value||null})}><option value="">Chưa giao</option>{users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.name||u.email}</option>)}</select></label></div>
          <label className="block">Cách tính thời lượng<select className={css} value={t.clock_mode||'working'} onChange={e=>task(t.id,{clock_mode:e.target.value})}><option value="working">Giờ làm việc theo ca</option><option value="elapsed">Giờ liên tục, kể cả đêm và ngày nghỉ (chờ nhà cung cấp)</option></select></label>
          <label className="block">Việc phải xong trước (giữ Ctrl để chọn nhiều)<select multiple className={css} value={t.dependencies} onChange={e=>task(t.id,{dependencies:[...e.target.selectedOptions].map(o=>o.value)})}>{graph.tasks.filter(x=>x.id!==t.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <div className="flex flex-wrap gap-3"><label><input type="checkbox" checked={t.required!==false} onChange={e=>task(t.id,{required:e.target.checked})}/> Bắt buộc để xong công đoạn</label><label><input type="checkbox" checked={!!t.evidence_required} onChange={e=>task(t.id,{evidence_required:e.target.checked})}/> Cần minh chứng</label><button onClick={()=>changeGraph(g=>({...g,tasks:g.tasks.filter(x=>x.id!==t.id).map(x=>({...x,dependencies:x.dependencies.filter(d=>d!==t.id)}))}))}>Xóa nhiệm vụ</button></div>
        </div>)}
        <button className="text-teal-700" onClick={()=>changeGraph(g=>({...g,tasks:[...g.tasks,{id:crypto.randomUUID().replaceAll('-',''),name:'Nhiệm vụ mới',stage_id:s.id,hours:8,dependencies:[],required:true,assignee_id:null}]}))}>+ Nhiệm vụ</button>
      </div>)}
      <button className="border rounded px-3 py-2" onClick={()=>changeGraph(g=>({...g,stages:[...g.stages,{id:crypto.randomUUID().replaceAll('-',''),name:'Công đoạn mới'}]}))}>+ Công đoạn</button>
      <div className="flex flex-wrap gap-3"><button className="bg-teal-700 text-white rounded px-4 py-2" disabled={busy||!deadline} onClick={async()=>{if(await command({action:'draft',graph,deadline:`${deadline}:00+07:00`,reason,source_template:source}))setEditing(false);}}>Lưu nháp và tính lịch</button><button className="border rounded px-3 py-2" disabled={busy||!data.document?.draft} onClick={async()=>{if(await command({action:'discard'}))await reload();}}>Bỏ bản nháp</button></div>
      {preview&&<div className="border rounded p-3 space-y-2"><h3 className="font-bold">Lịch dự kiến bản nháp {editing?'(có thay đổi chưa lưu)':''}</h3><p>Dự kiến hoàn thành: {date(preview.forecast_finish)} · {preview.feasible?'Có thể kịp hạn':'Không kịp hạn từ thời điểm hiện tại'}</p>{preview.collisions.length>0&&<p className="text-amber-800">{preview.collisions.length} cặp nhiệm vụ cùng người bị trùng lịch.</p>}<div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Nhiệm vụ</th><th>Bắt đầu</th><th>Hạn chót</th></tr></thead><tbody>{preview.tasks.map(t=><tr key={t.id}><td>{t.name}</td><td>{date(t.planned_start)}</td><td>{date(t.deadline)}</td></tr>)}</tbody></table></div>
        {!preview.feasible&&<label className="block"><input type="checkbox" checked={acceptLate} onChange={e=>setAcceptLate(e.target.checked)}/> Tôi hiểu kế hoạch có nguy cơ trễ hạn</label>}<button className="bg-teal-700 text-white rounded px-4 py-2" disabled={busy||editing||(!preview.feasible&&!acceptLate)} onClick={()=>command({action:'approve',accept_late:acceptLate})}>Duyệt và giao thực hiện</button></div>}
      <div className="border-t pt-3 space-y-2"><h3 className="font-bold">Lưu quy trình này làm mẫu</h3><p>Mẫu giữ cấu trúc, thời lượng, vai trò và việc trước. Ngày, người phụ trách và trạng thái không được sao chép. Kiểm tra tên nhiệm vụ/công đoạn để tránh chứa thông tin khách hàng.</p><input aria-label="Tên mẫu" className={css} placeholder="Tên mẫu quy trình" value={templateName} onChange={e=>setTemplateName(e.target.value)}/><button className="border rounded px-3 py-2" disabled={busy||!templateName||editing} onClick={saveTemplate}>{source?'Xuất bản phiên bản mẫu mới':'Lưu thành mẫu mới'}</button></div>
      <button className="text-teal-700" onClick={async()=>{try{const r=await api.get(`${url}/history`);setHistory(r.data);}catch(e){setError(e.response?.data?.error||'Không tải được lịch sử');}}}>Xem lịch sử</button>
      {history&&<ul className="space-y-1">{history.map(h=><li key={h.revision}>Phiên bản {h.revision} · {date(h.created_at)} · {h.document.active?.reason||'Cập nhật nhiệm vụ / bản nháp'} · hạn {date(h.document.active?.deadline)}</li>)}</ul>}
    </section>}
  </div>;
}
