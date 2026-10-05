import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {connectionChoices,connectionView,readConnectionPending,saveConnectionPending,closeConnectionPending,clearConnectionPending,connectionReceipt,connectionClosure} from './careConnectionState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const date=x=>new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export default function CareConnections({companyId,actorId,threadId,disabled=false,onRefresh}){
 if(!companyId||!actorId||!threadId)return null;
 return <Panel key={`${actorId}:${companyId}:${threadId}`} {...{companyId,actorId,threadId,disabled,onRefresh}}/>;
}
function Panel({companyId,actorId,threadId,disabled,onRefresh}){
 const[search,setSearch]=useState(''),[choices,setChoices]=useState(null),[view,setView]=useState(null),[evidence,setEvidence]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
 const[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[storageError,setStorageError]=useState(false);
 const alive=useRef(false),locked=useRef(false),sequence=useRef(0),saved=useRef(null),storage=useRef(null),disabledNow=useRef(disabled);
 disabledNow.current=disabled;
 useEffect(()=>{
  alive.current=true;
  try{storage.current=window.sessionStorage;saved.current=readConnectionPending(storage.current,actorId,companyId,threadId);setPending(saved.current);}
  catch{setStorageError(true);setError('Chưa đọc được yêu cầu đang lưu. Cần kiểm tra trước khi thay đổi liên kết.');}
  return()=>{alive.current=false;sequence.current++;locked.current=false;};
 },[]);
 useEffect(()=>{if(disabled){sequence.current++;locked.current=false;setBusy(false);setChoices(null);setView(null);setEvidence('');setConfirmed(false);}},[disabled]);
 const current=n=>alive.current&&!disabledNow.current&&sequence.current===n;
 const begin=()=>{locked.current=true;setBusy(true);setError('');setNotice('');return++sequence.current;};
 const done=n=>{if(current(n)){locked.current=false;setBusy(false);}};
 const resetSelection=()=>{setView(null);setEvidence('');setReason('');setConfirmed(false);};
 async function find(event){
  event.preventDefault();if(disabled||locked.current||saved.current||storageError||search.trim().length<2)return;
  const term=search.trim(),n=begin();setChoices(null);resetSelection();
  try{const{data}=await api.get('/facebook/customer-care/connection/choices',{params:{companyId,threadId,search:term},timeout:15000});
   if(current(n))setChoices(connectionChoices(data,actorId,companyId,threadId,term));
  }catch{if(current(n)){setChoices(null);resetSelection();setError('Chưa tìm được hồ sơ trong phạm vi hiện tại. Hãy kiểm tra quyền và thử lại.');}}finally{done(n);}
 }
 async function select(leadId){
  if(disabled||locked.current||saved.current||storageError)return;const n=begin();resetSelection();
  try{const{data}=await api.get('/facebook/customer-care/connection',{params:{companyId,threadId,leadId},timeout:15000});
   if(current(n))setView(connectionView(data,actorId,companyId,threadId,leadId));
  }catch{if(current(n)){setChoices(null);resetSelection();setError('Chưa đọc được hồ sơ và bằng chứng hiện hành. Tìm lại để kiểm tra.');}}finally{done(n);}
 }
 function forget(p){clearConnectionPending(storage.current,p);saved.current=null;setPending(null);setChoices(null);resetSelection();}
 async function submit(event){
  event?.preventDefault();if(disabled||locked.current||storageError)return;
  if(!saved.current){
   const message=view?.messages.find(m=>m.id===evidence&&m.text.trim());
   if(!view?.canLink||view.mappingComplete||!message||!confirmed||reason.trim().length<20)return;
   try{saved.current=saveConnectionPending(storage.current,{actorId,companyId,threadId,requestId:crypto.randomUUID(),intent:'LINK',
    command:{threadId,leadId:view.leadId,expectedVersion:view.version,evidenceMessageId:evidence,identityConfirmed:true,reason:reason.trim()}});setPending(saved.current);}
   catch{setStorageError(true);setError('Chưa lưu được yêu cầu trong phiên trình duyệt. Chưa gửi liên kết.');return;}
  }
  if(saved.current.intent==='CLOSE')return closeRequest();
  const p=saved.current,n=begin();
  try{const{data}=await api.post('/facebook/customer-care/connection/link',{companyId:p.companyId,requestId:p.requestId,command:p.command},{timeout:15000});
   if(!current(n))return;const result=connectionReceipt(data,p);forget(p);
   setNotice(result.currentLink?'Đã xác nhận liên kết được lưu. Cập nhật hội thoại để xem người phụ trách; thao tác này không mở gửi tin.':'Yêu cầu đã được ghi trước đây; liên kết hiện tại cần kiểm tra lại. Cập nhật hội thoại trước khi làm tiếp.');
  }catch(e){if(current(n)){
   setChoices(null);resetSelection();
   if(e.response?.status===409&&e.response?.data?.reason==='REQUEST_CANCELLED'){
    try{forget(p);setNotice('Yêu cầu này đã được kết thúc trước khi ghi liên kết. Có thể tìm lại hồ sơ.');}
    catch{setStorageError(true);setError('Đã có kết quả nhưng chưa xóa được yêu cầu đã lưu. Cần đối chiếu lại.');}
   }else setError('Chưa xác nhận được kết quả. Giữ cùng yêu cầu để kiểm tra lại, hoặc đối chiếu và kết thúc yêu cầu trước khi chọn hồ sơ khác.');
  }}finally{done(n);}
 }
 async function closeRequest(){
  if(disabled||locked.current||storageError||!saved.current)return;
  try{saved.current=closeConnectionPending(storage.current,saved.current);setPending(saved.current);}
  catch{setStorageError(true);setError('Chưa lưu được ý định kết thúc yêu cầu. Chưa gửi thay đổi.');return;}
  const p=saved.current,n=begin();setChoices(null);resetSelection();
  try{const{data}=await api.post('/facebook/customer-care/connection/close',{companyId:p.companyId,requestId:p.requestId,command:p.command},{timeout:15000});
   if(!current(n))return;const result=connectionClosure(data,p);forget(p);
   setNotice(result.status==='CANCELLED'?'Đã kết thúc yêu cầu chưa ghi. Yêu cầu cũ đến muộn sẽ không tạo liên kết. Có thể tìm lại hồ sơ.':'Liên kết đã được ghi trước khi đối chiếu và được giữ nguyên. Cập nhật hội thoại để kiểm tra.');
  }catch{if(current(n))setError('Chưa xác nhận được việc kết thúc yêu cầu. Tiếp tục đối chiếu cùng yêu cầu; chưa chọn hồ sơ mới.');}finally{done(n);}
 }
 const blocked=disabled||busy||!!pending||storageError;
 return <section aria-label="Đối chiếu hồ sơ khách" className="space-y-3 border-t pt-4">
  <h3 className="font-semibold">Đối chiếu hồ sơ khách</h3>
  <p className="text-sm text-gray-600">Tìm khách đã có trong CRM, đọc thông tin và chọn tin nhắn làm bằng chứng. Kết quả tìm kiếm chưa xác nhận hai hồ sơ là cùng người.</p>
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
  {notice&&<div role="status" className="space-y-2 rounded border border-green-200 bg-green-50 p-3 text-sm"><p>{notice}</p>{onRefresh&&<button className={button} disabled={disabled||busy||!!pending} onClick={onRefresh}>Cập nhật thông tin hội thoại</button>}</div>}
  {pending&&<div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
   <p>{pending.intent==='CLOSE'?'Đang đối chiếu để kết thúc yêu cầu. Chưa tạo liên kết mới.':'Có yêu cầu liên kết chưa xác nhận kết quả; yêu cầu được giữ khi tải lại trang trong phiên này.'}</p>
   {pending.intent==='LINK'&&<button className={button} disabled={disabled||busy||storageError} onClick={submit}>Kiểm tra lại cùng yêu cầu</button>}
   <button className={button} disabled={disabled||busy||storageError} onClick={closeRequest}>{pending.intent==='CLOSE'?'Kiểm tra việc kết thúc yêu cầu':'Đối chiếu và kết thúc yêu cầu'}</button>
   <p className="text-xs text-gray-600">Liên kết đã ghi trước đó sẽ được giữ nguyên. Yêu cầu chưa ghi được khóa để không chạy sau khi đã kết thúc.</p>
  </div>}
  <form onSubmit={find} className="flex flex-wrap items-end gap-2">
   <label className="grow text-sm">Tên khách, số điện thoại hoặc mã hồ sơ<input className="mt-1 block w-full rounded border p-2" value={search} onChange={e=>setSearch(e.target.value)} minLength={2} maxLength={100} disabled={blocked}/></label>
   <button className={button} disabled={blocked||search.trim().length<2}>{busy?'Đang kiểm tra…':'Tìm hồ sơ'}</button>
  </form>
  {!disabled&&choices&&<div aria-label="Kết quả tìm hồ sơ" className="space-y-2">
   {choices.items.length===0&&<p className="text-sm text-gray-500">Chưa có hồ sơ phù hợp trong phạm vi được phép. Kiểm tra lại tên, số điện thoại hoặc mã hồ sơ.</p>}
   {choices.hasMore&&<p className="text-sm text-amber-800">Có nhiều kết quả; đang hiển thị 20 hồ sơ. Nhập thêm thông tin để thu hẹp.</p>}
   {choices.items.map(i=><button key={i.id} className={`${button} block w-full text-left ${view?.leadId===i.id?'border-blue-600 bg-blue-50':''}`} disabled={blocked} onClick={()=>select(i.id)}>
    <strong>{i.customerName}</strong><span className="block">{i.code?i.code+' · ':''}{i.title}</span>
    <span className="block text-xs text-gray-600">{i.phone||'Chưa có số điện thoại'} · {i.ownerName||'Đã có người phụ trách'}{i.regionName?' · '+i.regionName:''}</span>
   </button>)}
  </div>}
  {!disabled&&view&&<div className="space-y-3 rounded border p-3">
   <p className="text-sm"><strong>{view.lead.customerName}</strong> · {view.lead.phone||'Chưa có số điện thoại'}<br/>{view.lead.title}</p>
   {!view.canLink?<p role="alert" className="text-sm text-amber-800">Có liên kết khác cần rà lại. Không thể ghi đè từ màn hình này.</p>:view.mappingComplete?<p className="text-sm text-green-800">Hội thoại đã nối đầy đủ với hồ sơ này. Không cần tạo thêm yêu cầu.</p>:<form onSubmit={submit} className="space-y-3">
    <fieldset disabled={blocked}><legend className="text-sm font-medium">Chọn tin khách cung cấp để đối chiếu danh tính</legend>
     {view.messages.filter(m=>m.text.trim()).map(m=><label key={m.id} className="my-2 flex items-start gap-2 rounded bg-gray-50 p-2 text-sm"><input type="radio" name="care-connection-evidence" value={m.id} checked={evidence===m.id} onChange={()=>setEvidence(m.id)}/><span><span className="block text-xs text-gray-500">{date(m.sentAt)}</span><span className="whitespace-pre-wrap break-words">{m.text}</span></span></label>)}
     {!view.messages.some(m=>m.text.trim())&&<p className="text-sm text-amber-800">Chưa có tin nhắn văn bản để làm bằng chứng; chưa thể xác nhận liên kết.</p>}
    </fieldset>
    <label className="block text-sm">Căn cứ đối chiếu (ít nhất 20 ký tự)<textarea className="mt-1 block w-full rounded border p-2" rows={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} disabled={blocked}/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={blocked}/><span>Tôi đã đối chiếu thông tin khách cung cấp và xác nhận đây là cùng người.</span></label>
    <p className="text-xs text-gray-600">Việc nối hồ sơ không tự xác nhận khách hợp lệ, đặt lịch hoặc mở lại liên hệ đã dừng.</p>
    <button className={`${button} bg-blue-600 text-white`} disabled={blocked||!evidence||!confirmed||reason.trim().length<20}>Xác nhận nối hồ sơ</button>
   </form>}
  </div>}
 </section>;
}
