import{useEffect,useRef,useState}from'react';
import api from'../../lib/api';
import{snapshotResult,snapshotReceipt,readPending,savePending,clearPending}from'./measurementSnapshotState.mjs';
const money=n=>n===null||n===undefined?'Chưa đủ dữ liệu':Math.round(n).toLocaleString('vi-VN')+' đ';
const reasons={ACCOUNT_DESTINATIONS_UNVERIFIED:'Cần bằng chứng đầy đủ các điểm nhận khách của tài khoản trong kỳ',SOURCE_REGISTRY_NOT_CURRENT:'Cần cập nhật danh mục nguồn',EXPORT_MISSING:'Chưa có tệp nguồn để đối soát',EXPORT_CHANGED:'Dữ liệu hoặc quyền đã đổi sau lần đối soát',EXPORT_DISCREPANCIES:'Tệp và hệ thống có mã hoặc thời điểm khác nhau',EXPORT_DUPLICATES:'Tệp có dòng trùng cần kiểm tra',ZERO_SOURCE_UNVERIFIED:'Chưa có bằng chứng xác nhận nguồn này không tạo khách',EXPORT_PROVENANCE_UNVERIFIED:'Các mã đã khớp; còn xác minh nguồn và bộ lọc của tệp',ENTRYPOINT_NOT_RECONCILED:'Điểm nhận này chưa được đối soát',FORM_ACCOUNT_UNRESOLVED:'Chưa xác định tài khoản của biểu mẫu',SPEND_UNAVAILABLE:'Chưa đủ chi tiêu cùng kỳ',COHORT_UNRESOLVED:'Còn hồ sơ cần đối soát nguồn hoặc khách trùng',QUALIFICATION_PENDING:'Còn khách chờ xác minh nhu cầu',CENSUS_NOT_RECONCILED:'Tập khách từ nguồn chưa khớp CRM'};
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50';
export default function MeasurementSnapshot(props){if(!props.actorId)return null;return <Panel key={[props.actorId,props.companyId,props.trialId].join(':')} {...props}/>;}
function Summary({report:r}){return <div className="space-y-1 text-sm"><p>Chụp dữ liệu lúc {new Date(r.asOf).toLocaleString('vi-VN')} · {r.period.since} – {r.period.until||'chưa có ngày hoàn tất'}</p><p>Tiền đã chi: {money(r.spend.spendVnd)} · Khách đã xác minh: {r.counts.qualified} · Chờ xác minh: {r.counts.pending}</p><p>Chi phí/khách trên tập đã đối soát: <strong>{money(r.observedMeasurement.costPerQualifiedLeadVnd)}</strong></p><p className="text-amber-800">Bản lưu chưa đủ phạm vi để kết luận đạt 250.000 đ/khách hoặc tăng ngân sách.</p>
 <details><summary className="cursor-pointer">Các bằng chứng còn thiếu ({r.obligations.length})</summary><ul className="list-disc space-y-1 pl-5">{r.obligations.map((x,i)=><li key={i}>{[x.accountId,x.pageId&&'Page '+x.pageId,x.formId&&'Biểu mẫu '+x.formId,x.kind].filter(Boolean).join(' · ')}{x.accountId||x.pageId||x.kind?' — ':''}{reasons[x.code]||'Cần kiểm tra dữ liệu'}{x.count>1?' ('+x.count+')':''}{x.evidenceId&&<span className="block text-xs text-slate-500">Bằng chứng: {x.evidenceId}</span>}</li>)}</ul></details></div>;}
function Panel({actorId,companyId,trialId}){
 const[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[reload,setReload]=useState(0),[pending,setPending]=useState(null),[receipt,setReceipt]=useState(null);
 const seq=useRef(0),lock=useRef(false),pendingRef=useRef(null);
 useEffect(()=>{const n=++seq.current,controller=new AbortController();setData(null);setReceipt(null);setError('');setLoading(true);
  try{const p=readPending(sessionStorage,actorId,companyId,trialId);pendingRef.current=p;setPending(p);}catch(e){setError(e.message);setLoading(false);return()=>{++seq.current;controller.abort();};}
  api.get('/crm/marketing-trials/'+trialId+'/measurement-snapshots',{params:{company_id:companyId},signal:controller.signal,timeout:20000}).then(({data:x})=>{if(n===seq.current)setData(snapshotResult(x,actorId,companyId,trialId));}).catch(e=>{if(n===seq.current){setData(null);setError(e.response?.data?.error||e.message||'Chưa đọc được phép đo.');}}).finally(()=>{if(n===seq.current)setLoading(false);});
  return()=>{++seq.current;controller.abort();};
 },[actorId,companyId,trialId,reload]);
 async function save(){if(lock.current||loading||(!data&&!pendingRef.current))return;const n=seq.current;
  try{let p=pendingRef.current;if(!p){p={requestId:crypto.randomUUID(),contextVersion:data.contextVersion};savePending(sessionStorage,actorId,companyId,trialId,p);pendingRef.current=p;setPending(p);}
   lock.current=true;setSaving(true);setData(null);setReceipt(null);setError('');
   const{data:x}=await api.post('/crm/marketing-trials/'+trialId+'/measurement-snapshots',p,{params:{company_id:companyId},timeout:30000});if(n!==seq.current)return;
   snapshotReceipt(x,companyId,trialId,p,actorId);clearPending(sessionStorage,actorId,companyId,trialId);pendingRef.current=null;setPending(null);setReceipt(x);
  }catch(e){if(n===seq.current){if([400,403,409].includes(e.response?.status)){try{clearPending(sessionStorage,actorId,companyId,trialId);pendingRef.current=null;setPending(null);}catch{}}
   setError(e.response?.data?.error||e.message||'Chưa xác nhận kết quả; gửi lại cùng mã yêu cầu.');}}
  finally{lock.current=false;if(n===seq.current)setSaving(false);}
 }
 return <section aria-label="Bản lưu kết quả đo" className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Bản lưu kết quả đo</h3><p className="text-sm text-slate-600">Giữ số liệu và bằng chứng tại thời điểm đánh giá. Bản đã lưu giữ nguyên khi hồ sơ khách hoặc chi tiêu thay đổi.</p>
  <div className="flex gap-3"><button className={button} disabled={loading||saving} onClick={()=>{setData(null);setReceipt(null);setReload(x=>x+1);}}>Tải phép đo và lịch sử</button><button className={button} disabled={loading||saving||(!data&&!pending)} onClick={save}>{saving?'Đang lưu…':pending?'Xác nhận lại cùng yêu cầu':'Lưu kết quả hiện tại'}</button></div>
  {loading&&<p role="status">Đang đọc tiền, khách và bằng chứng nguồn…</p>}{pending&&<p role="status" className="text-sm text-amber-800">Có yêu cầu đang chờ xác nhận. Gửi lại sẽ tìm đúng bản đã lưu, kể cả khi dữ liệu mới đã thay đổi.</p>}{error&&<p role="alert" className="text-amber-800">{error}</p>}
  {data&&<><Summary report={data.preview}/><h4 className="font-medium">20 bản lưu gần nhất</h4>{!data.history.length&&<p className="text-sm">Chưa có bản lưu.</p>}{data.history.map(x=><article key={x.receipt.requestId} className="space-y-2 rounded-lg border p-3"><p className="text-sm font-medium">Bản lịch sử · lưu lúc {new Date(x.receipt.recordedAt).toLocaleString('vi-VN')}</p><p className="text-sm">{x.currentStatus==='UNCHANGED_INPUTS'?'Đầu vào hiện chưa thay đổi; kết quả vẫn là số liệu lịch sử.':x.currentStatus==='STALE_AUTHORITY'?'Quyền người lập bản đã thay đổi; cần rà lại.':'Dữ liệu đã thay đổi sau bản lưu; xem phép đo hiện tại phía trên.'}</p><Summary report={x.receipt.report}/></article>)}</>}
  {receipt&&<article className="space-y-2 rounded-lg border p-3"><p role="status" className="font-medium">Đã xác nhận bản lưu lịch sử. Tải lại để so với dữ liệu hiện tại.</p><Summary report={receipt.report}/></article>}
 </section>;
}

