'use strict';
// Isolated release-candidate host. Never import server.js or its scheduled jobs.
const path = require('node:path');
const expectedRef = 'jdwgcivfqajpnlatrfwq';
if (process.env.STAGING_MODE !== '1' || process.env.SUPABASE_URL !== `https://${expectedRef}.supabase.co`) {
  throw new Error('Staging requires its explicitly provisioned database');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('Staging credentials must be configured independently');
}
// Keep provider credentials, backup targets and local .env files out of this host.
const allowed = new Set(['STAGING_MODE','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','JWT_SECRET','PORT','NODE_ENV','PATH','Path','SystemRoot','TEMP','TMP','HOME','USERPROFILE','NODE_EXTRA_CA_CERTS','FRONTEND_URL']);
for (const key of Object.keys(process.env)) if (!allowed.has(key)) delete process.env[key];
require('dotenv').config = () => ({ parsed: {} });
Object.assign(process.env, {
  REDIS_DISABLED:'1',PG_POOL_DISABLED:'1',RESPONSE_CACHE_DISABLED:'1',
  SUPABASE_FAILOVER_ENABLED:'0',SUPABASE_AUTO_FAILOVER:'0',SUPABASE_REPLICATION_DISABLED:'1',
  WORK_PLANS_AGGREGATES_ENABLED:'1',NODE_ENV:'production',
});
const express = require('express');
const helmet = require('helmet');
const app = express();
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'1mb'}));
app.use((_req,res,next)=>{res.set('X-TuBep-Environment','staging');next();});
app.get('/api/health',(_req,res)=>res.json({environment:'staging',database_ref:expectedRef,business_jobs:false,health_probes:true}));
app.use('/api/auth',(req,res,next)=>{
  if (!['/login','/logout','/me','/my-permissions','/check-permission','/google-config'].includes(req.path)) return res.status(404).json({error:'Tuyến này không thuộc bản thử'});
  next();
},require('./routes/auth'));
for (const [prefix,file] of [
  ['users','users'],['companies','companies'],['departments','departments'],['stages','stages'],
  ['app-modules','appModules'],['permissions','permissions'],['heartbeat','heartbeat'],['user-activity','userActivityLog'],
  ['projects','projects'],['work-plans','workPlans'],['work-tasks','workTasks'],
  ['management','management'],['production','production'],['customers','customers'],
  ['crm/daily-reports','crmDailyReports'],['crm','crm'],
]) app.use(`/api/${prefix}`,require(`./routes/${file}`));
app.use('/api',(_req,res)=>res.status(404).json({error:'Module này chưa được bật trên staging'}));
const dist = path.resolve(__dirname,'../../frontend/dist');
app.use(express.static(dist));
app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
app.use((err,_req,res,_next)=>{console.error('[staging]',err.message);res.status(500).json({error:'Lỗi bản thử'});});
app.listen(Number(process.env.PORT)||4000,()=>console.log('TuBep staging ready; production startup and jobs excluded'));
