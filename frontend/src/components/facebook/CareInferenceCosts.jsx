import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {inferenceCosts,receiptLabels} from './careInferenceCostState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50';
const number=x=>new Intl.NumberFormat('vi-VN').format(x);
const date=x=>new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export default function CareInferenceCosts({companyId,actorId}){return <Panel key={`${actorId}:${companyId}`} companyId={companyId}/>;}
function Panel({companyId}){
 const[view,setView]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(false),seq=useRef(0),locked=useRef(false);
 useEffect(()=>{alive.current=true;void read();return()=>{alive.current=false;seq.current++;locked.current=false;};},[]);
 async function read(policyId=null,after=null,unresolvedOnly=false){
  if(locked.current)return;locked.current=true;const n=++seq.current;setBusy(true);setError('');setView(null);
  try{
   const{data}=await api.get('/facebook/customer-care/inference/costs',{params:{companyId,...(policyId?{policyId}:{}),...(after?{after}:{}),...(unresolvedOnly?{queue:'unresolved'}:{})},timeout:15000});
   if(alive.current&&seq.current===n)setView(inferenceCosts(data,companyId,policyId,unresolvedOnly));
  }catch{if(alive.current&&seq.current===n)setError('Chưa xác minh được số liệu chi phí AI. Chức năng có thể chưa mở hoặc nguồn/quyền đã thay đổi; dữ liệu cũ đã được ẩn.');}
  finally{if(alive.current&&seq.current===n){locked.current=false;setBusy(false);}}
 }
 const s=view?.summary,p=view?.policy;
 return <section className="h-full overflow-auto p-4 md:p-6 space-y-4" aria-label="Chi phí và sử dụng AI">
  <header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">Chi phí AI</h2><p className="text-sm text-gray-600">Hạn mức đã đăng ký, lượt sử dụng và biên nhận cần đối soát.</p></div><button className={button} disabled={busy} onClick={()=>read(view?.policyId||null,null,view?.unresolvedOnly||false)}>Tải lại số liệu AI</button></header>
  <p className="text-sm text-gray-600">Phạm vi là toàn bộ lịch sử các hạn mức chăm khách đã ghi trong công ty, gồm người dùng và Agent. Không bao gồm công cụ AI khác hoặc chi quảng cáo của đợt thử.</p>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}{busy&&<p role="status">Đang đọc số liệu…</p>}
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tổng sử dụng AI"><Metric title="Lượt đã cấp" value={s?number(s.attempts):'—'}/><Metric title="Tiền đã dự phòng" value={s?`${number(s.reservedVnd)} đ`:'—'}/><Metric title="Biên nhận cần kiểm tra" value={s?number(s.pendingReceipts+s.unknownReceipts):'—'}/><Metric title="Chi phí thực đã đối soát" value="Chưa xác định"/></div>
  <p className="rounded bg-amber-50 p-3 text-sm">Tiền dự phòng giữ trong hạn mức, chưa phải hóa đơn. Token đã ghi nhận không tự quy thành tiền thực chi. Lượt chưa rõ kết quả tiếp tục khóa lượt gọi mới trên hạn mức tương ứng; xem hoặc đóng lượt tư vấn không giải phóng khóa này.</p>
  {view&&<>
   <p className="text-xs text-gray-500">Số liệu tại {date(view.asOf)}. Mỗi lần chuyển trang lấy một bản đọc mới; các tổng phía trên tính toàn bộ phạm vi đã chọn.</p>
   <div className="rounded border bg-white p-3 text-sm space-y-1"><p>Đã ghi token: {number(s.usageReceipts)} lượt. Chờ biên nhận: {number(s.pendingReceipts)}. Chưa rõ kết quả: {number(s.unknownReceipts)}. Adapter báo chưa gửi: {number(s.notSentReceipts)}.</p><p>Token có biên nhận: vào {number(s.inputTokens)} · ra {number(s.outputTokens)} · tổng {number(s.totalTokens)}.</p>{s.pendingReceipts+s.unknownReceipts>0&&<p className="text-amber-800">Số token trên chưa bao gồm các lượt đang chờ hoặc chưa rõ kết quả.</p>}</div>
   {!p?<><h3 className="font-semibold">Hạn mức đã ghi nhận ({number(s.policyCount)})</h3>{!view.policies.length&&<p className="text-sm">Chưa có hạn mức chăm khách trong phạm vi trang này. Chưa kết luận tổng chi phí AI bằng 0.</p>}<div className="space-y-2">{view.policies.map(g=><button key={g.policyId} className={`${button} block w-full bg-white text-left`} disabled={busy} onClick={()=>read(g.policyId)}><strong>{g.model}</strong><span className="block">Hạn mức …{g.policyId.slice(-6)} · Người/Agent …{g.principalId.slice(-6)}</span><span className="block">Đã cấp {number(g.attempts)} / {number(g.maxCalls)} lượt · Dự phòng {number(g.reservedVnd)} / {number(g.allowanceVnd)} đ</span><span className="block">Cần kiểm tra {number(g.pendingReceipts+g.unknownReceipts)} biên nhận · {g.active?'Cờ hạn mức đang bật':'Cờ hạn mức đang tắt'}</span><span className="block text-xs text-gray-500">Kỳ {date(g.startsAt)} – {date(g.expiresAt)}. Cờ bật chưa chứng minh đủ quyền hoặc sẵn sàng chạy.</span></button>)}</div></>:<>
    <button className={button} disabled={busy} onClick={()=>read()}>Về tất cả hạn mức AI</button><h3 className="font-semibold">Biên nhận của {p.model}</h3><div className="flex gap-2"><button className={button} aria-pressed={!view.unresolvedOnly} disabled={busy} onClick={()=>read(p.policyId)}>Tất cả biên nhận</button><button className={button} aria-pressed={view.unresolvedOnly} disabled={busy} onClick={()=>read(p.policyId,null,true)}>Chỉ lượt cần đối soát</button></div><p className="text-sm">Hạn mức …{p.policyId.slice(-6)} · Kỳ {date(p.startsAt)} – {date(p.expiresAt)}</p>
    {!view.receipts.length&&<p className="text-sm">Chưa có biên nhận trên trang này.</p>}
    <div className="space-y-2">{view.receipts.map(r=><article key={r.requestId} className="rounded border bg-white p-3 text-sm space-y-1"><h4 className="font-medium">{receiptLabels[r.state]}</h4><p className="break-all">Mã lượt: {r.requestId}</p><p>Đã cấp lúc {date(r.authorizedAt)} · Dự phòng {number(r.reservedVnd)} đ</p>{r.usage?<p>Token vào {number(r.usage.inputTokens)} · ra {number(r.usage.outputTokens)} · tổng {number(r.usage.totalTokens)}.</p>:<p>Chưa có biên nhận token cho lượt này.</p>}{['AUTHORIZED','UNKNOWN'].includes(r.state)&&<p className="text-amber-800">Cần đối chiếu mã lượt với log và bằng chứng nhà cung cấp. Không gọi lại mô hình hoặc đánh dấu không phát sinh phí chỉ vì đã quá thời gian.</p>}</article>)}</div>
   </>}
   {view.nextAfter&&<button className={button} disabled={busy} onClick={()=>read(view.policyId,view.nextAfter,view.unresolvedOnly)}>Xem trang tiếp theo</button>}
  </>}
 </section>;
}
function Metric({title,value}){return <div className="rounded border bg-white p-3"><p className="text-sm text-gray-600">{title}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;}
