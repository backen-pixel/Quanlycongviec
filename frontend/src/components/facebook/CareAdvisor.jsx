import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {advisorList,advisorDraft,canGenerate,canRetry,labels,fieldLabels,readAdvisorPending,saveAdvisorPending,clearAdvisorPending,cancellationAck} from './careAdvisorState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const date=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa xác định';
const outcomes={ABSENT_CANCELLED:'Đã hủy yêu cầu chưa bắt đầu và chặn yêu cầu cũ đến muộn.',CLOSED:'Đã đóng lượt chờ và chặn kết quả đến muộn. Việc đóng không xác nhận AI đã ngừng xử lý hoặc không phát sinh phí.',ALREADY_TERMINAL:'Lượt này đã có kết quả trước khi hủy. Kết quả được giữ để đối chiếu.'};
export default function CareAdvisor({actorId,companyId,threadId,disabled=false}){
 if(!actorId||!companyId||!threadId)return null;
 return <Panel key={`${actorId}:${companyId}:${threadId}`} {...{actorId,companyId,threadId,disabled}}/>;
}
function Panel({actorId,companyId,threadId,disabled}){
 const[view,setView]=useState(null),[draft,setDraft]=useState(null),[pending,setPending]=useState(null),[busy,setBusy]=useState(false);
 const[error,setError]=useState(''),[notice,setNotice]=useState(''),[reason,setReason]=useState(''),[storageError,setStorageError]=useState(false);
 const alive=useRef(false),seq=useRef(0),locked=useRef(false),storage=useRef(null),saved=useRef(null),disabledRef=useRef(disabled);
 disabledRef.current=disabled;
 const current=n=>alive.current&&!disabledRef.current&&seq.current===n;
 const begin=()=>{locked.current=true;setBusy(true);setError('');return ++seq.current;};
 const done=n=>{if(current(n)){locked.current=false;setBusy(false);}};
 useEffect(()=>{
  alive.current=true;
  try{storage.current=window.sessionStorage;saved.current=readAdvisorPending(storage.current,actorId,companyId,threadId);setPending(saved.current);}
  catch{setStorageError(true);setError('Chưa đọc được yêu cầu đang chờ trong phiên trình duyệt. Thao tác mới đang khóa để kiểm tra.');}
  return()=>{alive.current=false;seq.current++;locked.current=false;};
 },[]);
 useEffect(()=>{seq.current++;locked.current=false;setBusy(false);setView(null);setDraft(null);if(!disabled)void refresh();},[disabled]);
 async function refresh(after=null){
  if(locked.current||disabledRef.current)return;
  const previous=view,n=begin();setDraft(null);if(!after)setView(null);
  try{
   const{data}=await api.get('/facebook/customer-care/advisor/drafts',{params:{companyId,threadId,...(after?{after}:{})},timeout:15000});
   if(!current(n))return;const next=advisorList(data,companyId,threadId);
   if(after&&previous?.version!==next.version)throw Error('CHANGED');
   setView({...next,items:after?[...(previous?.items||[]),...next.items.filter(x=>!previous?.items.some(y=>y.requestId===x.requestId))]:next.items});
  }catch{if(current(n)){setView(null);setDraft(null);setError('Chưa tải được trạng thái tư vấn. Thông tin cũ đã được ẩn; tải lại để kiểm tra.');}}
  finally{done(n);}
 }
 function clearSaved(p){
  try{clearAdvisorPending(storage.current,p);saved.current=null;setPending(null);}
  catch{setStorageError(true);throw Error('PENDING_UNCLEARED');}
 }
 async function inspect(requestId){
  if(locked.current||disabledRef.current)return;const n=begin();setDraft(null);
  try{
   const{data}=await api.get('/facebook/customer-care/advisor/draft',{params:{companyId,requestId},timeout:15000});
   if(!current(n))return;const next=advisorDraft(data,companyId,threadId,requestId);
   // A read proves BEGIN exists, but does not settle an unacknowledged CANCEL.
   if(saved.current&&saved.current.body.requestId===requestId&&saved.current.operation!=='cancel')clearSaved(saved.current);
   setDraft(next);
  }catch{if(current(n)){setDraft(null);setView(null);setError('Chưa đối chiếu được lượt này. Giữ yêu cầu đang chờ; có thể đọc lại hoặc hủy có xác nhận.');}}
  finally{done(n);}
 }
 function persist(operation,body,previous=null){
  try{const p=saveAdvisorPending(storage.current,{actorId,companyId,threadId,operation,body},previous);saved.current=p;setPending(p);return p;}
  catch{setStorageError(true);setError('Chưa lưu được yêu cầu trong phiên này. Chưa gửi thao tác mới.');return null;}
 }
 async function submit(p){
  if(!p||locked.current||disabledRef.current||storageError)return;
  const n=begin();setDraft(null);setNotice('');
  const path=p.operation==='generate'?'/facebook/customer-care/advisor/draft':`/facebook/customer-care/advisor/draft/${p.operation}`;
  try{
   const{data}=await api.post(path,p.body,{timeout:45000});
   if(!current(n))return;
   if(p.operation==='cancel'){
    const ack=cancellationAck(data,p);clearSaved(p);setView(null);setNotice(outcomes[ack.outcome]);setReason('');
   }else{
    const next=advisorDraft(data,companyId,threadId,p.body.requestId);clearSaved(p);setDraft(next);setView(null);
    setNotice('Đã lưu kết quả đề xuất. Chưa gửi nội dung cho khách.');
   }
  }catch{if(current(n)){setView(null);setDraft(null);setError('Chưa xác nhận được kết quả. Yêu cầu được giữ để đối chiếu; không tạo lượt mới.');}}
  finally{done(n);}
 }
 function generate(){
  if(locked.current||disabledRef.current||saved.current||storageError||!canGenerate(view))return;
  void submit(persist('generate',{companyId,requestId:crypto.randomUUID(),threadId,version:view.version}));
 }
 function retry(){
  if(locked.current||disabledRef.current||saved.current||storageError||!canGenerate(view)||!canRetry(draft)||reason.trim().length<20)return;
  void submit(persist('retry',{companyId,requestId:crypto.randomUUID(),previousRequestId:draft.requestId,version:view.version,reason:reason.trim()}));
 }
 function cancel(){
  if(locked.current||disabledRef.current||storageError)return;
  if(saved.current?.operation==='cancel'){void submit(saved.current);return;}
  const requestId=saved.current?.body.requestId||(draft?.state==='RUNNING'?draft.requestId:null);
  if(!requestId||reason.trim().length<20)return;
  void submit(persist('cancel',{companyId,requestId,threadId,reason:reason.trim()},saved.current));
 }
 const writeLocked=disabled||busy||storageError;
 const mayCancel=!!pending||draft?.state==='RUNNING';
 return <section className="space-y-3 border-t pt-4" aria-label="Đề xuất tư vấn">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Đề xuất tư vấn</h3><button className={button} disabled={busy||disabled} onClick={()=>refresh()}>Tải trạng thái tư vấn</button></div>
  <p className="text-sm text-gray-600">Xem nội dung từ thư viện đã duyệt và nhu cầu kèm lời khách. Bản đề xuất chưa được gửi cho khách; nhu cầu trích ra chưa được xác minh.</p>
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {storageError&&<p role="alert" className="text-sm text-red-800">Cần kiểm tra yêu cầu lưu trong trình duyệt trước khi thực hiện thao tác mới.</p>}
  {pending&&<div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"><p>Có yêu cầu chưa xác nhận kết quả trong phiên này. Tải lại trang sẽ giữ cùng yêu cầu.</p>
   <button className={button} disabled={busy||disabled||storageError} onClick={()=>inspect(pending.body.requestId)}>Đối chiếu yêu cầu đang chờ</button>
   {pending.operation!=='cancel'&&<button className={button} disabled={writeLocked||!view?.generationAvailable} onClick={()=>submit(saved.current)}>Tiếp tục cùng yêu cầu</button>}
   {pending.operation==='cancel'&&<p>Đang chờ xác nhận hủy. Đọc kết quả không thay xác nhận hủy.</p>}
  </div>}
  {view&&<>
   {!view.generationAvailable&&<p className="rounded bg-amber-50 p-3 text-sm">Chưa mở chức năng tạo đề xuất tư vấn. Vẫn có thể đọc và đối soát các lượt đã lưu.</p>}
   {view.careMode!=='WAITING'&&<p className="text-sm text-amber-800">Khách đã ngừng liên hệ hoặc hội thoại cần người xử lý. Không tạo đề xuất mới.</p>}
   {!view.routingReady&&<p className="text-sm text-amber-800">Cần xác nhận hồ sơ và người phụ trách CRM trước.</p>}
   {view.historyTruncated&&<p className="text-sm text-amber-800">Hội thoại dài cần chuẩn bị thêm ngữ cảnh trước khi đề xuất.</p>}
   {view.threadBusy&&<p className="text-sm text-amber-800">Có lượt đang xử lý hoặc cần đối soát trong hội thoại này.</p>}
   <button className={`${button} bg-blue-700 text-white`} disabled={writeLocked||!!pending||!canGenerate(view)} onClick={generate}>Tạo bản đề xuất tư vấn</button>
   <div className="space-y-2" aria-label="Các lượt tư vấn của bạn"><h4 className="text-sm font-medium">Các lượt của bạn trong hội thoại</h4>
    {!view.items.length&&<p className="text-sm text-gray-500">Chưa có lượt đã lưu của bạn.</p>}
    {view.items.map(x=><button key={x.requestId} className={`${button} block w-full text-left`} disabled={busy||disabled} onClick={()=>inspect(x.requestId)}>
     {labels[x.state]} · {date(x.createdAt)} · Lần {x.attempt}{x.needsReconciliation?' · Cần đối soát':''}
    </button>)}
    {view.nextAfter&&<button className={button} disabled={busy||disabled} onClick={()=>refresh(view.nextAfter)}>Xem lượt cũ hơn</button>}
   </div>
  </>}
  {draft&&<article className="space-y-2 rounded border p-3 text-sm" aria-label="Bản tư vấn đang xem">
   <p className="font-medium">{labels[draft.state]} · Lần {draft.attempt}</p>
   {draft.stale?<p className="text-amber-800">Thông tin hoặc trạng thái khách đã thay đổi. Nội dung cũ được ẩn.</p>:<>
    {draft.result?.text&&<><p className="whitespace-pre-wrap break-words">{draft.result.text}</p><p className="break-words text-xs text-gray-600">Nguồn: {draft.result.sourceReference}</p></>}
    {draft.result?.action==='HANDOFF'&&<p>Đề nghị người phụ trách xem xét; hệ thống chưa tự chuyển hoặc gửi tin.</p>}
    {draft.result?.needs?.map(n=><p key={n.field}><strong>{fieldLabels[n.field]}:</strong> “{n.quote}” <span className="text-xs text-gray-500">(tin …{n.messageId.slice(-6)}, chưa xác minh)</span></p>)}
    {draft.state==='FAILED'&&<p>Chưa tạo được đề xuất. Kiểm tra điều kiện trước khi yêu cầu thử lại.</p>}
    {draft.result?.reason==='OPERATOR_CLOSED'&&<p>Lượt đã được đóng để đối soát. Không đồng nghĩa AI đã ngừng xử lý hoặc không có phí.</p>}
    {draft.result?.reason==='EXPIRED'&&<p>Lượt xử lý đã quá thời gian; kết quả không được dùng làm câu trả lời.</p>}
   </>}
   {draft.state==='RUNNING'&&<button className={button} disabled={busy||disabled} onClick={()=>inspect(draft.requestId)}>Đọc lại kết quả</button>}
  </article>}
  {(mayCancel||canRetry(draft))&&<div className="space-y-2">
   <label className="block text-sm">Lý do đối soát hoặc thử lại (ít nhất 20 ký tự)<textarea className="mt-1 block w-full rounded border p-2" value={pending?.operation==='cancel'?pending.body.reason:reason} maxLength={2000} disabled={writeLocked||pending?.operation==='cancel'} onChange={e=>setReason(e.target.value)}/></label>
   {mayCancel&&<button className={button} disabled={writeLocked||(pending?.operation!=='cancel'&&reason.trim().length<20)} onClick={cancel}>{pending?.operation==='cancel'?'Xác nhận lại việc hủy':'Hủy lượt chờ và chặn kết quả muộn'}</button>}
   {!pending&&canRetry(draft)&&<button className={button} disabled={writeLocked||!canGenerate(view)||reason.trim().length<20} onClick={retry}>Yêu cầu thử lại một lần</button>}
  </div>}
 </section>;
}
