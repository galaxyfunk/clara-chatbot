import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ceSalesGuard } from '../src/lib/chat/ce-sales-guard';
import { CE_WORKSPACE_ID, companyEmailError } from '../src/lib/chat/company-email-policy';
import { mailboxError, chatMailboxError } from '../src/lib/chat/email-validation';

const widget = readFileSync('public/widget.js','utf8');
function parser() {
  const code = widget.slice(widget.indexOf('  async function handleSSEStream('),widget.indexOf('  // Typing Dots Creator'));
  return runInNewContext(`${code}; handleSSEStream`,{TextDecoder,setTimeout,clearTimeout});
}
test('widget accepts fragmented frames and stops at done before late errors',async()=>{
  const events:string[]=[];
  const body=new ReadableStream({start(c){for(const part of ['data: {"type":"to','ken","content":"Hello"}\n\ndata: {"type":"done"}\n\ndata: {"type":"error"}\n\n'])c.enqueue(new TextEncoder().encode(part));}});
  await parser()(new Response(body),{onToken:()=>events.push('token'),onDone:()=>events.push('done'),onError:()=>events.push('error')});
  assert.deepEqual(events,['token','done']);
});
test('widget reports truncated replies, and accepts terminal frame without newline',async()=>{
  for(const [text,expected] of [['data: {"type":"token","content":"partial"}\n','error'],['data: {"type":"done"}','done']]){
    const events:string[]=[];
    await parser()(new Response(text),{onDone:()=>events.push('done'),onError:()=>events.push('error')});
    assert.deepEqual(events,[expected]);
  }
});
test('UK fintech, 3 senior React/Node devs: CE guard requires Philippines, agreed hours on a call and evidence-based pricing',()=>{
  const guard=ceSalesGuard(CE_WORKSPACE_ID);
  assert.match(guard,/Philippines/);
  assert.match(guard,/working hours and shift overlap are agreed with the team on a call/);
  assert.match(guard,/Do not state specific working hours or shift overlap times/);
  assert.doesNotMatch(guard,/7am[–-]4pm/i);
  assert.match(guard,/senior React\/Node/);
  assert.match(guard,/£2,980–£5,400 per developer per month/);
  assert.match(guard,/headcount the visitor explicitly requested/);
  assert.match(guard,/indicative benchmark, not a senior React\/Node quote/);
  assert.match(guard,/site\/src\/components\/templates\/pricing\/content\.ts/);
  assert.match(guard,/never invent a price/);
  assert.equal(ceSalesGuard('other-workspace'),'');
});
test('test mailbox skips validation bridge even without bridge credentials',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('must not call bridge')};
  try { assert.equal(await mailboxError(CE_WORKSPACE_ID,'jake+test@noxcapital.ae'),null); }
  finally {globalThis.fetch=original;}
});
test('secondary brief extraction is outside the response stream',()=>{
  const engine=readFileSync('src/lib/chat/engine.ts','utf8');
  const stream=engine.slice(engine.indexOf('const sseStream ='),engine.indexOf('// Context-based escalation removed'));
  assert.doesNotMatch(stream,/await extractBrief/);
});

test('designated test mailbox bypasses history and company-email checks',async()=>{
  assert.equal(await chatMailboxError(CE_WORKSPACE_ID,'jake+test@gmail.com','GB',async()=>{throw Error('must not read DB')}),null);
  assert.equal(companyEmailError(CE_WORKSPACE_ID,'jake+test@gmail.com'),null);
  assert.ok(companyEmailError(CE_WORKSPACE_ID,'jake@gmail.com'));
});

test('round 4 cost, overlap, headcount, latest-question and contact guard is scoped to CE',()=>{
  const guard=ceSalesGuard(CE_WORKSPACE_ID);
  assert.match(guard,/cost question must receive that exact benchmark and its not-a-quote qualification/);
  assert.match(guard,/timezone question must say shift overlap is agreed on a call, without inventing a number of hours/);
  assert.match(guard,/keep exactly two Senior React\/Node developers/);
  assert.match(guard,/Answer the latest visitor question first/);
  assert.match(guard,/name, work email and company/);
  assert.equal(ceSalesGuard('unrelated-tenant'),'');
});
