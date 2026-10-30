/** Explicit live-model regression for unsolicited regional recommendations.
 * Reads configured knowledge/model and optional existing conversation, but never
 * invokes postProcess: no session writes, lead delivery, Slack, CRM or booking. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {processChatStream} from '../src/lib/chat/engine';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';

const prompts=[
 'How would timezone overlap work with our New York engineering team?',
 'We are a US SaaS team in San Francisco hiring 3 senior React/Node developers. Can your engineers work with our team across timezones?',
 'We are hiring 3 senior React/Node developers in Toronto. What is the indicative per-developer monthly price and how would timezone alignment work?',
 'How many active developers does Cloud Employee have? I heard 260+. Please give the exact evidence-bank number and what it measures.',
 'Our CTO worries that Philippines engineers cannot support our US East Coast team. How would you make this work?',
];
async function main(){
 if(process.env.RUN_LIVE_CLARA_EVAL!=='1')throw Error('Set RUN_LIVE_CLARA_EVAL=1 to run paid live-model evals');
 for(const [index,message] of prompts.entries()){
  const start=Date.now();
  const result=await processChatStream({workspace_id:CE_WORKSPACE_ID,session_token:index===0&&process.env.CLARA_EVAL_SESSION_TOKEN||randomUUID(),message_id:randomUUID(),message,source_page:'/pricing',surface:'popup'});
  let body='';const decoder=new TextDecoder();const reader=result.stream.getReader();while(true){const {done,value}=await reader.read();if(done)break;body+=decoder.decode(value,{stream:true})}
  const events=body.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  const reply=events.filter(e=>e.type==='token').map(e=>e.content).join('');
  console.log(JSON.stringify({prompt:index+1,reply,ms:Date.now()-start}));
  assert.ok(events.some(e=>e.type==='done'),'stream must finish');
  if(index!==3)assert.match(reply,/Philippines|Philippine-based/i);
  assert.doesNotMatch(reply,/Latin America|LATAM|nearshor|Eastern Europe|Poland|Croatia|Serbia/i,'do not introduce alternative regions');
  assert.doesNotMatch(reply,/\b\d+(?:[–-]\d+)?\s*(?:hours?|am|pm)\b/i,'do not invent overlap hours');
  if(index!==3)assert.match(reply,/call|discuss|agree|arrang/i);
  if(index===3){assert.match(reply,/543/);assert.match(reply,/total (?:company )?headcount/i);assert.match(reply,/September.{0,5}23|23.{0,5}September/i);assert.doesNotMatch(reply,/543\+|543 (?:active|deployed)/i);if(reply.includes('260'))assert.match(reply,/outdated|obsolete|retired|not current|no longer/i)}
  assert.doesNotMatch(reply,/already.{0,40}(?:booked|scheduled|confirmed)|(?:call|appointment|meeting)\s+(?:is|has been)\s+(?:booked|scheduled|confirmed)/i,'no booking confirmation signal is available');
  assert.doesNotMatch(reply,/(?:contact\s+)?form\s+(?:just\s+)?below|button\s+(?:just\s+)?below|GBP/i);
  if(index===2){assert.ok(reply.includes('£2,980')&&reply.includes('£5,400'));assert.deepEqual([...new Set(reply.match(/£\s*[\d,]+(?:\.\d+)?/g))].sort(),['£2,980','£5,400'])}
 }
 console.log('R8 PROD LIVE EVAL: 5/5 passed (no postProcess / lead delivery)');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
