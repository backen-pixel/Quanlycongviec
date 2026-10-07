import type { Result } from '../src/bridge.js';
export const company='00000000-0000-4000-8000-000000000001';
export const synthetic: Result={contract_version:'founder-control/v1',outcome:'PARTIAL',coverage:'PARTIAL',fetched_at:'2026-10-07T08:00:00Z',source_as_of:null,synthetic:true,
 scope:{company_id:company,tenant_id:'00000000-0000-4000-8000-000000000009'},window:{start:'2026-10-07T00:00:00+07:00',end:'2026-10-08T00:00:00+07:00',timezone:'Asia/Ho_Chi_Minh'},
 source_refs:[{ref:'lead_attribution',status:'ERROR',coverage:'UNKNOWN',reason:'SOURCE_UNAVAILABLE',source_as_of:null,freshness:'UNKNOWN_NO_SOURCE_WATERMARK'}],
 data:{metrics:{attribution_events:{value:null,status:'UNKNOWN',reason:'SOURCE_UNAVAILABLE',source_refs:['lead_attribution']},crm_records_created:{value:2,status:'OBSERVED',source_refs:['crm_leads']}},
 systems:[{title:'Báo cáo & Sự thật',next_step:'Đối soát nguồn',owner_id:null}],execution:'NOT_EXECUTED'}};
