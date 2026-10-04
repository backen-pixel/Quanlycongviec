import React, { useEffect, useRef, useState } from 'react';
import { createRecoveryController } from './batchRecoveryState.mjs';

export default function FacebookBatchRecovery({ actorId, companyId, contactIds, loaded, api, headers, onChanged }) {
  const [state,setState]=useState({pending:null,run:null,busy:false,error:''});
  const [selection,setSelection]=useState(null),[history,setHistory]=useState([]),[next,setNext]=useState(null);
  const alive=useRef(false),generation=useRef(0),historySequence=useRef(0),controller=useRef(null),transport=useRef({headers,onChanged});
  transport.current={headers,onChanged};
  const endpoint=`${api}/api/facebook/batch-create-leads`;
  async function loadHistory(before=null) {
    const epoch=generation.current,sequence=++historySequence.current;
    if(!before){setHistory([]);setNext(null);}
    try {
      const res=await fetch(`${endpoint}?company_id=${encodeURIComponent(companyId)}${before?'&before='+encodeURIComponent(before):''}`,{headers:transport.current.headers()});
      const data=await res.json();if(!alive.current||generation.current!==epoch||historySequence.current!==sequence)return;
      if(!res.ok||!Array.isArray(data.runs))throw Error('Chưa đọc được lịch sử server.');
      setHistory(old=>before?[...old,...data.runs]:data.runs);setNext(data.nextCursor||null);
    }catch(e){if(alive.current&&generation.current===epoch&&historySequence.current===sequence){setHistory([]);setNext(null);setState(s=>({...s,error:e.message}));}}
  }
  useEffect(()=>{
    alive.current=true;
    const epoch=++generation.current,current=()=>alive.current&&generation.current===epoch;
    try {
      controller.current=createRecoveryController({actor:actorId,company:companyId,storage:window.localStorage,newId:()=>crypto.randomUUID(),
        isCurrent:current,update:value=>{if(current())setState(s=>({...s,...value}));},
        send:async(method,p)=>{
          const url=method==='POST'?endpoint:`${endpoint}/${encodeURIComponent(p.requestId)}?company_id=${encodeURIComponent(companyId)}`;
          const res=await fetch(url,{method,headers:{...transport.current.headers(),'Content-Type':'application/json'},
            ...(method==='POST'?{body:JSON.stringify({company_id:companyId,contact_ids:p.contactIds,requestId:p.requestId})}:{})});
          const data=await res.json();if(current()&&res.ok&&method==='POST')transport.current.onChanged?.();
          return{ok:res.ok,data};
        }});
      setState(controller.current.initial());controller.current.refresh();loadHistory();
    }catch(e){setState(s=>({...s,error:e.message,storageFailed:true}));}
    return()=>{alive.current=false;generation.current++;controller.current=null;};
  },[]); // Parent keys this component by the complete authenticated scope.
  async function act(fn){try{await fn();}catch(e){if(alive.current)setState(s=>({...s,error:e.message}));}}
  const disabled=state.busy||state.storageFailed,run=state.run;
  const count=s=>run?.items.filter(i=>i.state===s).length||0;
  return <section className="w-full rounded-lg border border-green-200 bg-green-50 p-3 text-sm space-y-2" aria-label="Tạo khách và khôi phục lượt xử lý">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={disabled||!!state.pending||!loaded||!contactIds.length}
        onClick={()=>setSelection(contactIds.slice(0,500))} className="rounded border px-3 py-1.5 disabled:opacity-40">Tạo hoặc liên kết khách từ danh sách đang xem</button>
      <button type="button" disabled={state.busy} onClick={()=>loadHistory()} className="rounded border px-3 py-1.5">Đọc lịch sử xử lý</button>
    </div>
    {selection&&<div className="rounded border bg-white p-3">
      <p>Xác nhận xử lý {selection.length} liên hệ đã chọn theo cài đặt Page? Lượt xử lý được lưu để đối soát khi mất kết nối.</p>
      <button type="button" disabled={disabled||!!state.pending} onClick={()=>{const ids=selection;setSelection(null);act(()=>controller.current.start(ids));}} className="rounded border px-3 py-1.5">Xác nhận danh sách</button>
      <button type="button" onClick={()=>setSelection(null)} className="px-3 py-1.5">Hủy</button>
    </div>}
    {state.error&&<p role="alert" className="text-red-700">{state.error}</p>}
    {state.pending&&<div className="space-y-2">
      <p>Đang giữ yêu cầu {state.pending.requestId}. Tải lại trang vẫn có thể đọc kết quả từ server.</p>
      <button type="button" disabled={disabled} onClick={()=>act(()=>controller.current.refresh())} className="rounded border px-3 py-1.5">Đọc lại tiến độ</button>
      {(!run||run.requestId!==state.pending.requestId)&&<button type="button" disabled={disabled} onClick={()=>act(()=>controller.current.resend())} className="rounded border px-3 py-1.5 ml-2">Đối chiếu hoặc gửi lại cùng yêu cầu</button>}
      {run?.state==='COMPLETED'&&run.requestId===state.pending.requestId&&<button type="button" disabled={disabled} onClick={()=>act(()=>controller.current.acknowledge())} className="rounded border px-3 py-1.5 ml-2">Đã xem kết quả</button>}
    </div>}
    {run&&<div role="status" className="rounded border bg-white p-3">
      <p>{run.state==='COMPLETED'?'Đã hoàn tất lượt xử lý.':run.state==='RUNNING'?'Lượt đang chạy hoặc chưa xác nhận đã dừng.':'Cần đối soát trước khi xử lý tiếp.'}</p>
      <p>Đã nối CRM: {count('LINKED')} · Bỏ qua: {count('SKIPPED')} · Chưa bắt đầu: {count('PENDING')+count('CANCELLED')} · Chưa rõ kết quả: {count('RUNNING')+count('UNKNOWN')}</p>
      {run.state!=='COMPLETED'&&<p>Không tự chạy lại hồ sơ chưa rõ kết quả. Người phụ trách cần kiểm tra tác vụ cũ và hồ sơ đã phát sinh.</p>}
    </div>}
    {history.length>0&&<details><summary>Các lượt đã lưu trên server ({history.length})</summary><ul>{history.map(x=><li key={x.requestId}>
      <button type="button" disabled={state.busy} className="underline py-1" onClick={()=>act(()=>controller.current.inspect(x.requestId))}>{new Date(x.createdAt).toLocaleString('vi-VN')} · {x.state==='COMPLETED'?'Hoàn tất':x.state==='REVIEW'?'Cần đối soát':'Chưa kết thúc'}</button>
    </li>)}</ul>{next&&<button type="button" disabled={state.busy} onClick={()=>loadHistory(next)}>Xem lượt cũ hơn</button>}</details>}
  </section>;
}
