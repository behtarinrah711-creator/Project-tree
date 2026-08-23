/** Phase 8.2 — global incomplete-form exit choice overlay. */
export function showIncompleteFormExitChoice({ onYes, onNo, onStay, documentRef } = {}){
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if(!doc || !doc.body) return false;
  const existing = doc.querySelector('.global-incomplete-exit-choice');
  if(existing) return true;
  const ov = doc.createElement('div');
  ov.className = 'contact-exit-choice global-incomplete-exit-choice';
  ov.innerHTML = '<div class="contact-exit-card"><div class="contact-exit-title">اطلاعات کامل نشده است</div><div class="contact-exit-text">آیا اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟</div><div class="contact-exit-actions"><button type="button" class="mini-btn primary" data-exit="yes">بله</button><button type="button" class="mini-btn ghost" data-exit="no">خیر</button></div></div>';
  doc.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('[data-exit="yes"]').onclick = () => { close(); if(onYes) onYes(); };
  ov.querySelector('[data-exit="no"]').onclick = () => { close(); if(onNo) onNo(); };
  ov.addEventListener('pointerdown', e => { if(e.target === ov && onStay){ close(); onStay(); } });
  return true;
}
