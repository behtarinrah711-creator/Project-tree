/* Contract-specific policy adapter for the canonical same-route history stack. */
(function installContractHistoryController(){
  const history=window.KarhaChildHistory;
  let formPopDispatchDepth=0;
  let traversalExitPending=false;

  function isConsumedFormTransition(transition){
    return !!(transition?.consumed && transition?.layer?.key==='contract-form');
  }

  history?.register('contract-form',{
    onTraverse:()=>{
      const form=window.KarhaRealContractForm;
      if(!form?.shouldPreflightExit?.()) return false;

      // Cancel the browser traversal first. Run the normal contract exit flow
      // in the next task, after Navigation API cancellation has fully settled;
      // pushing the transient history entry from the navigate-event microtask
      // can race Chromium and leave the prompt mounted but still hidden.
      if(!traversalExitPending){
        traversalExitPending=true;
        const dispatchExit=()=>{
          traversalExitPending=false;
          const activeForm=window.KarhaRealContractForm;
          if(activeForm?.shouldPreflightExit?.()) activeForm.requestClose?.(false,null);
        };
        if(typeof window.setTimeout==='function') window.setTimeout(dispatchExit,0);
        else queueMicrotask(dispatchExit);
      }
      return true;
    },
    onPop:(_payload,transition)=>{
      const consumed=isConsumedFormTransition(transition);
      if(consumed) formPopDispatchDepth++;
      try{
        return window.KarhaRealContractForm?.requestClose?.(true,transition);
      }finally{
        if(consumed) formPopDispatchDepth=Math.max(0,formPopDispatchDepth-1);
      }
    }
  });
  history?.register('contract-template-form',{
    onPop:(_payload,transition)=>window.KarhaContractFormLifecycle?.requestCloseTemplate?.(true,transition)
  });

  const requestCanonicalBack=()=>window.KarhaBrowserHistory?.back?.();
  const contractsBackButton=document.getElementById('closeContractsPage');
  if(contractsBackButton) contractsBackButton.onclick=requestCanonicalBack;
  const formBackButton=document.getElementById('closeContractFormPage');
  if(formBackButton) formBackButton.onclick=requestCanonicalBack;

  window.KarhaContractHistory=Object.freeze({
    enterForm(){
      if(formPopDispatchDepth>0) return false;
      return history?.open('contract-form');
    },
    leaveForm(fromPopState=false){return history?.consume('contract-form',{fromPopState});},
    restoreConsumedForm(transition){
      if(!isConsumedFormTransition(transition)) return false;
      transition.restore?.();
      return true;
    },
    enterTemplate(){return history?.open('contract-template-form');},
    leaveTemplate(fromPopState=false){return history?.consume('contract-template-form',{fromPopState});},
    formOwned(){return !!history?.isOpen('contract-form');},
    requestBack:requestCanonicalBack,
  });
})();
