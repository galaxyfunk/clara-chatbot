import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyAskClaraLead } from '../src/lib/integrations/ce-lead';
test('preview bridge targets configured endpoint and only acknowledges accepted delivery',async()=>{
 const original=globalThis.fetch;const old=process.env.CE_LEAD_URL;
 process.env.CE_LEAD_URL='https://website-preview.example/api/lead';
 try {
  for(const [status,body,expected] of [[200,{ok:true},true],[200,{ok:false},false],[503,{ok:false},false]] as const){
   globalThis.fetch=async(input,init)=>{assert.equal(input,process.env.CE_LEAD_URL);assert.equal(JSON.parse(String(init?.body)).email,'jake+test-r6@noxcapital.ae');return new Response(JSON.stringify(body),{status})};
   assert.equal(await notifyAskClaraLead({email:'jake+test-r6@noxcapital.ae'}),expected);
  }
  globalThis.fetch=async()=>{throw Error('timeout')};
  assert.equal(await notifyAskClaraLead({email:'jake+test-r6@noxcapital.ae'}),false);
 } finally{globalThis.fetch=original;if(old===undefined)delete process.env.CE_LEAD_URL;else process.env.CE_LEAD_URL=old}
});
