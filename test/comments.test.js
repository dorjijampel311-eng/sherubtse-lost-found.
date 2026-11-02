const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
test('comment content and author names are escaped and profile details are not embedded in cards', () => {
  const context = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8'), context);
  const html = context.commentRows([{ id: '1', userId: '7', name: '<img src=x onerror=bad()>', body: '<script>bad()</script>', createdAt: '2026-11-02T00:00:00Z', phone: 'PRIVATE-PHONE' }]);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-commenter="7"')); assert.ok(html.includes('aria-haspopup="dialog"')); assert.ok(!html.includes('PRIVATE-PHONE'));
  const section = context.commentSection({ id: '3', commentCount: 2 });
  assert.ok(section.includes('data-comments-item="3"')); assert.ok(section.includes('>2</span>'));
});

test('Delete is shown only beside comments authored by the current user', () => {
  const context = vm.createContext({ document:{ addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/app.js'),'utf8'),context);
  const comments = [{ id:'1',userId:'7',name:'Author one',body:'First',createdAt:'2026-11-02T00:00:00Z' },{ id:'2',userId:'8',name:'Author two',body:'Second',createdAt:'2026-11-02T00:00:00Z' }];
  assert.ok(!context.commentRows(comments).includes('data-delete-comment'));
  vm.runInContext('state.user={id:7}',context);
  const html = context.commentRows(comments);
  assert.ok(html.includes('data-delete-comment="1"')); assert.ok(!html.includes('data-delete-comment="2"'));
  assert.ok(html.includes('aria-label="Delete your comment"'));
});
test('comment deletion asks for confirmation, sends DELETE and refreshes the thread without clearing the draft', async () => {
  let calls=0, refreshed=0, confirmed=false;
  const draft={ value:'Unsubmitted draft' },count={textContent:'1'};
  const details={ dataset:{ commentsItem:'3' },querySelector:selector=>selector==='[data-comment-count]'?count:draft };
  const button={ disabled:false,textContent:'Delete',dataset:{ deleteComment:'1' },closest:()=>details };
  const context=vm.createContext({ document:{ addEventListener() {} },confirm:()=>confirmed,fetch:async (url,options)=>{
    calls++; assert.equal(url,'/api/items/3/comments/1'); assert.equal(options.method,'DELETE'); assert.deepEqual(JSON.parse(options.body),{confirmed:true});
    return { ok:true,json:async()=>({ok:true}) };
  } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/js/app.js'),'utf8'),context);
  context.loadComments=async (target,notice)=>{assert.equal(target,details);assert.equal(notice,'Comment deleted.');refreshed++;draft.value='';};
  await context.deleteOwnComment(button);assert.equal(calls,0);assert.equal(refreshed,0);
  confirmed=true;await context.deleteOwnComment(button);assert.equal(calls,1);assert.equal(refreshed,1);assert.equal(draft.value,'Unsubmitted draft');assert.equal(button.disabled,false);assert.equal(count.textContent,'0');
});
