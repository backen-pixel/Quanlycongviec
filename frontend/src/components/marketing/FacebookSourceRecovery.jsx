import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
const statusNames={MISSING:'Chưa kiểm kê nguồn',RUNNING:'Đang tìm và khôi phục khách',FAILED:'Lượt kiểm kê gặp lỗi',STALE:'Phạm vi đã thay đổi — cần kiểm kê lại',SCANNED:'Đã đọc xong các nguồn trong lượt này'};
const issueNames={CENSUS_NO_CLOSED_DAY:'Kỳ đo chưa có ngày hoàn tất để đối chiếu chi phí; khôi phục khách vẫn được phép',CENSUS_ACQUISITION_CONFLICT:'Thời điểm hoặc định danh khách mâu thuẫn giữa các bằng chứng nguồn',CENSUS_RECEIPT_MISSING:'Chưa có bản tiếp nhận tương ứng',CENSUS_RECEIPT_CONFLICT:'Thông tin tiếp nhận không khớp nguồn',CENSUS_REVIEW_REQUIRED:'Cần xử lý trong hàng chờ tiếp nhận',CENSUS_INTAKE_PENDING:'Đang chờ đưa khách vào CRM',CENSUS_PROOF_CONFLICT:'Bằng chứng nguồn chưa khớp hồ sơ',CENSUS_CRM_MISSING:'Hồ sơ CRM còn thiếu hoặc đã bị xóa',CENSUS_ACQUISITION_UNPROVEN:'Chưa xác định được thời điểm khách phát sinh',CENSUS_KNOWN_ID_NOT_ENUMERATED:'Lượt gửi CRM đã biết nhưng chưa tìm thấy trong lượt quét',CENSUS_SOURCE_WITHOUT_RECEIPT:'Bằng chứng nguồn thiếu bản tiếp nhận',CENSUS_FORM_NOT_DISCOVERED:'Có biểu mẫu cũ chưa tìm lại được',CENSUS_EXPIRED_LEADS:'Facebook báo có dữ liệu biểu mẫu hết thời gian lưu',CENSUS_RETENTION_UNVERIFIED:'Chưa xác minh thời gian lưu của biểu mẫu',CENSUS_SCOPE_CHANGED:'Cấu hình nguồn hoặc kỳ đo đã thay đổi',CENSUS_PERIOD_MISMATCH:'Lượt kiểm kê chưa cùng kỳ ngày hoàn tất với chi tiêu — cần kiểm kê lại'};
const date=x=>x?new Date(x).toLocaleString('vi-VN'):'—';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);

export default function FacebookSourceRecovery({companyId,trialId,reconciliation,pendingRequests,onBusy,onRefresh,disabled=false}){
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(pendingRequests.has(trialId));
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function start(){
  if(disabled||lock.current||(!pendingRequests.has(trialId)&&reconciliation?.status==='RUNNING'))return;
  lock.current=true;setSaving(true);setError('');onBusy(true);
  const body=pendingRequests.get(trialId)||{requestId:crypto.randomUUID()};pendingRequests.set(trialId,body);
  try{
   const {data}=await api.post(`/crm/marketing-trials/${trialId}/reconciliation`,body,{params:{company_id:companyId},timeout:20000});
   if(!alive.current)return;
   if(data?.companyId!==companyId||data?.trialId!==trialId||!uuid(data?.id)||!['RUNNING','SCANNED','FAILED'].includes(data.state))throw Error('unconfirmed');
   pendingRequests.delete(trialId);setUncertain(false);onRefresh();
  }catch(e){if(alive.current){
   if([400,403,404,409].includes(e.response?.status)){pendingRequests.delete(trialId);setUncertain(false);setError(e.response?.data?.error||'Không tạo được lượt kiểm kê. Tải lại kỳ đo để kiểm tra trạng thái.');}
   else{setUncertain(true);setError('Chưa xác nhận được yêu cầu kiểm kê. Có thể thử lại cùng yêu cầu; hệ thống sẽ không tạo thêm một lượt trùng.');}
  }}finally{lock.current=false;if(alive.current){setSaving(false);onBusy(false);}}
 }
 const c=reconciliation?.counts,hasPeriod=Date.parse(reconciliation?.run?.until)>Date.parse(reconciliation?.run?.since);
 return <section aria-label="Đối soát Facebook và CRM" className="space-y-3 rounded-lg border border-slate-200 p-3">
  <h3 className="font-medium">Đối soát Facebook và CRM</h3>
  <p role="status" className="text-sm">{statusNames[reconciliation?.status]||'Chưa đọc được kết quả kiểm kê'}</p>
  {reconciliation?.run&&<p className="text-sm text-slate-600">Phạm vi khôi phục: từ {date(reconciliation.run.since)} đến trước {date(reconciliation.run.recoveryUntil)}.</p>}
  {hasPeriod&&<p className="text-sm text-slate-600">Các số đối chiếu dưới đây chỉ tính khách phát sinh trước {date(reconciliation.run.until)}. Khách mới hơn vẫn được khôi phục và được tính vào kỳ đo tiếp theo.</p>}
  {c&&hasPeriod&&<><p className="text-sm text-slate-600">Các số dưới đây đếm lượt gửi biểu mẫu. Một khách có thể gửi nhiều lần; số khách duy nhất đã xác minh được hiển thị ở phần trên.</p><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Lượt gửi biểu mẫu tìm thấy</dt><dd>{c.enumerated}</dd><dt>Lượt gửi đã khớp hồ sơ CRM</dt><dd>{c.receivedCrm}</dd><dt>Đang chờ tiếp nhận</dt><dd>{c.awaitingIntake}</dd><dt>Cần kiểm tra hồ sơ</dt><dd>{c.reviewRequired+c.missingReceipt+c.proofConflict+c.missingCrm}</dd><dt>Lượt gửi CRM đã biết nhưng chưa tìm thấy trong lượt quét</dt><dd>{c.notEnumerated}</dd><dt>Chưa xác minh thời điểm hoặc thiếu bản tiếp nhận</dt><dd>{c.unknownAcquiredTime+c.unlinkedProofs}</dd></dl></>}
  {reconciliation?.matchStatus==='MATCHED_ENUMERATED'&&<p className="text-sm text-slate-700">Các lượt gửi tìm thấy đã khớp CRM. Còn cần xác minh phạm vi tài khoản, quyền truy cập và dữ liệu lưu tại Facebook trước khi kết luận đã nhận đủ khách.</p>}
  {!!reconciliation?.issues?.length&&<ul className="list-disc pl-5 text-sm text-amber-800">{reconciliation.issues.map(x=><li key={x.code}>{issueNames[x.code]||'Cần kiểm tra nguồn'}: {x.count}</li>)}</ul>}
  {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
  <button type="button" className={button} disabled={disabled||saving||(!uncertain&&reconciliation?.status==='RUNNING')} onClick={start}>{saving?'Đang gửi yêu cầu…':uncertain?'Xác nhận lại yêu cầu kiểm kê':'Tìm và khôi phục khách bị sót'}</button>
  <p className="text-xs text-slate-600">Đọc các biểu mẫu đã cấu hình và đưa khách bị sót về hàng chờ CRM đến lúc bắt đầu lượt quét, gồm khách trong ngày. Phần đối chiếu chi phí chỉ dùng những ngày đã hoàn tất. Chức năng cần được mở trong gói phát hành. Dùng “Tải lại kỳ đo” để xem tiến độ.</p>
 </section>;
}
