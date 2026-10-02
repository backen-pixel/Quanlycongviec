'use strict';
const {Router}=require('express');
const {supabase}=require('../config/supabase');
const state=require('../config/supabaseRouter');
const {createIntakeAdmin}=require('../modules/marketingAutomation/facebookLeadIntakeAdmin');
const {createLegacyReview}=require('../modules/marketingAutomation/facebookLegacyReview');
// The parent mount requires authMiddleware; DB checks current scope.
const r=Router(),handle=createIntakeAdmin({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
const legacy=createLegacyReview({db:supabase,isPrimary:()=>!state.isFailoverEnabled()&&state.getActiveTarget()==='primary'});
r.get('/status',(req,res)=>handle(req,res,'status'));
r.get('/console',(req,res)=>handle(req,res,'console'));
r.post('/bindings',(req,res)=>handle(req,res,'bindings'));
r.post('/recover',(req,res)=>handle(req,res,'recover'));
r.post('/legacy/preview',(req,res)=>legacy(req,res,'preview'));
r.post('/legacy/commit',(req,res)=>legacy(req,res,'commit'));
module.exports=r;
