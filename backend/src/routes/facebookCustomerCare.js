'use strict';
const {Router}=require('express');
const {supabase}=require('../config/supabase');
const state=require('../config/supabaseRouter');
const {createCustomerCare}=require('../modules/marketingAutomation/facebookCustomerCare');
// Parent mount authenticates; each RPC checks the current actor and company.
const r=Router(),care=createCustomerCare({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
r.get('/threads',(req,res)=>care.handle(req,res,'list'));
r.get('/queue',(req,res)=>care.handle(req,res,'queue'));
r.get('/thread',(req,res)=>care.handle(req,res,'read'));
r.get('/history',(req,res)=>care.handle(req,res,'history'));
r.post('/control',(req,res)=>care.handle(req,res,'control'));
module.exports=r;
