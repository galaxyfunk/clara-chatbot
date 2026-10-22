import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailboxError } from '../src/lib/chat/email-validation';
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
  globalThis.fetch=async()=>Response.json({accepted:true});assert.ok(await mailboxError(CE_WORKSPACE_ID,'person@company.test'));
  globalThis.fetch=async()=>{throw new Error('offline')};assert.ok(await mailboxError(CE_WORKSPACE_ID,'person@company.test'));
 } finally {globalThis.fetch=prior;if(key===undefined)delete process.env.EMAIL_VALIDATION_BRIDGE_KEY;else process.env.EMAIL_VALIDATION_BRIDGE_KEY=key;}
});
