'use strict';
const {Router}=require('express');
const {supabase}=require('../config/supabase');
const state=require('../config/supabaseRouter');
const {createIntakeAdmin}=require('../modules/marketingAutomation/facebookLeadIntakeAdmin');
// The parent mount requires authMiddleware; DB checks current scope.
const r=Router(),handle=createIntakeAdmin({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
r.get('/status',(req,res)=>handle(req,res,'status'));
r.get('/console',(req,res)=>handle(req,res,'console'));
r.post('/bindings',(req,res)=>handle(req,res,'bindings'));
r.post('/recover',(req,res)=>handle(req,res,'recover'));
module.exports=r;
