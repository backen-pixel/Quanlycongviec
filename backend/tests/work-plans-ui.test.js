const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
const express=require('express');const {chromium}=require('playwright');const {createRouter}=require('../src/modules/work-plans/public/router');
const root=path.resolve(__dirname,'../../frontend');const actor='00000000-0000-4000-8000-000000000001', company='00000000-0000-4000-8000-000000000002';
test('Browser: template to draft to approved plan, own tasks, completion, template reuse and old project', {timeout:120000},async()=>{
  let row=null;const templates=[];const versions=[];const commands=new Map();
  const repo={getPlan:async id=>id===actor?row:null,listPlans:async()=>row?[{...row,project_id:actor}]:[],
    replay:async(key,hash)=>{const c=commands.get(key);if(!c)return null;if(c.hash!==hash)throw Object.assign(new Error('reused'),{status:409});return c.result;},
    commit:async(kind,id,expected,key,hash,doc,ctx)=>{const result={revision:expected+1,document:structuredClone(doc)};if(kind==='template')templates.push({template_id:id,version:expected+1,document:structuredClone(doc)});else{row={company_id:ctx.companyId,...result};versions.push({...row,created_at:new Date().toISOString()});commands.set(key,{hash,result});}return result;},
    listTemplates:async()=>templates,getTemplate:async(id,version)=>templates.find(t=>t.template_id===id&&t.version===version),history:async()=>versions};
  const app=express();app.use(express.json());app.get('/api/users',(req,res)=>res.json([{id:actor,full_name:'Nhân viên mẫu'}]));
  app.use('/api/work-plans',createRouter({repository:repo,auth:(req,res,next)=>{req.user={userId:actor,company_id:company,role:req.headers['x-test-role']};next();},scope:async(req,res,id)=>({project:{id,company_id:company}}),isManager:u=>u.role==='manager',validateAssignees:async()=>{}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let vite,browser;
  try{
    const {createServer}=await import(pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')).href);
    const react=(await import(pathToFileURL(path.join(root,'node_modules/@vitejs/plugin-react/dist/index.js')).href)).default;
    const tailwind=(await import(pathToFileURL(path.join(root,'node_modules/@tailwindcss/vite/dist/index.mjs')).href)).default;
    const fixture=path.join(root,'tests/work-plans-ui');
    vite=await createServer({configFile:false,root:fixture,plugins:[react(),tailwind()],resolve:{alias:{'../lib/api':path.join(fixture,'api.js'),'../lib/auth':path.join(fixture,'auth.js')}},server:{host:'127.0.0.1',port:43017,fs:{allow:[root]},proxy:{'^/api/':`http://127.0.0.1:${server.address().port}`}}});await vite.listen();
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(`${r.url()} ${r.failure()?.errorText}`));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    const base=`http://127.0.0.1:${vite.httpServer.address().port}`;const url=`${base}/sx/projects/${actor}/plan`;
    await page.goto(url);try{await page.getByRole('heading',{name:'Lập và điều chỉnh kế hoạch'}).waitFor({timeout:10000});}catch(e){throw new Error(`${e.message}\n${errors.join('\n')}\n${(await page.content()).slice(0,2000)}`);}
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'24px');
    await page.getByLabel('Dùng quy trình mẫu').selectOption('example:glass');
    await page.getByLabel('Hạn hoàn thành sản xuất').fill('2026-11-30T17:00');
    const assignees=page.getByLabel('Người phụ trách');assert.equal(await assignees.count(),6);for(const select of await assignees.all())await select.selectOption(actor);
    await page.getByRole('button',{name:'Lưu nháp và tính lịch'}).click();await page.getByRole('heading',{name:'Lịch dự kiến bản nháp',exact:true}).waitFor();assert.equal(row.document.active,null);assert.equal(row.document.draft.graph.tasks.length,6);
    await page.getByRole('button',{name:'Duyệt và giao thực hiện'}).click();await page.getByRole('heading',{name:'Nhiệm vụ đang thực hiện'}).waitFor();assert.equal(row.document.active.graph.tasks.length,6);
    try{await page.locator('article').first().waitFor({timeout:5000});}catch(e){throw new Error(`${e.message}\n${JSON.stringify(row.document.active.graph.tasks.map(t=>t.assignee_id))}\n${(await page.locator('body').innerText()).slice(0,5000)}`);}
    const article=page.locator('article').filter({has:page.getByText('Chốt kích thước',{exact:true})});await article.getByRole('button',{name:'Hoàn thành',exact:true}).click();await page.waitForFunction(()=>document.querySelector('article')?.innerText.includes('Hoàn thành'));assert.equal(row.document.execution.t1.status,'done');
    await page.getByText('Công đoạn hiện tại: Gia công kính',{exact:true}).waitFor();
    await page.getByText('Có thể làm song song: Gia công khung',{exact:true}).waitFor();
    await page.getByLabel('Tên mẫu').fill('Cánh kính tiêu chuẩn');await page.getByRole('button',{name:'Lưu thành mẫu mới',exact:true}).click();await page.getByRole('status').filter({hasText:'Đã xuất bản mẫu'}).waitFor();assert.equal(templates[0].document.graph.tasks[0].assignee_id,null);assert.equal(templates[0].document.graph.tasks[0].status,undefined);
    await page.screenshot({path:path.resolve(__dirname,'../../docs/_tmp_work_plans_ui.png'),fullPage:true});
    await page.goto(`${url}?role=staff`);await page.getByRole('heading',{name:'Nhiệm vụ đang thực hiện'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Lập và điều chỉnh kế hoạch'}).count(),0);
    await page.goto(`${base}/sx/plan-tasks?role=staff`);await page.getByText('Mở kế hoạch dự án →').first().waitFor();assert.equal(await page.getByText('Mở kế hoạch dự án →').count(),6);
    await page.goto(`${base}/sx/projects/00000000-0000-4000-8000-000000000099/plan`);await page.getByText('Dự án chưa có kế hoạch linh hoạt được duyệt.',{exact:false}).waitFor();
    await page.getByLabel('Dùng quy trình mẫu').selectOption(`${templates[0].template_id}:1`);assert.equal(await page.getByLabel('Người phụ trách').first().inputValue(),'');
    let board={enabled:false,items:[]};
    await page.route('**/api/work-plans/board?*',route=>route.fulfill({json:board}));
    await page.goto(`${base}/test-board`);
    await page.getByText('2 dự án chưa có kế hoạch đã duyệt hoặc chỉ có quyền xem phần việc cá nhân.',{exact:false}).waitFor();
    assert.equal(await page.getByText('Đang đọc kế hoạch',{exact:false}).count(),0);
    board={enabled:true,items:[]};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByText('Chưa có kế hoạch được phép hiển thị trên bảng công đoạn.',{exact:true}).waitFor();
    const stages=[{id:'a',name:'Thiết kế'},{id:'b',name:'Đóng gói'}];
    const item=(project_id,index)=>({project_id,state:'approved',scope:'project',total:2,completed:index,waived:0,progression:{stages,current:stages[index],complete:false,parallel:[]}});
    board={enabled:true,items:[item(actor,1),item('00000000-0000-4000-8000-000000000003',0)]};
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Thiết kế · 1',exact:true}).waitFor();
    assert.deepEqual(await page.locator('h3').allTextContents(),['Thiết kế · 1','Đóng gói · 1']);
    board.items[1]=item('00000000-0000-4000-8000-000000000003',1);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Đóng gói · 2',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Thiết kế · 1',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
  }finally{if(browser)await browser.close();if(vite)await vite.close();await new Promise(r=>server.close(r));}
});
