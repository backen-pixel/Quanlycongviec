'use strict';

// Offline authored SVG counterpart of overall.mmd; this is not a Mermaid renderer.
// Usage: node render-overall.cjs <absolute path to installed sharp module>
// Writes only overall.svg and overall.png beside this script. No network/runtime calls.
const fs = require('node:fs');
const path = require('node:path');
const sharpModule = process.argv[2] || 'sharp';
const sharp = require(sharpModule);
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const items = [];
const rect = (x,y,w,h,fill,stroke,rx=18,extra='') => items.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${extra}/>`);
const text = (x,y,s,size=25,color='#172b4d',weight=400,anchor='start') => items.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`);
const lines = (x,y,ss,size=24,color='#42526e',weight=400,step=34) => ss.forEach((s,i)=>text(x,y+i*step,s,size,color,weight));
const arrow = (d,color='#687c98',dash='') => items.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow)"/>`);
const band = (y,h,badge,title,detail) => {
  rect(130,y,1540,h,'#ffffff','#d3e4e4',14);
  rect(149,y+17,162,h-34,'#e1f3ed','#e1f3ed',12);
  text(230,y+h/2+8,badge,25,'#0f6854',700,'middle');
  text(337,y+39,title,27,'#153c36',700);
  text(337,y+76,detail,24,'#425a60');
};

items.push('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1760" viewBox="0 0 1800 1760" role="img" aria-labelledby="title desc">');
items.push('<title id="title">Kiến trúc tổng thể Business AI OS — thiết kế đề xuất, chưa triển khai</title>');
items.push('<desc id="desc">Một ranh giới Business AI OS gồm sáu miền ngang hàng: Founder, Marketing, Sales CRM, Vận hành, Chăm sóc bảo hành, Tài chính đơn hàng. Mọi miền dùng chung L1 đến L10. Kênh bên ngoài qua tiếp nhận bền vững, Codex ở ngoài runtime.</desc>');
items.push('<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="#687c98"/></marker></defs>');
items.push('<style>text{font-family:"Segoe UI",Arial,sans-serif} .boundary{stroke-dasharray:10 6}</style>');
rect(0,0,1800,1760,'#f4f7fb','#f4f7fb',0);
text(70,68,'BUSINESS AI OS',43,'#132b4a',750);
text(70,111,'Một hệ thống điều hành doanh nghiệp • Các miền cùng dùng một nền quản trị',25,'#52657f');
rect(1210,34,520,82,'#fff4df','#e3bc69',14);
text(1470,68,'DESIGN_PROPOSAL / NOT_LIVE',24,'#835e0b',700,'middle');
text(1470,99,'BOS-ARCH-DESIGN-01 · 16/10/2026',21,'#835e0b',400,'middle');

rect(70,165,1240,120,'#ffffff','#b7c5d7',18);
text(100,205,'KÊNH BÊN NGOÀI',24,'#4c6380',700);
lines(100,243,['Website/form · Meta · Google · TikTok · Zalo · ChatGPT Ads'],28,'#233d60');
text(100,272,'Quyền đọc/ghi từng tài khoản phải xác minh theo ma trận kênh.',21,'#60728a');
rect(1360,165,370,120,'#f5edff','#b49bd2',18);
text(1545,206,'CODEX / FACTORY',24,'#69498e',700,'middle');
text(1545,242,'Thiết kế · xây · kiểm thử',23,'#69498e',400,'middle');
text(1545,272,'Ngoài runtime nghiệp vụ',21,'#69498e',600,'middle');

rect(55,330,1690,1330,'#ffffff','#728eaf',24,'class="boundary"');
text(85,375,'MỘT RANH GIỚI BUSINESS AI OS',29,'#17375f',750);
text(1710,375,'Marketing nằm bên trong cùng hệ thống',23,'#4e6687',400,'end');
rect(85,405,1630,380,'#f5f9fe','#d3dfed',18);
text(110,443,'SÁU MIỀN NGHIỆP VỤ NGANG HÀNG',23,'#59718e',700);

const domains = [
  {x:110,y:465,t:'Founder Control Center',ls:['Mục tiêu · tình hình · chênh lệch','Ngoại lệ cần quyết định / ủy quyền']},
  {x:650,y:465,t:'Marketing',ls:['Kế hoạch · nội dung · chiến dịch','Nguồn khách · bàn giao · đo hiệu quả']},
  {x:1190,y:465,t:'Sales / CRM',ls:['Party · Need · người phụ trách','Tư vấn · khảo sát · báo giá']},
  {x:110,y:625,t:'Vận hành & giao giá trị',ls:['Project · WorkItem · nguồn lực','Sản xuất · giao/lắp · nghiệm thu']},
  {x:650,y:625,t:'Chăm sóc & bảo hành',ls:['ServiceCase · lịch hẹn · trách nhiệm','Xử lý · phản hồi · chăm sóc có quyền']},
  {x:1190,y:625,t:'Tài chính & đơn hàng',ls:['Order · chứng từ · công nợ','Thu/hoàn tiền · chi phí · đối soát']},
];
domains.forEach(d=>{
  rect(d.x,d.y,500,135,'#ffffff','#9eb9d9',14);
  text(d.x+22,d.y+38,d.t,28,'#214f80',700);
  lines(d.x+22,d.y+76,d.ls,23,'#4b617b',400,31);
});
arrow('M900,786 L900,826');

rect(100,827,1600,635,'#edf8f4','#90c1af',18);
text(130,864,'NỀN CHUNG — MỌI MIỀN CÙNG DÙNG',25,'#1a6552',750);
band(886,100,'L1 + L2','Kênh và tiếp nhận bền vững','Xác thực nguồn/binding → durable inbox → ACK; nhận khách độc lập AI');
band(1005,100,'L3','Sự thật có chủ và bằng chứng','CRM / Work / Finance giữ nguồn chuẩn; revision · nguồn · độ mới · coverage');
band(1124,100,'L4–L6','Quy luật → Quyết định → Thực thi','Một registry · C0–C3 · TTL/duyệt · Command/lease/fence → Receipt/đối soát');
band(1243,100,'L7–L9','AI chung · Đo/học · Trải nghiệm','Paperclip → gateway → runtime adapter; Outcome · cockpit · hộp việc');
band(1362,80,'L10','Nền tảng xuyên suốt','Tenant/company · quyền · audit · cap/reservation · backup/restore');

// Route incoming source arrow around domain cards directly to L1/L2.
arrow('M670,285 L670,308 L28,308 L28,936 L127,936');
// Dashed factory line terminates at boundary; no runtime connection is implied.
arrow('M1545,285 L1545,308 L1772,308 L1772,391 L1747,391','#687c98','8 6');
text(900,1522,'Khách → Nhu cầu → Báo giá → Đơn → Giao giá trị → Thu/hoàn → Chăm sóc',27,'#345b76',650,'middle');
text(900,1570,'Tiền có thể đến trước hoặc sau giao hàng; mỗi mốc cần chủ chịu trách nhiệm và bằng chứng riêng.',23,'#657a91',400,'middle');
text(900,1611,'AI đề xuất và thực hiện trong quyền; kết quả AI không tự xác nhận thu tiền hoặc hoàn thành nghiệp vụ.',23,'#657a91',400,'middle');

text(70,1706,'10 tầng là trách nhiệm logic, không phải 10 microservice/DB. Mũi tên là hợp đồng thiết kế, chưa chứng minh tích hợp live.',23,'#687d95');
text(70,1738,'Nguồn: ARCHITECTURE.md + CONTRACTS.md. Hình minh họa soạn từ cùng mô hình; Mermaid là nguồn sơ đồ chỉnh sửa được.',21,'#687d95');
items.push('</svg>');

(async()=>{
  const svg = items.join('\n') + '\n';
  const destSvg = path.join(__dirname,'overall.svg');
  const destPng = path.join(__dirname,'overall.png');
  fs.writeFileSync(destSvg,svg,'utf8');
  await sharp(Buffer.from(svg)).png().toFile(destPng);
  const m = await sharp(destPng).metadata();
  process.stdout.write(JSON.stringify({svg:'overall.svg',png:'overall.png',width:m.width,height:m.height,bytes:fs.statSync(destPng).size})+'\n');
})().catch(err=>{process.stderr.write(err.message+'\n');process.exitCode=1;});
