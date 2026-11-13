import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ceSalesGuard} from '../src/lib/chat/ce-sales-guard';
import {pricingFacts} from '../src/lib/chat/ce-pricing-facts';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';

test('pricing comes verbatim from the Evidence Bank, with no conversion and no forced GBP',()=>{
 const guard=ceSalesGuard(CE_WORKSPACE_ID);
 assert.equal(pricingFacts.fees.length,3);
 for(const f of pricingFacts.fees)assert.ok(guard.includes(`"${f.statement}"`),f.id);
 assert.match(guard,/Do not convert to any other currency/);
 assert.match(guard,/do not switch currency because of the visitor's location/);
 assert.doesNotMatch(guard,/£/);
 assert.doesNotMatch(guard,/always use the £ symbol|never .*write GBP/i);
 assert.doesNotMatch(guard,/\$3,000 to \$6,000\+? per month for a full-time/);
});
test('KB SQL replaces the old $3,000-$6,000+ answer with the Evidence Bank statements',()=>{
 const sql=readFileSync('scripts/kb-fixes-2026-11-14.sql','utf8');
 assert.match(sql,/f48254cc-0c96-493a-bb3e-0e91941c177a/);
 for(const f of pricingFacts.fees)assert.ok(sql.includes(f.statement.replace(/'/g,"''")),f.id);
});
