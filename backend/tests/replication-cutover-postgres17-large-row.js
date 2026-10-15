'use strict';
// Disposable official-PostgreSQL17 CI fixture only. Never load app env/URLs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const v2=require('../scripts/prepare-replication-cutover-v2-20261015');
const NAME='vpt_cutover_large_rows_synthetic',MAX_RSS=1024*1024*1024;
function guardedUrl(env){assert.equal(env.VPT_CUTOVER_TEST_ONLY,'1','synthetic gate required');const u=new URL(env.VPT_CUTOVER_TEST_DATABASE_URL||'');
  assert.ok(['postgres:','postgresql:'].includes(u.protocol));assert.ok(['127.0.0.1','[::1]'].includes(u.hostname));assert.equal(u.pathname,'/vpt_cutover_synthetic');assert.equal(u.username,'postgres');
  assert.equal(decodeURIComponent(u.password),'vpt-synthetic-only-20261015');assert.equal(u.search,'');assert.equal(u.hash,'');assert.ok(u.port);return u;
}
function memoryProfile(){let peak=0;const checkpoints=[];return {mark(label){const m=process.memoryUsage(),os=process.resourceUsage().maxRSS*1024;peak=Math.max(peak,m.rss,os);assert.ok(peak<=MAX_RSS,'synthetic standalone client RSS exceeded 1GiB');checkpoints.push({label,rss_bytes:m.rss,heap_used_bytes:m.heapUsed,external_bytes:m.external,process_peak_rss_bytes:os});},result(){return {peak_rss_bytes:peak,rss_budget_bytes:MAX_RSS,checkpoints};}};}
async function run(){const base=guardedUrl(process.env),{Client}=require(process.argv[2]||'pg'),admin=new Client({connectionString:base.href,connectionTimeoutMillis:5000});let db,created=false;const profile=memoryProfile();
  await admin.connect();try{assert.equal((await admin.query("SELECT current_setting('server_version_num')::int n")).rows[0].n,170006);
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[NAME])).rows[0].n,0,'refuse existing synthetic database');
    await admin.query('CREATE DATABASE '+NAME);created=true;const u=new URL(base.href);u.pathname='/'+NAME;db=new Client({connectionString:u.href,connectionTimeoutMillis:5000});await db.connect();
    const sql=fs.readFileSync(path.resolve(__dirname,'../../database/20261015051758_replication_cutover_v2_preparation.sql'),'utf8');await db.query(sql);await v2.privateContract(db);
    await db.query('CREATE TABLE public.large_rows(id uuid PRIMARY KEY,payload text,amount numeric)');
    // PostgreSQL builds UTF8 payloads; no large fixture string is sent by Node.
    await db.query(`WITH s AS (SELECT 'Đỗ Việt 漢字 😀'::text AS pattern),p AS (SELECT repeat(pattern,(12600000/octet_length(pattern))::int)||repeat('x',(12600000%octet_length(pattern))::int) AS payload FROM s)
      INSERT INTO public.large_rows SELECT md5(g::text)::uuid,p.payload,12345678901234567890.123456789 FROM generate_series(1,12) g CROSS JOIN p`);
    const size=(await db.query('SELECT count(*)::int rows,max(octet_length(to_jsonb(t)::text))::int maxrow FROM public.large_rows t')).rows[0];
    assert.equal(size.rows,12);assert.ok(size.maxrow>=12547819&&size.maxrow<=v2.ROW_BYTES);
    const inventory=await v2.inventorySite(db,'primary',{SUPABASE_REPLICATION_LIGHT:'1'}),entry=inventory.tables.find(t=>t.name==='large_rows');
    const meta={run_id:crypto.randomUUID(),capture_id:crypto.randomUUID(),site:'primary',phase:'baseline',manifest_sha256:'a'.repeat(64),key_id:crypto.randomUUID()},secret=Buffer.alloc(32,71).toString('base64');
    let fetches=[],chunks=0,verified=0;
    const client={query:async(sql,args)=>{const r=await db.query(sql,args);const match=/^FETCH FORWARD (\d+)/.exec(sql);if(match){fetches.push(Number(match[1]));profile.mark('fetch');}return r;}};
    global.gc?.();profile.mark('before_stream');await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const summary=await v2.streamTable(client,entry,meta,secret,async artifact=>{
      chunks++;assert.ok(artifact.ciphertext.length<=v2.CHUNK_BYTES);profile.mark('encrypted_chunk');
      const plain=v2.decrypt(artifact,secret);profile.mark('decrypted_text');const rows=JSON.parse(plain).raw_rows;profile.mark('decoded_chunk');
      verified+=rows.length;for(const raw of rows){assert.ok(raw.includes('Đỗ Việt 漢字 😀'));assert.ok(raw.includes('12345678901234567890.123456789'));}
    });await db.query('ROLLBACK');profile.mark('after_stream');
    assert.equal(summary.rows,'12');assert.equal(verified,12);assert.ok(chunks>=6);assert.ok(fetches.length>=2);assert.ok(fetches.every(n=>n===Math.min(64,Math.floor(v2.FETCH_RAW_BUDGET/size.maxrow))&&n>1&&n*size.maxrow<=v2.FETCH_RAW_BUDGET));
    await db.query("TRUNCATE public.large_rows;INSERT INTO public.large_rows VALUES(md5('oversized')::uuid,repeat('x',16777217),1)");await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    let transferred=false;await assert.rejects(()=>v2.streamTable(db,entry,meta,secret,async()=>{transferred=true;}),e=>e.cutoverCode==='CUTOVER_V2_ROW_TOO_LARGE');await db.query('ROLLBACK');assert.equal(transferred,false);
    console.log(JSON.stringify({ok:true,fixture:'synthetic_postgres17_large_rows',server_version:'17.6',rows:verified,max_row_bytes:size.maxrow,chunks,fetch_rows:fetches[0],...profile.result()}));
  }finally{if(db)await db.end().catch(()=>{});if(created)await admin.query('DROP DATABASE '+NAME);await admin.end();}
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({ok:false,reason:'SYNTHETIC_PG17_LARGE_ROW_BENCHMARK_FAILED'}));process.exitCode=1;});
module.exports={guardedUrl,memoryProfile};
