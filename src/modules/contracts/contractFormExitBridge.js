import { createFormExitSession } from '../../core/formExitPolicy.js';

let installed = false;
const REAL_CONTRACT_DRAFT_KEY = 'karha_real_contract_form_draft_v1';

function setEditMode(documentRef, editing){
  const page = documentRef.getElementById('contractFormPage');
  if(!page) return;
  if(editing) page.dataset.contractEditing = 'true';
  else delete page.dataset.contractEditing;
}

function runAfterPromptDismiss(overlay, action){
  if(typeof overlay?.__karhaDismissWithAction === 'function'){
    overlay.__karhaDismissWithAction(action);
  }else{
    overlay?.remove?.();
    action?.();
  }
}

function patchExitPrompt({windowRef, form, editing}){
  const documentRef = windowRef.document;
  const overlay = documentRef.querySelector('.global-incomplete-exit-choice');
  if(!overlay) return false;

  const title = overlay.querySelector('.contact-exit-title');
  const text = overlay.querySelector('.contact-exit-text');
  const yes = overlay.querySelector('[data-exit="yes"]');
  const no = overlay.querySelector('[data-exit="no"]');

  if(editing){
    if(title) title.textContent = 'تغییرات ذخیره نشده';
    if(text) text.textContent = 'آیا تغییرات این فرم ذخیره شود؟';
  }

  if(yes){
    yes.onclick = () => runAfterPromptDismiss(overlay, () => {
      if(editing){
        // Editing never creates a draft. Save back to the same contract id.
        form.save(null, false);
      }else{
        // New-contract exit must use the real draft path so the same state can
        // be restored next time the user opens New Contract.
        form.saveDraft?.();
      }
    });
  }

  if(no){
    no.onclick = () => runAfterPromptDismiss(overlay, () => {
      // Once the transient has been dismissed the browser is back on the form
      // entry. Consume that form entry normally; fromPopState=true would leave
      // stale form ownership in history and desynchronise UI from the browser.
      form.close(false);
    });
  }
  return true;
}

function restoreDraftIfPresent({windowRef, form, editing}){
  if(editing) return false;
  try{
    const raw = windowRef.localStorage?.getItem?.(REAL_CONTRACT_DRAFT_KEY);
    if(!raw) return false;
    const draft = JSON.parse(raw);
    if(!draft || typeof draft !== 'object' || Array.isArray(draft)) return false;
    form.setState?.(draft);
    form.setDirty?.(false);
    form.render?.();
    return true;
  }catch{
    return false;
  }
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
  const originalSave = form.save.bind(form);

  let editing = false;
  let exitSession = null;

  form.open = function(id = null, projectId = null){
    const opened = originalOpen(id, projectId);
    if(!opened) return opened;

    editing = !!id;
    setEditMode(documentRef, editing);
    restoreDraftIfPresent({windowRef, form, editing});
    exitSession = createFormExitSession({
      isNew: () => !editing,
      getState: () => form.getState?.(),
    });
    // A restored draft is the new clean baseline; only later edits should ask
    // whether to save another draft on exit.
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
    if(changed && result === false){
      patchExitPrompt({windowRef, form, editing});
    }
    return result;
  };

  form.save = function(projectId = null, silent = false){
    const wasNew = !editing;
    const saved = originalSave(projectId, silent);
    if(saved && wasNew){
      try{ windowRef.localStorage?.removeItem?.(REAL_CONTRACT_DRAFT_KEY); }catch{}
    }
    return saved;
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
