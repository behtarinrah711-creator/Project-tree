import { createFormExitSession } from '../../core/formExitPolicy.js';

let installed = false;

function ensureEditDraftStyle(documentRef){
  if(documentRef.getElementById('contract-edit-no-draft-style')) return;
  const style = documentRef.createElement('style');
  style.id = 'contract-edit-no-draft-style';
  style.textContent = '#contractFormPage[data-contract-editing="true"] .if-draft{display:none!important;}';
  documentRef.head?.appendChild(style);
}

function setEditMode(documentRef, editing){
  const page = documentRef.getElementById('contractFormPage');
  if(!page) return;
  if(editing) page.dataset.contractEditing = 'true';
  else delete page.dataset.contractEditing;
}

function patchEditPrompt({windowRef, form}){
  const documentRef = windowRef.document;
  const overlay = documentRef.querySelector('.global-incomplete-exit-choice');
  if(!overlay) return false;

  const title = overlay.querySelector('.contact-exit-title');
  const text = overlay.querySelector('.contact-exit-text');
  const yes = overlay.querySelector('[data-exit="yes"]');

  if(title) title.textContent = 'تغییرات ذخیره نشده';
  if(text) text.textContent = 'آیا تغییرات این فرم ذخیره شود؟';
  if(yes){
    yes.onclick = () => {
      overlay.remove();
      // Editing never creates a draft. Save back to the same contract id.
      form.save(null, false);
    };
  }
  return true;
}

export function installContractFormExitBridge({windowRef = window} = {}){
  if(installed) return true;
  const form = windowRef.KarhaRealContractForm;
  if(!form) return false;
  installed = true;

  const documentRef = windowRef.document;
  ensureEditDraftStyle(documentRef);

  const originalOpen = form.open.bind(form);
  const originalRequestClose = form.requestClose.bind(form);
  const originalClose = form.close.bind(form);
  const originalSetDirty = form.setDirty.bind(form);

  let editing = false;
  let exitSession = null;

  form.open = function(id = null, projectId = null){
    const opened = originalOpen(id, projectId);
    if(!opened) return opened;

    editing = !!id;
    setEditMode(documentRef, editing);
    exitSession = createFormExitSession({
      isNew: () => !editing,
      getState: () => form.getState?.(),
    });
    exitSession.captureBaseline();
    return opened;
  };

  form.requestClose = function(fromPopState = false){
    // Only yield while a child overlay is still open. Time-based suppress is for
    // the same gesture that closed the child; a later Back belongs to the form.
    const doc = windowRef.document;
    const childOpen = id => {
      const el = doc?.getElementById?.(id);
      return !!(el && !el.classList.contains('hidden'));
    };
    if(childOpen('searchTemplatePage') || childOpen('numpadOverlay') || childOpen('jalaliPop')) return false;

    // Net change from baseline OR the form's own dirty flag (input handlers).
    const sessionDirty = !!exitSession?.isDirty?.();
    const flagDirty = !!form.isDirty?.();
    const changed = sessionDirty || flagDirty;
    if(changed) originalSetDirty(true);

    const result = originalRequestClose(fromPopState);
    if(changed && result === false){
      // Ensure dialog exists even if helper resolution failed once.
      const hasDialog = !!doc?.querySelector?.('.global-incomplete-exit-choice');
      if(!hasDialog){
        const show = windowRef.KarhaUI?.showIncompleteFormExitChoice
          || windowRef.showIncompleteFormExitChoice
          || windowRef.KarhaLegacy?.showIncompleteFormExitChoice;
        if(typeof show === 'function'){
          // Re-enter module requestClose path by re-calling original after dirty forced
          originalSetDirty(true);
          originalRequestClose(fromPopState);
        }
      }
      if(editing) patchEditPrompt({windowRef, form});
    }
    return result;
  };

  form.close = function(fromPopState = false){
    editing = false;
    exitSession = null;
    setEditMode(documentRef, false);
    return originalClose(fromPopState);
  };

  return true;
}

export default { installContractFormExitBridge };
