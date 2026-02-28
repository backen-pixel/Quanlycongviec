import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import TaskDetailModal from '../components/TaskDetailModal';
import TaskCreateModal from '../components/TaskCreateModal';
import Modal from '../components/Modal';
import { FileUploadButton, FilePreview } from '../components/FileUpload';
import { PRIORITY_LABELS, PRIORITY_COLORS, formatDate, getInitials, avatarColor } from '../lib/utils';
import { Plus, FolderKanban, CheckSquare, Lock, X, Clock, AlertTriangle, RefreshCw, Calendar, Edit3, Check, Layers, Building2, ArrowRightCircle, Send } from 'lucide-react';

const SN = { consulting:'Tư vấn', design:'Thiết kế', quotation:'Báo giá', contract:'Hợp đồng', production:'Sản xuất', shipping:'Vận chuyển', installation:'Lắp đặt', 'customer-care':'Chăm sóc KH' };
const SO = ['consulting','design','quotation','contract','production','shipping','installation','customer-care'];
const NEXT_STATUS = { consulting:'designing', design:'quoting', quotation:'contract_signed', contract:'producing', production:'shipping', shipping:'installing', installation:'warranty' };
const NEXT_SLUG = { consulting:'design', design:'quotation', quotation:'contract', contract:'production', production:'shipping', shipping:'installation', installation:'customer-care' };
const QT = [{id:'all',label:'Tất cả'},{id:'today',label:'Hôm nay'},{id:'week',label:'Tuần này'},{id:'month',label:'Tháng này'},{id:'custom',label:'Tùy chọn'}];

function si(s){return SO.indexOf(s)}
function pcs(st){const m={consulting:'consulting',designing:'design',quoting:'quotation',contract_signed:'contract',producing:'production',shipping:'shipping',installing:'installation',warranty:'customer-care',completed:'customer-care'};return m[st]||'consulting'}
function fmt(d){return d.toISOString().slice(0,10)}
function defRange(){const n=new Date();return{from:fmt(new Date(n.getFullYear(),n.getMonth(),1)),to:fmt(new Date(n.getFullYear(),n.getMonth()+1,0))}}
function fdr(items,from,to,f='created_at'){if(!from&&!to)return items;return items.filter(i=>{const d=i[f]?new Date(i[f]):null;if(!d)return false;if(from&&d<new Date(from))return false;if(to){const t=new Date(to);t.setHours(23,59,59,999);if(d>t)return false}return true})}

export default function StageView(){
  const{slug}=useParams();
  const{user}=useAuth();
  const[projects,setProjects]=useState([]);
  const[tasks,setTasks]=useState([]);
  const[wLines,setWLines]=useState([]);
  const[stageInfo,setSI]=useState(null);
  const[loading,setL]=useState(true);
  const[error,setE]=useState(null);
  const[selTask,setSelTask]=useState(null);
  const[showCreate,setShowCreate]=useState(false);
  const[fProj,setFProj]=useState('all');
  const[fComp,setFComp]=useState('all');
  const[fLine,setFLine]=useState('all');
  const[qt,setQt]=useState('month');
  const[dFrom,setDFrom]=useState(defRange().from);
  const[dTo,setDTo]=useState(defRange().to);
  const[editLn,setEditLn]=useState(null);
  const[editNm,setEditNm]=useState('');
  const[advProj,setAdvProj]=useState(null);
  const[advNotes,setAdvNotes]=useState('');
  const[advFiles,setAdvFiles]=useState([]);
  const[advMode,setAdvMode]=useState('advance');
  const[advL,setAdvL]=useState(false);

  useEffect(()=>{
    const n=new Date();
    if(qt==='all'){setDFrom('');setDTo('')}
    else if(qt==='today'){const d=fmt(n);setDFrom(d);setDTo(d)}
    else if(qt==='week'){const s=new Date(n);s.setDate(n.getDate()-n.getDay());setDFrom(fmt(s));setDTo(fmt(n))}
    else if(qt==='month'){setDFrom(defRange().from);setDTo(defRange().to)}
  },[qt]);

  const load=useCallback(async()=>{
    setL(true);setE(null);
    try{
      const[sr,pr]=await Promise.all([
        api.get('/users/stages').catch(()=>({data:{stages:[]}})),
        api.get('/projects',{params:{limit:200}}).catch(()=>({data:{projects:[]}})),
      ]);
      const stage=sr.data.stages?.find(s=>s.slug===slug)||null;
      setSI(stage||{slug,name:SN[slug],color:'#3b82f6'});
      const ap=pr.data.projects||[];
      if(!ap.length||!stage?.id){setProjects(ap);setTasks([]);setWLines([]);setL(false);return}

      const{data:td}=await api.get('/tasks',{params:{stage_id:stage.id}}).catch(()=>({data:{tasks:[]}}));
      let st=td.tasks||[];
      const pids=new Set(st.map(t=>t.project_id));
      const rp=ap.filter(p=>pids.has(p.id));
      setProjects(rp);

      let al=[];
      for(const p of rp){try{const{data:ld}=await api.get(`/projects/${p.id}/workflow-lines`);const sl=(ld.lines||[]).filter(l=>l.stage_slug===slug);sl.forEach(l=>{l._pc=p.code;l._pn=p.name;l._pid=p.id;l._cid=p.company_id});al.push(...sl)}catch{}}
      setWLines(al);

      const wc=await Promise.all(st.map(async t=>{try{const{data}=await api.get(`/tasks/${t.id}`);return{...t,checklists:data.task?.checklists||[],assignee:data.task?.assignee||t.assignee}}catch{return{...t,checklists:[]}}}));
      setTasks(wc);
    }catch(e){console.error(e);setE('Không thể tải dữ liệu.')}
    setL(false);
  },[slug]);

  useEffect(()=>{load()},[load]);

  const togCk=async(tid,cid,d)=>{setTasks(p=>p.map(t=>t.id!==tid?t:{...t,checklists:t.checklists.map(c=>c.id===cid?{...c,is_completed:!d}:c)}));try{await api.patch(`/tasks/${tid}/checklists/${cid}`,{is_completed:!d})}catch{load()}};
  const mkDone=async id=>{setTasks(p=>p.map(t=>t.id===id?{...t,status:'done'}:t));try{await api.patch(`/tasks/${id}/status`,{status:'done'});load()}catch{load()}};
  const startT=async id=>{setTasks(p=>p.map(t=>t.id===id?{...t,status:'in_progress'}:t));try{await api.patch(`/tasks/${id}/status`,{status:'in_progress'})}catch{load()}};
  const saveLn=async ln=>{if(!editNm.trim()){setEditLn(null);return}try{await api.put(`/projects/${ln._pid}/workflow-lines/${ln.id}`,{label:editNm.trim()});setWLines(p=>p.map(l=>l.id===ln.id?{...l,label:editNm.trim()}:l))}catch{}setEditLn(null)};

  const doAdv=async()=>{
    if(!advProj)return;setAdvL(true);
    try{
      const ns=NEXT_SLUG[slug],nst=NEXT_STATUS[slug];
      if(advMode==='advance'&&ns&&nst){
        await api.put(`/projects/${advProj.id}/stage`,{stage_slug:ns,new_status:nst,notes:advNotes||null,attachments:advFiles});
      }else{
        await api.post(`/projects/${advProj.id}/comments`,{content:`🔍 YÊU CẦU DUYỆT: ${SN[slug]} → ${SN[NEXT_SLUG[slug]]||'tiếp'}\n\n${advNotes||'(Không ghi chú)'}`,attachments:advFiles});
      }
      setAdvProj(null);setAdvNotes('');setAdvFiles([]);load();
    }catch{}setAdvL(false);
  };

  if(loading)return<div className="flex items-center justify-center h-64"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;

  const name=SN[slug]||slug;
  let ft=tasks;
  if(fProj!=='all')ft=ft.filter(t=>t.project_id===fProj);
  if(fComp!=='all'){const cp=new Set(projects.filter(p=>p.company_id===fComp).map(p=>p.id));ft=ft.filter(t=>cp.has(t.project_id))}
  ft=fdr(ft,dFrom,dTo);
  const sd=[...ft].sort((a,b)=>(a.order_index||0)-(b.order_index||0));
  const tot=sd.length,dn=sd.filter(t=>t.status==='done').length;
  const tc=sd.reduce((s,t)=>s+(t.checklists?.length||0),0),dc=sd.reduce((s,t)=>s+(t.checklists?.filter(c=>c.is_completed)?.length||0),0);
  let vl=wLines;if(fComp!=='all')vl=vl.filter(l=>l._cid===fComp);if(fLine!=='all')vl=vl.filter(l=>l.id===fLine);
  const hl=wLines.length>0;
  const glt=ln=>sd.filter(t=>t.workflow_line_id?t.workflow_line_id===ln.id:t.project_id===ln._pid);
  const pad={};projects.forEach(p=>{const pt=sd.filter(t=>t.project_id===p.id);pad[p.id]=pt.length>0&&pt.every(t=>t.status==='done')});
  const pc=[];const sc=new Set();projects.forEach(p=>{if(p.company_id&&p.company&&!sc.has(p.company_id)){sc.add(p.company_id);pc.push({id:p.company_id,n:p.company.short_name||p.company.name})}});
  const nsn=SN[NEXT_SLUG[slug]];

  return(
    <div className="space-y-4">
      {error&&<div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-red-500"/><p className="text-sm text-red-700 flex-1">{error}</p><button onClick={load} className="h-8 px-3 bg-red-100 text-red-700 rounded-lg text-xs cursor-pointer"><RefreshCw className="h-3.5 w-3.5 inline mr-1"/>Thử lại</button></div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor:stageInfo?.color||'#3b82f6'}}/><h1 className="text-2xl font-bold text-gray-900">{name}</h1></div>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} DA · {tot} NV ({dn} xong) · {dc}/{tc} CL</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="h-9 w-9 bg-white border rounded-lg flex items-center justify-center hover:bg-gray-50 cursor-pointer text-gray-400"><RefreshCw className="h-4 w-4"/></button>
          <button onClick={()=>setShowCreate(true)} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4"/> Thêm NV</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400 self-center ml-2"/>
            {QT.map(t=><button key={t.id} onClick={()=>setQt(t.id)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${qt===t.id?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>{t.label}</button>)}
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={dFrom} onChange={e=>{setDFrom(e.target.value);setQt('custom')}} className="h-7 px-2 border rounded text-xs bg-white"/>
            <span className="text-xs text-gray-400">→</span>
            <input type="date" value={dTo} onChange={e=>{setDTo(e.target.value);setQt('custom')}} className="h-7 px-2 border rounded text-xs bg-white"/>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pc.length>0&&<div className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-gray-400"/><select value={fComp} onChange={e=>setFComp(e.target.value)} className="h-7 px-2 border rounded text-xs bg-white"><option value="all">Tất cả CTy</option>{pc.map(c=><option key={c.id} value={c.id}>{c.n}</option>)}</select></div>}
          {projects.length>1&&<select value={fProj} onChange={e=>setFProj(e.target.value)} className="h-7 px-2 border rounded text-xs bg-white"><option value="all">Tất cả DA</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>}
          {hl&&<div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5"><Layers className="h-3.5 w-3.5 text-gray-400 self-center ml-2"/><button onClick={()=>setFLine('all')} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer ${fLine==='all'?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>Tất cả</button>{wLines.map(l=><button key={l.id} onClick={()=>setFLine(fLine===l.id?'all':l.id)} className={`h-7 px-2.5 rounded-md text-[11px] font-medium cursor-pointer max-w-[130px] truncate ${fLine===l.id?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>{l.label}</button>)}</div>}
        </div>
      </div>

      {tot>0&&<div className="bg-white rounded-xl border p-3"><div className="flex justify-between text-xs mb-1"><span className="font-medium text-gray-700">Tiến độ</span><span className="font-bold">{Math.round((dn/tot)*100)}%</span></div><div className="w-full h-2 bg-gray-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${(dn/tot)*100}%`}}/></div></div>}

      {/* Advance banners */}
      {nsn&&projects.filter(p=>pad[p.id]).map(p=>(
        <div key={p.id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <CheckSquare className="h-5 w-5 text-emerald-600"/>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-emerald-800">✅ {p.code} — {p.name}: Hoàn thành!</p><p className="text-xs text-emerald-600">Tất cả NV ở {name} đã xong.</p></div>
          <button onClick={()=>{setAdvProj(p);setAdvMode('advance');setAdvNotes('');setAdvFiles([])}} className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-emerald-700"><ArrowRightCircle className="h-3.5 w-3.5"/> Chuyển → {nsn}</button>
          <button onClick={()=>{setAdvProj(p);setAdvMode('review');setAdvNotes('');setAdvFiles([])}} className="h-8 px-3 bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer hover:bg-amber-600"><Send className="h-3.5 w-3.5"/> Chờ duyệt</button>
        </div>
      ))}

      {/* Kanban */}
      {!hl?(
        <KB tasks={sd} projects={projects} slug={slug} onTC={togCk} onMD={mkDone} onST={startT} onSel={setSelTask} onAdd={()=>setShowCreate(true)} reload={load}/>
      ):(
        <div className="space-y-6">{vl.map(ln=>{const lt=glt(ln);return(
          <div key={ln.id} className="space-y-2">
            <div className="flex items-center gap-3 bg-white rounded-xl border px-4 py-3">
              <div className="w-2 h-8 rounded-full" style={{backgroundColor:stageInfo?.color||'#3b82f6'}}/>
              <div className="flex-1 min-w-0">
                {editLn===ln.id?(<div className="flex items-center gap-2"><input value={editNm} onChange={e=>setEditNm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveLn(ln);if(e.key==='Escape')setEditLn(null)}} className="h-8 px-2 border rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400" autoFocus/><button onClick={()=>saveLn(ln)} className="w-7 h-7 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center cursor-pointer"><Check className="h-3.5 w-3.5"/></button><button onClick={()=>setEditLn(null)} className="w-7 h-7 rounded bg-gray-100 text-gray-500 flex items-center justify-center cursor-pointer"><X className="h-3.5 w-3.5"/></button></div>):(<div className="flex items-center gap-2"><h2 className="text-base font-bold text-gray-900">{ln.label}</h2><button onClick={()=>{setEditLn(ln.id);setEditNm(ln.label)}} className="w-6 h-6 rounded hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"><Edit3 className="h-3 w-3"/></button></div>)}
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5"><span className="text-blue-600 font-medium">{ln._pc}</span>{ln.assignee&&<span className="flex items-center gap-1"><span className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{backgroundColor:avatarColor(ln.assignee.full_name)}}>{getInitials(ln.assignee.full_name)}</span>{ln.assignee.full_name}</span>}<span>{lt.length} NV · {lt.filter(t=>t.status==='done').length} xong</span></div>
              </div>
            </div>
            {lt.length>0?<KB tasks={lt} projects={projects} slug={slug} onTC={togCk} onMD={mkDone} onST={startT} onSel={setSelTask} onAdd={()=>setShowCreate(true)} reload={load} compact/>:<div className="text-center py-4 text-xs text-gray-400 bg-gray-50 rounded-lg border border-dashed">Chưa có NV</div>}
          </div>
        )})}</div>
      )}

      {sd.length===0&&projects.length>0&&<div className="text-center py-16 bg-white rounded-xl border"><CheckSquare className="h-12 w-12 mx-auto text-gray-300 mb-3"/><p className="text-sm text-gray-500">Chưa có NV ở <strong>{name}</strong></p></div>}
      {sd.length===0&&projects.length===0&&<div className="text-center py-16"><FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3"/><p className="text-sm text-gray-500">Không có DA ở <strong>{name}</strong></p></div>}

      {/* Advance Modal */}
      <Modal open={!!advProj} onClose={()=>setAdvProj(null)} title={advMode==='advance'?`Chuyển: ${advProj?.code} → ${nsn}`:`Yêu cầu duyệt: ${advProj?.code}`} size="md">
        <div className="space-y-4">
          <div className={`${advMode==='advance'?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'} border rounded-xl p-4`}>
            <p className={`text-sm ${advMode==='advance'?'text-emerald-800':'text-amber-800'}`}>{advMode==='advance'?`✅ Chuyển "${advProj?.name}" → "${nsn}". Hệ thống tự tạo NV mới.`:`🔍 Gửi yêu cầu duyệt cho "${advProj?.name}" đến người quản lý DA.`}</p>
          </div>
          <div><label className="block text-sm font-medium mb-1">Ghi chú</label><textarea value={advNotes} onChange={e=>setAdvNotes(e.target.value)} className="w-full h-20 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Ghi chú chuyển giao..."/></div>
          <div><label className="block text-sm font-medium mb-1">Đính kèm</label><FileUploadButton onFilesUploaded={f=>setAdvFiles(p=>[...p,...f])}/><FilePreview files={advFiles} onRemove={i=>setAdvFiles(f=>f.filter((_,j)=>j!==i))}/></div>
          <div className="flex justify-end gap-2"><button onClick={()=>setAdvProj(null)} className="h-9 px-4 bg-gray-100 rounded-lg text-sm cursor-pointer">Hủy</button><button onClick={doAdv} disabled={advL} className={`h-9 px-4 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${advMode==='advance'?'bg-emerald-600':'bg-amber-500'}`}>{advL?'...':advMode==='advance'?<><ArrowRightCircle className="h-3.5 w-3.5"/> Chuyển GĐ</>:<><Send className="h-3.5 w-3.5"/> Gửi duyệt</>}</button></div>
        </div>
      </Modal>

      <TaskDetailModal taskId={selTask} open={!!selTask} onClose={()=>setSelTask(null)} onUpdated={load}/>
      <TaskCreateModal open={showCreate} onClose={()=>setShowCreate(false)} onCreated={load} stageId={stageInfo?.id} projectId={fProj!=='all'?fProj:projects[0]?.id}/>
    </div>
  );
}

// ═══ KANBAN ═══
function KB({tasks,projects,slug,onTC,onMD,onST,onSel,onAdd,reload,compact}){
  const sd=[...tasks].sort((a,b)=>(a.order_index||0)-(b.order_index||0));
  if(!sd.length)return null;
  return(
    <div className="flex gap-4 overflow-x-auto pb-4" style={{minHeight:compact?'180px':'280px'}}>
      {sd.map((t,i)=><TC key={t.id} task={t} idx={i} tasks={sd} projects={projects} slug={slug} onTC={onTC} onMD={onMD} onST={onST} onSel={onSel} reload={reload} compact={compact}/>)}
      <div className="shrink-0 w-60 flex items-start pt-8"><button onClick={onAdd} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 text-sm cursor-pointer"><Plus className="h-4 w-4"/>Thêm NV</button></div>
    </div>
  );
}

// ═══ TASK COLUMN ═══
function TC({task,idx,tasks,projects,slug,onTC,onMD,onST,onSel,reload,compact}){
  const ckD=task.checklists?.filter(c=>c.is_completed)?.length||0;
  const ckT=task.checklists?.length||0;
  const allD=ckT>0&&ckD===ckT;
  const isDn=task.status==='done';
  const proj=projects.find(p=>p.id===task.project_id);
  const pSlug=proj?pcs(proj.status):slug;
  const isFut=si(slug)>si(pSlug);
  const spt=tasks.filter(t=>t.project_id===task.project_id);
  const ti=spt.findIndex(t=>t.id===task.id);
  const seqL=ti>0&&!spt.filter((_,i)=>i<ti).every(t=>t.status==='done');
  const lk=isFut||seqL;
  const act=!lk&&!isDn;

  return(
    <div className={`shrink-0 ${compact?'w-72':'w-80'} flex flex-col ${lk?'opacity-50':''}`}>
      <div className={`rounded-t-xl p-3 border border-b-0 ${isDn?'bg-emerald-50 border-emerald-200':act?'bg-white border-gray-200':'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-2">
          <button onClick={()=>!lk&&!isDn&&allD&&onMD(task.id)} disabled={lk||isDn||!allD} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${isDn?'bg-emerald-500 border-emerald-500 text-white':allD?'border-emerald-400 hover:bg-emerald-50 cursor-pointer animate-pulse':lk?'border-gray-200 cursor-not-allowed':'border-gray-300 cursor-not-allowed'}`}>{isDn&&<CheckSquare className="h-3.5 w-3.5"/>}</button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400">#{idx+1}</span>
              {proj&&<Link to={`/projects/${proj.id}`} className="text-[10px] text-blue-600 font-medium hover:underline">{proj.code}{!compact?` — ${proj.name}`:''}</Link>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
            </div>
            <h3 className={`text-sm font-semibold leading-tight ${isDn?'text-emerald-700 line-through':'text-gray-900'}`}>{task.title}</h3>
          </div>
          {lk&&<Lock className="h-4 w-4 text-gray-400 shrink-0 mt-1"/>}
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {task.assignee&&<div className="flex items-center gap-1"><div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{backgroundColor:avatarColor(task.assignee.full_name)}}>{getInitials(task.assignee.full_name)}</div><span className="text-[10px] text-gray-500">{task.assignee.full_name}</span></div>}
          {task.due_date&&<span className={`text-[10px] flex items-center gap-0.5 ${new Date(task.due_date)<new Date()&&!isDn?'text-red-500':'text-gray-400'}`}><Clock className="h-3 w-3"/>{formatDate(task.due_date)}</span>}
          <span className={`text-[10px] font-medium ${allD&&ckT>0?'text-emerald-600':'text-gray-400'}`}>✓ {ckD}/{ckT}</span>
        </div>
        {ckT>0&&<div className="w-full h-1.5 bg-gray-200 rounded-full mt-2"><div className={`h-full rounded-full transition-all ${isDn?'bg-emerald-500':'bg-blue-500'}`} style={{width:`${(ckD/ckT)*100}%`}}/></div>}
      </div>
      <div className={`flex-1 rounded-b-xl border p-2 space-y-1.5 min-h-[60px] ${isDn?'bg-emerald-50/50 border-emerald-200':lk?'bg-gray-50 border-gray-200':'bg-gray-50/50 border-gray-200'}`}>
        {task.checklists?.map(cl=>(
          <div key={cl.id} className={`flex items-start gap-2 bg-white rounded-lg border p-2 ${cl.is_completed?'border-emerald-200 bg-emerald-50/50':lk?'border-gray-200 opacity-60':'border-gray-200 hover:shadow-sm'}`}>
            <button onClick={()=>!lk&&onTC(task.id,cl.id,cl.is_completed)} disabled={lk} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${cl.is_completed?'bg-emerald-500 border-emerald-500 text-white':lk?'border-gray-200 cursor-not-allowed':'border-gray-300 hover:border-blue-400 cursor-pointer'}`}>{cl.is_completed&&<CheckSquare className="h-3 w-3"/>}</button>
            <span className={`text-sm ${cl.is_completed?'line-through text-gray-400':lk?'text-gray-400':'text-gray-700'}`}>{cl.title}</span>
          </div>
        ))}
        {!task.checklists?.length&&<div className="flex items-center justify-center h-12 text-xs text-gray-400">Chưa có checklist</div>}
        {!lk&&!isDn&&<QA taskId={task.id} onAdded={reload}/>}
      </div>
      <div className="flex gap-1 mt-1">
        {!lk&&!isDn&&task.status==='pending'&&<button onClick={()=>onST(task.id)} className="flex-1 h-7 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 cursor-pointer">▶ Bắt đầu</button>}
        {!lk&&!isDn&&allD&&ckT>0&&<button onClick={()=>onMD(task.id)} className="flex-1 h-7 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100 cursor-pointer animate-pulse">✓ Xong</button>}
        <button onClick={()=>onSel(task.id)} className="flex-1 h-7 text-gray-400 bg-white border rounded-lg text-xs hover:text-blue-600 cursor-pointer">Chi tiết →</button>
      </div>
    </div>
  );
}

function QA({taskId,onAdded}){
  const[t,setT]=useState('');
  const[a,setA]=useState(false);
  const add=async()=>{if(!t.trim())return;setA(true);try{await api.post(`/tasks/${taskId}/checklists`,{title:t.trim()});setT('');onAdded?.()}catch{}setA(false)};
  return<div className="flex gap-1 mt-1"><input value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="+ Thêm CL..." className="flex-1 h-7 px-2 bg-white border border-dashed rounded text-xs outline-none focus:border-blue-400"/>{t&&<button onClick={add} disabled={a} className="h-7 px-2 bg-blue-600 text-white rounded text-xs cursor-pointer">{a?'...':'+'}</button>}</div>;
}