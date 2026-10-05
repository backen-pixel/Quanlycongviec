import {useEffect,useRef,useState} from 'react';
import api from '../../lib/api';
import {channelLabels,purposeLabels,stateLabels,readinessLabels,documentValid,entryView,listView,choicesView,historyView,previewView,readPending,savePending,clearPending,changePayload,changeAck,vietnamInput,vietnamISO} from './careLibraryState.mjs';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const input='mt-1 block w-full rounded-lg border p-2 text-sm disabled:bg-gray-100';
const date=x=>new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const actionLabels={SAVE:'lưu bản nháp',APPROVE:'duyệt nội dung',REVOKE:'thu hồi nội dung'};
const empty=()=>({title:'',purpose:'ADVICE',question:'',answer:'',sourceReference:'',productId:null,regionIds:[],channels:['facebook'],validUntil:''});
export default function CustomerCareLibrary({companyId,actorId}){return <LibrarySession key={`${actorId}:${companyId}`} companyId={companyId} actorId={actorId}/>;}
function LibrarySession({companyId,actorId}){
 const [list,setList]=useState(null),[entry,setEntry]=useState(null),[form,setForm]=useState(null),[dirty,setDirty]=useState(false),[reason,setReason]=useState('');
 const [products,setProducts]=useState(null),[regions,setRegions]=useState(null),[search,setSearch]=useState(''),[searchTerm,setSearchTerm]=useState('');
 const [history,setHistory]=useState(null),[preview,setPreview]=useState(null),[previewRegion,setPreviewRegion]=useState(''),[previewChannel,setPreviewChannel]=useState('facebook');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(null),[storageError,setStorageError]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(false),locked=useRef(false),generation=useRef(0),storage=useRef(null),saved=useRef(null);
 const begin=()=>{locked.current=true;setBusy(true);setError('');setNotice('');return ++generation.current;};
 const current=n=>alive.current&&generation.current===n;
 const finish=n=>{if(current(n)){locked.current=false;setBusy(false);}};
 const wipe=()=>{setEntry(null);setForm(null);setDirty(false);setReason('');setHistory(null);setPreview(null);};
 const clearVisible=()=>{wipe();setList(null);setProducts(null);setRegions(null);};
 useEffect(()=>{alive.current=true;try{storage.current=window.sessionStorage;saved.current=readPending(storage.current,actorId,companyId);setPending(saved.current);}catch{setStorageError(true);setError('Không đọc được yêu cầu đã lưu. Thao tác thay đổi bị khóa để kiểm tra.');}void reload();return()=>{alive.current=false;generation.current++;locked.current=false;};},[]);
 function changed(key,value){setForm(old=>({...old,[key]:value}));setDirty(true);setPreview(null);setHistory(null);}
 function canLeave(){return !dirty||window.confirm('Nội dung đang sửa chưa được lưu. Bỏ phần sửa này?');}
 async function reload(after=null){
  if(locked.current||saved.current||(!after&&!canLeave()))return;const n=begin();if(!after){clearVisible();setSearch('');setSearchTerm('');}
  try{
   const {data}=await api.get('/facebook/customer-care/library',{params:{companyId,...(after?{after}:{})},timeout:15000});
   if(!current(n))return;const view=listView(data,companyId);setList(old=>({...view,items:after?[...(old?.items||[]),...view.items.filter(x=>!old?.items.some(y=>x.entryId===y.entryId))]:view.items}));
   if(!after){const rs=await Promise.all(['product','region'].map(kind=>api.get('/facebook/customer-care/library/choices',{params:{companyId,kind},timeout:15000})));if(!current(n))return;setProducts(choicesView(rs[0].data,companyId,'product',''));setRegions(choicesView(rs[1].data,companyId,'region',''));}
  }catch(e){if(current(n)){if(!after||e.response?.status===403)clearVisible();else setList(null);setError(after&&e.response?.status!==403?'Chưa tải được trang danh sách tiếp theo. Phần nội dung đang sửa vẫn được giữ; có thể lưu nháp trước khi tải lại.':'Chưa tải được thư viện trong phạm vi công ty. Tải lại để kiểm tra.');}}finally{finish(n);}
 }
 async function loadChoices(kind,after=null){
  if(locked.current||saved.current)return;const n=begin(),q=kind==='product'?(after?searchTerm:search.trim()):'';
  try{const {data}=await api.get('/facebook/customer-care/library/choices',{params:{companyId,kind,search:q,...(after?{after}:{})},timeout:15000});if(!current(n))return;const view=choicesView(data,companyId,kind,q),set=kind==='product'?setProducts:setRegions;set(old=>({...view,items:after?[...(old?.items||[]),...view.items.filter(x=>!old?.items.some(y=>y.id===x.id))]:view.items}));if(kind==='product')setSearchTerm(q);}
  catch(e){if(current(n)){if(e.response?.status===403)clearVisible();else if(kind==='product')setProducts(null);else setRegions(null);setError('Chưa tải được danh sách lựa chọn. Nội dung đang sửa chưa được lưu.');}}finally{finish(n);}
 }
 async function open(id){
  if(locked.current||saved.current||!canLeave())return;const n=begin();wipe();
  try{const {data}=await api.get('/facebook/customer-care/library/entry',{params:{companyId,entryId:id},timeout:15000});if(!current(n))return;const v=entryView(data,companyId,id);setEntry(v);setForm({...v.document});setPreviewRegion(v.document.regionIds[0]);setPreviewChannel(v.document.channels[0]);}
  catch(e){if(current(n)){if(e.response?.status===403)clearVisible();setError('Chưa đọc được nội dung. Tải lại thư viện để kiểm tra.');}}finally{finish(n);}
 }
 function newEntry(){if(locked.current||saved.current||!list||!canLeave())return;wipe();setForm(empty());setDirty(true);}
 async function submit(action){
  if(locked.current||storageError)return;
  if(!saved.current){
   if(!form||reason.trim().length<20||(action==='SAVE'&&(!documentValid(form)||Date.parse(form.validUntil)<=Date.now()))||(action!=='SAVE'&&(!entry||dirty)))return;
   const command={entryId:entry?.entryId||crypto.randomUUID(),action,expectedVersion:entry?.version||null,reason:reason.trim(),...(action==='SAVE'?{document:form}:{})};
   try{saved.current=savePending(storage.current,{actorId,companyId,requestId:crypto.randomUUID(),command:JSON.parse(JSON.stringify(command))});setPending(saved.current);}catch{setStorageError(true);setError('Chưa lưu được yêu cầu trên trình duyệt. Chưa gửi thay đổi đến hệ thống.');return;}
  }
  const intent=saved.current,n=begin();setPreview(null);setHistory(null);
  try{const {data}=await api.post('/facebook/customer-care/library/change',changePayload(intent),{timeout:15000});if(!current(n))return;changeAck(data,intent);clearPending(storage.current,actorId,companyId);saved.current=null;setPending(null);clearVisible();setNotice('Đã xác nhận thao tác. Tải lại thư viện để xem trạng thái hiện hành.');}
  catch(e){if(current(n)){if([400,409].includes(e.response?.status)){try{clearPending(storage.current,actorId,companyId);saved.current=null;setPending(null);}catch{setStorageError(true);}clearVisible();setError('Nội dung hoặc nguồn đã thay đổi, hoặc yêu cầu không hợp lệ. Tải lại và kiểm tra trước khi thao tác tiếp.');}else{if(e.response?.status===403)clearVisible();setError('Chưa xác nhận được kết quả. Gửi lại đúng yêu cầu đã lưu; không tạo thao tác khác.');}}}finally{finish(n);}
 }
 async function showPreview(){
  if(locked.current||saved.current||!entry||dirty)return;const n=begin(),snapshot=entry;setPreview(null);
  try{const {data}=await api.post('/facebook/customer-care/library/preview',{companyId,entryId:snapshot.entryId,version:snapshot.version,regionId:previewRegion,channel:previewChannel},{timeout:15000});if(current(n))setPreview(previewView(data,snapshot));}
  catch(e){if(current(n)){if([403,409].includes(e.response?.status))clearVisible();setError('Nội dung chưa đủ điều kiện hoặc đã thay đổi. Tải lại bản hiện hành để kiểm tra.');}}finally{finish(n);}
 }
 async function showHistory(before=null){
  if(locked.current||saved.current||!entry||dirty)return;const n=begin(),snapshot=entry;
  try{const {data}=await api.get('/facebook/customer-care/library/history',{params:{companyId,entryId:snapshot.entryId,version:snapshot.version,...(before?{before}:{})},timeout:15000});if(!current(n))return;const view=historyView(data,companyId,snapshot.entryId,snapshot.version,new Set(before?history?.items.map(x=>x.requestId):[]));setHistory(old=>({...view,items:before?[...old.items,...view.items]:view.items}));}
  catch(e){if(current(n)){setHistory(null);if([403,409].includes(e.response?.status))clearVisible();setError('Chưa tải được lịch sử hoặc nội dung đã thay đổi. Tải lại bản hiện hành.');}}finally{finish(n);}
 }
 const writeLocked=busy||!!pending||storageError,navLocked=busy||!!pending;
 return <section className="h-full overflow-auto p-4 md:p-6 space-y-4" aria-label="Thư viện nội dung tư vấn">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Nội dung tư vấn</h2><p className="text-sm text-gray-600">Chuẩn bị thông tin có nguồn và duyệt nội dung được phép dùng với khách.</p></div><div className="flex gap-2"><button className={button} disabled={navLocked} onClick={()=>reload()}>Tải lại thư viện</button><button className={`${button} bg-blue-600 text-white`} disabled={navLocked||!list||storageError} onClick={newEntry}>Thêm nội dung</button></div></header>
  <p className="rounded border bg-amber-50 p-3 text-sm">Duyệt nội dung chưa bật AI hoặc gửi tin. Báo giá cuối cùng và chốt đơn vẫn do người phụ trách thực hiện.</p>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  {storageError&&<p role="alert">Cần kiểm tra yêu cầu đã lưu trên trình duyệt trước khi thay đổi nội dung.</p>}
  {pending&&<div className="rounded border border-amber-300 p-3"><p>Có yêu cầu {actionLabels[pending.command.action]} chưa xác nhận kết quả. Yêu cầu được giữ khi tải lại trang trong phiên này.</p><button className={button} disabled={busy||storageError} onClick={()=>submit(pending.command.action)}>Gửi lại cùng yêu cầu thư viện</button></div>}
  <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]">
   <aside className="rounded border bg-white p-3 space-y-2" aria-label="Danh sách nội dung"><h3 className="font-semibold">Nội dung đã lưu</h3>{!list&&<p className="text-sm text-gray-500">{busy?'Đang tải…':'Chưa có danh sách đã xác nhận.'}</p>}{list?.items.length===0&&<p className="text-sm">Chưa có nội dung tư vấn.</p>}{list?.items.map(x=><button key={x.entryId} className={`${button} block w-full text-left ${entry?.entryId===x.entryId?'bg-blue-50 border-blue-600':''}`} disabled={navLocked} onClick={()=>open(x.entryId)}><strong className="block">{x.title}</strong><span className="block text-xs">{stateLabels[x.state]} · Phiên bản {x.revision}</span><span className="block text-xs">{x.approvedReady?'Đủ điều kiện về nội dung':readinessLabels[x.invalidReason]||'Cần kiểm tra'}</span></button>)}{list?.nextAfter&&<button className={button} disabled={navLocked} onClick={()=>reload(list.nextAfter)}>Xem thêm nội dung</button>}</aside>
   <article className="min-w-0 rounded border bg-white p-4 space-y-4" aria-label="Biên tập nội dung">
    {!form&&<p className="text-sm text-gray-500">Chọn nội dung hoặc thêm bản nháp mới.</p>}
    {form&&<><div className="text-sm"><strong>{entry?`${stateLabels[entry.state]} · Phiên bản ${entry.revision}`:'Nội dung mới'}</strong>{dirty&&<span className="ml-2 text-amber-800">Có thay đổi chưa lưu</span>}{entry&&<p>{entry.approvedReady?'Nội dung đã duyệt và còn hiệu lực.':readinessLabels[entry.invalidReason]||'Cần kiểm tra điều kiện sử dụng.'}</p>}{entry?.approvedAt&&<p>Duyệt lúc {date(entry.approvedAt)}; hiệu lực đến {date(entry.document.validUntil)}.</p>}</div>
    <fieldset disabled={writeLocked} className="space-y-3"><legend className="sr-only">Thông tin nội dung</legend>
     <label className="block text-sm">Tên nội dung<input className={input} value={form.title} maxLength={200} onChange={e=>changed('title',e.target.value)}/></label>
     <label className="block text-sm">Mục đích<select className={input} value={form.purpose} onChange={e=>changed('purpose',e.target.value)}>{Object.entries(purposeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <div className="rounded border p-3 space-y-2"><label className="block text-sm">Tìm sản phẩm theo tên hoặc mã<input className={input} value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/></label><button type="button" className={button} onClick={()=>loadChoices('product')}>Tìm sản phẩm</button>
      <label className="block text-sm">Sản phẩm áp dụng<select className={input} value={form.productId||''} onChange={e=>changed('productId',e.target.value||null)}><option value="">Thông tin chung, không gắn một sản phẩm</option>{form.productId&&!products?.items.some(x=>x.id===form.productId)&&<option value={form.productId}>Sản phẩm đã lưu — chưa có tên trong trang lựa chọn này</option>}{products?.items.map(x=><option key={x.id} value={x.id}>{x.name}{x.code?` (${x.code})`:''}</option>)}</select></label>{products?.nextAfter&&<button type="button" className={button} onClick={()=>loadChoices('product',products.nextAfter)}>Xem thêm sản phẩm</button>}{!products&&<p className="text-sm text-amber-800">Chưa tải được danh sách sản phẩm.</p>}</div>
     <fieldset className="rounded border p-3"><legend className="text-sm">Khu vực áp dụng</legend>{regions?.items.map(x=><label key={x.id} className="mr-4 inline-flex gap-2 text-sm"><input type="checkbox" checked={form.regionIds.includes(x.id)} onChange={e=>changed('regionIds',e.target.checked?[...form.regionIds,x.id]:form.regionIds.filter(id=>id!==x.id))}/>{x.name}</label>)}{form.regionIds.filter(id=>!regions?.items.some(x=>x.id===id)).map((id,i)=><p key={id} className="text-sm">Khu vực đã lưu {i+1}: chưa có tên trong trang lựa chọn này. <button type="button" className={button} onClick={()=>changed('regionIds',form.regionIds.filter(x=>x!==id))}>Bỏ khu vực đã lưu {i+1}</button></p>)}{regions?.nextAfter&&<button type="button" className={button} onClick={()=>loadChoices('region',regions.nextAfter)}>Xem thêm khu vực</button>}{!regions&&<button type="button" className={button} onClick={()=>loadChoices('region')}>Tải danh sách khu vực</button>}</fieldset>
     <fieldset className="rounded border p-3"><legend className="text-sm">Kênh được phép dùng nội dung</legend>{Object.entries(channelLabels).map(([k,v])=><label key={k} className="mr-4 inline-flex gap-2 text-sm"><input type="checkbox" checked={form.channels.includes(k)} onChange={e=>changed('channels',e.target.checked?[...form.channels,k]:form.channels.filter(c=>c!==k))}/>{v}</label>)}<p className="mt-1 text-xs text-gray-500">Chọn kênh ở đây không mở kết nối hoặc quyền gửi tin.</p></fieldset>
     <label className="block text-sm">Câu hỏi hoặc tình huống sử dụng<textarea className={input} rows={2} value={form.question} maxLength={1000} onChange={e=>changed('question',e.target.value)}/></label>
     <label className="block text-sm">Nội dung trả lời được phép dùng<textarea className={input} rows={6} value={form.answer} maxLength={4000} onChange={e=>changed('answer',e.target.value)}/></label>
     <label className="block text-sm">Nguồn xác nhận (tài liệu, phiên bản và vị trí tham chiếu)<textarea className={input} rows={2} value={form.sourceReference} maxLength={2000} onChange={e=>changed('sourceReference',e.target.value)}/></label>
     <label className="block text-sm">Hiệu lực đến (giờ Việt Nam)<input type="datetime-local" className={input} value={vietnamInput(form.validUntil)} onChange={e=>changed('validUntil',vietnamISO(e.target.value))}/></label>
     <label className="block text-sm">Lý do lưu, duyệt hoặc thu hồi (ít nhất 20 ký tự)<textarea className={input} rows={2} value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)}/></label>
    </fieldset>
    <div className="flex flex-wrap gap-2"><button className={`${button} bg-blue-600 text-white`} disabled={writeLocked||!documentValid(form)||Date.parse(form.validUntil)<=Date.now()||reason.trim().length<20} onClick={()=>submit('SAVE')}>Lưu bản nháp</button><button className={`${button} bg-green-700 text-white`} disabled={writeLocked||dirty||!entry?.canApprove||entry.state!=='DRAFT'||!entry.sourceReady||Date.parse(entry.document.validUntil)<=Date.now()||reason.trim().length<20} onClick={()=>submit('APPROVE')}>Duyệt đúng phiên bản đang xem</button><button className={button} disabled={writeLocked||dirty||!entry||entry.state==='REVOKED'||reason.trim().length<20} onClick={()=>submit('REVOKE')}>Thu hồi nội dung</button></div>
    {entry&&!entry.canApprove&&<p className="text-sm text-gray-500">Tài khoản này có thể soạn nháp; quyền duyệt cần được chỉ định riêng.</p>}{dirty&&<p className="text-sm text-amber-800">Lưu bản nháp rồi mở lại nội dung trước khi duyệt. Lưu sửa đổi sẽ làm mất hiệu lực duyệt cũ.</p>}
    {entry&&!dirty&&<div className="border-t pt-3 space-y-3"><div className="flex flex-wrap gap-3"><label className="text-sm">Khu vực xem trước<select className={input} value={previewRegion} disabled={navLocked} onChange={e=>{setPreviewRegion(e.target.value);setPreview(null);}}>{entry.document.regionIds.map((id,i)=><option key={id} value={id}>{regions?.items.find(x=>x.id===id)?.name||`Khu vực đã lưu ${i+1}`}</option>)}</select></label><label className="text-sm">Kênh xem trước<select className={input} value={previewChannel} disabled={navLocked} onChange={e=>{setPreviewChannel(e.target.value);setPreview(null);}}>{entry.document.channels.map(c=><option key={c} value={c}>{channelLabels[c]}</option>)}</select></label></div><div className="flex gap-2"><button className={button} disabled={navLocked||!entry.approvedReady} onClick={showPreview}>Xem trước câu trả lời</button><button className={button} disabled={navLocked} onClick={()=>showHistory()}>Xem lịch sử nội dung</button></div>
     {preview&&<div className="rounded bg-blue-50 p-3" aria-label="Bản xem trước"><strong className="text-sm">Xem trước — chưa gửi cho khách</strong><p className="whitespace-pre-wrap break-words text-sm">{preview.text}</p><p className="mt-2 text-xs">Nguồn: {preview.sourceReference}</p></div>}
     {history&&<div className="space-y-2" aria-label="Lịch sử nội dung"><h3 className="font-semibold">Lịch sử — không phải quyền sử dụng hiện hành</h3>{history.items.map(x=><details key={x.requestId} className="rounded border p-3"><summary className="cursor-pointer text-sm">Phiên bản {x.revision} · {actionLabels[x.action]} · {date(x.recordedAt)}</summary><p className="text-sm">{x.actorName}: {x.reason}</p><p className="text-sm">{x.document.title} · {stateLabels[x.state]}</p><p className="whitespace-pre-wrap break-words text-sm">{x.document.answer}</p><p className="text-xs">Nguồn: {x.document.sourceReference}</p></details>)}{history.nextBefore&&<button className={button} disabled={navLocked} onClick={()=>showHistory(history.nextBefore)}>Xem lịch sử cũ hơn</button>}</div>}
    </div>}
    </>}
   </article>
  </div>
 </section>;
}
