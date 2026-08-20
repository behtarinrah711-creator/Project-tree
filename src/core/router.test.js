import assert from 'node:assert/strict';
import test from 'node:test';

test('project routes decode the selected project and module identifiers', async () => {
  globalThis.window={location:{hash:'#/projects/%D9%BE%D8%B1%D9%88%DA%98%D9%87%20%DB%B1/dashboard',search:''}};
  const { parseRoute }=await import(`./router.js?decode=${Date.now()}`);
  assert.deepEqual(parseRoute(),{projectId:'پروژه ۱',moduleId:'dashboard'});
});

test('programmatic project navigation and browser history share one router lifecycle', async () => {
  const listeners=new Map();
  const stack=[''];
  let cursor=0;
  globalThis.CustomEvent=class { constructor(type,init={}){this.type=type;this.detail=init.detail;} };
  globalThis.document={readyState:'complete'};
  globalThis.window={
    location:{hash:stack[0],search:''},
    addEventListener(type,listener){
      const values=listeners.get(type)||[]; values.push(listener); listeners.set(type,values);
    },
    dispatchEvent(event){ (listeners.get(event.type)||[]).forEach(listener=>listener(event)); },
  };
  const setLocation=value=>{ window.location.hash=value; };
  window.history={
    pushState(_state,_title,url){ stack.splice(cursor+1); stack.push(url); cursor++; setLocation(url); },
    replaceState(_state,_title,url){ stack[cursor]=url; setLocation(url); },
    back(){ cursor--; setLocation(stack[cursor]); window.dispatchEvent({type:'popstate'}); },
    forward(){ cursor++; setLocation(stack[cursor]); window.dispatchEvent({type:'popstate'}); },
  };

  const { AppRouter }=await import(`./router.js?lifecycle=${Date.now()}`);
  const { moduleRegistry }=await import('./moduleRegistry.js');
  const { projectContext }=await import('./projectContext.js');
  projectContext.setProjectId(null,{silent:true});
  const projects={
    A:{tasks:['task-A']}, B:{tasks:['task-B']}, C:{tasks:['task-C']},
  };
  const data={projects:[],activeTab:null};
  const dashboardMounts=[];
  const taskReads=[];
  const invalidDashboardMounts=[];
  const contractProjects=[];
  moduleRegistry.register({
    id:'dashboard',
    mount({projectId}){
      dashboardMounts.push(projectId);
      if(!projects[projectId]){
        invalidDashboardMounts.push(projectId);
        return {projectId,moduleId:'dashboard'};
      }
      taskReads.push(...projects[projectId].tasks);
      return {projectId,moduleId:'dashboard'};
    },
  });
  moduleRegistry.register({
    id:'contracts',
    mount({projectId}){ contractProjects.push(projectId); return {projectId,moduleId:'contracts'}; },
  });
  window.addEventListener('karha:workspace-route-synced',event=>{ data.activeTab=event.detail.projectId; });

  const router=new AppRouter();
  router.start();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(router.currentMounted,null);

  // Authenticated cloud restoration happens after Router.start on an empty
  // browser. It must canonicalize and mount rather than only changing Context.
  data.projects=Object.keys(projects).map(id=>({id,...projects[id]}));
  data.activeTab='B';
  projectContext.synchronizeProjects(data.projects,data.activeTab);
  router.navigate(data.activeTab,'dashboard',{replace:true});
  assert.deepEqual(data.projects.map(project=>project.id),['A','B','C']);
  assert.deepEqual({
    activeTab:data.activeTab,
    hash:window.location.hash,
    context:projectContext.getProjectId(),
    route:window.KarhaRoute.projectId,
    mounted:router.currentMounted.projectId,
    dashboard:dashboardMounts.at(-1),
    task:taskReads.at(-1),
  },{
    activeTab:'B',hash:'#/projects/B/dashboard',context:'B',route:'B',mounted:'B',dashboard:'B',task:'task-B',
  });

  // Keep the click regression from the original Router fix.
  router.navigate('B','dashboard');
  assert.deepEqual({
    activeTab:data.activeTab,
    hash:window.location.hash,
    context:projectContext.getProjectId(),
    route:window.KarhaRoute.projectId,
    mounted:router.currentMounted.projectId,
    dashboard:dashboardMounts.at(-1),
    task:taskReads.at(-1),
  },{
    activeTab:'B',hash:'#/projects/B/dashboard',context:'B',route:'B',mounted:'B',dashboard:'B',task:'task-B',
  });

  data.activeTab='C';
  router.navigate('C','dashboard');
  assert.equal(taskReads.at(-1),'task-C');
  assert.equal(router.currentMounted.projectId,'C');
  window.history.back();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([data.activeTab,projectContext.getProjectId(),window.KarhaRoute.projectId,router.currentMounted.projectId],['B','B','B','B']);
  window.history.forward();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([data.activeTab,projectContext.getProjectId(),window.KarhaRoute.projectId,router.currentMounted.projectId,taskReads.at(-1)],['C','C','C','C','task-C']);

  router.navigate('B','contracts');
  assert.equal(contractProjects.at(-1),'B');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(invalidDashboardMounts,[]);
});
