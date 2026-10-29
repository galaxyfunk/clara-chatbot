import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contactDetails, chatSurface, shouldShowBooking} from '../src/lib/chat/contact-details';
import {ceSalesGuard} from '../src/lib/chat/ce-sales-guard';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';
test('popup contact capture always renders booking, independent of model UI wording',()=>{
 for(const page of ['/','/pricing','/book-a-call-thank-you']){
  assert.equal(chatSurface('popup',page),'popup');
  assert.equal(shouldShowBooking(chatSurface('popup',page),'jake+test-r7@noxcapital.ae',false),true);
 }
 assert.equal(shouldShowBooking('popup',null,false),false);
 assert.equal(shouldShowBooking('ask','jake+test-r7@noxcapital.ae',false),false);
});
test('combined and separate contact capture preserves full name and company for booking and Slack',()=>{
 for(const content of ['Sam Test / jake+test-r7@noxcapital.ae / Healthtest Ltd', 'My name is Sam Test, from Healthtest Ltd. My work email is jake+test-r7@noxcapital.ae.']){
  assert.deepEqual(contactDetails([{role:'assistant',content:'I am Fake Person, from Wrong Ltd.'},{role:'user',content}]),{name:'Sam Test',company:'Healthtest Ltd',email:'jake+test-r7@noxcapital.ae'});
 }
 assert.deepEqual(contactDetails([{role:'user',content:'Sam Test'},{role:'user',content:'Healthtest Ltd'},{role:'user',content:'jake+test-r7@noxcapital.ae'}]),{name:'Sam Test',company:'Healthtest Ltd',email:'jake+test-r7@noxcapital.ae'});
});
test('surface prompt forbids fabricated forms and all seniority price subranges',()=>{
 const popup=ceSalesGuard(CE_WORKSPACE_ID,'popup');
 assert.match(popup,/has NO contact form/);assert.match(popup,/£2,980–£5,400/);assert.match(popup,/Never narrow the range/);
 assert.doesNotMatch(popup,/GBP 2/);assert.match(ceSalesGuard(CE_WORKSPACE_ID,'ask'),/surface is \/ask/);
});

test('lead bridge preserves full identity, brief and popup surface',async()=>{
 const {notifyAskClaraLead}=await import('../src/lib/integrations/ce-lead');
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));
   assert.equal(body.firstName,'Sam');assert.equal(body.lastName,'Test');assert.equal(body.company,'Healthtest Ltd');
   assert.equal(body.sourceSurface,'popup');assert.equal(body.sourcePage,'/pricing');assert.match(body.message,/two senior React/);
   return new Response(JSON.stringify({ok:true}));
  };
  assert.equal(await notifyAskClaraLead({email:'jake+test-r7@noxcapital.ae',firstName:'Sam',lastName:'Test',company:'Healthtest Ltd',surface:'popup',sourcePage:'/pricing',message:'We need two senior React developers next month.'}),true);
 }finally{globalThis.fetch=original}
});
