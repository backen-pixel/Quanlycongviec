const ExcelJS = require('c:/Projects/Quanlycongviec/frontend/node_modules/exceljs');
const path = 'c:/Users/Admin/Downloads/MAU-BAO-GIA-HOP-CUNG.xlsx';

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NEXTGO Cost Engine';

  const bg = wb.addWorksheet('BANG_GIA', { views: [{ state: 'frozen', ySplit: 1 }] });
  bg.columns = [
    { header: 'Ma', key: 'ma', width: 18 },
    { header: 'Ten', key: 'ten', width: 28 },
    { header: 'Don_vi', key: 'dv', width: 12 },
    { header: 'Don_gia', key: 'dg', width: 14 },
    { header: 'Ghi_chu', key: 'gc', width: 48 },
  ];
  const prices = [
    ['CHIPBOARD', 'Chipboard', 'VND/m2', 15000, 'B ≈ (Dw/100*Dh/100*15000)/F'],
    ['GIAY_BOI', 'Giay boi', 'VND/m2', 3225, 'B ≈ (Dw/100*Dh/100*3225)/F'],
    ['MANG', 'Mang BOPP/PET', 'VND/m2', 1100, 'A10 file goc; B=C*A10'],
    ['MANG_EPKIM', 'Mang ep kim', 'VND/m2', 5395, 'F10'],
    ['KEO', 'Keo dan', 'VND/hop', 300, ''],
    ['UV', 'UV', 'VND/hop', 900, ''],
    ['NAM_CHAM', 'Nam cham', 'VND/hop', 1100, ''],
    ['QUAI', 'Quai xach', 'VND/hop', 0, ''],
    ['MUT', 'Mut lot', 'VND/hop', 0, ''],
    ['IN_JOB', 'Gia in ca job', 'VND', 3400000, 'B_in = D10/B8'],
    ['EPKIM_KHUON', 'Khuon ep kim job', 'VND', 70000, 'B = E10/B8'],
    ['VC_VT', 'Van chuyen VT+In', 'VND', 500000, ''],
    ['KHUON_TB', 'Khuon be TB', 'VND/khuon', 250000, ''],
    ['MARGIN_300', 'He so ban 300', 'ratio', 0.45, 'Ban = COST / he_so'],
    ['MARGIN_500', 'He so ban 500', 'ratio', 0.5, ''],
    ['MARGIN_1000', 'He so ban 1000', 'ratio', 0.55, ''],
  ];
  prices.forEach((r) => {
    const row = bg.addRow({ ma: r[0], ten: r[1], dv: r[2], dg: r[3], gc: r[4] });
    row.getCell(1).font = { bold: true };
  });
  bg.getRow(1).font = { bold: true };
  bg.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  const kho = wb.addWorksheet('KHO_GIAY');
  kho.columns = [
    { header: 'Ma_kho', key: 'ma', width: 16 },
    { header: 'W_cm', key: 'w', width: 10 },
    { header: 'H_cm', key: 'h', width: 10 },
    { header: 'Dien_tich_m2', key: 'a', width: 14 },
    { header: 'Loai', key: 'loai', width: 12 },
  ];
  [
    ['CB_109x81.5', 109, 81.5, 'chipboard'],
    ['CB_109x74.5', 109, 74.5, 'chipboard'],
    ['CB_109x65', 109, 65, 'chipboard'],
    ['CB_113x81.5', 113, 81.5, 'chipboard'],
    ['CB_82x120', 82, 120, 'chipboard'],
    ['CB_109x50', 109, 50, 'chipboard'],
    ['GIAY_79x109', 79, 109, 'giay'],
    ['GIAY_65x86', 65, 86, 'giay'],
  ].forEach((s) => {
    kho.addRow({
      ma: s[0],
      w: s[1],
      h: s[2],
      a: +((s[1] / 100) * (s[2] / 100)).toFixed(4),
      loai: s[3],
    });
  });
  kho.getRow(1).font = { bold: true };
  kho.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };

  const doc = wb.addWorksheet('CONG_THUC');
  const docs = [
    ['PHAN TICH CONG THUC FILE T7-TRINH-HOP CUNG'],
    [''],
    ['A. O NHAP (INPUT) — file goc thuong NHAP TAY'],
    ['B6', 'Kich thuoc LxWxH', 'CHI LA NHAN — KHONG tham gia cong thuc Excel goc'],
    ['B8', 'So luong Q', 'Dung chia: D10/B8, C10/B8, E10/B8'],
    ['A10', 'Gia mang VND/m2', 'Hang so, thuong 1100'],
    ['D10', 'Gia in ca job', 'Nhap tay'],
    ['E10', 'Gia khuon ep kim ca job', 'Nhap tay'],
    ['Cot E (mm)', 'Kich thuoc phang moi chi tiet', 'Nhap tay tu LxWxH + allowance'],
    ['Cot D (cm)', 'Kho giay', 'Nhap tay / chon kho'],
    ['Cot F', 'So kho chia duoc', 'Nest(D,E) — thuong nhap tay'],
    ['Cot G,H', 'So khuon be + don gia khuon', 'Nhap tay'],
    ['Cot B chipboard/giay', 'Gia NVL / hop', 'NHAP TAY trong file goc (co the suy ra — muc C)'],
    [''],
    ['B. CONG THUC CO SAN TRONG EXCEL GOC'],
    ['I_row', '=H_row*G_row', 'Tong tien khuon be tung dong'],
    ['C10', '=SUM(I13:I_last)', 'Tong gia khuon be ca job'],
    ['B_mang', '=C_mang*A10', 'Gia mang / hop'],
    ['C_mang', 'm2 / hop', 'Thuong = dien_tich_kho_m2 / F'],
    ['B_in', '=D10/B8', 'Gia in / hop'],
    ['B_khuon_be', '=C10/B8', 'Gia khuon be / hop'],
    ['B_epkim', '=E10/B8', 'Gia khuon ep kim / hop'],
    ['COST', '=SUM(B13:B_truoc_cost)', 'Tong cost / hop'],
    ['Ban_300', '=COST/0.45', 'Cot C = COST/Ban = 45%'],
    ['Ban_500', '=COST/0.50', 'Margin 50%'],
    ['Ban_1000', '=COST/0.55', 'Margin 55%'],
    ['Tong_cost', '=COST*B8', ''],
    ['Tong_ban', '=Ban_moc*B8', ''],
    [''],
    ['C. CONG THUC NVL BI AN (suy ra tu data that)'],
    ['Don vi', 'D kho = cm; E phang = mm; E_cm = E/10', ''],
    ['Nest F', 'F=MAX(INT(Dw/Ew)*INT(Dh/Eh), INT(Dw/Eh)*INT(Dh/Ew))', ''],
    ['Chipboard B', 'B≈(Dw/100*Dh/100*15000)/F', '~15.000 VND/m2'],
    ['Giay boi B', 'B≈(Dw/100*Dh/100*3225)/F', '~3.225 VND/m2'],
    ['Mang C', 'C=(Dw/100*Dh/100)/F ; B=C*A10', ''],
    ['Day CB goi y', 'E≈(L+2H) x (W+2H) (cm → *10 ra mm)', 'Khop hop nho'],
    ['Nap / wrap', 'Phu thuoc kieu nap — chua 1 cong thuc duy nhat', 'Can chon kieu'],
    [''],
    ['D. KET LUAN'],
    ['1', 'Chi nhap Size+SL trong FILE GOC se KHONG ra gia — NVL cot B/E/D/F nhap tay', ''],
    ['2', 'Sheet TINH_NHANH: nhap L/W/H/Q (+ options) → tu nest + cost + ban', ''],
    ['3', 'In/khuon FIX theo job → Q cang lon, cost/hop cang giam', ''],
  ];
  docs.forEach((r, i) => {
    const row = doc.addRow(r);
    if (i === 0 || (r[0] && /^[A-D]\./.test(String(r[0])))) {
      row.font = { bold: true, size: i === 0 ? 14 : 12 };
    }
  });
  doc.getColumn(1).width = 24;
  doc.getColumn(2).width = 58;
  doc.getColumn(3).width = 48;

  const t = wb.addWorksheet('TINH_NHANH');
  t.mergeCells('A1:G1');
  t.getCell('A1').value =
    'MAU TINH NHANH HOP CUNG — nhap Size + SL (+ options vang) la ra COST / gia ban';
  t.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  t.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };

  const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
  const setIn = (addr, label, val) => {
    const col = addr[0];
    const row = addr.slice(1);
    t.getCell(`A${row}`).value = label;
    t.getCell(`B${row}`).value = val;
    t.getCell(`B${row}`).fill = yellow;
  };

  t.getCell('A3').value = 'INPUT (o vang)';
  t.getCell('A3').font = { bold: true };
  t.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };

  t.getCell('A4').value = 'Khach hang';
  t.getCell('B4').value = '';
  t.getCell('B4').fill = yellow;
  setIn('B5', 'L (cm)', 20);
  setIn('B6', 'W (cm)', 15);
  setIn('B7', 'H (cm)', 8);
  setIn('B8', 'So luong Q', 1000);
  t.getCell('A9').value = 'Quy uoc kieu';
  t.getCell('B9').value =
    'Day CB=(L+2H)x(W+2H); Nap CB=(L+2H)x(W+H); Giay = CB + 2cm/canh';
  setIn('B10', 'Co mang ngoai (0/1)', 1);
  setIn('B11', 'Co mang trong (0/1)', 1);
  setIn('B12', 'Co UV (0/1)', 1);
  setIn('B13', 'Co nam cham (0/1)', 1);
  setIn('B14', 'Keo VND/hop', 300);
  setIn('B15', 'Gia in ca job', 3400000);
  setIn('B16', 'Khuon ep kim job', 70000);
  setIn('B17', 'Tong so khuon be', 4);
  setIn('B18', 'Don gia khuon TB', 250000);
  setIn('B19', 'Kho CB W cm', 109);
  setIn('B20', 'Kho CB H cm', 81.5);
  setIn('B21', 'Kho giay W cm', 79);
  setIn('B22', 'Kho giay H cm', 109);

  t.getCell('D3').value = 'DON GIA (BANG_GIA)';
  t.getCell('D3').font = { bold: true };
  const v = (code) => ({ formula: `VLOOKUP("${code}",BANG_GIA!A:D,4,FALSE)` });
  t.getCell('D4').value = 'Chipboard VND/m2';
  t.getCell('E4').value = v('CHIPBOARD');
  t.getCell('D5').value = 'Giay boi VND/m2';
  t.getCell('E5').value = v('GIAY_BOI');
  t.getCell('D6').value = 'Mang VND/m2';
  t.getCell('E6').value = v('MANG');
  t.getCell('D7').value = 'UV / hop';
  t.getCell('E7').value = v('UV');
  t.getCell('D8').value = 'Nam cham / hop';
  t.getCell('E8').value = v('NAM_CHAM');
  t.getCell('D9').value = 'Margin 300';
  t.getCell('E9').value = v('MARGIN_300');
  t.getCell('D10').value = 'Margin 500';
  t.getCell('E10').value = v('MARGIN_500');
  t.getCell('D11').value = 'Margin 1000';
  t.getCell('E11').value = v('MARGIN_1000');

  t.getCell('A24').value = 'TU SINH KICH THUOC PHANG';
  t.getCell('A24').font = { bold: true };
  t.getCell('A24').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
  t.getCell('A25').value = 'Day CB W cm';
  t.getCell('B25').value = { formula: 'B5+2*B7' };
  t.getCell('C25').value = 'H cm';
  t.getCell('D25').value = { formula: 'B6+2*B7' };
  t.getCell('A26').value = 'Nap CB W cm';
  t.getCell('B26').value = { formula: 'B5+2*B7' };
  t.getCell('C26').value = 'H cm';
  t.getCell('D26').value = { formula: 'B6+B7' };
  t.getCell('A27').value = 'Giay day W cm';
  t.getCell('B27').value = { formula: 'B25+2' };
  t.getCell('C27').value = 'H cm';
  t.getCell('D27').value = { formula: 'D25+2' };
  t.getCell('A28').value = 'Giay nap W cm';
  t.getCell('B28').value = { formula: 'B26+2' };
  t.getCell('C28').value = 'H cm';
  t.getCell('D28').value = { formula: 'D26+2' };

  const nest = (pw, ph, sw, sh) =>
    `MAX(INT(${sw}/${pw})*INT(${sh}/${ph}),INT(${sw}/${ph})*INT(${sh}/${pw}))`;

  t.getCell('A30').value = 'NEST & COST NVL (dung logic suy ra tu file goc)';
  t.getCell('A30').font = { bold: true };
  t.getCell('A30').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
  t.getCell('A31').value = 'Dien tich kho CB m2';
  t.getCell('B31').value = { formula: '(B19/100)*(B20/100)' };
  t.getCell('A32').value = 'Dien tich kho giay m2';
  t.getCell('B32').value = { formula: '(B21/100)*(B22/100)' };
  t.getCell('A33').value = 'Nest Day CB F';
  t.getCell('B33').value = { formula: nest('B25', 'D25', 'B19', 'B20') };
  t.getCell('A34').value = 'Nest Nap CB F';
  t.getCell('B34').value = { formula: nest('B26', 'D26', 'B19', 'B20') };
  t.getCell('A35').value = 'Nest Giay day F';
  t.getCell('B35').value = { formula: nest('B27', 'D27', 'B21', 'B22') };
  t.getCell('A36').value = 'Nest Giay nap F';
  t.getCell('B36').value = { formula: nest('B28', 'D28', 'B21', 'B22') };

  t.getCell('A38').value = 'Chipboard Day / hop';
  t.getCell('B38').value = { formula: 'IF(B33<=0,0,B31*E4/B33)' };
  t.getCell('A39').value = 'Chipboard Nap / hop';
  t.getCell('B39').value = { formula: 'IF(B34<=0,0,B31*E4/B34)' };
  t.getCell('A40').value = 'Giay boi Day / hop';
  t.getCell('B40').value = { formula: 'IF(B35<=0,0,B32*E5/B35)' };
  t.getCell('A41').value = 'Giay boi Nap / hop';
  t.getCell('B41').value = { formula: 'IF(B36<=0,0,B32*E5/B36)' };
  t.getCell('A42').value = 'Mang ngoai / hop';
  t.getCell('B42').value = {
    formula: 'IF(B10=0,0,(IF(B36<=0,0,B32/B36)+IF(B35<=0,0,B32/B35))*E6)',
  };
  t.getCell('A43').value = 'Mang trong / hop';
  t.getCell('B43').value = {
    formula: 'IF(B11=0,0,(IF(B36<=0,0,B32/B36)+IF(B35<=0,0,B32/B35))*E6*0.5)',
  };

  t.getCell('A45').value = 'GIA CONG / hop';
  t.getCell('A45').font = { bold: true };
  t.getCell('A45').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
  t.getCell('A46').value = 'Tong khuon be job';
  t.getCell('B46').value = { formula: 'B17*B18' };
  t.getCell('A47').value = 'Khuon be / hop';
  t.getCell('B47').value = { formula: 'B46/B8' };
  t.getCell('A48').value = 'In / hop';
  t.getCell('B48').value = { formula: 'B15/B8' };
  t.getCell('A49').value = 'Ep kim khuon / hop';
  t.getCell('B49').value = { formula: 'B16/B8' };
  t.getCell('A50').value = 'UV / hop';
  t.getCell('B50').value = { formula: 'IF(B12=1,E7,0)' };
  t.getCell('A51').value = 'Nam cham / hop';
  t.getCell('B51').value = { formula: 'IF(B13=1,E8,0)' };
  t.getCell('A52').value = 'Keo / hop';
  t.getCell('B52').value = { formula: 'B14' };

  t.getCell('A54').value = 'KET QUA';
  t.getCell('A54').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  t.getCell('A54').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
  t.getCell('A55').value = 'COST / hop';
  t.getCell('B55').value = { formula: 'SUM(B38:B43)+SUM(B47:B52)' };
  t.getCell('B55').font = { bold: true, size: 14 };
  t.getCell('B55').numFmt = '#,##0';
  t.getCell('A56').value = 'Gia ban 300';
  t.getCell('B56').value = { formula: 'B55/E9' };
  t.getCell('B56').numFmt = '#,##0';
  t.getCell('C56').value = { formula: 'B55/B56' };
  t.getCell('C56').numFmt = '0%';
  t.getCell('A57').value = 'Gia ban 500';
  t.getCell('B57').value = { formula: 'B55/E10' };
  t.getCell('B57').numFmt = '#,##0';
  t.getCell('C57').value = { formula: 'B55/B57' };
  t.getCell('C57').numFmt = '0%';
  t.getCell('A58').value = 'Gia ban 1000';
  t.getCell('B58').value = { formula: 'B55/E11' };
  t.getCell('B58').numFmt = '#,##0';
  t.getCell('C58').value = { formula: 'B55/B58' };
  t.getCell('C58').numFmt = '0%';
  t.getCell('A59').value = 'Tong COST (theo Q)';
  t.getCell('B59').value = { formula: 'B55*B8' };
  t.getCell('B59').numFmt = '#,##0';
  t.getCell('A60').value = 'Tong BAN moc 1000';
  t.getCell('B60').value = { formula: 'B58*B8' };
  t.getCell('B60').numFmt = '#,##0';

  t.mergeCells('A62:G63');
  t.getCell('A62').value =
    'O vang = nhap. Logic giong file goc: NVL = dien_tich_kho * don_gia / nest; in & khuon chia Q; gia ban = COST / margin (0.45/0.50/0.55). Day CB uoc (L+2H)x(W+2H) — hop am duong / khay / thanh can bo sung dong.';
  t.getCell('A62').alignment = { wrapText: true, vertical: 'top' };

  t.getColumn(1).width = 28;
  t.getColumn(2).width = 18;
  t.getColumn(3).width = 10;
  t.getColumn(4).width = 22;
  t.getColumn(5).width = 14;

  await wb.xlsx.writeFile(path);
  console.log('Wrote', path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
