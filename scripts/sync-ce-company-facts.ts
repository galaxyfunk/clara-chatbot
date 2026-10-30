/** Explicit release-time import from the website evidence bank, not a runtime dependency.
 * Usage: npx tsx scripts/sync-ce-company-facts.ts /path/to/cloudemployee.io [ref]
 */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const root=process.argv[2],ref=process.argv[3]||'origin/main';
if(!root)throw Error('Supply the website repository path');
const path='docs/seo/evidence/company-facts.md';
const commit=execFileSync('git',['-C',root,'rev-parse',ref],{encoding:'utf8'}).trim();
const text=execFileSync('git',['-C',root,'show',`${commit}:${path}`],{encoding:'utf8'});
const lines=text.split('\n');
const index=lines.findIndex(line=>/Total headcount \(\d+:/.test(line)&&line.includes('**Status.** current'));
const match=lines[index]?.match(/Total headcount \((\d+):.*?\) is as of ([^.]+)\./);
if(!match)throw Error('No current dated total-headcount evidence; review source manually');
if(!text.includes('confirm a current embedded-engineer subtotal'))throw Error('Review metric scope before importing changed evidence');
writeFileSync('src/lib/chat/ce-company-facts.json',JSON.stringify({totalHeadcount:Number(match[1]),asOf:match[2],metric:'total company headcount',activeDeveloperCountConfirmed:false,source:{repository:'galaxyfunk/cloudemployee.io',commit,path,line:index+1,scopeLine:16}},null,2)+'\n');
