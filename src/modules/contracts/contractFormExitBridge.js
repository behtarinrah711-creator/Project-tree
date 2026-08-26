import { createFormExitSession } from '../../core/formExitPolicy.js';

let installed = false;

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

  form.requestClose = function(fromPopState = false, transition = null){
    const doc = windowRef.document;
    const childOpen = id => {
      const el = doc?.getElementById?.(id);
      return !!(el && !el.classList.contains('hidden'));
    };
    // Child overlays own this Back; form must not close or prompt.
    if(childOpen('searchTemplatePage') || childOpen('numpadOverlay') || childOpen('jalaliPop')) return false;

    // session baseline OR form dirty flag — never force-clear dirty to false.
    const sessionDirty = !!exitSession?.isDirty?.();
    const flagDirty = !!form.isDirty?.();
    const changed = sessionDirty || flagDirty;
    if(changed) originalSetDirty(true);

    const result = originalRequestClose(fromPopState, transition);
    if(editing && changed && result === false){
      patchEditPrompt({windowRef, form});
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
