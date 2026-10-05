'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {assertLegacyLeadMergeAccess,legacyCleanupScope}=require('../src/helpers/crmLegacyMergeAccess');

module.exports=async(t,{db,peers,company,other,admin,sales,region,pipeline})=>{
  // Exercise real SELECT grants and current rows. No production DB and no
  // physical merge is performed; transaction/concurrent merge is still open.
  await db.query(`ALTER TABLE crm_pipelines ADD COLUMN IF NOT EXISTS allow_employee_delete_lead boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS allow_employee_delete_deal boolean NOT NULL DEFAULT true;
    GRANT SELECT ON users,companies,tenants,crm_leads,customers,crm_pipelines,user_company_regions,company_regions TO service_role;`);
  const allowed={users:['id','role','company_id','tenant_id','is_active'],companies:['id','tenant_id','is_active'],
    tenants:['id','is_active'],crm_leads:['id','company_id','customer_id','type','pipeline_id','region_id','assigned_to','lead_owner_id'],
    customers:['id','company_id'],crm_pipelines:['id','company_id','allow_employee_delete_lead','allow_employee_delete_deal'],
    user_company_regions:['user_id','region_id'],company_regions:['id','company_id','is_active']};
  const adapter={writes:[],from(table){
    assert.ok(allowed[table]);let columns='*',single=false;const filters=[];
    const q={select(s){const names=s.split(',').map(x=>x.trim());assert.ok(names.every(x=>allowed[table].includes(x)));columns=names.join(',');return q;},
      eq(k,v){assert.ok(allowed[table].includes(k));filters.push([k,v,false]);return q;},
      in(k,v){assert.ok(allowed[table].includes(k));filters.push([k,v,true]);return q;},
      maybeSingle(){single=true;return q;},
      update(){adapter.writes.push(table);throw Error('Access helper must not mutate');},
      delete(){adapter.writes.push(table);throw Error('Access helper must not delete');},
      then(resolve,reject){return (async()=>{
        const params=[],where=filters.map(([k,v,many])=>{params.push(v);return many?`${k}=ANY($${params.length}::uuid[])`:`${k}=$${params.length}`;}).join(' AND ');
        assert.ok(where);
        try{const r=await peers[0].query(`SELECT ${columns} FROM ${table} WHERE ${where}`,params);return{data:single?(r.rows[0]||null):r.rows};}catch(error){return{error};}
      })().then(resolve,reject);}
    };return q;
  }};
  const req=actor=>({user:{userId:actor,role:'platform_admin',company_id:other},body:{}});
  const record=async()=>{
    const customer=randomUUID(),keep=randomUUID(),source=randomUUID();
    await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic merge customer','0900000000',$2)",[customer,company]);
    for(const id of [keep,source])await db.query(`INSERT INTO crm_leads(id,title,type,company_id,customer_id,assigned_to,lead_owner_id,region_id,pipeline_id)
      VALUES($1,'Synthetic merge Lead','lead',$2,$3,$4,$4,$5,$6)`,[id,company,customer,sales,region,pipeline]);
    return{customer,keep,source};
  };
  const check=(c,actor=sales)=>assertLegacyLeadMergeAccess(adapter,req(actor),c.keep,[c.source]);
  await t.test('actual merge access reads PostgreSQL current owner instead of broad request claims',async()=>{
    const c=await record();assert.equal((await check(c)).actor.role,'sales');
    await db.query('UPDATE crm_leads SET assigned_to=$2,lead_owner_id=$2 WHERE id=$1',[c.source,admin]);
    await assert.rejects(check(c),{status:403});assert.deepEqual(adapter.writes,[]);
    assert.equal((await db.query('SELECT count(*)::int n FROM crm_leads WHERE id=ANY($1::uuid[])',[[c.keep,c.source]])).rows[0].n,2);
  });
  await t.test('actual merge access rejects another company inside the same tenant',async()=>{
    const c=await record();await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1',[c.source,other]);
    await assert.rejects(check(c,admin),{status:403});assert.deepEqual(adapter.writes,[]);
  });
  await t.test('actual merge access observes revoked actor and pipeline deletion policy',async()=>{
    const c=await record();await db.query('UPDATE users SET is_active=false WHERE id=$1',[sales]);
    try{await assert.rejects(check(c),{status:403});}finally{await db.query('UPDATE users SET is_active=true WHERE id=$1',[sales]);}
    await db.query('UPDATE crm_pipelines SET allow_employee_delete_lead=false WHERE id=$1',[pipeline]);
    try{await assert.rejects(check(c),{status:403});await check(c,admin);}finally{await db.query('UPDATE crm_pipelines SET allow_employee_delete_lead=true WHERE id=$1',[pipeline]);}
  });
  await t.test('actual merge access validates Customer company before handing off to mutation',async()=>{
    const c=await record();await db.query('UPDATE customers SET company_id=$2 WHERE id=$1',[c.customer,other]);
    await assert.rejects(check(c,admin),{status:403});assert.deepEqual(adapter.writes,[]);
  });
  await t.test('actual merge region grant disappears immediately when PostgreSQL membership is removed',async()=>{
    const c=await record(),actor=randomUUID();await db.query("INSERT INTO users SELECT $1,company_id,tenant_id,'region_admin',true FROM users WHERE id=$2",[actor,sales]);
    await db.query('INSERT INTO user_company_regions(user_id,region_id) VALUES($1,$2)',[actor,region]);await check(c,actor);
    await db.query('DELETE FROM user_company_regions WHERE user_id=$1',[actor]);await assert.rejects(check(c,actor),{status:403});
  });
  await t.test('actual merge access cannot interpret PostgreSQL privilege failure as empty data',async()=>{
    const c=await record();await db.query('REVOKE SELECT ON crm_pipelines FROM service_role');
    try{await assert.rejects(check(c),{status:503});assert.deepEqual(adapter.writes,[]);}finally{await db.query('GRANT SELECT ON crm_pipelines TO service_role');}
  });
  await t.test('actual cleanup ignores cached company and requires an explicit company for ecosystem admin',async()=>{
    assert.equal((await legacyCleanupScope(adapter,req(admin))).companyId,company);
    await assert.rejects(legacyCleanupScope(adapter,{...req(admin),body:{company_id:other}}),{status:403});
    const actor=randomUUID();await db.query("INSERT INTO users SELECT $1,NULL,tenant_id,'ecosystem_admin',true FROM users WHERE id=$2",[actor,admin]);
    await assert.rejects(legacyCleanupScope(adapter,req(actor)),{status:403});
    assert.equal((await legacyCleanupScope(adapter,{...req(actor),body:{company_id:company}})).companyId,company);
  });
};
