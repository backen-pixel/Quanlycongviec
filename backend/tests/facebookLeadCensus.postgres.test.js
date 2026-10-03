'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const dsn=process.env.FB_CENSUS_TEST_DATABASE_URL;
test('isolated PostgreSQL Facebook census',{skip:!dsn},async t=>{
 const url=new URL(dsn);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/fb_census_test');
 const {Client}=require('pg'),db=new Client({connectionString:dsn}),peers=[];await db.connect();
 const company=randomUUID(),other=randomUUID(),tenant=randomUUID(),admin=randomUUID(),sales=randomUUID(),region=randomUUID(),pipeline=randomUUID(),stage=randomUUID(),source=randomUUID(),kind=randomUUID();
 const config={pageId:'123',formId:'456',accountId:'act_77',expectedRevision:0,active:true,approvalReference:'Synthetic approved routing for isolated acceptance only',fieldMap:{name:'full_name',phone:'phone_number',request:'need'},regionId:region,ownerId:sales,pipelineId:pipeline,stageId:stage,sourceId:source,leadTypeId:kind};
 let counter=1000;
 try{
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
  await db.query(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
   CREATE TABLE tenants(id uuid PRIMARY KEY,is_active boolean);CREATE TABLE companies(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
   CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,tenant_id uuid,role text,is_active boolean);
   CREATE TABLE company_regions(id uuid PRIMARY KEY,company_id uuid,is_active boolean);
   CREATE TABLE user_company_regions(user_id uuid,region_id uuid,PRIMARY KEY(user_id,region_id));
   CREATE TABLE facebook_pages(page_id text PRIMARY KEY,default_company_id uuid,is_active boolean,access_token text);
   CREATE TABLE fb_ad_accounts(ad_account_id text PRIMARY KEY,company_id uuid,bat boolean,token_het_han timestamptz,access_token text);
   CREATE TABLE crm_pipelines(id uuid PRIMARY KEY,company_id uuid,is_active boolean,region_id uuid);
   CREATE TABLE crm_pipeline_stages(id uuid PRIMARY KEY,pipeline_id uuid,is_active boolean,pipeline_type text,is_won boolean,is_lost boolean);
   CREATE TABLE crm_sources(id uuid PRIMARY KEY,company_id uuid,is_active boolean);
   CREATE TABLE crm_lead_types(id uuid PRIMARY KEY,company_id uuid,is_active boolean,applies_to text);
   CREATE TABLE customers(id uuid PRIMARY KEY,full_name varchar NOT NULL,phone varchar NOT NULL,email varchar,company_id uuid,assigned_to uuid,source varchar);
   CREATE TABLE crm_leads(id uuid PRIMARY KEY,code text,title text NOT NULL,type text,customer_id uuid,company_id uuid,region_id uuid,assigned_to uuid,lead_owner_id uuid,created_by uuid,pipeline_id uuid,stage_id uuid,source_id uuid,lead_type_id uuid,description text,first_touch_time timestamptz);
   CREATE TABLE facebook_lead_ads(leadgen_id text PRIMARY KEY,page_id text,form_id text,processed boolean,lead_id uuid);
   CREATE TABLE facebook_contacts(page_id text,psid text,lead_id uuid);`);
  await db.query('INSERT INTO tenants VALUES($1,true)',[tenant]);await db.query('INSERT INTO companies VALUES($1,$3,true),($2,$3,true)',[company,other,tenant]);
  await db.query("INSERT INTO users VALUES($1,$3,$4,'admin',true),($2,$3,$4,'sales',true)",[admin,sales,company,tenant]);
  await db.query('INSERT INTO company_regions VALUES($1,$2,true)',[region,company]);await db.query('INSERT INTO user_company_regions VALUES($1,$2)',[sales,region]);
  await db.query("INSERT INTO facebook_pages VALUES('123',$1,true,'page-test-token')",[company]);await db.query("INSERT INTO fb_ad_accounts VALUES('act_77',$1,true,NULL,'ad-test-token')",[company]);
  await db.query('INSERT INTO crm_pipelines VALUES($1,$2,true,$3)',[pipeline,company,region]);await db.query("INSERT INTO crm_pipeline_stages VALUES($1,$2,true,'lead',false,false)",[stage,pipeline]);
  await db.query('INSERT INTO crm_sources VALUES($1,$2,true)',[source,company]);await db.query("INSERT INTO crm_lead_types VALUES($1,$2,true,'lead')",[kind,company]);
  await db.query('ALTER TABLE customers ADD COLUMN created_at timestamptz DEFAULT now();ALTER TABLE crm_leads ADD COLUMN created_at timestamptz DEFAULT now();');
  for(const file of ['649_marketing_spend_evidence.sql','650_crm_lead_qualification.sql','651_crm_lead_identity.sql','652_facebook_lead_intake.sql','653_facebook_lead_intake_console.sql','654_crm_identity_review.sql','655_marketing_lead_trial.sql','656_facebook_lead_census.sql','657_marketing_census_reconciliation.sql','670_marketing_measurement_period.sql','671_marketing_source_registry.sql','672_marketing_census_witness.sql']){const sql=fs.readFileSync(path.resolve(__dirname,'../../database',file),'utf8');await db.query(sql);await db.query(sql);}
  for(let i=0;i<3;i++){const c=new Client({connectionString:dsn});await c.connect();await c.query('SET ROLE service_role');peers.push(c);}
  const query=(name,args,c=peers[0])=>c.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args).then(x=>x.rows[0]?.r);
  const bind=(cmd=config,who=admin,cid=company,key=randomUUID())=>query('marketing_fb_lead_binding_set',[who,cid,key,cmd]);
  const enqueue=(id=String(counter++),form='456',c=peers[0])=>query('marketing_fb_lead_enqueue',[JSON.stringify([{pageId:'123',formId:form,leadgenId:id}]),'a'.repeat(64)],c);
  const lease=async(c=peers[0])=>{const token=randomUUID();const rows=await c.query('SELECT * FROM marketing_fb_lead_claim($1,$2)',[['123'],token]);return{r:rows.rows[0],token}};
  const setup=async()=>{await enqueue();const item=await lease();item.ctx=await query('marketing_fb_lead_context',[item.r.id,item.token]);return item};
  const proof=item=>({provider:'META_LEAD_ADS_V1',pageId:'123',formId:'456',leadgenId:item.r.leadgen_id,source:'PAID',accountId:'act_77',adId:'888',adsetId:'999',campaignId:'111',graphVersion:'v24.0',acquiredAt:new Date(Date.now()-3600000).toISOString(),fetchedAt:new Date().toISOString()});
  const contact={name:'Khách giả',phone:'0901234567',email:'',request:'Tủ bếp'};
  const commit=(item,p=proof(item),c=peers[0],person=contact)=>query('crm_accept_facebook_lead',[item.r.id,item.token,item.ctx.contextVersion,p,person],c);
  const count=async table=>(await db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
  const dropQueue=()=>db.query("UPDATE marketing_fb_lead_receipts SET state='REVIEW',lease_token=NULL,lease_until=NULL WHERE state<>'DONE'");
  await require('./facebookLeadCensus.cases')(t,{db,peers,company,other,tenant,admin,sales,region,bind,setup,proof,commit,query});
 }finally{await Promise.all(peers.map(c=>c.end()));await db.end();}
});
