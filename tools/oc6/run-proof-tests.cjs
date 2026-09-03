'use strict';
// Offline test/evidence orchestration. Production integration does not import this runner.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const [workspaceArg,outputArg,expectedCommit,expectedTree,expectedOC6Count]=process.argv.slice(2);
assert(workspaceArg&&outputArg,'workspace and external fresh output directory required');
const workspace=path.resolve(workspaceArg),out=path.resolve(outputArg);
assert(!out.toLowerCase().startsWith(workspace.toLowerCase()+path.sep),'Evidence output must be outside the tested worktree');
assert(!fs.existsSync(out),'Preserve prior evidence; output directory must be new');
const base='cb0e627093bdc837fcf64d080cebf4d0443b80f7',baseTree='fe110ce78ae91512f34141c2fcd0aa16051febbd';
const environment={...process.env,GIT_OPTIONAL_LOCKS:'0',READ_REVIEW_WORKSPACE:workspace};
const git=(args,binary=false)=>cp.execFileSync('git',['-c','safe.directory='+workspace.replaceAll('\\','/'),...args],{cwd:workspace,encoding:binary?null:'utf8',windowsHide:true,env:environment,maxBuffer:40e6});
const g=args=>git(args).trim(),sha=b=>createHash('sha256').update(b).digest('hex');
const split=s=>s?s.split('\n'):[];
assert.equal(g(['rev-parse',base+'^{tree}']),baseTree);
const originalPaths=new Set(split(g(['ls-tree','-r','--name-only',base])));
function inventory(){
  const paths=[...new Set([...split(g(['diff','--name-only',base])),...split(g(['ls-files','--others','--exclude-standard']))])].sort();
  assert(paths.length>0&&paths.length<=20,'OC6 scope must be 1..20 paths');
  for(const p of paths){assert(!originalPaths.has(p),'STOP: existing baseline file changed: '+p);assert(/^(tools|docs|qa)\/oc6\//.test(p),'STOP: outside OC6 scope: '+p);}
  return paths;
}
const paths=inventory();
const originals=split(g(['ls-files','tools/bos-ai1','tools/reg4','tools/mg5','qa/reg4','qa/mg5']));
git(['diff','--exit-code',base,'--',...originals]);
const sourcePaths=[...new Set([...originals,...paths.filter(p=>/\.(c?js)$/.test(p))])].sort();
const snapshot=()=>({commit:g(['rev-parse','HEAD']),tree:g(['rev-parse','HEAD^{tree}']),branch:g(['branch','--show-current'])||'HEAD',status:g(['status','--porcelain=v1','--untracked-files=all']),inventory:inventory(),source:sourcePaths.map(file=>({file,workspace_sha256:sha(fs.readFileSync(path.join(workspace,file))),...(expectedCommit?{blob:g(['rev-parse',expectedCommit+':'+file]),canonical_sha256:sha(git(['show',expectedCommit+':'+file],true))}:{})}))});
const before=snapshot();
if(expectedCommit){assert.equal(before.commit,expectedCommit);assert.equal(before.tree,expectedTree);assert.equal(before.branch,'HEAD');assert.equal(before.status,'');git(['merge-base','--is-ancestor',base,expectedCommit]);assert(Number.isSafeInteger(Number(expectedOC6Count))&&Number(expectedOC6Count)>0);}
fs.mkdirSync(out,{recursive:true});
const packagePath='docs/bos-ai1/BOS_AI1_READ_PRE_EFFECT_EVIDENCE.json';
const packageBytes=git(['show',base+':'+packagePath],true),pkg=JSON.parse(packageBytes);
assert.equal(pkg.technical_commit,'b040d12a27ec0c99433a7c2abb988cc993cf337b');assert.equal(pkg.technical_tree,'4190816ac113d2b6352eb7d242b1d35a9f58ca1e');assert.equal(sha(packageBytes),'de6fec1673d5cd2ff0b3b7690fa726847dffb41a761d49ab0abc2fcce044234d');
const selected=['regression/controlled-publish.independent.test.js','regression/pre-effect.independent.test.js','regression/fixture.js','regression/draft/reviewer-fixture.js','regression/draft/reviewer-adversarial.test.js','regression/draft/reviewer-expiry-boundary.test.js','independent-round0/review-fixture.cjs','independent-round0/review-adversarial.test.cjs'];
const extracted=[];
for(const p of selected){const matches=pkg.artifacts.filter(a=>a.path===p);assert.equal(matches.length,1);const a=matches[0],bytes=Buffer.from(a.data,'base64');assert.equal(a.encoding,'base64');assert.equal(bytes.length,a.bytes);assert.equal(sha(bytes),a.sha256);const file=path.join(out,'historical',p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);extracted.push({source:p,file,bytes:a.bytes,sha256:a.sha256});}
const historic=p=>path.join(out,'historical',p);
const groups=[
 ['oc6',['tools/oc6/control-integration-proof.test.js','tools/oc6/control-integration-security.test.js'],expectedOC6Count?Number(expectedOC6Count):null],
 ['read',['tools/bos-ai1/read-pre-effect-handoff-proof.test.js'],387],
 ['draft',['tools/bos-ai1/draft-pre-effect-handoff-proof.test.js'],176],
 ['baseline',['tools/bos-ai1/pre-effect-handoff-proof.test.js','tools/bos-ai1/controlled-publish-proof.test.js','tools/bos-ai1/project-progress-brief-proof.test.js','tools/reg4/agent-registry.test.js','qa/reg4/agent-registry.independent.test.js','tools/mg5/model-gateway-proof.test.js','qa/mg5/model-gateway-proof.independent.test.js'],383],
 ['controlled-publish-independent',[historic(selected[0])],152],
 ['pre-effect-independent',[historic(selected[1])],173],
 ['draft-independent',[historic(selected[4]),historic(selected[5])],223],
 ['read-independent',[historic(selected[7])],85],
];
const results=[];
for(const [name,files,expected] of groups){const args=['--test','--test-concurrency=1',...files],started=new Date().toISOString();const run=cp.spawnSync(process.execPath,args,{cwd:workspace,windowsHide:true,env:environment,maxBuffer:40e6});const stdout=run.stdout||Buffer.alloc(0),stderr=run.stderr||Buffer.alloc(0);fs.writeFileSync(path.join(out,name+'.tap'),stdout);fs.writeFileSync(path.join(out,name+'.stderr.txt'),stderr);const counts={};for(const k of ['tests','pass','fail','cancelled','skipped','todo'])counts[k]=Number(stdout.toString().match(new RegExp('^# '+k+' (\\d+)\\r?$','m'))?.[1]);const count=expected??counts.tests;const passed=run.status===0&&count>0&&counts.tests===count&&counts.pass===count&&['fail','cancelled','skipped','todo'].every(k=>counts[k]===0);const r={name,command:[process.execPath,...args],cwd:workspace,started_utc:started,finished_utc:new Date().toISOString(),exit_code:run.status,...counts,expected:count,result:passed?'PASS':'FAIL',stdout_file:name+'.tap',stdout_sha256:sha(stdout),stderr_file:name+'.stderr.txt',stderr_sha256:sha(stderr)};results.push(r);console.log(name+': '+counts.pass+'/'+count+' '+r.result);}
const after=snapshot(),unchanged=JSON.stringify(before)===JSON.stringify(after);
const report={result:unchanged&&results.every(x=>x.result==='PASS')?'PASS':'FAIL',kind:expectedCommit?'FORMAL_TRACEABLE':'DEVELOPMENT',commit:before.commit,tree:before.tree,base,base_tree:baseTree,workspace,before,after,unchanged,node:process.version,git:g(['--version']),platform:process.platform,environment_overrides:{GIT_OPTIONAL_LOCKS:'0',READ_REVIEW_WORKSPACE:workspace},groups:results,tests:results.reduce((n,r)=>n+r.tests,0),oc6_tests:results[0].tests,historical_tests:results.slice(1).reduce((n,r)=>n+r.tests,0),historical_package:{path:packagePath,blob:g(['rev-parse',base+':'+packagePath]),canonical_sha256:sha(packageBytes)},extracted};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,tests:report.tests,oc6:report.oc6_tests,regression:report.historical_tests,unchanged,commit:report.commit,tree:report.tree}));if(report.result!=='PASS')process.exitCode=1;
