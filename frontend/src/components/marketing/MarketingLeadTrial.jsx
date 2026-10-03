import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import FacebookSourceRecovery from './FacebookSourceRecovery';
const button='rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
const money=n=>Number.isFinite(n)?`${n.toLocaleString('vi-VN')} đ`:'Chưa đủ dữ liệu';
const issueNames={RECEIPT_ACQUISITION_CONFLICT:'Thời điểm hoặc định danh khách mâu thuẫn giữa các bằng chứng nguồn',RECEIPT_NOT_RECONCILED:'Biểu mẫu còn chờ xử lý hoặc đối soát',IDENTITY_UNRESOLVED:'Nhóm khách còn trùng hoặc cần rà lại',EARLIER_HISTORY_UNVERIFIED:'Chưa xác minh được lịch sử trước nguồn quảng cáo',FIRST_SOURCE_AMBIGUOUS:'Nguồn đầu tiên còn mâu thuẫn',FIRST_SOURCE_OUTSIDE_ACCOUNTS:'Nguồn đầu tiên nằm ngoài tài khoản của kỳ',RECEIPT_PROOF_CONFLICT:'Hồ sơ khách chưa khớp bằng chứng nhận biểu mẫu',QUALIFICATION_CONFLICT:'Các kết luận nhu cầu trong nhóm đang mâu thuẫn',QUALIFICATION_PENDING:'Cần xác minh hoặc xác minh lại nhu cầu',SOURCE_WITHOUT_IDENTITY:'Bằng chứng nguồn không còn hồ sơ nhận diện tương ứng',PAID_SOURCE_UNVERIFIED:'Chưa chứng minh được nguồn trả phí'};
export default function MarketingLeadTrial({companyId}){
 if(!companyId)return <section className="rounded-xl border bg-white p-4 text-sm">Chọn một công ty để xem kỳ đo khách và chi phí.</section>;
 return <Trial key={companyId} companyId={companyId}/>;
}
function Trial({companyId}){
 const[trials,setTrials]=useState([]),[selected,setSelected]=useState(''),[result,setResult]=useState(null),[error,setError]=useState('');
 const[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[creating,setCreating]=useState(false),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const[name,setName]=useState(''),[since,setSince]=useState(''),[confirmed,setConfirmed]=useState(false);
 const seq=useRef(0),pending=useRef(null),saveLock=useRef(false),recoveryRequests=useRef(new Map());
 const[recovering,setRecovering]=useState(false);
 const end=since&&Number.isFinite(Date.parse(`${since}T00:00:00Z`))?new Date(Date.parse(`${since}T00:00:00Z`)+29*86400000).toISOString().slice(0,10):'';
 useEffect(()=>{
  const current=++seq.current,controller=new AbortController();setLoading(true);setResult(null);setError('');
  api.get('/crm/marketing-trials',{params:{company_id:companyId},signal:controller.signal,timeout:20000}).then(async({data})=>{
   if(seq.current!==current)return;
   if(data?.companyId!==companyId||!Array.isArray(data.trials)||data.trials.some(t=>t.company_id!==companyId))throw Error('invalid scope');
   setTrials(data.trials);const id=data.trials.some(t=>t.id===selected)?selected:data.trials[0]?.id;
   if(!id)return;const response=await api.get(`/crm/marketing-trials/${id}/report`,{params:{company_id:companyId},signal:controller.signal,timeout:20000});
   if(seq.current!==current)return;
   if(response.data?.companyId!==companyId||response.data?.trial?.id!==id||response.data?.measurementStatus!=='INCOMPLETE'||!Array.isArray(response.data.issues))throw Error('invalid report');
   setResult(response.data);if(id!==selected)setSelected(id);
  }).catch(e=>{if(seq.current===current){setResult(null);setError(e.response?.data?.error||'Chưa đọc được kỳ đo. Số cũ được ẩn; vui lòng thử lại.');}}).finally(()=>{if(seq.current===current)setLoading(false);});
  return()=>{++seq.current;controller.abort();};
 },[companyId,selected,reload]);
 async function save(e){
  e.preventDefault();if(loading||recovering||saveLock.current||(!pending.current&&(!confirmed||name.trim().length<3||!since||!end)))return;
  const current=seq.current;
  if(!pending.current)pending.current={trialId:crypto.randomUUID(),requestId:crypto.randomUUID(),name:name.trim(),since,until:end,expectedRevision:0};
  saveLock.current=true;setSaving(true);setError('');
  try{const{data}=await api.post('/crm/marketing-trials',pending.current,{params:{company_id:companyId},timeout:20000});if(seq.current!==current)return;if(data?.company_id!==companyId||data?.id!==pending.current.trialId)throw Error('invalid result');pending.current=null;setUncertain(false);setCreating(false);setName('');setSince('');setConfirmed(false);setSelected(data.id);setReload(n=>n+1);}
  catch(e){if(seq.current===current){if([400,403,404,409].includes(e.response?.status)){pending.current=null;setUncertain(false);setError(e.response?.data?.error||'Không lưu được cấu hình; cần kiểm tra lại.');}else{setUncertain(true);setError('Chưa xác nhận được kết quả lưu. Gửi lại cùng yêu cầu để xác nhận.');}}}
  finally{saveLock.current=false;if(seq.current===current)setSaving(false);}
 }
 const locked=loading||saving||uncertain||recovering;
 return <section aria-label="Khách và chi phí theo kỳ" className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
  <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Khách và chi phí — kỳ đo</h2><p className="mt-1 text-sm text-slate-600">Theo toàn bộ tài khoản Facebook đã lưu cho kỳ này; dùng khoảng ngày riêng, không thu hẹp theo Page ở bộ lọc phía trên.</p></div><button type="button" className={button} disabled={loading||locked} onClick={()=>{setResult(null);setReload(n=>n+1);}}>Tải lại kỳ đo</button></div>
  {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
  {loading?<p role="status">Đang kiểm tra khách và chi tiêu…</p>:<>
   {!!trials.length&&<label className="block text-sm">Kỳ đo<select className="ml-2 rounded-lg border p-2" value={selected} disabled={locked} onChange={e=>{setResult(null);setSelected(e.target.value);}}>{trials.map(t=><option key={t.id} value={t.id}>{t.name} · {t.since} – {t.until}</option>)}</select></label>}
   {!trials.length&&!error&&<p className="text-sm">Chưa lưu kỳ đo cho công ty này.</p>}
   {result&&<>
    <p className="text-sm">{result.trial.since} – {result.trial.until} · {result.trial.accountCount} tài khoản · Đọc lúc {new Date(result.asOf).toLocaleString('vi-VN')}</p>
    {result.period?.status==='AVAILABLE'?<p className="text-sm text-slate-600">Tiền và khách dưới đây cùng tính từ {result.period.since} đến hết {result.period.until} theo giờ Việt Nam. Chất lượng khách được kiểm tra theo hồ sơ hiện tại.</p>:<p role="status" className="text-sm text-amber-800">Kỳ này chưa có ngày hoàn tất để đối chiếu tiền và khách.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Tiền đã chi trong kỳ đối chiếu',result.spend?.status==='KNOWN_TO_DATE'?money(result.spend.spendVnd):'Chưa đủ dữ liệu'],['Khách đã xác minh',result.observed?.qualified],['Khách chờ xác minh',result.observed?.pending],['Nhóm cần đối soát',result.observed?.unresolved]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-xl font-semibold">{result.period?.status==='AVAILABLE'?(value??'Chưa đủ dữ liệu'):'Chưa có ngày hoàn tất'}</p></div>)}</div>
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Số khách trên chỉ tính trong hồ sơ đã nhận và có bằng chứng. Chưa đối soát đủ với Facebook, nên chưa kết luận chi phí/khách hoặc đạt mục tiêu 250.000 đồng.</p>
    <FacebookSourceRecovery key={result.trial.id} companyId={companyId} trialId={result.trial.id} reconciliation={result.reconciliation} pendingRequests={recoveryRequests.current} onBusy={setRecovering} onRefresh={()=>setReload(n=>n+1)} disabled={loading||saving||uncertain}/>
    {result.period?.status==='AVAILABLE'&&<dl className="grid grid-cols-2 gap-2 text-sm"><dt>Biểu mẫu chờ xử lý/đối soát</dt><dd>{result.observed?.unprocessedForms??'—'}</dd><dt>Lượt gửi đã chứng minh ngoài kỳ đối chiếu</dt><dd>{result.observed?.outsidePeriodForms??'—'}</dd><dt>Khách đã có trước kỳ</dt><dd>{result.observed?.existing??'—'}</dd><dt>Khách không đạt nhu cầu</dt><dd>{result.observed?.rejected??'—'}</dd><dt>Lịch khảo sát</dt><dd>Chưa nối nguồn lịch</dd></dl>}
    {!!result.issues.length&&<ul className="list-disc pl-5 text-sm text-amber-800">{result.issues.map(x=><li key={x.code}>{issueNames[x.code]||'Cần kiểm tra thêm nguồn dữ liệu'}: {x.count}</li>)}</ul>}
    {result.period?.status==='AVAILABLE'&&result.spend?.status!=='KNOWN_TO_DATE'&&<p className="text-sm text-amber-800">Chi tiêu chưa đủ hoặc cấu hình tài khoản đã đổi. Cần kiểm tra quyền và đồng bộ đủ ngày; phần thiếu không được tính là 0.</p>}
   </>}
  </>}
  <button type="button" className={button} disabled={loading||locked} onClick={()=>setCreating(v=>!v)}>{creating?'Đóng cấu hình':'Cấu hình kỳ đo mới'}</button>
  {creating&&<form onSubmit={save} className="space-y-3 border-t pt-3"><p className="text-sm text-slate-600">Lưu phạm vi đo 30 ngày. Cấu hình này chưa mở chạy quảng cáo hoặc cấp ngân sách.</p><label className="block text-sm">Tên kỳ đo<input className="mt-1 block w-full rounded-lg border p-2" minLength={3} maxLength={120} value={name} disabled={locked} onChange={e=>{setName(e.target.value);setConfirmed(false);}}/></label><label className="block text-sm">Ngày bắt đầu<input type="date" className="ml-2 rounded-lg border p-2" value={since} disabled={locked} onChange={e=>{setSince(e.target.value);setConfirmed(false);}}/></label><p className="text-sm">Ngày cuối: {end||'Chọn ngày bắt đầu'} · Múi giờ Việt Nam.</p><label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e=>setConfirmed(e.target.checked)}/>Tôi xác nhận khoảng đo và dùng tất cả tài khoản Facebook đã cấu hình của công ty.</label><button className={`${button} bg-blue-700 text-white`} disabled={recovering||loading||saving||(!uncertain&&(!confirmed||name.trim().length<3||!end))}>{uncertain?'Xác nhận lại cùng yêu cầu':'Lưu cấu hình đo'}</button></form>}
 </section>;
}
