let xlsxPromise = null;

export function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx');
  }
  return xlsxPromise;
}
