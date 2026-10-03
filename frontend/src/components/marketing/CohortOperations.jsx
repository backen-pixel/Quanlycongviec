import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {cohortOperationsResult} from './cohortOperationsState.mjs';
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
const date=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa xác định';
const reasons={QUALIFICATION_PENDING:'Chờ xác minh nhu cầu',CARE_CONNECTION_NOT_ESTABLISHED:'Chưa nối được hồ sơ chăm khách',OWNER_UNAVAILABLE:'Cần kiểm tra người phụ trách',HANDLER_UNAVAILABLE:'Người tiếp quản không còn phù hợp',HUMAN_REQUESTED:'Khách đang chờ người hỗ trợ',MESSAGE_ORDER_UNCERTAIN:'Cần kiểm tra thứ tự tin nhắn',AWAITING_REPLY:'Khách đang chờ trả lời',APPOINTMENT_CHANGED:'Lịch hoặc người khảo sát đã thay đổi',HANDOFF_PENDING:'Chờ người khảo sát nhận bàn giao',RESULT_NOT_RECORDED:'Lịch đã qua, cần ghi nhận kết quả',DELIVERY_CONFLICT:'Cần đối soát gửi xác nhận lịch'};
const statuses={CHANGED:'Lịch cần rà lại',RESULT_NOT_RECORDED:'Chưa ghi nhận kết quả',IN_PROGRESS:'Trong giờ hẹn',UPCOMING:'Sắp tới'};
export default function CohortOperations({companyId,actorId,trialId}){
 if(!companyId||!actorId||!trialId)return null;
 return <Panel key={`${companyId}:${actorId}:${trialId}`} {...{companyId,actorId,trialId}}/>;
}
function Panel({companyId,actorId,trialId}){
 const[result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),seq=useRef(0);
 useEffect(()=>{
  const current=++seq.current,controller=new AbortController();setResult(null);setError('');setLoading(true);
  api.get(`/crm/marketing-trials/${trialId}/operations`,{params:{company_id:companyId},signal:controller.signal,timeout:20000})
   .then(({data})=>{if(current===seq.current)setResult(cohortOperationsResult(data,companyId,actorId,trialId));})
   .catch(e=>{if(current===seq.current){setResult(null);setError(e.response?.data?.error||'Chưa đọc được lịch và khách cần xử lý. Số cũ đã được ẩn.');}})
   .finally(()=>{if(current===seq.current)setLoading(false);});
  return()=>{++seq.current;controller.abort();};
 },[companyId,actorId,trialId,reload]);
 const c=result?.counts,ready=result?.period.status==='AVAILABLE';
 return <section aria-label="Khảo sát và khách chờ theo kỳ quảng cáo" className="rounded-xl border border-slate-200 p-4 space-y-3">
  <div className="flex justify-between gap-3"><div><h3 className="font-semibold">Khách từ kỳ quảng cáo đang được xử lý đến đâu?</h3><p className="text-sm text-slate-600">Theo nguồn tiếp nhận khách; giữ lịch hẹn diễn ra sau khi đợt quảng cáo kết thúc.</p></div><button type="button" className={button} disabled={loading} onClick={()=>{setResult(null);setReload(n=>n+1);}}>Tải lại khách và lịch</button></div>
  {loading&&<p role="status">Đang nối khách với hội thoại và lịch khảo sát…</p>}
  {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
  {result&&<>
   <p className="text-sm text-slate-600">Kỳ: {result.trial.name} · Tình trạng chăm khách tại {date(result.asOf)}.</p>
   {ready?<p className="text-sm">Nhóm khách tiếp nhận từ {result.period.since} đến hết {result.period.until} theo giờ Việt Nam; chỉ gồm nguồn trả phí đã nối được.</p>:<p role="status" className="text-sm text-amber-800">Kỳ này chưa có ngày hoàn tất để xác định nhóm khách. Chưa công bố số khảo sát theo kỳ.</p>}
   {ready&&<>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Khách hợp lệ trong nhóm',c.qualifiedGroups],['Khách cần rà / xử lý',c.waitingGroups],['Khách có hồ sơ đặt khảo sát',c.bookedGroups],['Lịch khảo sát sắp tới',c.upcoming]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div>
    <p className="text-sm">{c.observedPaidGroups} khách trả phí đã xác định nguồn: {c.qualifiedGroups} hợp lệ, {c.pendingQualificationGroups} chờ xác minh, {c.rejectedGroups} không đạt nhu cầu. {c.withoutCareGroups} khách cần rà kết nối chăm sóc.</p>
    <p className="text-sm">{c.bookedAppointments} hồ sơ lịch: {c.pendingHandoffs} chờ nhận bàn giao, {c.inProgress} trong giờ hẹn, {c.pastDue} đã qua nhưng chưa ghi nhận kết quả, {c.changedAppointments} cần rà thay đổi. Người nhận bàn giao chưa có nghĩa đã khảo sát xong.</p>
    <p className="text-sm text-slate-600">Số khách cần xử lý được loại trùng dù có nhiều việc. Thiếu kết nối chăm sóc không khẳng định khách chưa được chăm ở nơi khác và không cho phép tự liên hệ; khách từ chối vẫn được giữ trạng thái dừng.</p>
    <details><summary className="cursor-pointer text-sm">Các hồ sơ chưa được tính vào nhóm này</summary><p className="mt-2 text-sm">{result.excluded.existingGroups} nhóm khách cũ; {result.excluded.organicGroups} nhóm tự nhiên; {result.excluded.unresolvedGroups} nhóm cần đối soát; {result.excluded.unknownSourceGroups} nhóm chưa rõ nguồn. {result.excluded.unprocessedForms} biểu mẫu cần xử lý và {result.excluded.unlinkedProofs} bằng chứng chưa nối được. Toàn công ty còn {result.excluded.companyThreadsNotAttributed} hội thoại và {result.excluded.companyBookingsNotAttributed} hồ sơ lịch thuộc nhóm khác hoặc chưa quy thuộc.</p></details>
    <div><h4 className="font-medium">Việc cần rà / xử lý ({result.attentionTotal})</h4>{result.attention.length?<ul className="divide-y">{result.attention.map(a=><li key={`${a.kind}:${a.id}:${a.reason}`} className="py-2 text-sm"><strong>{a.title||'Hồ sơ khách'}</strong> · {reasons[a.reason]||'Cần rà hồ sơ'}{a.dueAt&&` · ${date(a.dueAt)}`}</li>)}</ul>:<p className="text-sm">Chưa thấy việc cần xử lý trong phạm vi đã nối.</p>}{result.attentionTotal>50&&<p className="text-sm">Đang hiện 50/{result.attentionTotal} việc; tổng khách phía trên tính toàn bộ.</p>}</div>
    {!!result.appointments.length&&<div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left font-medium">Lịch đã nối với khách trong kỳ ({result.appointmentTotal})</caption><thead><tr><th className="p-2">Khách</th><th className="p-2">Giờ hẹn Việt Nam</th><th className="p-2">Trạng thái</th><th className="p-2">Bàn giao</th></tr></thead><tbody>{result.appointments.map(a=><tr key={a.id} className="border-t"><td className="p-2">{a.title||'Hồ sơ khách'}</td><td className="p-2">{date(a.startsAt)}</td><td className="p-2">{statuses[a.status]}</td><td className="p-2">{a.handoffState==='ACKNOWLEDGED'?'Đã nhận bàn giao':'Chưa nhận bàn giao'}</td></tr>)}</tbody></table>{result.appointmentTotal>50&&<p className="text-sm">Đang hiện 50/{result.appointmentTotal} lịch.</p>}</div>}
    <div className="flex gap-4 text-sm"><a className="text-blue-700 underline" href="/crm/facebook">Mở chăm khách</a><a className="text-blue-700 underline" href="/crm/events/surveys">Mở lịch khảo sát</a></div>
   </>}
   <p className="text-xs text-slate-500">Phạm vi hiện nối Messenger và lịch được khách xác nhận trong hệ thống. Các số này không chứng nhận đủ mọi kênh hoặc cấp quyền tăng ngân sách.</p>
  </>}
 </section>;
}
