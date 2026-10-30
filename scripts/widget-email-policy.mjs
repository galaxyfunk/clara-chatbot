import ts from 'typescript';
import {readFileSync,writeFileSync} from 'node:fs';
const policy=readFileSync('src/lib/chat/work-email-policy.ts','utf8');
const guard=readFileSync('src/lib/chat/company-email-policy.ts','utf8').replace(/^(?:import|export \{).*$/gm,'');
const source=(policy+'\n'+guard).replace(/^export /gm,'').replace(/export const WORK_EMAIL_MESSAGE[^;]+;/,'');
// The shared policy already defines WORK_EMAIL_MESSAGE.
const compiled=ts.transpileModule(source.replace(/const WORK_EMAIL_MESSAGE = 'Please use your company email address[^;]+;/,''),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.None}}).outputText;
const begin='  // BEGIN GENERATED WORK EMAIL POLICY';
const end='  // END GENERATED WORK EMAIL POLICY';
const path='public/widget.js',original=readFileSync(path,'utf8');
const block=begin+'\n'+compiled+'  '+end.trim();
const start=original.indexOf(begin),finish=original.indexOf(end);
const next=start<0?original.replace('  // ── Config ──',block+'\n\n  // ── Config ──'):original.slice(0,start)+block+original.slice(finish+end.length);
if(process.argv.includes('--check')) {if(next!==original)throw Error('Run node scripts/widget-email-policy.mjs');}
else writeFileSync(path,next);
