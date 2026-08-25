/* Contract-specific policy adapter for the canonical same-route history stack. */
(function installContractHistoryController(){
  const history=window.KarhaChildHistory;

  function isConsumedFormTransition(transition){
    return !!(transition?.consumed && transition?.layer?.key==='contract-form');
  }

  history?.register('contract-form',{
    onPop:(_payload,transition)=>window.KarhaRealContractForm?.requestClose?.(true,transition)
  });
  history?.register('contract-template-form',{
    onPop:(_payload,transition)=>window.KarhaContractFormLifecycle?.requestCloseTemplate?.(true,transition)
  });

  window.KarhaContractHistory=Object.freeze({
    enterForm(){return history?.open('contract-form');},
    leaveForm(fromPopState=false){return history?.consume('contract-form',{fromPopState});},
    restoreConsumedForm(transition){
      if(!isConsumedFormTransition(transition)) return false;
      return history?.open('contract-form') || false;
    },
    enterTemplate(){return history?.open('contract-template-form');},
    leaveTemplate(fromPopState=false){return history?.consume('contract-template-form',{fromPopState});},
    formOwned(){return !!history?.isOpen('contract-form');}
  });
})();
