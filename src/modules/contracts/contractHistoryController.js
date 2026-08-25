/* Contract-specific policy adapter for the canonical same-route history stack. */
(function installContractHistoryController(){
  const history=window.KarhaChildHistory;
  history?.register('contract-form',{onPop:()=>window.KarhaRealContractForm?.requestClose?.(true)});
  history?.register('contract-template-form',{onPop:()=>window.KarhaContractFormLifecycle?.requestCloseTemplate?.(true)});
  window.KarhaContractHistory=Object.freeze({
    enterForm(){return history?.open('contract-form');},
    leaveForm(fromPopState=false){return history?.consume('contract-form',{fromPopState});},
    enterTemplate(){return history?.open('contract-template-form');},
    leaveTemplate(fromPopState=false){return history?.consume('contract-template-form',{fromPopState});},
    formOwned(){return !!history?.isOpen('contract-form');}
  });
})();
