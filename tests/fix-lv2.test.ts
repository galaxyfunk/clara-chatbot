import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {companyEmailError,CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';
import {contactDetails} from '../src/lib/chat/contact-details';
import {buildAskClaraLeadMessage} from '../src/lib/integrations/ce-lead';
test('API and generated widget share the validator including test aliases',()=>{
 const widget=readFileSync('public/widget.js','utf8');
 const code=widget.split('// BEGIN GENERATED WORK EMAIL POLICY')[1].split('// END GENERATED WORK EMAIL POLICY')[0];
 const context=vm.createContext({});vm.runInContext(code+';globalThis.check=companyEmailError',context);
 for(const email of ['jake+test-negative-lv3@gmail.com','buyer@outlook.co.nz','buyer@mailinator.com','jake+test-clara-lv3@noxcapital.ae']){
  assert.equal(Boolean(context.check(CE_WORKSPACE_ID,email)),Boolean(companyEmailError(CE_WORKSPACE_ID,email)));
 }
 assert.ok(companyEmailError(CE_WORKSPACE_ID,'jake+test-negative-lv3@gmail.com'));
 assert.equal(companyEmailError('unrelated-workspace','buyer@gmail.com'),null);
});
test('visitor-supplied name with initials and digits survives extraction and original first message wins over summary',()=>{
 const content='I am Jake Live2 QA at Nox Capital, United States. We need two senior React engineers. My email is jake+test-clara-lv3@noxcapital.ae.';
 const messages=[{role:'user',content},{role:'assistant',content:'My name is Clara'}];
 assert.equal(contactDetails(messages).name,'Jake Live2 QA');
 assert.equal(buildAskClaraLeadMessage(messages,'Short generated summary'),content);
});
