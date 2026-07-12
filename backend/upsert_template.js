// Script to upsert 630 products with new prices + corrected metadata
// Runs via Supabase JS client (no raw SQL needed)
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

// ALL 630 products extracted from the SQL INSERT
// Format: [code, name, desc, unit, base_price, selling_price, vat_rate, dimensions, code_group, code_spec, code_standard, code_glass, code_side, code_type_std, code_size]
const products = [
['HUC-TTGNA4T380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 4 ly thường 700 x 380','Md',2454545,2700000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm vác âm','Kính 4 ly thường',null,null,'700 x 380'],
['HUC-TTGNC4T380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm cnc kính 4 ly thường 700 x 380','Md',2863636,3150000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm CNC','Kính 4 ly thường',null,null,'700 x 380'],
['HUC-TTGNA4ST380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 4 ly siêu trong 700 x 380','Md',2545455,2800000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm vác âm','Kính 4 ly siêu trong',null,null,'700 x 380'],
['HUC-TTGNC4ST380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm cnc kính 4 ly siêu trong 700 x 380','Md',2954545,3250000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm CNC','Kính 4 ly siêu trong',null,null,'700 x 380'],
['HUC-TTGNA5T380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 5 ly thường 700 x 380','Md',2500000,2750000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm vác âm','Kính 5 ly thường',null,null,'700 x 380'],
['HUC-TTGNC5T380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm cnc kính 5 ly thường 700 x 380','Md',2909091,3200000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm CNC','Kính 5 ly thường',null,null,'700 x 380'],
['HUC-TTGNA5C380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 5 ly cường lực 700 x 380','Md',2545455,2800000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm vác âm','Kính 5 ly cường lực',null,null,'700 x 380'],
['HUC-TTGNC5C380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm cnc kính 5 ly cường lực 700 x 380','Md',2954545,3250000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm CNC','Kính 5 ly cường lực',null,null,'700 x 380'],
['HUC-TTGNA5ST380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 5 ly siêu trong 700 x 380','Md',2681818,2950000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm vác âm','Kính 5 ly siêu trong',null,null,'700 x 380'],
['HUC-TTGNC5ST380','Tủ bếp trên nhôm lá ghép nhỏ tay nắm cnc kính 5 ly siêu trong 700 x 380','Md',3090909,3400000,10,{"ngang":700,"cao":380},'Tủ bếp trên','Nhôm lá ghép nhỏ','Tay nắm CNC','Kính 5 ly siêu trong',null,null,'700 x 380'],
];

// This is just the first 10 - we need to generate full list from the SQL
// Better approach: run individual UPDATEs by code

console.log('Sample count:', products.length);
console.log('This script is a template - need to include all 630 products');
console.log('Switching to batch UPDATE approach...');
