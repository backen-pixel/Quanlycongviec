import { useState } from 'react';
import { Bell, RefreshCw, GitBranch, LayoutGrid } from 'lucide-react';

// ─── Step data ─────────────────────────────────────────────────────────────
// col = index within the module (used by swim-lane diagram)
const STEPS = [
  { id:0,  mod:'CRM', col:0, icon:'📥', label:'Lead mới',      sub:'Tiếp nhận',      color:'#7c3aed',
    detail:'Khách hàng tiềm năng tiếp nhận qua form, email, điện thoại, Facebook Ads. Hệ thống tạo lead và gán nhân viên sale phụ trách ngay lập tức.',
    tips:['📌 Gán nhân viên ngay khi tiếp nhận','📊 Ghi rõ nguồn lead để đo kênh'] },
  { id:1,  mod:'CRM', col:1, icon:'📞', label:'Liên hệ',        sub:'Tiếp cận KH',    color:'#7c3aed',
    detail:'Sale liên hệ khai thác nhu cầu, ghi nhận kết quả cuộc gọi, lên lịch hẹn demo.',
    tips:['📝 Ghi chú sau mỗi cuộc gọi','🔔 Đặt lịch nhắc follow-up'] },
  { id:2,  mod:'CRM', col:2, icon:'💡', label:'Tư vấn',         sub:'Demo & đề xuất', color:'#7c3aed',
    detail:'Tư vấn chi tiết, gửi catalog, mẫu tham khảo. Ghi nhận yêu cầu kỹ thuật.',
    tips:['📎 Đính kèm catalog vào CRM','🔧 Ghi chú kỹ yêu cầu kỹ thuật'] },
  { id:3,  mod:'CRM', col:3, icon:'📄', label:'Báo giá',        sub:'Gửi proposal',   color:'#7c3aed',
    detail:'Tạo và gửi báo giá chi tiết. Theo dõi trạng thái phản hồi, điều chỉnh nếu cần.',
    tips:['💰 Tạo báo giá trong module Báo giá','👀 Theo dõi: Gửi → Xem → Phản hồi'] },
  { id:4,  mod:'CRM', col:4, icon:'🤝', label:'Đàm phán',       sub:'Thương lượng',   color:'#7c3aed',
    detail:'Đàm phán điều khoản: thanh toán, tiến độ giao hàng, bảo hành.',
    tips:['📋 Ghi chú điều khoản đã thỏa thuận','📁 Đính kèm bản nháp hợp đồng'] },
  { id:5,  mod:'CRM', col:5, icon:'🏆', label:'THẮNG',          sub:'Deal chốt ✓',    color:'#16a34a', isWon:true,
    detail:'Deal đánh dấu THẮNG. Hệ thống tức thì tạo Dự án Sản xuất và thông báo nhân viên xưởng.',
    tips:['🧾 Tạo đơn hàng & hóa đơn từ deal','🔍 Kiểm tra thông tin kỹ thuật'],
    event:{ icon:'⚡', type:'trigger', title:'Tự động tạo Dự án SX',
      desc:'Dự án SX tự tạo tại Kanban Xưởng cột "Chờ vào xưởng". Toàn bộ thông tin deal được liên kết.',
      notify:'production · manager', crmUpdate:'Deal giữ THẮNG → tự cập nhật khi SX bắt đầu' } },
  { id:6,  mod:'SX',  col:0, icon:'⏳', label:'Chờ xưởng',     sub:'Hàng đợi SX',    color:'#ea580c', crmDealTrigger:0,
    detail:'Dự án xuất hiện trên Kanban Xưởng. Xưởng trưởng lên kế hoạch, phân công nhân viên. CRM deal tự nhảy sang cột "Sản xuất".',
    tips:['📐 Xem bản vẽ kỹ thuật trong tab Tài liệu','⏰ Đặt deadline SX'] },
  { id:7,  mod:'SX',  col:1, icon:'⚙️', label:'Đang SX',        sub:'Gia công',        color:'#ea580c',
    detail:'Nhân viên xưởng sản xuất theo đơn. Cập nhật tiến độ qua nhiệm vụ, ghi chú kỹ thuật.',
    tips:['✅ Tạo nhiệm vụ cho từng công đoạn','⚠️ Ghi sự cố nếu có vấn đề'] },
  { id:8,  mod:'SX',  col:2, icon:'✅', label:'Hoàn thành',     sub:'Kiểm tra QC',    color:'#ea580c',
    detail:'Kiểm tra chất lượng QC, tạo biên bản nghiệm thu, chụp ảnh sản phẩm.',
    tips:['📸 Tải ảnh sản phẩm hoàn thiện','📋 Kiểm tra đủ thông tin trước khi bàn giao'] },
  { id:9,  mod:'SX',  col:3, icon:'🚚', label:'Bàn giao VC',    sub:'Chuyển VC ✓',    color:'#1d4ed8', isWon:true, crmDealTrigger:1,
    detail:'Nhân viên nhấn "Bàn giao VC" trên Kanban. Hệ thống tự tạo Dự án Vận chuyển. CRM deal nhảy sang "Vận chuyển".',
    tips:['📂 Đảm bảo hồ sơ kỹ thuật đã đính kèm','📍 Ghi chú địa điểm giao hàng'],
    event:{ icon:'🚀', type:'trigger', title:'Tự động tạo Dự án VC',
      desc:'Dự án xuất hiện trong module Vận chuyển & Lắp đặt. Quản lý VC nhận thông báo điều phối.',
      notify:'logistics · installer', crmUpdate:'CRM deal → cột "Vận chuyển"' } },
  { id:10, mod:'VC',  col:0, icon:'📋', label:'Tiếp nhận',      sub:'Điều phối đội',  color:'#0f766e',
    detail:'Quản lý VC phân công người vận chuyển và đội lắp đặt. Gửi thông báo tới từng người được gán.',
    tips:['👥 Gán đội VC trong tab Đội ngũ','📅 Kiểm tra lịch khả dụng của đội'] },
  { id:11, mod:'VC',  col:1, icon:'🚛', label:'Vận chuyển',     sub:'Giao hàng',      color:'#0f766e',
    detail:'Đội giao sản phẩm đến địa điểm. Cập nhật trạng thái, chụp ảnh bằng chứng giao hàng.',
    tips:['📸 Chụp ảnh khi giao hàng thành công','✅ Xác nhận với KH'] },
  { id:12, mod:'VC',  col:2, icon:'🔧', label:'Lắp đặt',        sub:'Thi công',       color:'#0f766e', crmDealTrigger:2,
    detail:'Đội lắp đặt thi công, kiểm tra vận hành, hướng dẫn sử dụng. CRM deal nhảy sang "Lắp đặt".',
    tips:['📝 Ghi chú kết quả lắp đặt chi tiết','🖼️ Tải ảnh nghiệm thu'] },
  { id:13, mod:'VC',  col:3, icon:'⭐', label:'CSKH',           sub:'Hoàn tất ✓',     color:'#16a34a', isEnd:true, crmDealTrigger:3,
    detail:'CSKH liên hệ sau lắp đặt, thu thập phản hồi, xử lý bảo hành. CRM deal hoàn tất, quay về CRM cột CSKH.',
    tips:['⭐ Thu thập đánh giá khách hàng','💎 Tạo cơ hội upsell'],
    event:{ icon:'🎉', type:'end', title:'Quay về CRM — Hoàn tất!',
      desc:'Deal kết thúc đầy đủ vòng đời: CRM → SX → VC → CSKH. CRM pipeline cập nhật cột CSKH.',
      notify:'sale · manager', crmUpdate:'Deal về CRM cột "CSKH" — kết thúc vòng đời' } },
];

// CRM Deal auto-update stages (rendered in CRM row, right side)
const CRM_DEAL = [
  { icon:'⚙️', label:'Sản xuất',   triggerAt:6,  color:'#ea580c' },
  { icon:'🚛', label:'Vận chuyển', triggerAt:9,  color:'#1d4ed8' },
  { icon:'🔧', label:'Lắp đặt',   triggerAt:12, color:'#0f766e' },
  { icon:'⭐', label:'CSKH',       triggerAt:13, color:'#16a34a' },
];

const LANE = {
  CRM:{ color:'#7c3aed', light:'#f5f3ff', border:'#ddd6fe', label:'CRM Pipeline', icon:'💼', gradient:'#ede9fe' },
  SX: { color:'#ea580c', light:'#fff7ed', border:'#fdba74', label:'Xưởng Sản xuất', icon:'🏭', gradient:'#ffedd5' },
  VC: { color:'#0f766e', light:'#f0fdfa', border:'#5eead4', label:'Vận chuyển & Lắp đặt', icon:'🚚', gradient:'#ccfbf1' },
};

// ─────────────────────────────────────────────────────────────────────────────
// DIAGRAM 1 — Swim Lanes
// ─────────────────────────────────────────────────────────────────────────────
// Uses s.col to position nodes within each lane
const SW=1100, SH=444;
const S_NW=124, S_NH=64, S_LBL=80;
const SLANE={ CRM:{y:16,h:104}, SX:{y:170,h:104}, VC:{y:324,h:104} };
const s_nd=(m)=>SLANE[m].y+20;
const s_nc=(m)=>SLANE[m].y+20+S_NH/2;
const s_nb=(m)=>SLANE[m].y+20+S_NH;
const s_crmX=(i)=>S_LBL+4+i*177;  // step=177, NW=124 → gap=53
const s_crmCX=(i)=>s_crmX(i)+S_NW/2;
const s_sxX=(i)=>S_LBL+4+i*295;   // step=295, NW=124 → gap=171
const s_sxCX=(i)=>s_sxX(i)+S_NW/2;
const s_nx=(m,c)=>m==='CRM'?s_crmX(c):s_sxX(c);
const s_ncx=(m,c)=>m==='CRM'?s_crmCX(c):s_sxCX(c);

function SwimLaneDiagram({ active, setActive }) {
  const cur=STEPS[active]; const lc=cur.color||LANE[cur.mod].color;
  return (
    <svg width={SW} height={SH} style={{display:'block',fontFamily:'system-ui,sans-serif',overflow:'visible'}}>
      <defs>
        {Object.entries(LANE).map(([m,l])=>(
          <linearGradient key={m} id={`sg-${m}`} x1="0" x2="1">
            <stop offset="0%" stopColor={l.light}/><stop offset="100%" stopColor={l.gradient}/>
          </linearGradient>
        ))}
        {Object.entries(LANE).map(([m,l])=>(
          <linearGradient key={`n${m}`} id={`ng1-${m}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={l.color}/><stop offset="100%" stopColor={l.color} stopOpacity="0.8"/>
          </linearGradient>
        ))}
        <filter id="sh1"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00000012"/></filter>
        <filter id="gl1" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <marker id="s-ag" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,.5L0,6.5L8,3.5z" fill="#cbd5e1"/></marker>
        <marker id="s-ac" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,.5L0,6.5L8,3.5z" fill={lc}/></marker>
        <marker id="s-ab" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,.5L0,7.5L9,4z" fill="#3b82f6"/></marker>
      </defs>
      {/* Lane bands */}
      {Object.entries(SLANE).map(([mod,ll])=>{
        const l=LANE[mod];
        const done=STEPS.filter(s=>s.mod===mod&&s.id<active).length;
        const tot=STEPS.filter(s=>s.mod===mod).length;
        return (<g key={mod}>
          <rect x={S_LBL} y={ll.y} width={SW-S_LBL-8} height={ll.h} rx={12} fill={`url(#sg-${mod})`} stroke={l.border} strokeWidth={1.5}/>
          {done>0&&<rect x={S_LBL} y={ll.y} width={(SW-S_LBL-8)*(done/tot)} height={ll.h} rx={12} fill={l.color} opacity={0.07} style={{transition:'width .5s'}}/>}
          <text x={S_LBL/2} y={ll.y+ll.h/2-10} textAnchor="middle" fontSize={18}>{l.icon}</text>
          <text x={S_LBL/2} y={ll.y+ll.h/2+5}  textAnchor="middle" fontSize={9} fontWeight="800" fill={l.color}>{mod}</text>
          <text x={S_LBL/2} y={ll.y+ll.h/2+17} textAnchor="middle" fontSize={8} fill="#94a3b8">{done}/{tot}</text>
        </g>);
      })}
      {/* Horizontal arrows */}
      {[[0,1,'CRM'],[1,2,'CRM'],[2,3,'CRM'],[3,4,'CRM'],[4,5,'CRM'],
        [6,7,'SX'],[7,8,'SX'],[8,9,'SX'],
        [10,11,'VC'],[11,12,'VC'],[12,13,'VC']].map(([f,t,m])=>{
        const fs=STEPS[f],ts=STEPS[t];
        const x1=s_nx(fs.mod,fs.col)+S_NW+3, x2=s_nx(ts.mod,ts.col)-3, y=s_nc(m);
        const done=f<active;
        return <line key={`${f}-${t}`} x1={x1} y1={y} x2={x2} y2={y}
          stroke={done?LANE[m].color:'#e2e8f0'} strokeWidth={done?2.5:1.5}
          markerEnd={done?'url(#s-ac)':'url(#s-ag)'} style={{transition:'stroke .3s'}}/>;
      })}
      {/* Cross-module arrows */}
      {[{fx:s_crmCX(5),fy:s_nb('CRM'),tx:s_sxCX(0),ty:s_nd('SX'),ms:6,label:'⚡ Auto tạo SX'},
        {fx:s_sxCX(3), fy:s_nb('SX'), tx:s_sxCX(0),ty:s_nd('VC'),ms:10,label:'🚀 Auto tạo VC'}
      ].map(({fx,fy,tx,ty,ms,label},i)=>{
        const done=active>=ms; const mx=(fx+tx)/2, my=(fy+ty)/2;
        return (<g key={i}>
          <path d={`M${fx} ${fy} C${fx} ${my} ${tx} ${my} ${tx} ${ty}`}
            fill="none" stroke={done?'#3b82f6':'#cbd5e1'} strokeWidth={done?3:1.5}
            strokeDasharray={done?'none':'8,5'} markerEnd="url(#s-ab)" style={{transition:'stroke .4s'}}/>
          {done&&<circle r={4} fill="#3b82f6" opacity={0.8}><animateMotion dur="2s" repeatCount="indefinite"
            path={`M${fx} ${fy} C${fx} ${my} ${tx} ${my} ${tx} ${ty}`}/></circle>}
          <rect x={mx-62} y={my-11} width={124} height={22} rx={11} fill={done?'#eff6ff':'#f8fafc'} stroke={done?'#93c5fd':'#e2e8f0'}/>
          <text x={mx} y={my+4} textAnchor="middle" fontSize={9.5} fontWeight="700" fill={done?'#2563eb':'#94a3b8'}>{label}</text>
        </g>);
      })}
      {/* Nodes */}
      {STEPS.map(s=>{
        const x=s_nx(s.mod,s.col), y=s_nd(s.mod), cx=s_ncx(s.mod,s.col), cy=s_nc(s.mod);
        const done=s.id<active, curr=s.id===active, pend=s.id>active;
        const lc2=LANE[s.mod].color;
        const fill=done?`url(#ng1-${s.mod})`:curr?'white':'#f8fafc';
        const stroke=done?lc2:curr?(s.color||lc2):'#e2e8f0';
        return (<g key={s.id} onClick={()=>setActive(s.id)} style={{cursor:'pointer'}}>
          {curr&&<rect x={x-7} y={y-7} width={S_NW+14} height={S_NH+14} rx={15} fill="none"
            stroke={s.color||lc2} strokeWidth={1.5} opacity={0.25} style={{animation:'glow-pulse 2s ease-in-out infinite'}}/>}
          <rect x={x} y={y} width={S_NW} height={S_NH} rx={10} fill={fill} stroke={stroke}
            strokeWidth={curr?2.5:1} opacity={pend?.5:1} filter={curr?'url(#gl1)':'url(#sh1)'} style={{transition:'all .3s'}}/>
          {done?(<><path d={`M${cx-14} ${cy+5}L${cx-3} ${cy+3}L${cx+5} ${cy-7}`} stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x={cx+8} y={cy+5} fontSize={10} fontWeight="800" fill="white" textAnchor="middle">{s.label}</text></>
          ):(<>
            <text x={cx} y={y+24} textAnchor="middle" fontSize={17} opacity={pend?.5:1}>{s.icon}</text>
            <text x={cx} y={y+41} textAnchor="middle" fontSize={10.5} fontWeight={curr?'800':'700'}
              fill={curr?(s.isWon||s.isEnd?'white':(s.color||lc2)):'#374151'} opacity={pend?.6:1}>{s.label}</text>
            <text x={cx} y={y+54} textAnchor="middle" fontSize={8.5}
              fill={curr&&(s.isWon||s.isEnd)?'rgba(255,255,255,.7)':'#94a3b8'} opacity={pend?.5:1}>{s.sub}</text>
          </>)}
          {s.event&&<><circle cx={x+S_NW-8} cy={y+8} r={10} fill={s.event.type==='end'?'#16a34a':'#f59e0b'} stroke="white" strokeWidth={2}/>
            <text x={x+S_NW-8} y={y+13} textAnchor="middle" fontSize={11}>{s.event.icon}</text></>}
          <title>{s.label}</title>
        </g>);
      })}
      {/* Active badge */}
      {(()=>{
        const s=STEPS[active], cx=s_ncx(s.mod,s.col);
        return <g>
          <rect x={cx-14} y={s_nd(s.mod)-30} width={28} height={20} rx={10} fill={s.color||LANE[s.mod].color}/>
          <text x={cx} y={s_nd(s.mod)-15} textAnchor="middle" fontSize={9} fontWeight="800" fill="white">#{active+1}</text>
        </g>;
      })()}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGRAM 2 — Branch Flow
// Layout (all verified: step > node-width so there are gaps between nodes):
//
//  FNW=100, FNH=54
//
//  CRM Lead (6 nodes, step=114 → gap=14):
//    x[i]=8+i*114,  cx[i]=58+i*114  → cx: 58,172,286,400,514,628
//    right-edge of last = 8+5*114+100 = 678
//
//  CRM Deal (4 nodes, step=124 → gap=24, starting after gap at x=700):
//    x[j]=700+j*124, cx[j]=750+j*124 → cx: 750,874,998,1122
//    right-edge of last = 700+3*124+100 = 1172  (SVG width=1200 ✓)
//
//  SX (4 nodes, step=127 → gap=27, start cx aligned with CRM Lead[5]=628):
//    x[i]=578+i*127, cx[i]=628+i*127 → cx: 628,755,882,1009
//    right-edge of last = 578+3*127+100 = 1059 ✓
//
//  VC (4 nodes, step=165, start cx=628, last cx≈1123≈CRM Deal[3]=1122):
//    x[i]=578+i*165, cx[i]=628+i*165 → cx: 628,793,958,1123
//    right-edge of last = 578+3*165+100 = 1173 ✓
//
//  Rows: CRM_Y=44, SX_Y=228, VC_Y=405  →  total height ≈ 510
// ─────────────────────────────────────────────────────────────────────────────
const FW=1200, FH=510;
const FNW=100, FNH=54;

// CRM Lead
const CL_STEP=114;
const clX =(i)=>8+i*CL_STEP;
const clCX=(i)=>58+i*CL_STEP;   // 58,172,286,400,514,628

// CRM Deal
const CD_STEP=124;
const cdX =(j)=>700+j*CD_STEP;
const cdCX=(j)=>750+j*CD_STEP;  // 750,874,998,1122

// SX
const SX_STEP=127;
const sxX =(i)=>578+i*SX_STEP;
const sxCX=(i)=>628+i*SX_STEP;  // 628,755,882,1009

// VC
const VC_STEP=165;
const vcX =(i)=>578+i*VC_STEP;
const vcCX=(i)=>628+i*VC_STEP;  // 628,793,958,1123

// Row Y tops
const CRM_Y=44, SX_Y=228, VC_Y=405;
const fCY=(y)=>y+FNH/2;
const fBot=(y)=>y+FNH;

function BranchFlowDiagram({ active, setActive }) {
  const dealDone=(j)=>active>=CRM_DEAL[j].triggerAt;

  return (
    <svg width={FW} height={FH} style={{display:'block',fontFamily:'system-ui,sans-serif',overflow:'visible'}}>
      <defs>
        <linearGradient id="fb-CRM" x1="0" x2="1"><stop offset="0%" stopColor="#f5f3ff"/><stop offset="100%" stopColor="#ede9fe"/></linearGradient>
        <linearGradient id="fb-SX"  x1="0" x2="1"><stop offset="0%" stopColor="#fff7ed"/><stop offset="100%" stopColor="#ffedd5"/></linearGradient>
        <linearGradient id="fb-VC"  x1="0" x2="1"><stop offset="0%" stopColor="#f0fdfa"/><stop offset="100%" stopColor="#ccfbf1"/></linearGradient>
        <linearGradient id="fn-CRM" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#6d28d9"/></linearGradient>
        <linearGradient id="fn-SX"  x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ea580c"/><stop offset="100%" stopColor="#c2410c"/></linearGradient>
        <linearGradient id="fn-VC"  x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0f766e"/><stop offset="100%" stopColor="#0d6b63"/></linearGradient>
        <linearGradient id="fn-WIN" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#16a34a"/><stop offset="100%" stopColor="#15803d"/></linearGradient>
        <linearGradient id="fn-BLU" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#1d4ed8"/></linearGradient>
        <filter id="fsh"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00000014"/></filter>
        <filter id="fgl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <marker id="f-g"  markerWidth="9"  markerHeight="9"  refX="7" refY="3.5" orient="auto"><path d="M0,.5L0,6.5L8,3.5z" fill="#cbd5e1"/></marker>
        <marker id="f-v"  markerWidth="9"  markerHeight="9"  refX="7" refY="3.5" orient="auto"><path d="M0,.5L0,6.5L8,3.5z" fill="#7c3aed"/></marker>
        <marker id="f-o"  markerWidth="9"  markerHeight="9"  refX="7" refY="3.5" orient="auto"><path d="M0,.5L0,6.5L8,3.5z" fill="#ea580c"/></marker>
        <marker id="f-t"  markerWidth="9"  markerHeight="9"  refX="7" refY="3.5" orient="auto"><path d="M0,.5L0,6.5L8,3.5z" fill="#0f766e"/></marker>
        <marker id="f-b"  markerWidth="11" markerHeight="11" refX="9" refY="4.5" orient="auto"><path d="M0,.5L0,8.5L10,4.5z" fill="#3b82f6"/></marker>
        <marker id="f-r"  markerWidth="11" markerHeight="11" refX="9" refY="4.5" orient="auto"><path d="M0,.5L0,8.5L10,4.5z" fill="#7c3aed"/></marker>
      </defs>

      {/* ── Section bands ─────────────────────────────── */}
      <rect x={2} y={22} width={FW-4} height={FNH+44} rx={14} fill="url(#fb-CRM)" stroke="#ddd6fe" strokeWidth={1.5}/>
      <rect x={2} y={206} width={FW-4} height={FNH+44} rx={14} fill="url(#fb-SX)"  stroke="#fdba74" strokeWidth={1.5}/>
      <rect x={2} y={383} width={FW-4} height={FNH+44} rx={14} fill="url(#fb-VC)"  stroke="#5eead4" strokeWidth={1.5}/>

      {/* Band labels */}
      <text x={10} y={37}  fontSize={9} fontWeight="900" fill="#7c3aed">💼 CRM PIPELINE ĐẦY ĐỦ — Lead & Deal</text>
      <text x={10} y={221} fontSize={9} fontWeight="900" fill="#ea580c">🏭 XƯỞNG SẢN XUẤT — NHÁNH 1 (tự động từ THẮNG)</text>
      <text x={10} y={398} fontSize={9} fontWeight="900" fill="#0f766e">🚚 VẬN CHUYỂN & LẮP ĐẶT — NHÁNH 2 (tự động từ Bàn giao VC)</text>

      {/* Separator: Lead | Deal in CRM row */}
      <line x1={690} y1={26} x2={690} y2={22+FNH+40} stroke="#c4b5fd" strokeWidth={1.5} strokeDasharray="4,4"/>
      <text x={693} y={36} fontSize={7.5} fill="#a78bfa" fontWeight="700">DEAL AUTO ↓</text>

      {/* ── Intra arrows — CRM Lead ─────────────────── */}
      {Array.from({length:5},(_,i)=>{
        const done=i<active;
        const x1=clX(i)+FNW+3, x2=clX(i+1)-3, y=fCY(CRM_Y);
        return <line key={`cl${i}`} x1={x1} y1={y} x2={x2} y2={y}
          stroke={done?'#7c3aed':'#e2e8f0'} strokeWidth={done?2.5:1.5}
          markerEnd={done?'url(#f-v)':'url(#f-g)'} style={{transition:'stroke .3s'}}/>;
      })}
      {/* Intra arrows — CRM Deal */}
      {Array.from({length:3},(_,j)=>{
        const done=dealDone(j)&&dealDone(j+1);
        const active_j=dealDone(j);
        const x1=cdX(j)+FNW+3, x2=cdX(j+1)-3, y=fCY(CRM_Y);
        return <line key={`cd${j}`} x1={x1} y1={y} x2={x2} y2={y}
          stroke={done?'#7c3aed':'#e2e8f0'} strokeWidth={done?2:1.5}
          strokeDasharray={active_j?'none':'5,3'}
          markerEnd={done?'url(#f-v)':'url(#f-g)'} style={{transition:'all .3s'}}/>;
      })}
      {/* Intra arrows — SX */}
      {[6,7,8].map(i=>{
        const done=i<active; const si=i-6;
        return <line key={`sx${i}`} x1={sxX(si)+FNW+3} y1={fCY(SX_Y)} x2={sxX(si+1)-3} y2={fCY(SX_Y)}
          stroke={done?'#ea580c':'#e2e8f0'} strokeWidth={done?2.5:1.5}
          markerEnd={done?'url(#f-o)':'url(#f-g)'} style={{transition:'stroke .3s'}}/>;
      })}
      {/* Intra arrows — VC */}
      {[10,11,12].map(i=>{
        const done=i<active; const vi=i-10;
        return <line key={`vc${i}`} x1={vcX(vi)+FNW+3} y1={fCY(VC_Y)} x2={vcX(vi+1)-3} y2={fCY(VC_Y)}
          stroke={done?'#0f766e':'#e2e8f0'} strokeWidth={done?2.5:1.5}
          markerEnd={done?'url(#f-t)':'url(#f-g)'} style={{transition:'stroke .3s'}}/>;
      })}

      {/* ── BRANCH 1: CRM THẮNG ↓ SX[0] — straight down ─ */}
      {(()=>{
        // clCX(5)=628, CRM bottom=98, SX top=228
        const fx=clCX(5), fy=fBot(CRM_Y)+3, ty=SX_Y-3;
        const done=active>=6; const my=(fy+ty)/2;
        return (<g>
          <line x1={fx} y1={fy} x2={fx} y2={ty}
            stroke={done?'#3b82f6':'#cbd5e1'} strokeWidth={done?4:2}
            strokeDasharray={done?'none':'8,5'} markerEnd="url(#f-b)"
            style={{transition:'stroke .4s'}}/>
          {done&&<circle r={5} fill="#3b82f6" opacity={0.85}>
            <animateMotion dur="1.2s" repeatCount="indefinite" path={`M0 0 L0 ${ty-fy}`}/>
          </circle>}
          <rect x={fx-56} y={my-13} width={112} height={26} rx={13} fill={done?'#eff6ff':'#f8fafc'} stroke={done?'#93c5fd':'#e2e8f0'} strokeWidth={1.5} filter="url(#fsh)"/>
          <text x={fx} y={my} textAnchor="middle" fontSize={9.5} fontWeight="800" fill={done?'#2563eb':'#94a3b8'}>⚡ Tự động tạo</text>
          <text x={fx} y={my+12} textAnchor="middle" fontSize={9} fill={done?'#3b82f6':'#b0b8c4'}>Dự án Sản xuất</text>
        </g>);
      })()}

      {/* ── BRANCH 2: SX[3] ↓ VC[0] — J-curve ─────────── */}
      {(()=>{
        // sxCX(3)=1009, SX bottom=282; vcCX(0)=628, VC top=405
        const fx=sxCX(3), fy=fBot(SX_Y)+3, tx=vcCX(0), ty=VC_Y-3;
        const done=active>=10; const my=(fy+ty)/2;
        return (<g>
          <path d={`M${fx} ${fy} C${fx} ${my+18} ${tx} ${my-18} ${tx} ${ty}`}
            fill="none" stroke="#3b82f620" strokeWidth={8}/>
          <path d={`M${fx} ${fy} C${fx} ${my+18} ${tx} ${my-18} ${tx} ${ty}`}
            fill="none" stroke={done?'#3b82f6':'#cbd5e1'} strokeWidth={done?4:2}
            strokeDasharray={done?'none':'8,5'} markerEnd="url(#f-b)" style={{transition:'stroke .5s'}}/>
          {done&&<circle r={5} fill="#3b82f6" opacity={0.85}>
            <animateMotion dur="1.8s" repeatCount="indefinite"
              path={`M${fx} ${fy} C${fx} ${my+18} ${tx} ${my-18} ${tx} ${ty}`}/>
          </circle>}
          <rect x={(fx+tx)/2-56} y={my-13} width={112} height={26} rx={13} fill={done?'#eff6ff':'#f8fafc'} stroke={done?'#93c5fd':'#e2e8f0'} strokeWidth={1.5} filter="url(#fsh)"/>
          <text x={(fx+tx)/2} y={my} textAnchor="middle" fontSize={9.5} fontWeight="800" fill={done?'#2563eb':'#94a3b8'}>🚀 Tự động tạo</text>
          <text x={(fx+tx)/2} y={my+12} textAnchor="middle" fontSize={9} fill={done?'#3b82f6':'#b0b8c4'}>Dự án Vận chuyển</text>
        </g>);
      })()}

      {/* ── RETURN ARROW: VC[3] CSKH → CRM Deal[3] CSKH (right-side arc) */}
      {(()=>{
        // vcCX(3)=1123, VC bottom=459; cdCX(3)=1122, CRM bottom=98
        const fx=vcCX(3), fy=fBot(VC_Y)+4;
        const tx=cdCX(3), ty=fBot(CRM_Y)+3;
        const done=active>=13;
        const rx=FW-18; // right-side routing x
        return (<g>
          <path d={`M${fx} ${fy} C${rx} ${fy} ${rx} ${ty} ${tx} ${ty}`}
            fill="none" stroke="#7c3aed18" strokeWidth={10}/>
          <path d={`M${fx} ${fy} C${rx} ${fy} ${rx} ${ty} ${tx} ${ty}`}
            fill="none" stroke={done?'#7c3aed':'#e2e8f0'} strokeWidth={done?4:2}
            strokeDasharray={done?'none':'8,5'} markerEnd="url(#f-r)" style={{transition:'stroke .5s'}}/>
          {done&&<circle r={5} fill="#7c3aed" opacity={0.9}>
            <animateMotion dur="2.5s" repeatCount="indefinite"
              path={`M${fx} ${fy} C${rx} ${fy} ${rx} ${ty} ${tx} ${ty}`}/>
          </circle>}
          {/* Label floating on the right edge */}
          <rect x={rx-2} y={(fy+ty)/2-28} width={52} height={56} rx={10}
            fill={done?'#f5f3ff':'#f8fafc'} stroke={done?'#c4b5fd':'#e2e8f0'} strokeWidth={1.5} filter="url(#fsh)"/>
          <text x={rx+24} y={(fy+ty)/2-12} textAnchor="middle" fontSize={15}>🔄</text>
          <text x={rx+24} y={(fy+ty)/2+4}  textAnchor="middle" fontSize={8.5} fontWeight="800" fill={done?'#7c3aed':'#94a3b8'}>Quay</text>
          <text x={rx+24} y={(fy+ty)/2+16} textAnchor="middle" fontSize={8.5} fontWeight="800" fill={done?'#7c3aed':'#94a3b8'}>về CRM</text>
        </g>);
      })()}

      {/* ── Sync dashed arrows: SX→CRM Deal, SX[3]→CRM Deal[1] ─ */}
      {/* SX[0](628) → CRM Deal[0](750) */}
      {(()=>{
        const fx=sxCX(0), fy=SX_Y-3, tx=cdCX(0), ty=fBot(CRM_Y)+3;
        const done=active>=6;
        return <path key="syn0" d={`M${fx} ${fy} C${fx} ${(fy+ty)/2} ${tx} ${(fy+ty)/2} ${tx} ${ty}`}
          fill="none" stroke={done?'#ea580c':'#f3d1b8'} strokeWidth={done?1.5:1}
          strokeDasharray="5,4" markerEnd={done?'url(#f-o)':'url(#f-g)'}
          opacity={done?.85:.4} style={{transition:'all .4s'}}/>;
      })()}
      {/* SX[3](1009) → CRM Deal[1](874) */}
      {(()=>{
        const fx=sxCX(3), fy=SX_Y-3, tx=cdCX(1), ty=fBot(CRM_Y)+3;
        const done=active>=9;
        return <path key="syn1" d={`M${fx} ${fy} C${fx} ${(fy+ty)/2} ${tx} ${(fy+ty)/2} ${tx} ${ty}`}
          fill="none" stroke={done?'#1d4ed8':'#bfdbfe'} strokeWidth={done?1.5:1}
          strokeDasharray="5,4" markerEnd={done?'url(#f-b)':'url(#f-g)'}
          opacity={done?.85:.4} style={{transition:'all .4s'}}/>;
      })()}

      {/* ── CRM Deal nodes (display-only, auto-light) ──── */}
      {CRM_DEAL.map((d,j)=>{
        const active_d=dealDone(j);
        const curr_d=active===d.triggerAt;
        const x=cdX(j), y=CRM_Y, cx=cdCX(j), cy=fCY(CRM_Y);
        return (<g key={`cd-${j}`} onClick={()=>setActive(d.triggerAt)} style={{cursor:'pointer'}}>
          {curr_d&&<rect x={x-6} y={y-6} width={FNW+12} height={FNH+12} rx={13} fill="none"
            stroke={d.color} strokeWidth={1.5} opacity={0.3} style={{animation:'glow-pulse 2s ease-in-out infinite'}}/>}
          <rect x={x} y={y} width={FNW} height={FNH} rx={10}
            fill={active_d?d.color:'#f8fafc'} stroke={active_d?d.color:'#e2e8f0'}
            strokeWidth={active_d?2:1} filter="url(#fsh)"
            style={{transition:'all .4s', opacity:active_d?1:.5}}/>
          {!active_d&&<rect x={x} y={y+8} width={3} height={FNH-16} rx={2} fill={d.color} opacity={0.35}/>}
          {active_d?(
            <><path d={`M${cx-12} ${cy+4}L${cx-2} ${cy+2}L${cx+6} ${cy-7}`}
              stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x={cx+8} y={cy+4} fontSize={10} fontWeight="800" fill="white" textAnchor="middle">{d.label}</text></>
          ):(
            <><text x={cx} y={y+22} textAnchor="middle" fontSize={17} opacity={0.35}>{d.icon}</text>
            <text x={cx} y={y+38} textAnchor="middle" fontSize={10} fontWeight="700" fill="#94a3b8">{d.label}</text>
            <text x={cx} y={y+51} textAnchor="middle" fontSize={7.5} fill="#b0b8c4">auto-update</text></>
          )}
          <title>{active_d?`✓ CRM: ${d.label}`:`CRM: ${d.label} (pending)`}</title>
        </g>);
      })}

      {/* ── CRM Lead nodes (steps 0-5) ─────────────────── */}
      {STEPS.filter(s=>s.mod==='CRM').map(s=>{
        const x=clX(s.id), y=CRM_Y, cx=clCX(s.id), cy=fCY(CRM_Y);
        const done=s.id<active, curr=s.id===active, pend=s.id>active;
        const nc=s.isWon?'#16a34a':'#7c3aed';
        const fill=done?`url(#fn-${s.isWon?'WIN':'CRM'})`:curr?'white':LANE.CRM.light;
        return (<g key={s.id} onClick={()=>setActive(s.id)} style={{cursor:'pointer'}}>
          {curr&&<rect x={x-6} y={y-6} width={FNW+12} height={FNH+12} rx={13} fill="none"
            stroke={nc} strokeWidth={1.5} opacity={0.3} style={{animation:'glow-pulse 2s ease-in-out infinite'}}/>}
          <rect x={x} y={y} width={FNW} height={FNH} rx={10} fill={fill}
            stroke={done||curr?nc:LANE.CRM.border} strokeWidth={curr?2.5:1}
            opacity={pend?.5:1} filter={curr?'url(#fgl)':'url(#fsh)'} style={{transition:'all .3s'}}/>
          {!done&&<rect x={x} y={y+8} width={3} height={FNH-16} rx={2} fill={nc} opacity={curr?.9:.35}/>}
          {done?(
            <><path d={`M${cx-12} ${cy+4}L${cx-2} ${cy+2}L${cx+6} ${cy-7}`}
              stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x={cx+8} y={cy+4} fontSize={10} fontWeight="800" fill="white" textAnchor="middle">{s.label}</text></>
          ):(
            <><text x={cx} y={y+21} textAnchor="middle" fontSize={16} opacity={pend?.5:1}>{s.icon}</text>
            <text x={cx} y={y+37} textAnchor="middle" fontSize={10} fontWeight={curr?'800':'700'}
              fill={curr?(s.isWon?'white':nc):'#374151'} opacity={pend?.6:1}>{s.label}</text>
            <text x={cx} y={y+50} textAnchor="middle" fontSize={8}
              fill={curr&&s.isWon?'rgba(255,255,255,.7)':'#94a3b8'} opacity={pend?.5:1}>{s.sub}</text></>
          )}
          {s.event&&<><circle cx={x+FNW-8} cy={y+8} r={9} fill="#f59e0b" stroke="white" strokeWidth={2}/>
            <text x={x+FNW-8} y={y+13} textAnchor="middle" fontSize={10}>{s.event.icon}</text></>}
          <title>{s.label}</title>
        </g>);
      })}

      {/* ── SX nodes (steps 6-9) ────────────────────────── */}
      {STEPS.filter(s=>s.mod==='SX').map(s=>{
        const si=s.id-6;
        const x=sxX(si), y=SX_Y, cx=sxCX(si), cy=fCY(SX_Y);
        const done=s.id<active, curr=s.id===active, pend=s.id>active;
        const nc=s.isWon?'#1d4ed8':'#ea580c';
        const fill=done?`url(#fn-${s.isWon?'BLU':'SX'})`:curr?'white':LANE.SX.light;
        return (<g key={s.id} onClick={()=>setActive(s.id)} style={{cursor:'pointer'}}>
          {curr&&<rect x={x-6} y={y-6} width={FNW+12} height={FNH+12} rx={13} fill="none"
            stroke={nc} strokeWidth={1.5} opacity={0.3} style={{animation:'glow-pulse 2s ease-in-out infinite'}}/>}
          <rect x={x} y={y} width={FNW} height={FNH} rx={10} fill={fill}
            stroke={done||curr?nc:LANE.SX.border} strokeWidth={curr?2.5:1}
            opacity={pend?.5:1} filter={curr?'url(#fgl)':'url(#fsh)'} style={{transition:'all .3s'}}/>
          {!done&&<rect x={x} y={y+8} width={3} height={FNH-16} rx={2} fill={nc} opacity={curr?.9:.35}/>}
          {done?(
            <><path d={`M${cx-12} ${cy+4}L${cx-2} ${cy+2}L${cx+6} ${cy-7}`}
              stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x={cx+8} y={cy+4} fontSize={10} fontWeight="800" fill="white" textAnchor="middle">{s.label}</text></>
          ):(
            <><text x={cx} y={y+21} textAnchor="middle" fontSize={16} opacity={pend?.5:1}>{s.icon}</text>
            <text x={cx} y={y+37} textAnchor="middle" fontSize={10} fontWeight={curr?'800':'700'}
              fill={curr?(s.isWon?'white':nc):'#374151'} opacity={pend?.6:1}>{s.label}</text>
            <text x={cx} y={y+50} textAnchor="middle" fontSize={8}
              fill={curr&&s.isWon?'rgba(255,255,255,.7)':'#94a3b8'} opacity={pend?.5:1}>{s.sub}</text></>
          )}
          {s.event&&<><circle cx={x+FNW-8} cy={y+8} r={9} fill="#f59e0b" stroke="white" strokeWidth={2}/>
            <text x={x+FNW-8} y={y+13} textAnchor="middle" fontSize={10}>{s.event.icon}</text></>}
          <title>{s.label}</title>
        </g>);
      })}

      {/* ── VC nodes (steps 10-13) ──────────────────────── */}
      {STEPS.filter(s=>s.mod==='VC').map(s=>{
        const vi=s.id-10;
        const x=vcX(vi), y=VC_Y, cx=vcCX(vi), cy=fCY(VC_Y);
        const done=s.id<active, curr=s.id===active, pend=s.id>active;
        const nc=s.isEnd?'#16a34a':'#0f766e';
        const fill=done?`url(#fn-${s.isEnd?'WIN':'VC'})`:curr?'white':LANE.VC.light;
        return (<g key={s.id} onClick={()=>setActive(s.id)} style={{cursor:'pointer'}}>
          {curr&&<rect x={x-6} y={y-6} width={FNW+12} height={FNH+12} rx={13} fill="none"
            stroke={nc} strokeWidth={1.5} opacity={0.3} style={{animation:'glow-pulse 2s ease-in-out infinite'}}/>}
          <rect x={x} y={y} width={FNW} height={FNH} rx={10} fill={fill}
            stroke={done||curr?nc:LANE.VC.border} strokeWidth={curr?2.5:1}
            opacity={pend?.5:1} filter={curr?'url(#fgl)':'url(#fsh)'} style={{transition:'all .3s'}}/>
          {!done&&<rect x={x} y={y+8} width={3} height={FNH-16} rx={2} fill={nc} opacity={curr?.9:.35}/>}
          {done?(
            <><path d={`M${cx-12} ${cy+4}L${cx-2} ${cy+2}L${cx+6} ${cy-7}`}
              stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <text x={cx+8} y={cy+4} fontSize={10} fontWeight="800" fill="white" textAnchor="middle">{s.label}</text></>
          ):(
            <><text x={cx} y={y+21} textAnchor="middle" fontSize={16} opacity={pend?.5:1}>{s.icon}</text>
            <text x={cx} y={y+37} textAnchor="middle" fontSize={10} fontWeight={curr?'800':'700'}
              fill={curr?(s.isEnd?'white':nc):'#374151'} opacity={pend?.6:1}>{s.label}</text>
            <text x={cx} y={y+50} textAnchor="middle" fontSize={8}
              fill={curr&&s.isEnd?'rgba(255,255,255,.7)':'#94a3b8'} opacity={pend?.5:1}>{s.sub}</text></>
          )}
          {s.event&&<><circle cx={x+FNW-8} cy={y+8} r={9} fill={s.event.type==='end'?'#16a34a':'#f59e0b'} stroke="white" strokeWidth={2}/>
            <text x={x+FNW-8} y={y+13} textAnchor="middle" fontSize={10}>{s.event.icon}</text></>}
          <title>{s.label}</title>
        </g>);
      })}

      {/* Active badge */}
      {(()=>{
        const s=STEPS[active];
        const si=s.mod==='CRM'?s.id:s.mod==='SX'?s.id-6:s.id-10;
        const cx=s.mod==='CRM'?clCX(si):s.mod==='SX'?sxCX(si):vcCX(si);
        const rowY=s.mod==='CRM'?CRM_Y:s.mod==='SX'?SX_Y:VC_Y;
        const nc=s.isWon||s.isEnd?'#16a34a':s.id===9?'#1d4ed8':LANE[s.mod].color;
        return <g>
          <rect x={cx-15} y={rowY-33} width={30} height={21} rx={10} fill={nc}/>
          <text x={cx} y={rowY-17} textAnchor="middle" fontSize={9} fontWeight="800" fill="white">#{active+1}</text>
        </g>;
      })()}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function DetailPanel({ step }) {
  const lane=LANE[step.mod];
  const nodeColor=step.isWon||step.isEnd?'#16a34a':step.id===9?'#1d4ed8':lane.color;
  return (
    <div style={{display:'grid',gridTemplateColumns:step.event?'1fr 1fr':'1fr',gap:14}}>
      <div style={{background:'white',borderRadius:20,border:`1.5px solid ${lane.border}`,overflow:'hidden'}}>
        <div style={{background:`linear-gradient(135deg,${nodeColor},${nodeColor}cc)`,padding:'14px 18px',display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:44,height:44,borderRadius:11,background:'rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>{step.icon}</div>
          <div>
            <div style={{fontSize:17,fontWeight:900,color:'white'}}>{step.label}</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,.7)',marginTop:2}}>{step.sub}</div>
          </div>
          <div style={{marginLeft:'auto',background:'rgba(255,255,255,.2)',borderRadius:8,padding:'3px 10px',fontSize:10,fontWeight:700,color:'white'}}>{lane.icon} {lane.label}</div>
        </div>
        <div style={{padding:'14px 18px'}}>
          <p style={{fontSize:13.5,color:'#475569',lineHeight:1.65,margin:'0 0 12px'}}>{step.detail}</p>
          {step.crmDealTrigger!==undefined&&(
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:8,padding:'6px 12px',fontSize:12,color:'#7c3aed',fontWeight:700,marginBottom:12}}>
              <RefreshCw size={11}/> CRM Deal → {CRM_DEAL[step.crmDealTrigger].icon} {CRM_DEAL[step.crmDealTrigger].label}
            </div>
          )}
          {step.tips&&<>
            <div style={{fontSize:10,fontWeight:800,color:'#94a3b8',letterSpacing:'.06em',marginBottom:8}}>GỢI Ý THAO TÁC</div>
            {step.tips.map((t,i)=>(
              <div key={i} style={{display:'flex',gap:8,padding:'6px 0',borderTop:i>0?'1px solid #f1f5f9':'none',alignItems:'flex-start'}}>
                <span style={{fontSize:13,flexShrink:0}}>{t.slice(0,2)}</span>
                <span style={{fontSize:13,color:'#475569',lineHeight:1.5}}>{t.slice(2).trim()}</span>
              </div>
            ))}
          </>}
        </div>
      </div>
      {step.event&&(
        <div style={{borderRadius:20,overflow:'hidden',border:`1.5px solid ${step.event.type==='end'?'#bbf7d0':'#bfdbfe'}`,background:step.event.type==='end'?'#f0fdf4':'#eff6ff',display:'flex',flexDirection:'column'}}>
          <div style={{background:step.event.type==='end'?'linear-gradient(135deg,#16a34a,#15803d)':'linear-gradient(135deg,#2563eb,#1d4ed8)',padding:'14px 18px',display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:40,height:40,borderRadius:10,background:'rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>{step.event.icon}</div>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:'white'}}>{step.event.title}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,.7)',marginTop:2}}>{step.event.type==='end'?'🔄 Kết thúc, quay CRM':'🤖 Tự động kích hoạt'}</div>
            </div>
          </div>
          <div style={{padding:'14px 18px',flex:1,display:'flex',flexDirection:'column',gap:10}}>
            <p style={{fontSize:13,color:'#475569',lineHeight:1.6,margin:0}}>{step.event.desc}</p>
            {[{icon:<Bell size={13}/>,label:'THÔNG BÁO',val:step.event.notify,bg:step.event.type==='end'?'#dcfce7':'#dbeafe',ic:step.event.type==='end'?'#16a34a':'#2563eb'},
              step.event.crmUpdate&&{icon:<RefreshCw size={13}/>,label:'CRM AUTO',val:step.event.crmUpdate,bg:'#f5f3ff',ic:'#7c3aed'}
            ].filter(Boolean).map((row,i)=>(
              <div key={i} style={{background:'white',borderRadius:10,padding:'10px 12px',display:'flex',gap:8,alignItems:'flex-start',border:'1px solid #f1f5f9'}}>
                <div style={{width:28,height:28,borderRadius:7,background:row.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:row.ic}}>{row.icon}</div>
                <div><div style={{fontSize:10,fontWeight:800,color:'#374151'}}>{row.label}</div><div style={{fontSize:12,color:'#64748b',marginTop:2}}>{row.val}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function LeadJourneyPage() {
  const [active, setActive]=useState(0);
  const [tab, setTab]=useState(1);
  const cur=STEPS[active];
  const lane=LANE[cur.mod];
  const nodeColor=cur.isWon||cur.isEnd?'#16a34a':cur.id===9?'#1d4ed8':lane.color;
  const pct=Math.round((active/(STEPS.length-1))*100);
  const modProgress=Object.entries(LANE).map(([mod,l])=>({
    mod, l,
    done:STEPS.filter(s=>s.mod===mod&&s.id<active).length,
    total:STEPS.filter(s=>s.mod===mod).length,
    isActive:cur.mod===mod,
  }));

  return (
    <div style={{minHeight:'100vh',background:'#f1f5f9',padding:'18px 18px 48px'}}>
      <style>{`
        @keyframes glow-pulse{0%,100%{opacity:.25}50%{opacity:.55}}
        @keyframes panel-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .panel-in{animation:panel-in .4s cubic-bezier(.16,1,.3,1) both}
      `}</style>
      <div style={{maxWidth:1220,margin:'0 auto'}}>

        {/* Header */}
        <div style={{background:'white',borderRadius:20,padding:'14px 20px',marginBottom:12,border:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:17,fontWeight:900,color:'#111'}}>🗺️ Hành trình Deal</div>
            <div style={{fontSize:11,color:'#64748b',marginTop:2}}>Lead CRM → Sản xuất → Vận chuyển → CSKH → Quay về CRM</div>
          </div>
          {modProgress.map(({mod,l,done,total,isActive})=>(
            <div key={mod} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',borderRadius:12,
              background:isActive?l.light:'#f8fafc',border:`1.5px solid ${isActive?l.border:'#f1f5f9'}`,transition:'all .3s'}}>
              <span style={{fontSize:16}}>{l.icon}</span>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:isActive?l.color:'#94a3b8'}}>{mod}</div>
                <div style={{fontSize:11,color:'#64748b'}}>{done}/{total}</div>
              </div>
              <div style={{width:36,height:4,background:'#e2e8f0',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,background:l.color,width:`${(done/total)*100}%`,transition:'width .4s'}}/>
              </div>
            </div>
          ))}
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:28,fontWeight:900,color:nodeColor,lineHeight:1,transition:'color .3s'}}>{pct}<span style={{fontSize:13,color:'#94a3b8',fontWeight:400}}>%</span></div>
            <div style={{fontSize:10,color:'#94a3b8'}}>bước {active+1}/14</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:6,marginBottom:10}}>
          {[
            {id:1,icon:<GitBranch size={13}/>,label:'Sơ đồ Luồng Nhánh (CRM đầy đủ)'},
            {id:0,icon:<LayoutGrid size={13}/>,label:'Swim Lanes'},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              height:34,padding:'0 16px',borderRadius:10,cursor:'pointer',
              border:`1.5px solid ${tab===t.id?nodeColor:'#e2e8f0'}`,
              background:tab===t.id?nodeColor:'white',
              color:tab===t.id?'white':'#64748b',
              fontSize:12,fontWeight:700,
              display:'flex',alignItems:'center',gap:6,
              transition:'all .2s',
            }}>{t.icon}{t.label}</button>
          ))}
        </div>

        {/* Diagram */}
        <div style={{background:'white',borderRadius:20,border:'1px solid #e2e8f0',overflowX:'auto',
          padding:'6px 4px 8px',boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
          {tab===0
            ?<SwimLaneDiagram active={active} setActive={setActive}/>
            :<BranchFlowDiagram active={active} setActive={setActive}/>
          }
        </div>

        {/* Slider */}
        <div style={{background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'10px 18px',marginTop:10,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:20}}>{cur.icon}</span>
          <input type="range" min={0} max={13} value={active} onChange={e=>setActive(Number(e.target.value))}
            style={{flex:1,accentColor:nodeColor,cursor:'pointer'}}/>
          <div style={{background:lane.light,border:`1.5px solid ${lane.border}`,borderRadius:10,padding:'4px 14px',whiteSpace:'nowrap',transition:'all .3s'}}>
            <span style={{fontSize:12,fontWeight:800,color:nodeColor}}>{cur.label}</span>
            <span style={{fontSize:11,color:'#94a3b8',marginLeft:6}}>{lane.label}</span>
          </div>
        </div>

        {/* Detail */}
        <div key={active} className="panel-in" style={{marginTop:12}}>
          <DetailPanel step={cur}/>
        </div>

        {/* Quick-jump */}
        <div style={{marginTop:12,background:'white',borderRadius:14,border:'1px solid #e2e8f0',padding:'12px 18px',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:'#94a3b8',fontWeight:600,marginRight:4}}>Nhảy nhanh:</span>
          {STEPS.map(s=>{
            const done=s.id<active, curr=s.id===active;
            const sc=s.isWon||s.isEnd?'#16a34a':s.id===9?'#1d4ed8':LANE[s.mod].color;
            return (
              <button key={s.id} onClick={()=>setActive(s.id)} title={s.label} style={{
                width:curr?38:28,height:curr?38:28,borderRadius:'50%',
                border:`2px solid ${done||curr?sc:'#e2e8f0'}`,
                background:done?sc:curr?'white':'#f8fafc',
                cursor:'pointer',fontSize:done?11:15,
                display:'flex',alignItems:'center',justifyContent:'center',
                transition:'all .25s cubic-bezier(.34,1.56,.64,1)',
                boxShadow:curr?`0 0 0 4px ${sc}30`:'none',padding:0,flexShrink:0,
              }}>{done?'✓':s.icon}</button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
