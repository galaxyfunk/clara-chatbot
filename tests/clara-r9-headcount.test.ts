import {test} from 'node:test';
import assert from 'node:assert/strict';
import facts from '../src/lib/chat/ce-company-facts.json';
import {ceSalesGuard} from '../src/lib/chat/ce-sales-guard';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';
test('published company-scale snapshot preserves the evidence metric, date and provenance',()=>{
 assert.equal(facts.totalHeadcount,543);assert.equal(facts.asOf,'September 23, 2026');
 assert.equal(facts.activeDeveloperCountConfirmed,false);assert.equal(facts.metric,'total company headcount');
 assert.equal(facts.source.path,'docs/seo/evidence/company-facts.md');assert.equal(facts.source.line,95);
 for(const surface of ['popup','ask'] as const){const prompt=ceSalesGuard(CE_WORKSPACE_ID,surface);assert.ok(prompt.includes(`${facts.totalHeadcount} total company headcount as of ${facts.asOf}`));assert.match(prompt,/active\/embedded-developer subtotal is not confirmed/)}
 assert.equal(ceSalesGuard('other-tenant'),'');
});

import {reconcileCompanyHeadcount} from '../src/lib/chat/ce-company-facts';
test('stale persona and knowledge counts are reconciled without changing requested hires or retention',()=>{
 const context='260+ active \ndevelopers; built the company to 300+ active developers with 97% retention. The visitor wants 3 senior React/Node developers.';
 const result=reconcileCompanyHeadcount(context);
 assert.doesNotMatch(result,/260|300/);assert.equal(result.split('543 total company headcount').length-1,2);
 assert.match(result,/not a confirmed active-developer subtotal/);assert.match(result,/97% retention/);assert.match(result,/3 senior React\/Node developers/);
});

test('legacy persona with literal escaped newlines is reconciled too',()=>{assert.match(reconcileCompanyHeadcount(String.raw`260+ active \ndevelopers`),/543 total company headcount/)});
