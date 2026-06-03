let xlsxPromise = null;

export function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx');
  }
  return xlsxPromise;
}

let xlsxStylePromise = null;

// Bản fork hỗ trợ style ô (màu nền, in đậm, viền, canh lề) khi ghi file .xlsx.
// API tương thích với 'xlsx' nên dùng được chung utils.
export function loadXlsxStyle() {
  if (!xlsxStylePromise) {
    xlsxStylePromise = import('xlsx-js-style');
  }
  return xlsxStylePromise;
}
