import React,{useEffect,useRef,useState} from 'react';
import {createDuplicateReviewReader} from './duplicateReviewState.mjs';
const reasons={MEMBER_UNAVAILABLE:'Có hồ sơ không còn trong phạm vi',REVIEW_REQUIRED:'Cần xác nhận lại sau thay đổi',CROSS_COMPANY_HISTORY:'Còn liên kết ở công ty khác',CONTACT_UNMATCHABLE:'Thông tin liên hệ chưa đủ để so trùng',STALE_IDENTITY_EVIDENCE:'Bằng chứng liên kết đã cũ',CONTRADICTORY_DISTINCTION:'Kết luận đang mâu thuẫn',UNRESOLVED_CONTACT_MATCH:'Có hồ sơ dùng chung thông tin liên hệ'};
export default function FacebookDuplicateReview({companyId,api,headers}){
 const [state,setState]=useState({busy:false,data:null,error:''}),[limit,setLimit]=useState(20);
 const reader=useRef(null),transport=useRef(headers);transport.current=headers;
 useEffect(()=>{reader.current=createDuplicateReviewReader({companyId,update:setState,read:async()=>{
  const response=await fetch(`${api}/api/facebook/duplicate-review?company_id=${encodeURIComponent(companyId)}`,{headers:transport.current()});
  return{ok:response.ok,data:await response.json()};
 }});return()=>{reader.current?.dispose();reader.current=null;};},[]); // Parent keys by authenticated company/actor/role scope.
 const data=state.data,groups=data?.groups.filter(g=>!g.deduplicationComplete)||[];
 return <section aria-label="Rà khách trùng toàn công ty" className="w-full rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-3 text-sm">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Rà khách trùng</h3><p>Đối chiếu khách tiềm năng, cơ hội bán hàng và lịch sử liên kết từ các kênh trong công ty đang chọn.</p></div>
   <button type="button" disabled={state.busy} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>{setLimit(20);reader.current?.load();}}>{state.busy?'Đang rà…':'Rà khách trong công ty'}</button></div>
  <p className="text-xs">Hệ thống đề xuất hồ sơ cần xác minh. Mở hồ sơ CRM để ghi kết luận cùng hoặc khác khách; giữ nguyên lịch sử và nguồn quảng cáo.</p>
  {state.error&&<p role="alert" className="text-red-700">{state.error}</p>}
  {data&&<><p role="status">Đã đối chiếu {data.availableLeadCount} hồ sơ hiện hành · {data.unresolvedPairCount} cặp cần xác minh · {data.reviewGroupCount} nhóm cần kiểm tra</p>
   <p className="text-xs">Thời điểm đọc: {new Date(data.asOf).toLocaleString('vi-VN')}. Kết quả rà trùng chưa xác nhận nhu cầu hoặc nguồn quảng cáo trả phí.</p>
   {!groups.length&&<p>Không còn nhóm cần xác minh theo thông tin liên hệ tại lần đọc này.</p>}
   <ul className="space-y-2">{groups.slice(0,limit).map(g=><li key={g.groupId} className="rounded border bg-white p-3 space-y-1">
    <p>{g.reasons.map(r=>reasons[r]||'Cần kiểm tra thêm').join(' · ')}</p>
    <ul>{g.members.map(m=><li key={m.leadId}>{m.available?<a className="text-blue-700 underline" href={`/crm/leads/${m.leadId}?tab=quality`}>{m.title||'Hồ sơ chưa có tên'} — Mở để rà danh tính</a>:<span>Hồ sơ lịch sử không còn trong phạm vi</span>}</li>)}</ul>
   </li>)}</ul>
   {groups.length>limit&&<button type="button" className="rounded border px-3 py-2" onClick={()=>setLimit(n=>n+20)}>Xem thêm nhóm ({groups.length-limit})</button>}
  </>}
 </section>;
}
