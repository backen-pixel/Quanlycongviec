// Direct update approach: Update prices and metadata for all existing HUC products
// Uses the price mapping from the SQL INSERT (GIÁ BÁN TỪ NGÀY 20.03.2026)
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

// Price map: code -> {base_price, selling_price, dimensions, code_group, code_spec, code_standard, code_glass, code_side, code_type_std, code_size}
// Extracted from SQL INSERT statement
const updates = {
// === TỦ BẾP TRÊN - Nhôm lá ghép nhỏ 700x380 ===
'HUC-TTGNA4T380': {b:2454545,s:2700000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm vác âm',gl:'Kính 4 ly thường',sz:'700 x 380'},
'HUC-TTGNC4T380': {b:2863636,s:3150000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm CNC',gl:'Kính 4 ly thường',sz:'700 x 380'},
'HUC-TTGNA4ST380': {b:2545455,s:2800000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm vác âm',gl:'Kính 4 ly siêu trong',sz:'700 x 380'},
'HUC-TTGNC4ST380': {b:2954545,s:3250000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm CNC',gl:'Kính 4 ly siêu trong',sz:'700 x 380'},
'HUC-TTGNA5T380': {b:2500000,s:2750000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm vác âm',gl:'Kính 5 ly thường',sz:'700 x 380'},
'HUC-TTGNC5T380': {b:2909091,s:3200000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm CNC',gl:'Kính 5 ly thường',sz:'700 x 380'},
'HUC-TTGNA5C380': {b:2545455,s:2800000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm vác âm',gl:'Kính 5 ly cường lực',sz:'700 x 380'},
'HUC-TTGNC5C380': {b:2954545,s:3250000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm CNC',gl:'Kính 5 ly cường lực',sz:'700 x 380'},
'HUC-TTGNA5ST380': {b:2681818,s:2950000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm vác âm',gl:'Kính 5 ly siêu trong',sz:'700 x 380'},
'HUC-TTGNC5ST380': {b:3090909,s:3400000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép nhỏ',st:'Tay nắm CNC',gl:'Kính 5 ly siêu trong',sz:'700 x 380'},
// === TỦ BẾP TRÊN - Nhôm lá ghép lớn 700x380 ===
'HUC-TTGLA4T380': {b:3045455,s:3350000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm vác âm',gl:'Kính 4 ly thường',sz:'700 x 380'},
'HUC-TTGLC4T380': {b:3500000,s:3850000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm CNC',gl:'Kính 4 ly thường',sz:'700 x 380'},
'HUC-TTGLA4ST380': {b:3136364,s:3450000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm vác âm',gl:'Kính 4 ly siêu trong',sz:'700 x 380'},
'HUC-TTGLC4ST380': {b:3590909,s:3950000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm CNC',gl:'Kính 4 ly siêu trong',sz:'700 x 380'},
'HUC-TTGLA5T380': {b:3090909,s:3400000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm vác âm',gl:'Kính 5 ly thường',sz:'700 x 380'},
'HUC-TTGLC5T380': {b:3545455,s:3900000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm CNC',gl:'Kính 5 ly thường',sz:'700 x 380'},
'HUC-TTGLA5C380': {b:3136364,s:3450000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm vác âm',gl:'Kính 5 ly cường lực',sz:'700 x 380'},
'HUC-TTGLC5C380': {b:3590909,s:3950000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm CNC',gl:'Kính 5 ly cường lực',sz:'700 x 380'},
'HUC-TTGLA5ST380': {b:3227273,s:3550000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm vác âm',gl:'Kính 5 ly siêu trong',sz:'700 x 380'},
'HUC-TTGLC5ST380': {b:3681818,s:4050000,d:{ngang:700,cao:380},g:'Tủ bếp trên',sp:'Nhôm lá ghép lớn',st:'Tay nắm CNC',gl:'Kính 5 ly siêu trong',sz:'700 x 380'},
// === TỦ BẾP TRÊN - Nhôm hợp kim 700x350 ===
'HUC-TTHKA4T350': {b:3500000,s:3850000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm vác âm',gl:'Kính 4 ly thường',sz:'700 x 350'},
'HUC-TTHKC4T350': {b:3954545,s:4350000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm CNC',gl:'Kính 4 ly thường',sz:'700 x 350'},
'HUC-TTHKA4ST350': {b:3590909,s:3950000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm vác âm',gl:'Kính 4 ly siêu trong',sz:'700 x 350'},
'HUC-TTHKC4ST350': {b:4045455,s:4450000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm CNC',gl:'Kính 4 ly siêu trong',sz:'700 x 350'},
'HUC-TTHKA5T350': {b:3545455,s:3900000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm vác âm',gl:'Kính 5 ly thường',sz:'700 x 350'},
'HUC-TTHKC5T350': {b:4000000,s:4400000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm CNC',gl:'Kính 5 ly thường',sz:'700 x 350'},
'HUC-TTHKA5C350': {b:3590909,s:3950000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm vác âm',gl:'Kính 5 ly cường lực',sz:'700 x 350'},
'HUC-TTHKC5C350': {b:4045455,s:4450000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm CNC',gl:'Kính 5 ly cường lực',sz:'700 x 350'},
'HUC-TTHKA5ST350': {b:3636364,s:4000000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm vác âm',gl:'Kính 5 ly siêu trong',sz:'700 x 350'},
'HUC-TTHKC5ST350': {b:4090909,s:4500000,d:{ngang:700,cao:350},g:'Tủ bếp trên',sp:'Nhôm hợp kim',st:'Tay nắm CNC',gl:'Kính 5 ly siêu trong',sz:'700 x 350'},
};

console.log('Codes in this batch:', Object.keys(updates).length);
console.log('This is batch 1 of ~20 (first 30 products)');
console.log('Need a smarter approach for 630 products...');

// Better: parse directly from SQL file
