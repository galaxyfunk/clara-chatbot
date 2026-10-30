/** Actual model/knowledge regression, explicitly invoked. No postProcess, writes or leads. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {processChatStream} from '../src/lib/chat/engine';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';
const cases=[
 ['US','We are a US SaaS company in New York hiring 3 senior React/Node developers. Where would you recommend hiring, and how would timezone alignment work?','Latin America'],
 ['UK','We are a UK fintech company in London hiring 3 senior React/Node developers. Where would you recommend hiring?','Philippines'],
 ['Australia','Our company is based in Sydney, Australia. Where would you recommend hiring senior developers?','Philippines'],
 ['Germany','Our engineering company is based in Berlin, Germany. What is your primary developer region recommendation?','Philippines'],
 ['Canada','Our team is in Toronto, Canada. Where should we hire our React engineers?','Latin America'],
 ['New Zealand','We are based in Auckland, New Zealand. Where should we hire developers?','Philippines'],
 ['APAC','We are based in Singapore. Where should we hire developers?','Philippines'],
 ['unknown','We need three senior React/Node developers. Where should we hire them?','unknown'],
];
async function main(){
 if(process.env.RUN_LIVE_CLARA_EVAL!=='1')throw Error('Set RUN_LIVE_CLARA_EVAL=1 to invoke paid live-model eval');
 for(const [region,message,expected] of cases){
  const result=await processChatStream({workspace_id:CE_WORKSPACE_ID,session_token:randomUUID(),message_id:randomUUID(),message,surface:'popup',source_page:'/'});
  let raw='';const reader=result.stream.getReader(),decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;raw+=decoder.decode(value,{stream:true})}
  const events=raw.split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));const reply=events.filter(e=>e.type==='token').map(e=>e.content).join('');console.log(JSON.stringify({region,expected,reply}));assert.ok(events.some(e=>e.type==='done'));
  if(expected==='unknown'){assert.match(reply,/where.{0,60}(?:based|located)|(?:country|location).{0,40}\?/i);assert.doesNotMatch(reply,/Latin America|Philippines|Eastern Europe/i)}else{assert.ok(reply.includes(expected));const first=reply.match(/Latin America|Philippines|Eastern Europe/i)?.[0];assert.equal(first?.toLowerCase(),expected.toLowerCase())}
  assert.doesNotMatch(reply,/\b\d+(?:[–-]\d+)?\s*(?:hours?|am|pm)\b|GBP|already.{0,30}(?:booked|scheduled|confirmed)/i);
 }
 console.log('R10 REGIONAL LIVE EVAL: 8/8 passed');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
