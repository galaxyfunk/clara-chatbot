import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contactDetails} from '../src/lib/chat/contact-details';
const user=(content:string)=>({role:'user',content});
for(const text of [
 'My name is Jake Fix Four at Nox Capital. Our company is based in the United States.',
 'I am Jake AUDIT1 QA at Nox Capital, United States',
 'My name is Jake Fix Three at Nox Capital based in the United States.',
])test(`company is Nox Capital: ${text}`,()=>{assert.equal(contactDetails([user(text)]).company,'Nox Capital')});
test('later location updates never replace an explicit company',()=>{
 const messages=[user('My name is Jake Fix Four at Nox Capital.'),user('Our company is based in the United States.'),user('Company is headquartered in London.')];
 assert.equal(contactDetails(messages).company,'Nox Capital');
});
for(const phrase of ['based in the United States','located in Germany','headquartered in London','United States'])test(`location-only company ${phrase} leaves domain fallback available`,()=>{
 const result=contactDetails([user(`Our company is ${phrase}. My email is jake+test-daily1101@noxcapital.ae.`)]);
 assert.equal(result.company,null);assert.equal(result.email,'jake+test-daily1101@noxcapital.ae');
});
test('real explicit company names and corrections still work',()=>{
 assert.equal(contactDetails([user('My name is Jake Test at Nox Capital.'),user('Company name: North Star Labs.')]).company,'North Star Labs');
 assert.equal(contactDetails([user('Company is Based Labs.')]).company,'Based Labs');
});

test('the actual website bridge receives a company name, never a location phrase',async()=>{
 const {notifyAskClaraLead}=await import('../src/lib/integrations/ce-lead');
 const originalFetch=globalThis.fetch;const originalUrl=process.env.CE_LEAD_URL;
 const captured:Array<Record<string,unknown>>=[];
 process.env.CE_LEAD_URL='https://fixture.invalid/api/lead';
 globalThis.fetch=async(url,init)=>{assert.equal(url,'https://fixture.invalid/api/lead');captured.push(JSON.parse(String(init?.body)));return Response.json({ok:true})};
 try{
  for(const message of ['My name is Jake Fix Four at Nox Capital. Our company is based in the United States.','I am Jake AUDIT1 QA at Nox Capital, United States','Our company is based in the United States.']){
   const details=contactDetails([user(message),user('jake+test-daily1101@noxcapital.ae')]);
   assert.equal(await notifyAskClaraLead({...details,email:details.email!,surface:'popup',sourcePage:'/pricing',message}),true);
  }
  assert.deepEqual(captured.map(x=>x.company),['Nox Capital','Nox Capital',undefined]);
  for(const body of captured){assert.equal(body.email,'jake+test-daily1101@noxcapital.ae');assert.equal(body.sourceSurface,'popup')}
 }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.CE_LEAD_URL;else process.env.CE_LEAD_URL=originalUrl}
});
