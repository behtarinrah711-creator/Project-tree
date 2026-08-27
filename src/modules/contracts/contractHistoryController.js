/* Contract-specific policy adapter for the canonical same-route history stack. */
(function installContractHistoryController(){
  const history=window.KarhaChildHistory;
  let formPopDispatchDepth=0;

  function isConsumedFormTransition(transition){
    return !!(transition?.consumed && transition?.layer?.key==='contract-form');
  }

  history?.register('contract-form',{
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
  const formBackButton=document.getElementById('closeContractFormPage');
  if(formBackButton) formBackButton.onclick=requestCanonicalBack;

  window.KarhaContractHistory=Object.freeze({
    enterForm(){
      // A consumed Back entry must stay consumed while its onPop policy is running.
      // Dirty-form Stay may restore it later, after this synchronous dispatch ends.
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
