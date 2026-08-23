/** Phase 8.2 — digit formatting primitives (no DOM ownership). */
export function toPersianDigits(str){
  return String(str).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
export function toEnglishDigits(str){
  return String(str).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}
export function groupWithCommas(digits){
  const s = String(digits || '');
  if(!s) return '';
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function formatCost(n){
  if(n === null || n === undefined || n === '') return '';
  const num = Number(String(n).replace(/[^\d.-]/g, ''));
  if(!Number.isFinite(num)) return '';
  return toPersianDigits(groupWithCommas(String(Math.round(Math.abs(num))))) + (num < 0 ? '-' : '');
}
export function formatCostDisplay(n){
  const s = formatCost(n);
  return s ? (s + ' تومان') : '';
}
