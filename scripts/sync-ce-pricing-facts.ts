/** Explicit release-time import of Cloud Employee's published fee bands from the
 * website Evidence Bank (docs/seo/evidence/facts.json), not a runtime dependency.
 * Copies each ruled fee entry's approved_wording VERBATIM: Clara quotes it exactly,
 * in the currency it is written in, and never converts it.
 * Usage: npx tsx scripts/sync-ce-pricing-facts.ts /path/to/cloudemployee.io [ref]
 */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const root=process.argv[2],ref=process.argv[3]||'origin/main';
if(!root)throw Error('Supply the website repository path');
const path='docs/seo/evidence/facts.json';
const commit=execFileSync('git',['-C',root,'rev-parse',ref],{encoding:'utf8'}).trim();
const facts=JSON.parse(execFileSync('git',['-C',root,'show',`${commit}:${path}`],{encoding:'utf8'})) as Array<{id:string;approved_wording:string|null;status:string;as_of:string|null;source:{file:string;line:number}}>;
const REGIONS:Record<string,string>={fee_ph:'Philippines',fee_latam:'Latin America',fee_ee:'Eastern Europe'};
const fees=Object.keys(REGIONS).map(id=>{
  const f=facts.find(x=>x.id===id);
  if(!f||f.status!=='ruled'||!f.approved_wording)throw Error(`${id} is missing or not ruled in the Evidence Bank; review manually`);
  return {id,region:REGIONS[id],statement:f.approved_wording,asOf:f.as_of,source:f.source};
});
writeFileSync('src/lib/chat/ce-pricing-facts.json',JSON.stringify({source:{repository:'galaxyfunk/cloudemployee.io',commit,path},fees},null,2)+'\n');
