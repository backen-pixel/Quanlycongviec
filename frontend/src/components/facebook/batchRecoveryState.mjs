const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const key = (actor, company) => `vpt-fb-batch-v1:${actor}:${company}`;
export function validatePending(p, actor, company) {
  if (!p || ![actor,company,p.requestId].every(uuid) || p.actorId !== actor || p.companyId !== company
    || !['actorId,companyId,contactIds,requestId','actorId,companyId,contactIds,intent,requestId'].includes(Object.keys(p).sort().join(','))
    || (Object.hasOwn(p,'intent') && p.intent !== 'STOP')
    || !Array.isArray(p.contactIds) || !p.contactIds.length || p.contactIds.length > 500 || p.contactIds.some(x => !uuid(x))
    || new Set(p.contactIds).size !== p.contactIds.length) throw Error('Yêu cầu đã lưu không hợp lệ. Cần đối soát lịch sử trên server.');
  return p;
}
export function readPending(storage, actor, company) {
  const raw = storage.getItem(key(actor,company));
  return raw === null ? null : validatePending(JSON.parse(raw),actor,company);
}
export function savePending(storage, p, allowStop = false) {
  validatePending(p,p.actorId,p.companyId);
  const old = readPending(storage,p.actorId,p.companyId);
  const sameSelection = old && old.actorId === p.actorId && old.companyId === p.companyId && old.requestId === p.requestId
    && JSON.stringify(old.contactIds) === JSON.stringify(p.contactIds);
  if (old && JSON.stringify(old) !== JSON.stringify(p) && !(allowStop && p.intent === 'STOP' && sameSelection)) throw Error('Còn lượt xử lý đã lưu. Đối soát lượt đó trước.');
  storage.setItem(key(p.actorId,p.companyId),JSON.stringify(p));
  if (JSON.stringify(readPending(storage,p.actorId,p.companyId)) !== JSON.stringify(p)) throw Error('Chưa lưu được yêu cầu để khôi phục.');
}
export function clearPending(storage,p) {
  if (JSON.stringify(readPending(storage,p.actorId,p.companyId)) !== JSON.stringify(p)) throw Error('Yêu cầu đã đổi ở cửa sổ khác.');
  storage.removeItem(key(p.actorId,p.companyId));
  if (readPending(storage,p.actorId,p.companyId) !== null) throw Error('Chưa xác nhận được việc đóng thông báo.');
}
export function validateJournal(x, actor, company, request) {
  if (!x || x.policy !== 'FACEBOOK_BATCH_JOURNAL_V1' || x.actorId !== actor || x.companyId !== company || x.requestId !== request
    || !['RUNNING','REVIEW','COMPLETED'].includes(x.state) || !Array.isArray(x.items) || !x.items.length || x.items.length>500
    || x.items.some(i => !uuid(i.contactId) || !['PENDING','RUNNING','UNKNOWN','CANCELLED','LINKED','SKIPPED'].includes(i.state))
    || new Set(x.items.map(i=>i.contactId)).size!==x.items.length
    || (x.state==='COMPLETED'&&x.items.some(i=>!['LINKED','SKIPPED'].includes(i.state)))) throw Error('Kết quả không khớp lượt xử lý. Giữ yêu cầu để đối soát.');
  return x;
}
export function journalSettled(x) {
  return !!x && ['COMPLETED','REVIEW'].includes(x.state) && x.items.length > 0 && x.items.every(i=>['LINKED','SKIPPED','CANCELLED'].includes(i.state));
}
export function createRecoveryController({actor,company,storage,send,isCurrent,update,newId}) {
  let pending=null,run=null,locked=false,storageError=null;
  try{pending=readPending(storage,actor,company);}catch(error){storageError=error;}
  const publish=(extra={})=>{if(isCurrent())update({pending,run,busy:locked,...extra});};
  const request=async(method,p)=>{
    if(locked||!isCurrent())return;
    locked=true;run=null;publish({error:''});
    try {
      const response=await send(method,p);
      if(!isCurrent())return;
      if(!response.ok)throw Error(response.data?.error||'Chưa nhận được kết quả. Yêu cầu đã được giữ lại.');
      const candidate=validateJournal(response.data?.journal,actor,company,p.requestId);
      if(p.contactIds&&JSON.stringify(candidate.items.map(x=>x.contactId))!==JSON.stringify(p.contactIds))throw Error('Danh sách phản hồi không khớp yêu cầu đã lưu.');
      run=candidate;
    } catch(error) { if(isCurrent())publish({error:error.message||'Chưa đọc được trạng thái. Không tự tạo lượt khác.'}); }
    finally {locked=false;publish();}
  };
  return { initial:()=>({pending,run,busy:false,storageFailed:!!storageError,error:storageError?.message||''}),
    async start(ids){if(storageError)throw storageError;if(locked||pending||!isCurrent())return;const p=validatePending({actorId:actor,companyId:company,requestId:newId(),contactIds:[...new Set(ids)]},actor,company);
      savePending(storage,p);pending=p;return request('POST',p);},
    refresh:()=>pending?request('GET',pending):Promise.resolve(),
    async resend(){
      if(!pending||locked||!isCurrent())return;
      const current=readPending(storage,actor,company);
      if(!current||current.requestId!==pending.requestId||JSON.stringify(current.contactIds)!==JSON.stringify(pending.contactIds))throw Error('Yêu cầu đã đổi ở cửa sổ khác. Đọc lại lịch sử trước.');
      pending=current;return request(pending.intent==='STOP'?'STOP':'POST',pending);
    },
    async stop(expectedRequestId){
      if(storageError)throw storageError;if(locked||!isCurrent())return;
      const target=pending||(run?{actorId:actor,companyId:company,requestId:run.requestId,contactIds:run.items.map(i=>i.contactId)}:null);
      if(!target)return;if(expectedRequestId&&target.requestId!==expectedRequestId)throw Error('Lượt đang xem đã thay đổi. Xác nhận lại đúng lượt cần dừng.');
      const p={...target,intent:'STOP'};
      savePending(storage,p,true);pending=p;return request('STOP',p);
    },
    inspect:requestId=>request('GET',{requestId}),
    acknowledge(){if(locked||!pending||!journalSettled(run)||run.requestId!==pending.requestId||!isCurrent())return;
      clearPending(storage,pending);pending=null;run=null;publish({error:''});},
  };
}
