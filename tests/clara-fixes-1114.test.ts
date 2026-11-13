import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildShortSummary} from '../src/lib/chat/short-summary';
import {isSyntheticSession,isHealthProbe,HEALTH_CHECK_QUESTION} from '../src/lib/chat/synthetic';
import {safeNextPath} from '../src/lib/safe-next';
import {ceSalesGuard} from '../src/lib/chat/ce-sales-guard';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';

test('health probe is only the exact monitor question with the flag',()=>{
 assert.equal(isHealthProbe({health_check:true,message:HEALTH_CHECK_QUESTION}),true);
 assert.equal(isHealthProbe({health_check:true,message:'Tell me your prices'}),false);
 assert.equal(isHealthProbe({message:HEALTH_CHECK_QUESTION}),false);
});
test('legacy monitor rows are synthetic, real chats with the same opener are not',()=>{
 const pair=[{role:'user',content:HEALTH_CHECK_QUESTION},{role:'assistant',content:'Philippines and LATAM.'}];
 assert.equal(isSyntheticSession({messages:pair}),true);
 assert.equal(isSyntheticSession({messages:[...pair,{role:'user',content:'And pricing?'},{role:'assistant',content:'…'}]}),false);
 assert.equal(isSyntheticSession({messages:pair,visitor_email:'someone@company.com'}),false);
 assert.equal(isSyntheticSession({messages:[],metadata:{synthetic:true}}),true);
});
test('short summary prefers the brief, never repeats emails, and falls back to visitor words',()=>{
 const brief={roles:[{count:2,title:'React Developer',seniority:'Senior'}],regions:['LATAM'],techStacks:['React'],companyContext:'US-based company.'};
 const s=buildShortSummary({messages:[{role:'user',content:'hi'},{role:'assistant',content:'hello'}],metadata:{brief}})!;
 assert.equal(s.source,'brief');
 assert.equal(s.text,'Wants 2 Senior React Developer · region LATAM. US-based company.');
 const v=buildShortSummary({messages:[{role:'user',content:'Do you place PMs? Reach me at a.person@corp.com'},{role:'assistant',content:'Yes'}]})!;
 assert.equal(v.source,'visitor');
 assert.ok(!v.text.includes('@corp.com'));
 assert.ok(v.text.length<=280);
 assert.equal(buildShortSummary({messages:[]}),null);
 const ai=buildShortSummary({messages:[{role:'user',content:'x'}],metadata:{summary:{summary:'Visitor wants 3 Node engineers next month.'},brief}})!;
 assert.equal(ai.source,'ai');
});
test('login deep link only allows same-site dashboard paths',()=>{
 assert.equal(safeNextPath('/dashboard/sessions/abc'),'/dashboard/sessions/abc');
 assert.equal(safeNextPath('https://evil.example/x'),'/dashboard');
 assert.equal(safeNextPath('//evil.example'),'/dashboard');
 assert.equal(safeNextPath('/login'),'/dashboard');
 assert.equal(safeNextPath(null),'/dashboard');
});
test('sales guard pins the two-profiles promise',()=>{
 const g=ceSalesGuard(CE_WORKSPACE_ID);
 assert.match(g,/two matched profiles within seven working days/);
 assert.match(g,/never say "2-3 profiles"/i);
});
test('no transcript or email debug logging remains in the chat engine',()=>{
 const engine=readFileSync('src/lib/chat/engine.ts','utf8');
 assert.ok(!engine.includes('[Summary Debug]'));
 assert.ok(!/JSON\.stringify\(upsertResult/.test(engine));
 const sessions=readFileSync('src/app/api/sessions/route.ts','utf8');
 assert.ok(!sessions.includes('[Sessions Debug]'));
});
