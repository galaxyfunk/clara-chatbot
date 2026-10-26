import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailboxError, chatMailboxError } from '../src/lib/chat/email-validation';
import { CE_WORKSPACE_ID } from '../src/lib/chat/company-email-policy';
test('only CE email turns require an authenticated valid website verdict', async () => {
 const prior=globalThis.fetch;const key=process.env.EMAIL_VALIDATION_BRIDGE_KEY;let calls=0;
 try {
  delete process.env.EMAIL_VALIDATION_BRIDGE_KEY;
  assert.equal(await mailboxError('another-workspace','person@company.test'),null);
  assert.equal(await mailboxError(CE_WORKSPACE_ID,'I want to hire an engineer'),null);
  assert.ok(await mailboxError(CE_WORKSPACE_ID,'person@company.test'));
  process.env.EMAIL_VALIDATION_BRIDGE_KEY='test-key';
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://www.cloudemployee.io/api/email/validate');assert.equal((options?.headers as Record<string,string>)['x-email-validation-key'],'test-key');return Response.json({ok:true})};
  assert.equal(await mailboxError(CE_WORKSPACE_ID,'person@company.test'),null);assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json({ok:false,message:'Please correct your address.'},{status:422});
  assert.equal(await mailboxError(CE_WORKSPACE_ID,'person@company.test'),'Please correct your address.');
  globalThis.fetch=async()=>Response.json({ok:true,pendingReview:true,message:'Saved for review'},{status:202});
  assert.deepEqual(await mailboxError(CE_WORKSPACE_ID,'person@company.test'),{pendingReview:true,message:'Saved for review'});
  globalThis.fetch=async()=>Response.json({accepted:true});assert.ok(await mailboxError(CE_WORKSPACE_ID,'person@company.test'));
  globalThis.fetch=async()=>{throw new Error('offline')};assert.ok(await mailboxError(CE_WORKSPACE_ID,'person@company.test'));
 } finally {globalThis.fetch=prior;if(key===undefined)delete process.env.EMAIL_VALIDATION_BRIDGE_KEY;else process.env.EMAIL_VALIDATION_BRIDGE_KEY=key;}
});

test('CE split-message service pitch reaches the gate before capture, excluding assistant text',async()=>{
 const prior=globalThis.fetch,key=process.env.EMAIL_VALIDATION_BRIDGE_KEY;
 try {
  process.env.EMAIL_VALIDATION_BRIDGE_KEY='test';let calls=0;
  globalThis.fetch=async(_url,options)=>{
   calls++;const body=JSON.parse(String(options?.body));
   assert.equal(body.inquiry,'Do you have any use for a freelance writer?\nvendor@company.test');
   assert.equal(body.country,'US');return Response.json({ok:true,pendingReview:true,message:'Saved'},{status:202});
  };
  const load=async()=>[{role:'user',content:'Do you have any use for a freelance writer?'},{role:'assistant',content:'We need engineers. What is your email?'}];
  assert.deepEqual(await chatMailboxError(CE_WORKSPACE_ID,'vendor@company.test','US',load),{pendingReview:true,message:'Saved'});
  assert.equal(calls,1);
  assert.ok(await chatMailboxError(CE_WORKSPACE_ID,'vendor@company.test','US',async()=>{throw Error('offline')}));
  assert.equal(calls,1);
  assert.equal(await chatMailboxError('other','vendor@company.test',null,async()=>{throw Error('must not read')}),null);
  assert.equal(await chatMailboxError(CE_WORKSPACE_ID,'Hello',null,async()=>{throw Error('must not read')}),null);
 } finally {globalThis.fetch=prior;if(key===undefined)delete process.env.EMAIL_VALIDATION_BRIDGE_KEY;else process.env.EMAIL_VALIDATION_BRIDGE_KEY=key;}
});
