import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {vietnamInstant,proposalList,availableOptions,readPendingProposal,savePendingProposal,clearPendingProposal,proposalReceipt} from './surveyProposalState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50';
const date=x=>new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const states={OPEN:'Đề xuất đang mở',SUPERSEDED:'Đã thay bằng đề xuất khác',BOOKED:'Đã đặt lịch',REJECTED:'Không đặt được theo đề xuất này'};
const delivery={QUEUED:'Đang chờ gửi',SENDING:'Đang gửi — chờ kết quả',SENT:'Meta đã nhận tin',UNCERTAIN:'Chưa rõ kết quả gửi',HELD:'Đang giữ để kiểm tra'};
export default function SurveyProposals({companyId,actorId,threadId,disabled=false}){
 if(!companyId||!actorId||!threadId)return null;
 return <Panel key={`${companyId}:${actorId}:${threadId}`} {...{companyId,actorId,threadId,disabled}}/>;
}
function Panel({companyId,actorId,threadId,disabled}){
 const[view,setView]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[storageError,setStorageError]=useState(false);
 const[from,setFrom]=useState(''),[to,setTo]=useState(''),[options,setOptions]=useState(null),[selected,setSelected]=useState(''),[location,setLocation]=useState(''),[now,setNow]=useState(Date.now());
 const alive=useRef(false),seq=useRef(0),locked=useRef(false),saved=useRef(null),storage=useRef(null);
 const current=n=>alive.current&&seq.current===n;
 const begin=()=>{locked.current=true;setBusy(true);setError('');setNotice('');return ++seq.current;};
 const done=n=>{if(current(n)){locked.current=false;setBusy(false);}};
 useEffect(()=>{alive.current=true;try{storage.current=window.sessionStorage;saved.current=readPendingProposal(storage.current,actorId,companyId,threadId);setPending(saved.current);}catch{setStorageError(true);setError('Không đọc được yêu cầu đề xuất đang chờ xác nhận. Thao tác mới đang bị khóa.');}
  void refresh();const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{alive.current=false;seq.current++;locked.current=false;clearInterval(timer);};},[]);
 async function refresh(){if(locked.current)return;const n=begin();setView(null);setOptions(null);setSelected('');
  try{const{data}=await api.get('/facebook/customer-care/survey/proposals',{params:{companyId,threadId},timeout:15000});if(current(n))setView(proposalList(data,companyId,actorId,threadId));}
  catch(e){if(current(n))setError(e.response?.data?.error||'Chưa đọc được trạng thái lịch. Dữ liệu cũ đã được ẩn.');}finally{done(n);}
 }
 async function search(event){event.preventDefault();if(locked.current||disabled||saved.current)return;const n=begin();setOptions(null);setSelected('');
  try{const{data}=await api.get('/facebook/customer-care/survey/availability',{params:{companyId,threadId,from:vietnamInstant(from),to:vietnamInstant(to)},timeout:15000});if(current(n))setOptions(availableOptions(data,companyId,threadId));}
  catch(e){if(current(n))setError(e.response?.data?.error||'Chưa xác nhận được giờ trống. Kiểm tra khoảng thời gian và nguồn lịch.');}finally{done(n);}
 }
 async function propose(event){event?.preventDefault();if(locked.current||disabled||storageError||!view)return;
  if(!saved.current){const option=options?.items.find(o=>o.optionId===selected);if(view.careMode!=='WAITING'||view.deliveryBusy||!option||Date.parse(option.snapshotExpiresAt)<=Date.now()||location.trim().length<10)return;
   try{saved.current=savePendingProposal(storage.current,{actorId,companyId,threadId,requestId:crypto.randomUUID(),command:{threadId,optionId:option.optionId,startsAt:option.startsAt,endsAt:option.endsAt,location:location.trim()}});setPending(saved.current);}catch{setStorageError(true);setError('Chưa lưu được yêu cầu trong phiên trình duyệt. Chưa gửi đề xuất.');return;}
  }
  const n=begin(),p=saved.current;setOptions(null);setSelected('');
  try{const{data}=await api.post('/facebook/customer-care/survey/proposal',{companyId:p.companyId,requestId:p.requestId,command:p.command},{timeout:15000});if(!current(n))return;proposalReceipt(data,p);
   clearPendingProposal(storage.current,p);saved.current=null;setPending(null);setLocation('');setView(null);setNotice('Đã xác nhận đề xuất đã được lưu. Tải lại để xem kết quả gửi và xác nhận của khách; đây chưa phải xác nhận giữ chỗ.');
  }catch(e){if(current(n)){
   if(e.response?.data?.reason==='STALE_OPTION'||e.response?.data?.reason==='INVALID_INPUT'){
    try{clearPendingProposal(storage.current,p);saved.current=null;setPending(null);}catch{setStorageError(true);}setView(null);setError('Đề xuất không được ghi vì dữ liệu đã thay đổi hoặc không hợp lệ. Tải lại rồi kiểm tra giờ trống mới.');
   }else{if(e.response?.status===403)setView(null);setError('Chưa xác nhận được kết quả. Giữ cùng yêu cầu để kiểm tra lại; không tạo hoặc gửi lại một đề xuất mới.');}
  }}finally{done(n);}
 }
 const writable=!!view&&view.careMode==='WAITING'&&!view.deliveryBusy&&!disabled&&!busy&&!pending&&!storageError;
 const option=options?.items.find(o=>o.optionId===selected),expired=option&&Date.parse(option.snapshotExpiresAt)<=now;
 return <section aria-label="Đề xuất và theo dõi lịch khảo sát" className="space-y-3 border-t pt-4">
  <div className="flex justify-between gap-3"><h3 className="font-semibold">Đề xuất lịch khảo sát</h3><button className={button} disabled={busy||disabled} onClick={refresh}>Tải trạng thái lịch</button></div>
  <p className="text-sm text-gray-600">Chọn giờ từ lịch đã xác nhận. Khách cần xác nhận đề xuất; hệ thống kiểm tra lại giờ trống rồi mới đặt.</p>
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {storageError&&<p role="alert" className="text-sm text-red-800">Không xác minh được yêu cầu đã lưu trong phiên trình duyệt. Cần kiểm tra trước khi tạo đề xuất khác.</p>}
  {pending&&<div className="rounded border border-amber-300 p-3 text-sm"><p>Có yêu cầu đề xuất chưa xác nhận kết quả trong phiên này. Gửi lại cùng yêu cầu chỉ để đối chiếu; không tạo lượt gửi Meta mới.</p><button className={button} disabled={busy||disabled||storageError||!view} onClick={propose}>Kiểm tra lại cùng yêu cầu</button></div>}
  {view&&<>
   {view.careMode!=='WAITING'&&<p className="text-sm text-amber-800">Hội thoại đã chuyển người xử lý hoặc ngừng liên hệ. Đường đề xuất tự động đang khóa; không mở lại chăm sóc từ đây.</p>}
   {view.deliveryBusy&&<p className="text-sm text-amber-800">Có tin đang gửi hoặc chưa rõ kết quả. Cần đối soát bằng chứng gửi trước; không bấm gửi lại.</p>}
   <form onSubmit={search} className="space-y-2"><div className="flex flex-wrap gap-3"><label className="text-sm">Từ giờ Việt Nam<input type="datetime-local" className="block rounded border p-2" value={from} disabled={!writable} onChange={e=>{setFrom(e.target.value);setOptions(null);setSelected('');}}/></label><label className="text-sm">Đến giờ Việt Nam<input type="datetime-local" className="block rounded border p-2" value={to} disabled={!writable} onChange={e=>{setTo(e.target.value);setOptions(null);setSelected('');}}/></label></div><button className={button} disabled={!writable||!from||!to}>Tìm giờ trống</button></form>
   {options&&<form onSubmit={propose} className="space-y-2"><p className="text-sm">{options.items.length?'Các giờ dưới đây chưa được giữ chỗ.':'Chưa có giờ trống được xác nhận trong khoảng này.'}</p>{options.items.map(o=><label className="flex items-start gap-2 rounded border p-2 text-sm" key={o.optionId}><input type="radio" name={`survey-option-${threadId}`} checked={selected===o.optionId} disabled={!writable||Date.parse(o.snapshotExpiresAt)<=now} onChange={()=>setSelected(o.optionId)}/><span>{o.staffName||'Nhân sự khảo sát'} · {date(o.startsAt)} – {date(o.endsAt)} · Kiểm lại sau {date(o.snapshotExpiresAt)}</span></label>)}
    {!!options.items.length&&<><label className="block text-sm">Địa điểm khảo sát đã trao đổi với khách<textarea className="block w-full rounded border p-2" value={location} maxLength={1000} disabled={!writable} onChange={e=>setLocation(e.target.value)}/></label>{expired&&<p role="status" className="text-sm text-amber-800">Giờ trống vừa hết thời hạn kiểm tra. Tìm lại trước khi đề xuất.</p>}<button className={`${button} bg-blue-700 text-white`} disabled={!writable||!option||expired||location.trim().length<10}>Tạo đề xuất để gửi khách</button></>}
   </form>}
   <h4 className="font-medium">Lịch sử đề xuất ({view.total})</h4><p className="text-xs text-gray-500">Giờ và địa điểm dưới đây là nội dung đề xuất tại thời điểm tạo. Xem hồ sơ bàn giao để xác nhận lịch hiện hành và những thay đổi sau đó.</p>{!view.items.length&&<p className="text-sm">Chưa có đề xuất trong hội thoại này.</p>}
   {view.items.map(p=><article className="space-y-1 rounded border p-3 text-sm" key={p.proposalId}>{!p.scopeReady?<p>Có hồ sơ lịch sử cần rà lại liên kết. Nội dung riêng đã được ẩn.</p>:<>
    <p className="font-medium">{states[p.state]} · {date(p.appointment.startsAt)} – {date(p.appointment.endsAt)}</p><p>{p.appointment.staffName||'Nhân sự khảo sát'} · {p.appointment.location}</p>
    <p>Gửi đề xuất: {delivery[p.delivery.state]}{p.delivery.conflict?' · Bằng chứng gửi mâu thuẫn':p.delivery.hasProblem?' · Có lỗi cần kiểm tra':''}.</p>
    {p.state==='OPEN'&&<p>{Date.parse(p.expiresAt)<=now?'Đề xuất đã hết hạn xác nhận.':`Chờ khách xác nhận trước ${date(p.expiresAt)}.`}</p>}
    {p.delivery.blockedReason&&<p className="text-amber-800">Đề xuất bị chặn do quyền, nguồn lịch, giờ trống hoặc hạn phản hồi đã thay đổi. Cần kiểm tra trước khi tạo đề xuất mới.</p>}
    {p.outcomes.map(o=><p key={o.kind}>Thông báo {o.kind==='BOOKED'?'đã đặt':'không đặt được'} cho khách: {delivery[o.state]}{o.conflict?' · Bằng chứng gửi mâu thuẫn':''}.</p>)}
    {p.booking&&<p>Đã lưu lịch; việc nhận bàn giao và hoàn tất khảo sát được theo dõi riêng.</p>}
   </>}</article>)}{view.total>50&&<p className="text-xs text-gray-500">Hiện 50 đề xuất gần nhất trong tổng {view.total}. Các ràng buộc gửi tính cả lịch sử còn lại.</p>}
   <p className="text-xs text-gray-500">Meta nhận tin chưa có nghĩa khách đã đọc. Không xác nhận thay khách, đặt lại lịch hoặc gửi lại tin chưa rõ kết quả từ màn hình này.</p>
  </>}
 </section>;
}
