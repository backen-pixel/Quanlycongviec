require('dotenv').config();
const fs=require('fs'), path=require('path');
const { supabase } = require('../src/config/supabase');
const COT='d5cf0698-30f8-4eae-b4ed-135b940327cd';
const apply=process.argv.includes('--apply');
(async () => {
  const { data: truoc } = await supabase.from('production_pipeline_stages')
    .select('id,name,order_index,board_tab,workshop_type_id,company_id').eq('id',COT).maybeSingle();
  if (!truoc) throw new Error('không thấy cột');
  console.log(`Cột: #${truoc.order_index} «${truoc.name}»`);
  console.log(`   board_tab: ${truoc.board_tab}  →  sx`);
  const { count } = await supabase.from('projects').select('id',{count:'exact',head:true}).eq('sx_kanban_column_id',COT);
  console.log(`   ${count} dự án sẽ hiện lại trên tab Sản xuất`);
  if (!apply) return console.log('\n(chạy thử — thêm --apply để ghi)');
  const bak=path.join(__dirname,'..','uploads',`_rollback_board_tab_${Date.now()}.json`);
  fs.writeFileSync(bak, JSON.stringify({ truoc }, null, 2));
  const { error } = await supabase.from('production_pipeline_stages').update({ board_tab:'sx' }).eq('id',COT);
  if (error) throw error;
  const { data: sau } = await supabase.from('production_pipeline_stages').select('board_tab').eq('id',COT).maybeSingle();
  console.log(`\n✅ board_tab = ${sau.board_tab}. Hoàn tác: ${path.basename(bak)}`);
})().catch(e=>{console.error('❌',e.message);process.exit(1);});
