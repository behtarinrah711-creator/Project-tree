import assert from 'node:assert/strict';
import test from 'node:test';
import {recoverContractLinkedTasks} from './contractLinkedTaskRecovery.js';

test('restores a missing root project item from an active contract reference',()=>{
  const project={
    id:'p1',tasks:[],contracts:[{
      id:'c1',projectItemId:'task-root',projectItemRootTaskId:'task-root',
      projectItemPath:'سفت کاری',activityId:'act-1',trashed:false,
    }],
  };
  const result=recoverContractLinkedTasks(project);
  assert.equal(result.recovered,1);
  assert.equal(project.tasks.length,1);
  assert.equal(project.tasks[0].id,'task-root');
  assert.equal(project.tasks[0].text,'سفت کاری');
  assert.deepEqual(project.tasks[0].activities,['act-1']);
  assert.equal(project.tasks[0].recoveredFromContract,true);
});

test('restores a missing nested item under its surviving root and preserves the linked item id',()=>{
  const project={
    id:'p1',
    tasks:[{id:'root',text:'ساختمان',subtasks:[],activities:[]}],
    contracts:[{
      id:'c1',projectItemId:'leaf',projectItemRootTaskId:'root',
      projectItemPath:'ساختمان / نازک کاری / کاشی',activityIds:['act-a','act-b'],trashed:false,
    }],
  };
  const result=recoverContractLinkedTasks(project);
  assert.equal(result.recovered,1);
  const middle=project.tasks[0].subtasks[0];
  const leaf=middle.subtasks[0];
  assert.equal(middle.text,'نازک کاری');
  assert.equal(leaf.id,'leaf');
  assert.equal(leaf.text,'کاشی');
  assert.deepEqual(leaf.activities,['act-a','act-b']);
});

test('does not duplicate an item that is already present and ignores trashed contracts',()=>{
  const project={
    id:'p1',
    tasks:[{id:'root',text:'موجود',subtasks:[],activities:[]}],
    contracts:[
      {id:'c1',projectItemId:'root',projectItemPath:'موجود',trashed:false},
      {id:'c2',projectItemId:'deleted-ref',projectItemPath:'نباید برگردد',trashed:true},
    ],
  };
  const result=recoverContractLinkedTasks(project);
  assert.equal(result.recovered,0);
  assert.equal(project.tasks.length,1);
});
