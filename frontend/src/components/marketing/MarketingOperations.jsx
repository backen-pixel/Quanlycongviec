import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {operationsResult} from './operationsState.mjs';
const names={MAPPING_UNAVAILABLE:'Cần kiểm tra liên kết hội thoại với CRM',OWNER_UNAVAILABLE:'Chưa có người phụ trách hợp lệ',HANDLER_UNAVAILABLE:'Người tiếp quản không còn quyền',HUMAN_REQUESTED:'Khách đang chờ người hỗ trợ',MESSAGE_ORDER_UNCERTAIN:'Thời điểm tin nhắn cần đối chiếu',AWAITING_REPLY:'Chưa thấy tin trả lời mới hơn tin khách gửi',BOOKING_SCOPE_UNAVAILABLE:'Phạm vi hồ sơ khảo sát đã thay đổi',APPOINTMENT_CHANGED:'Lịch hoặc người khảo sát đã thay đổi',HANDOFF_PENDING:'Nhân viên chưa xác nhận nhận hồ sơ',RESULT_NOT_RECORDED:'Đã qua giờ hẹn; chưa có bằng chứng hoàn tất',DELIVERY_CONFLICT:'Cần đối chiếu kết quả gửi thông báo'};
export default function MarketingOperations({companyId,actorId}){
 if(!companyId||!actorId)return <section className="rounded-xl border bg-white p-4 text-sm">Chọn công ty để theo dõi tư vấn và khảo sát.</section>;
 return <Operations key={`${companyId}:${actorId}`} companyId={companyId} actorId={actorId}/>;
}
function Operations({companyId,actorId}){
 const[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);const sequence=useRef(0);
 useEffect(()=>{const seq=++sequence.current,controller=new AbortController();setData(null);setError('');setLoading(true);
  api.get('/crm/marketing-operations',{params:{company_id:companyId},signal:controller.signal,timeout:20000}).then(({data:x})=>{if(seq!==sequence.current)return;setData(operationsResult(x,companyId,actorId));})
   .catch(e=>{if(seq===sequence.current){setData(null);setError(e.response?.data?.error||'Chưa đọc được dữ liệu vận hành. Số liệu cũ đã được ẩn.');}})
   .finally(()=>{if(seq===sequence.current)setLoading(false);});
  return()=>{++sequence.current;controller.abort();};
 },[companyId,actorId,reload]);
 const c=data?.counts,u=data?.customers;
 return <section aria-label="Tư vấn và khảo sát hiện tại" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
  <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Tư vấn và khảo sát hiện tại</h2><p className="mt-1 text-sm text-slate-600">Toàn công ty đang chọn: hội thoại Messenger đã nhận và lịch khách đã xác nhận qua hệ thống. Không giới hạn theo kỳ hoặc bộ lọc quảng cáo.</p></div><button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={loading} onClick={()=>{setData(null);setReload(n=>n+1);}}>Tải lại vận hành</button></div>
  {loading&&<p role="status">Đang kiểm tra lịch và khách cần xử lý…</p>}
  {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
  {data&&<>
   <p className="text-sm text-slate-600">Cập nhật lúc {new Date(data.asOf).toLocaleString('vi-VN')}. Các số dưới đây chưa quy thuộc cho đợt quảng cáo.</p>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[['Nhóm khách cần xử lý',u.status==='AVAILABLE'?u.waiting:'Chưa đối soát'],['Lịch khảo sát sắp tới',c.upcoming],['Lịch đang trong giờ hẹn',c.inProgress],['Hồ sơ khảo sát chờ nhân viên nhận',c.pendingHandoffs],['Hội thoại chờ người hỗ trợ',c.humanRequested],['Qua giờ hẹn, chưa ghi nhận kết quả',c.pastDue]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}</div>
   <p className="text-sm text-slate-600">Nhóm khách được gộp theo đối soát CRM hiện có; số hội thoại và số lịch là hai đơn vị riêng. Nhân viên nhận hồ sơ chưa có nghĩa đã khảo sát xong.</p>
   {u.status==='UNRESOLVED'&&<p role="status" className="text-sm text-amber-800">Chưa kết luận được tổng khách duy nhất: {u.unresolvedGroups} nhóm CRM cần đối soát; {c.unavailableThreads} hội thoại và {c.unavailableBookings} lịch cần kiểm tra phạm vi.</p>}
   <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Hội thoại chưa thấy phản hồi mới hơn</dt><dd>{c.awaitingReply}</dd><dt>Yêu cầu gặp người đã quá hạn</dt><dd>{c.overdueHumanRequests}</dd><dt>Hội thoại do người tiếp quản</dt><dd>{c.humanActive}</dd><dt>Hội thoại đã từ chối liên hệ</dt><dd>{c.optedOut}</dd><dt>Lịch/người nhận đã thay đổi</dt><dd>{c.changedAppointments}</dd><dt>Thời điểm tin nhắn cần đối chiếu</dt><dd>{c.ambiguousMessageOrder}</dd></dl>
   <p className="text-xs text-slate-600">“Chưa thấy phản hồi” dựa trên nhật ký nhận được, không chứng minh việc tư vấn đã hoàn tất. Từ chối liên hệ không xóa lịch đã xác nhận; bảng này không tự gửi tin.</p>
   {data.attention.length>0?<div className="space-y-2"><h3 className="font-medium">Cần xử lý · {data.attentionTotal} mục</h3><ul className="divide-y">{data.attention.map(r=><li key={`${r.kind}:${r.id}:${r.reason}`} className="py-2 text-sm"><span className="font-medium">{r.title||'Hồ sơ cần kiểm tra phạm vi'}</span> · {names[r.reason]||'Cần kiểm tra hồ sơ'}{r.dueAt&&<span className="text-slate-600"> · {new Date(r.dueAt).toLocaleString('vi-VN')}</span>}</li>)}</ul>{data.attentionTotal>data.attention.length&&<p className="text-sm">Đang hiển thị {data.attention.length} mục ưu tiên. Mở hàng chờ bên dưới để xem tiếp.</p>}</div>:<p className="text-sm">Chưa có mục cần xử lý theo nhật ký hiện tại.</p>}
   <div className="flex flex-wrap gap-4 text-sm text-blue-700"><a href="/crm/facebook">Mở hộp thư — chọn đúng công ty</a><a href="/crm/events/surveys">Mở bàn giao khảo sát — chọn đúng công ty</a></div>
  </>}
 </section>;
}
