import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {runtimeList,runtimeTurn,runLabels,deliveryLabels,readRuntimePending,saveRuntimePending,clearRuntimePending,runtimeCloseAck} from './careRuntimeState.mjs';
import {fieldLabels} from './careAdvisorState.mjs';
import {proposalList} from './surveyProposalState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const date=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa xác định';
const proposalLabels={OPEN:'Chờ khách xác nhận',BOOKED:'Đã lưu lịch khảo sát',REJECTED:'Không đặt được lịch',SUPERSEDED:'Đã thay bằng đề xuất khác'};
export default function CareRuntime({actorId,companyId,onOpenQueue}){
 return <Panel key={`${actorId}:${companyId}`} {...{actorId,companyId,onOpenQueue}}/>;
}
function Panel({actorId,companyId,onOpenQueue}){
 const[list,setList]=useState(null),[turn,setTurn]=useState(null),[survey,setSurvey]=useState(null),[pending,setPending]=useState(null);
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reason,setReason]=useState(''),[storageError,setStorageError]=useState(false);
 const alive=useRef(false),seq=useRef(0),locked=useRef(false),storage=useRef(null),saved=useRef(null);
 const current=n=>alive.current&&seq.current===n;
 const begin=()=>{locked.current=true;setBusy(true);setError('');setNotice('');return ++seq.current;};
 const done=n=>{if(current(n)){locked.current=false;setBusy(false);}};
 const hide=()=>{setTurn(null);setSurvey(null);setReason('');};
 useEffect(()=>{
  alive.current=true;
  try{storage.current=window.sessionStorage;saved.current=readRuntimePending(storage.current,actorId,companyId);setPending(saved.current);}
  catch{setStorageError(true);}
  void refresh();
  return()=>{alive.current=false;seq.current++;locked.current=false;};
 },[]);
 async function refresh(after=null){
  if(locked.current)return;const previous=list,n=begin();hide();if(!after)setList(null);
  try{
   const{data}=await api.get('/facebook/customer-care/runtime/turns',{params:{companyId,...(after?{after}:{})},timeout:15000});
   if(!current(n))return;const next=runtimeList(data,companyId);
   setList({...next,items:after?[...(previous?.items||[]),...next.items.filter(x=>!previous?.items.some(y=>y.request_id===x.request_id))]:next.items});
  }catch{if(current(n)){setList(null);hide();setError('Chưa đọc được lịch sử AI. Có thể chức năng chưa mở hoặc quyền truy cập đã thay đổi. Tải lại để kiểm tra.');}}
  finally{done(n);}
 }
 async function inspect(item){
  if(locked.current||!item.scope_available)return;const n=begin();hide();
  try{
   const{data}=await api.get('/facebook/customer-care/runtime/turn',{params:{companyId,requestId:item.request_id},timeout:15000});
   if(!current(n))return;const next=runtimeTurn(data,companyId,item);
   let latest=null;
   if(next.runtimeResult?.survey?.proposalId){
    const response=await api.get('/facebook/customer-care/survey/proposals',{params:{companyId,threadId:next.threadId},timeout:15000});
    if(!current(n))return;const view=proposalList(response.data,companyId,actorId,next.threadId);
    latest={asOf:view.asOf,proposal:view.items.find(p=>p.proposalId===next.runtimeResult.survey.proposalId)||null};
   }
   setTurn(next);setSurvey(latest);
  }catch{if(current(n)){hide();setList(null);setError('Chưa đối chiếu được lượt AI trong phạm vi hiện tại. Dữ liệu cũ đã được ẩn; yêu cầu đóng đang chờ vẫn được giữ.');}}
  finally{done(n);}
 }
 async function close(event){
  event?.preventDefault();if(locked.current||storageError)return;
  if(!saved.current){
   if(turn?.state!=='RUNNING'||reason.trim().length<20)return;
   try{saved.current=saveRuntimePending(storage.current,{actorId,companyId,threadId:turn.threadId,body:{companyId,requestId:crypto.randomUUID(),runtimeRequestId:turn.requestId,reason:reason.trim()}});setPending(saved.current);}
   catch{setStorageError(true);setError('Chưa lưu được yêu cầu trên trình duyệt. Chưa gửi thao tác đóng.');return;}
  }
  const p=saved.current,n=begin();hide();
  try{
   const{data}=await api.post('/facebook/customer-care/runtime/turn/close',p.body,{timeout:15000});
   if(!current(n))return;const ack=runtimeCloseAck(data,p);
   try{clearRuntimePending(storage.current,p);saved.current=null;setPending(null);}catch{setStorageError(true);throw Error('STORAGE_UNCLEARED');}
   setList(null);setNotice(ack.outcome==='CLOSED'?'Đã đóng lượt xử lý đang chờ. Kiểm tra hàng chờ người xử lý và đối soát phí AI.':'Lượt đã hoàn tất trước yêu cầu đóng. Kết quả và bằng chứng được giữ để đối chiếu.');
  }catch{if(current(n)){setList(null);setError('Chưa xác nhận được kết quả đóng. Giữ cùng yêu cầu để kiểm tra lại, kể cả sau khi tải lại trang.');}}
  finally{done(n);}
 }
 const result=turn?.result,history=turn?.runtimeResult,p=survey?.proposal;
 return <section className="h-full overflow-auto p-4 md:p-6 space-y-4" aria-label="Hoạt động AI chăm khách">
  <header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">Hoạt động AI</h2><p className="text-sm text-gray-600">Đối chiếu từng lượt tư vấn, gửi tin và đề xuất lịch.</p></div><button className={button} disabled={busy} onClick={()=>refresh()}>Tải lại hoạt động AI</button></header>
  <p className="text-sm text-gray-600">Danh sách là các lượt AI đã lưu, không phải số khách hợp lệ. Dữ liệu được cập nhật khi tải lại; việc xem lịch sử không bật AI hoặc gửi tin.</p>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  {storageError&&<p role="alert" className="text-sm text-red-800">Chưa xác minh được yêu cầu lưu trong trình duyệt. Thao tác đóng đang khóa; vẫn có thể đọc lịch sử.</p>}
  {pending&&<aside className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm"><p>Yêu cầu đóng lượt …{pending.body.runtimeRequestId.slice(-6)} chưa xác nhận. Đọc lại lịch sử không thay xác nhận đóng.</p><p>Lý do: {pending.body.reason}</p><button className={button} disabled={busy||storageError} onClick={close}>Kiểm tra lại cùng yêu cầu đóng</button></aside>}
  <div className="flex flex-wrap gap-2"><button className={button} onClick={onOpenQueue}>Mở hàng chờ người xử lý</button><a className={button} href="/crm/events/surveys">Xem hồ sơ bàn giao khảo sát</a></div>
  <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
   <aside className="rounded border bg-white p-3 space-y-2" aria-label="Danh sách lượt AI">
    {busy&&!list&&<p role="status">Đang tải…</p>}{list?.items.length===0&&<p>Chưa có lượt AI được ghi nhận trong công ty này.</p>}
    {list?.items.map(x=><button key={x.request_id} className={`${button} block w-full text-left ${turn?.requestId===x.request_id?'border-blue-600 bg-blue-50':''}`} disabled={busy||!x.scope_available} onClick={()=>inspect(x)}><strong>{runLabels[x.state]}</strong><span className="block">{date(x.created_at)}</span><span className="block text-xs text-gray-500">Lượt …{x.request_id.slice(-6)} · Hội thoại …{x.thread_id.slice(-6)}</span>{x.needs_reconciliation&&<span className="block text-amber-800">Quá thời gian xử lý; cần đối soát</span>}{!x.scope_available&&<span className="block text-amber-800">Cần kiểm tra phạm vi Page</span>}</button>)}
    {list?.nextAfter&&<button className={button} disabled={busy} onClick={()=>refresh(list.nextAfter)}>Xem lượt AI cũ hơn</button>}
   </aside>
   <article className="rounded border bg-white p-4 space-y-3 text-sm" aria-label="Chi tiết lượt AI">
    {!turn&&<p className="text-gray-500">Chọn một lượt để xem kết quả và bằng chứng.</p>}
    {turn&&<><h3 className="font-semibold">{runLabels[turn.state]} · {date(turn.createdAt)}</h3><p className="text-xs text-gray-500">Agent …{turn.principalId.slice(-6)} · Hội thoại …{turn.threadId.slice(-6)}</p>
     {(!turn.authorityCurrent||turn.stale)&&<p className="text-amber-800">Quyền hoặc ngữ cảnh đã thay đổi. Nội dung tư vấn được ẩn; bằng chứng bên dưới là lịch sử đã ghi nhận.</p>}
     {result?.text&&<><p className="whitespace-pre-wrap break-words">{result.text}</p><p className="break-words text-xs text-gray-500">Nguồn: {result.sourceReference}</p></>}
     {result?.needs?.map(x=><p key={x.field}><strong>{fieldLabels[x.field]}:</strong> “{x.quote}” <span className="text-gray-500">(lời khách, chưa xác minh)</span></p>)}
     {history?.handoff&&<p>Đã ghi nhận yêu cầu người xử lý tại thời điểm hoàn tất lượt. Hạn khi bàn giao: {date(history.humanDeadline)}. Xem hàng chờ để kiểm tra người tiếp quản hiện tại.</p>}
     {history?.operatorClosed&&<p>Lượt đã được đóng để đối soát.</p>}
     {history?.survey?.reason&&<p className="text-amber-800">Chưa tạo được đề xuất khảo sát trong điều kiện cho phép. Cần người phụ trách kiểm tra lịch, địa bàn, dữ liệu khách và quyền hiện tại.</p>}
     <div className="border-t pt-3 space-y-1"><h4 className="font-medium">Bằng chứng gửi câu tư vấn</h4>{turn.delivery?<><p>{deliveryLabels[turn.delivery.state]}</p><p>Nền tảng xác nhận nhận yêu cầu: {turn.delivery.acknowledged?'Có':'Chưa có'}. Ghi nhận tin từ Page: {turn.delivery.echoObserved?'Có':'Chưa có'}.</p><p className="text-gray-500">Các dấu nhận này không xác nhận khách đã đọc. Tin chưa rõ kết quả cần đối soát, không gửi lại từ đây.</p></>:<p>Chưa có bản ghi gửi câu tư vấn. Trạng thái này không kết luận về tin gửi qua cách khác.</p>}</div>
     {history?.survey?.proposalId&&<div className="border-t pt-3 space-y-1"><h4 className="font-medium">Đề xuất khảo sát của lượt này</h4><p className="text-gray-500">Kiểm tra lúc {date(survey?.asOf)}.</p>{!p?<p>Không có hồ sơ này trong 50 đề xuất gần nhất. Cần tra cứu lịch sử; chưa kết luận đã đặt lịch.</p>:!p.scopeReady?<p>Nội dung đề xuất đã ẩn do phạm vi dữ liệu thay đổi.</p>:<><p className="font-medium">{p.state==='OPEN'&&Date.parse(p.expiresAt)<=Date.now()?'Đề xuất đã hết hạn xác nhận':proposalLabels[p.state]}</p><p>{date(p.appointment.startsAt)} – {date(p.appointment.endsAt)} · {p.appointment.staffName||'Nhân sự khảo sát'}</p><p>{p.appointment.location}</p><p>Gửi đề xuất: {p.delivery.conflict?'Bằng chứng mâu thuẫn':p.delivery.state==='SENT'?'Meta đã nhận tin':p.delivery.state==='QUEUED'?'Đang chờ gửi':'Đang gửi hoặc cần đối soát'}.</p><p>{p.booking?'Đã lưu lịch; việc người khảo sát nhận bàn giao và hoàn tất được theo dõi riêng.':'Đề xuất chưa giữ chỗ; chỉ đặt khi khách xác nhận và giờ vẫn trống.'}</p></>}</div>}
     {turn.state==='RUNNING'&&<form onSubmit={close} className="border-t pt-3 space-y-2"><p>Đóng lượt đang chờ sẽ chặn ghi kết quả đến muộn. Không hủy lời gọi AI đang chạy, không hoàn phí và không hủy tin hoặc lịch đã phát sinh.</p><label className="block">Lý do đóng (ít nhất 20 ký tự)<textarea className="block w-full rounded border p-2" rows={3} maxLength={2000} value={reason} disabled={busy||!!pending||storageError} onChange={e=>setReason(e.target.value)}/></label><button className={button} disabled={busy||!!pending||storageError||reason.trim().length<20}>Đóng lượt xử lý đang chờ</button></form>}
    </>}
   </article>
  </div>
 </section>;
}
