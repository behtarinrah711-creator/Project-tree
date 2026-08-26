import { goHomeProjects, renderSettingsWorkspace, renderTabs, setBottomNavActive, showOnlyWorkspacePage, updateWorkspaceContextBar, workspaceSubpage } from '../ui/workspacePresentationRuntime.js';
import { closeContractTemplatesPage, closeContractsPage } from '../modules/contracts/contractCompatibility.js';
import { requestCloseActivityForm } from '../modules/runtime/featureComposition.js';
/* Same-route child history. Route history remains owned by core/router.js. */
(function installChildHistoryController(){
  const registrations = new Map();
  const layers = [];
  let sequence = 0;
  let handlingPop = false;
  const afterPopQueue=[];

  function currentState(){ return history.state && history.state.karhaChild; }
  function closeKnownChild(key){
    if(key==='contacts'){ workspaceSubpage=null; renderSettingsWorkspace(); showOnlyWorkspacePage('settingsPage'); return; }
    if(key==='activities'){ workspaceSubpage=null; showOnlyWorkspacePage('settingsPage'); renderSettingsWorkspace(); return; }
    if(key==='projectTrash'){ workspaceSubpage=null; showOnlyWorkspacePage('settingsPage'); setBottomNavActive('Settings'); renderTabs(); renderSettingsWorkspace(); updateWorkspaceContextBar(); return; }
    if(key==='settings'){ workspaceSubpage=null; goHomeProjects(); return; }
    if(key==='reports' || key==='accounting'){ goHomeProjects(); return; }
    if(key==='contractTemplates'){ closeContractTemplatesPage(); return; }
    if(key==='contracts'){ closeContractsPage(); return; }
    if(key==='activityForm'){ requestCloseActivityForm(true); }
  }
  function registration(key){ return registrations.get(String(key)) || {onPop:()=>closeKnownChild(String(key))}; }
  function top(){ return layers[layers.length-1] || null; }
  function isOpen(key){ return layers.some(layer=>layer.key===String(key)); }

  function register(key, handlers={}){
    key=String(key);
    registrations.set(key, handlers);
    return ()=>{
      registrations.delete(key);
      for(let i=layers.length-1;i>=0;i--) if(layers[i].key===key) layers.splice(i,1);
    };
  }

  function open(key, payload=null){
    key=String(key);
    const existing=layers.find(layer=>layer.key===key);
    if(existing) return existing.id;
    const layer={id:`child-${++sequence}`,key,payload};
    layers.push(layer);
    history.pushState({...(history.state||{}),karhaChild:layer},'',location.href);
    return layer.id;
  }

  function consume(key, {fromPopState=false, steps=1}={}){
    key=String(key);
    const index=layers.map(layer=>layer.key).lastIndexOf(key);
    if(index<0) return false;
    layers.splice(index,1);
    if(!fromPopState){
      if(steps>1) history.go(-steps); else history.back();
    }
    return true;
  }

  function replace(key,payload=null){
    const layer=top();
    if(!layer || layer.key!==String(key)) return false;
    layer.payload=payload;
    history.replaceState({...(history.state||{}),karhaChild:{...layer}},'',location.href);
    return true;
  }

  function onPopState(event){
    if(handlingPop) return;
    handlingPop=true;
    try{
      const target=event.state && event.state.karhaChild;
      const targetIndex=target ? layers.findIndex(layer=>layer.id===target.id) : -1;
      while(layers.length-1>targetIndex){
        const layer=layers.pop();
        const transition=Object.freeze({
          type:'pop',
          consumed:true,
          layer:{...layer},
          target:target ? {...target} : null,
        });
        registration(layer.key)?.onPop?.(layer.payload,transition);
      }
      if(target && targetIndex<0){
        const handlers=registration(target.key);
        if(handlers){
          layers.push({...target});
          handlers.onRestore?.(target.payload,Object.freeze({type:'restore',consumed:false,layer:{...target}}));
        }
      }
    }finally{
      handlingPop=false;
      afterPopQueue.splice(0).forEach(callback=>callback());
    }
  }

  if(typeof window.addEventListener === 'function'){
    window.addEventListener('popstate',onPopState);
  }
  window.KarhaChildHistory=Object.freeze({register,open,consume,replace,isOpen,top,
    afterNextPop(callback){if(typeof callback==='function')afterPopQueue.push(callback);},
    getDepth:()=>layers.length});
})();

/* Transitional classic-call facade: ownership still remains in this controller. */
function pushWorkspaceHistory(kind){ return window.KarhaChildHistory?.open(kind); }

export { pushWorkspaceHistory };
