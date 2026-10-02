import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {modes,labels,queueView,threadView,historyView,readPending,savePending,clearPending,controlAck,controlPayload} from './careConsoleState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const date=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có';
const reasons={REQUEST_HUMAN:'Khách yêu cầu gặp nhân viên',OUTBOUND_ECHO:'Có tin gửi đi; cần xác nhận người xử lý',OPT_OUT:'Đã ghi nhận ngừng liên hệ',TAKEOVER:'Nhân viên đã tiếp quản'};

export default function FacebookCustomerCareConsole({companyId,actorId}){
 if(!companyId||!actorId)return <p className="p-6 text-sm text-gray-600">Chọn một công ty để xem và xử lý hội thoại chăm khách.</p>;
 return <CareSession key={`${actorId}:${companyId}`} companyId={companyId} actorId={actorId}/>;
}
function CareSession({companyId,actorId}){
 const [mode,setMode]=useState('HUMAN_REQUESTED'),[queue,setQueue]=useState(null),[detail,setDetail]=useState(null),[messages,setMessages]=useState([]),[before,setBefore]=useState(null);
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(null),[storageError,setStorageError]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [action,setAction]=useState('TAKEOVER'),[reason,setReason]=useState('');
 const alive=useRef(false),locked=useRef(false),saved=useRef(null),storage=useRef(null),request=useRef(0);
 useEffect(()=>{
  alive.current=true;
  try{storage.current=window.sessionStorage;saved.current=readPending(storage.current,actorId,companyId);setPending(saved.current);}catch{setStorageError(true);setError('Không đọc được yêu cầu chưa xác nhận trên trình duyệt. Thao tác thay đổi đang bị khóa để kiểm tra.');}
  void loadQueue('HUMAN_REQUESTED');
  return()=>{alive.current=false;request.current+=1;locked.current=false;};
 },[]);
 const begin=()=>{locked.current=true;setBusy(true);setError('');setNotice('');return ++request.current;};
 const current=n=>alive.current&&request.current===n;
 const finish=n=>{if(current(n)){locked.current=false;setBusy(false);}};
 const hideDetail=()=>{setDetail(null);setMessages([]);setBefore(null);setReason('');};
 async function loadQueue(nextMode=mode,cursor=null){
  if(locked.current)return;
  const n=begin();if(!cursor){setQueue(null);hideDetail();setMode(nextMode);}
  try{
   const {data}=await api.get('/facebook/customer-care/queue',{params:{companyId,mode:nextMode,...(cursor?{after:cursor.id,afterVersion:cursor.version,queueVersion:cursor.queueVersion}:{})},timeout:15000});
   if(!current(n))return;const view=queueView(data,companyId,nextMode);
   setQueue(old=>({...view,items:cursor?[...(old?.items||[]),...view.items.filter(x=>!old?.items.some(y=>y.id===x.id))]:view.items}));
  }catch(e){if(current(n)){setQueue(null);hideDetail();setError(e.response?.status===409?'Hàng chờ đã thay đổi. Tải lại để xem đúng thứ tự xử lý.':'Chưa tải được hàng chờ. Số liệu hiện chưa xác định; hãy tải lại.');}}
  finally{finish(n);}
 }
 async function openThread(threadId){
  if(locked.current||saved.current)return;const n=begin();hideDetail();
  try{
   const {data}=await api.get('/facebook/customer-care/thread',{params:{companyId,threadId},timeout:15000});
   if(!current(n))return;const view=threadView(data,companyId,threadId);setDetail(view);setMessages(view.messages);setBefore(view.historyTruncated?view.messages[0]?.id:null);setAction('TAKEOVER');
  }catch{if(current(n))setError('Chưa đọc được hội thoại trong phạm vi hiện tại. Tải lại hàng chờ để kiểm tra.');}finally{finish(n);}
 }
 async function older(){
  if(locked.current||saved.current||!detail||!before)return;const n=begin(),snapshot=detail;
  try{
   const {data}=await api.get('/facebook/customer-care/history',{params:{companyId,threadId:snapshot.threadId,before,version:snapshot.version},timeout:15000});
   if(!current(n))return;const view=historyView(data,companyId,snapshot.threadId,snapshot.version,new Set(messages.map(x=>x.id)));setMessages(old=>[...view.messages,...old]);setBefore(view.nextBefore);
  }catch(e){if(current(n)){if(e.response?.status===409||e.response?.status===403)hideDetail();setError('Chưa tải được lịch sử hoặc hội thoại đã thay đổi. Mở lại hội thoại để kiểm tra.');}}finally{finish(n);}
 }
 async function control(event){
  event?.preventDefault();if(locked.current||storageError)return;
  if(!saved.current){
   if(!detail||detail.mode==='OPTED_OUT'||reason.trim().length<20)return;
   try{saved.current=savePending(storage.current,{actorId,companyId,requestId:crypto.randomUUID(),command:{threadId:detail.threadId,expectedVersion:detail.version,action,reason:reason.trim()}});setPending(saved.current);}catch{setStorageError(true);setError('Chưa lưu được yêu cầu trên trình duyệt. Chưa gửi thay đổi đến hệ thống.');return;}
  }
  const payload=saved.current,n=begin();
  try{
   const {data}=await api.post('/facebook/customer-care/control',controlPayload(payload),{timeout:15000});
   if(!current(n))return;controlAck(data,payload);clearPending(storage.current,actorId,companyId);saved.current=null;setPending(null);hideDetail();setQueue(null);
   setNotice('Đã xác nhận kết quả. Tải lại hàng chờ để xem trạng thái mới nhất.');
  }catch(e){if(current(n)){
   if([400,409].includes(e.response?.status)){
    try{clearPending(storage.current,actorId,companyId);saved.current=null;setPending(null);}catch{setStorageError(true);}
    hideDetail();setQueue(null);setError('Yêu cầu không được xác nhận do dữ liệu đã thay đổi hoặc không hợp lệ. Tải lại và kiểm tra trước khi thao tác tiếp.');
   }else{
    if(e.response?.status===403){hideDetail();setQueue(null);}
    setError('Chưa xác nhận được kết quả. Gửi lại cùng yêu cầu để kiểm tra; không tạo thao tác mới.');
   }
  }}finally{finish(n);}
 }
 const writeLocked=busy||!!pending||storageError;
 return <section className="h-full overflow-auto p-4 md:p-6 space-y-4" aria-label="Chăm khách có kiểm soát">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Chăm khách</h2><p className="text-sm text-gray-600">Xem nhu cầu, tiếp quản và theo dõi yêu cầu của khách.</p></div><button className={button} disabled={busy||!!pending} onClick={()=>loadQueue()}>Tải lại hàng chờ</button></header>
  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">AI và gửi tin từ hệ thống chưa được mở trên Page thử nghiệm. Tiếp quản ở đây chỉ ghi nhận người nhận xử lý.</p>
  {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  {storageError&&<p role="alert" className="text-sm text-red-800">Cần kiểm tra yêu cầu đã lưu trên trình duyệt trước khi thực hiện thay đổi khác.</p>}
  {pending&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2"><p className="text-sm">Có yêu cầu {pending.command.action==='TAKEOVER'?'tiếp quản':'ngừng liên hệ'} chưa xác nhận kết quả, hội thoại …{pending.command.threadId.slice(-6)}. Yêu cầu được giữ khi tải lại trang trong phiên trình duyệt này.</p><button className={button} disabled={busy||storageError} onClick={control}>{busy?'Đang xác nhận…':'Gửi lại cùng yêu cầu'}</button></div>}
  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tổng số hội thoại theo trạng thái">{modes.map(m=><button key={m} className={`rounded-lg border p-3 text-left ${mode===m?'border-blue-600 bg-blue-50':'bg-white'} disabled:opacity-50`} disabled={busy||!!pending} onClick={()=>loadQueue(m)} aria-pressed={mode===m}><span className="block text-sm">{labels[m]}</span><strong className="text-2xl">{queue?queue.counts[m]:'—'}</strong></button>)}</div>
  <p className="text-xs text-gray-500">Đếm hội thoại của công ty, không phải số khách hợp lệ không trùng. {queue?`Cập nhật lúc ${date(queue.observedAt)}.`:'Chưa có số liệu đã xác nhận.'}</p>
  {queue?.unavailableCount>0&&<p className="text-sm text-amber-800">{queue.unavailableCount} hội thoại cần kiểm tra lại phạm vi Page; nội dung chưa được mở.</p>}
  <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
   <aside className="rounded-lg border bg-white p-3 space-y-2" aria-label="Hàng chờ hội thoại"><h3 className="font-semibold">{labels[mode]}</h3>{mode==='HUMAN_REQUESTED'&&<p className="text-xs text-gray-500">Xếp theo hạn cần phản hồi sớm nhất.</p>}
    {busy&&!queue&&<p role="status">Đang tải…</p>}{queue?.items.length===0&&<p className="text-sm text-gray-500">Không có hội thoại ở trạng thái này.</p>}
    {queue?.items.map(x=><button key={x.id} className={`w-full rounded border p-3 text-left text-sm ${detail?.threadId===x.id?'border-blue-600 bg-blue-50':''} disabled:opacity-50`} disabled={busy||!!pending||!x.scope_available} onClick={()=>openThread(x.id)}><strong>Hội thoại …{x.id.slice(-6)}</strong><span className="block text-xs text-gray-500">Page {x.page_id} · Tin mới: {date(x.last_message_at)}</span><span className="block">{reasons[x.reason]||labels[x.mode]}</span>{x.human_deadline&&<span className={`block ${Date.parse(x.human_deadline)<Date.now()?'text-red-700':'text-amber-800'}`}>Hạn phản hồi: {date(x.human_deadline)}</span>}{!x.scope_available&&<span className="block text-red-700">Cần kiểm tra phạm vi Page</span>}</button>)}
    {queue?.nextCursor&&<button className={button} disabled={busy||!!pending} onClick={()=>loadQueue(mode,queue.nextCursor)}>Xem thêm hội thoại</button>}
   </aside>
   <article className="min-w-0 rounded-lg border bg-white p-4 space-y-4" aria-label="Chi tiết hội thoại">
    {!detail&&<p className="text-sm text-gray-500">Chọn hội thoại để xem nhu cầu và người phụ trách.</p>}
    {detail&&<><header><h3 className="font-semibold">{detail.target.leadTitle||`Hội thoại …${detail.threadId.slice(-6)}`}</h3><p className="text-sm">Trạng thái: <strong>{labels[detail.mode]}</strong></p><p className="text-sm">Người phụ trách CRM: {detail.target.routingReady?(detail.target.ownerName||'Đã có phân công trong CRM'):'Chưa xác nhận được người nhận'}</p>{detail.target.regionName&&<p className="text-sm">Khu vực: {detail.target.regionName}</p>}{!detail.target.routingReady&&<p className="text-sm text-amber-800">Cần rà liên kết hồ sơ và phân công CRM trước khi bàn giao khảo sát.</p>}{detail.claimedBy===actorId&&<p className="text-sm text-green-800">Bạn đã tiếp quản hội thoại này.</p>}{detail.humanDeadline&&<p className="text-sm">Hạn phản hồi: {date(detail.humanDeadline)} (giờ Việt Nam)</p>}</header>
    <div className="space-y-3" aria-label="Lịch sử trao đổi"><p className="text-xs text-gray-500">Đã tải {messages.length}/{detail.messageCount} tin. Nội dung dưới đây là lời khách và tin từ Page.</p>{before&&<button className={button} disabled={writeLocked} onClick={older}>Xem tin cũ hơn</button>}{messages.map(m=><div key={m.id} className={`rounded-lg p-3 ${m.direction==='inbound'?'bg-gray-100':'bg-blue-50'}`}><p className="text-xs text-gray-500">{m.direction==='inbound'?'Khách':'Page — chưa xác định người gửi'} · {date(m.sent_at)}</p><p className="whitespace-pre-wrap break-words text-sm">{m.content||'(Tin không có văn bản)'}</p>{m.attachments.length>0&&<p className="text-xs text-gray-600">Có {m.attachments.length} tệp đính kèm; nội dung tệp chưa được tải.</p>}</div>)}</div>
    {detail.mode==='OPTED_OUT'?<p className="rounded bg-red-50 p-3 text-sm text-red-800">Khách đã ngừng nhận liên hệ. Không mở lại chăm sóc từ màn hình này.</p>:<form onSubmit={control} className="border-t pt-4 space-y-3" aria-label="Tiếp quản hoặc ngừng liên hệ"><label className="block text-sm">Thao tác<select value={action} onChange={e=>setAction(e.target.value)} disabled={writeLocked} className="mt-1 block rounded border p-2"><option value="TAKEOVER">Tôi nhận xử lý hội thoại</option><option value="OPT_OUT">Ghi nhận ngừng liên hệ</option></select></label><label className="block text-sm">Ghi chú xử lý (ít nhất 20 ký tự)<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} rows={3} disabled={writeLocked} className="mt-1 block w-full rounded border p-2"/></label><button className={`${button} bg-blue-600 text-white`} disabled={writeLocked||reason.trim().length<20}>{busy?'Đang lưu…':action==='TAKEOVER'?'Xác nhận tôi tiếp quản':'Xác nhận ngừng liên hệ'}</button></form>}
    </>}
   </article>
  </div>
 </section>;
}
