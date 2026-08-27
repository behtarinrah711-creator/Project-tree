import assert from 'node:assert/strict';
import test from 'node:test';
import {createHistoryState,installBrowserHistory,isApplicationHistoryState} from './browserHistory.js';

function harness(hash='#/projects/A/dashboard'){
  const listeners=new Map();
  const navigationListeners=new Map();
  const stack=[{state:null,url:hash}]; let cursor=0;
  const windowRef={
    location:{hash,href:hash},
    addEventListener(type,fn){listeners.set(type,fn);},
    navigation:{addEventListener(type,fn){navigationListeners.set(type,fn);}}
  };
  const setUrl=url=>{windowRef.location.hash=url;windowRef.location.href=url;};
  windowRef.history={
    get state(){return stack[cursor].state;},
    pushState(state,_title,url){stack.splice(cursor+1);stack.push({state,url});cursor++;setUrl(url);},
    replaceState(state,_title,url){stack[cursor]={state,url};setUrl(url);},
    go(delta){cursor+=delta;setUrl(stack[cursor].url);listeners.get('popstate')?.({state:stack[cursor].state});},
    back(){this.go(-1);},
  };
  return {windowRef,stack,navigationListeners,get cursor(){return cursor;}};
}

test('schema is versioned, minimal, serializable and initializes the first entry',()=>{
  const h=harness(); const api=installBrowserHistory({windowRef:h.windowRef});
  assert.equal(isApplicationHistoryState(h.windowRef.history.state),true);
  assert.deepEqual(Object.keys(h.windowRef.history.state),['app','version','entryId','route','child']);
  assert.doesNotThrow(()=>JSON.stringify(api.current()));
});

test('Back and Forward each dispatch one route or child restoration',()=>{
  const h=harness(); const api=installBrowserHistory({windowRef:h.windowRef});
  const restored=[];
  api.register('route',state=>restored.push(`route:${state.route.moduleId}`));
  api.register('child',state=>restored.push(`child:${state.child?.key||'none'}`));
  api.push(api.stateForRoute({projectId:'A',moduleId:'tasks',hash:'#/projects/A/tasks'}),'#/projects/A/tasks');
  api.push(api.stateForChild({id:'one',key:'task-detail',payload:{id:'T'}}),'#/projects/A/tasks');
  api.back();
  api.go(1);
  assert.deepEqual(restored,['child:none','child:task-detail']);
});

test('foreign history state is not consumed by application restorers',()=>{
  const state=createHistoryState({locationRef:{hash:''}});
  assert.equal(isApplicationHistoryState(state),true);
  assert.equal(isApplicationHistoryState({app:'another'}),false);
});

test('Navigation API serializes a rapid traverse burst until popstate reconciliation',()=>{
  const h=harness();installBrowserHistory({windowRef:h.windowRef});
  const navigate=h.navigationListeners.get('navigate');
  let prevented=0;
  const traversal=()=>navigate({navigationType:'traverse',cancelable:true,preventDefault(){prevented++;}});

  traversal();
  traversal();
  traversal();
  assert.equal(prevented,2,'only the first outstanding traversal is admitted');

  // A committed traversal releases the transaction for a later intentional Back.
  h.windowRef.history.pushState(createHistoryState({locationRef:h.windowRef.location}),'',h.windowRef.location.href);
  h.windowRef.history.back();
  traversal();
  assert.equal(prevented,2);
});
