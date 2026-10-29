/** Explicitly invoked live-model eval. Reads the real knowledge/model configuration,
 * consumes the actual streamed reply, but never calls postProcess or submits leads. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {processChatStream} from '../src/lib/chat/engine';
import {CE_WORKSPACE_ID} from '../src/lib/chat/company-email-policy';
const prompts=[
 'What is the monthly cost for one senior React developer?',
 'How much does a mid-level Node developer cost per month?',
 'We are a UK healthtech company hiring two senior React and Node developers. What is your indicative per-developer monthly price?',
 'Senior developers must cost more. Can you narrow the range to the upper band for senior engineers?',
 'What do mid-level developers cost and how many hours of UK overlap are guaranteed?',
 'What do three senior developers cost per person? I am using the popup chat; where do I provide my contact details?',
 'Sam Test / jake+test-r7@noxcapital.ae / Healthtest Ltd. What is the per-developer price for senior React engineers?',
];
async function main(){
 if(process.env.RUN_LIVE_CLARA_EVAL!=='1')throw Error('Set RUN_LIVE_CLARA_EVAL=1 to explicitly run paid live-model evals');
 for(const [index,message] of prompts.entries()){
  const result=await processChatStream({workspace_id:CE_WORKSPACE_ID,session_token:randomUUID(),message_id:randomUUID(),message,source_page:index%2?'/pricing':'/',surface:'popup'});
  const reader=result.stream.getReader();let body='';const decoder=new TextDecoder();
  while(true){const{done,value}=await reader.read();if(done)break;body+=decoder.decode(value,{stream:true})}
  const events=body.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  const reply=events.filter(e=>e.type==='token').map(e=>e.content).join('');const terminal=events.find(e=>e.type==='done');
  console.log(JSON.stringify({prompt:index+1,reply,bookingCta:Boolean(terminal?.booking_url)}));
  assert.ok(terminal,'must finish successfully');assert.ok(reply.includes('£2,980'));assert.ok(reply.includes('£5,400'));
  assert.doesNotMatch(reply,/GBP/i);assert.deepEqual([...new Set(reply.match(/£\s*[\d,]+(?:\.\d+)?/g))].sort(),['£2,980','£5,400']);
  assert.doesNotMatch(reply,/\b\d+(?:[–-]\d+)?\s*(?:hours?|am|pm)\b/i);
  assert.doesNotMatch(reply,/(?:contact\s+)?form\s+(?:just\s+)?below|button\s+(?:just\s+)?below/i);
  assert.match(reply,/indicative|benchmark/i);
  if(index===6){const booking=new URL(terminal.booking_url);assert.equal(booking.hostname,'calendly.com');assert.equal(booking.searchParams.get('name'),'Sam Test');assert.equal(booking.searchParams.get('email'),'jake+test-r7@noxcapital.ae')}
 }
 console.log('LIVE MODEL EVAL: 7/7 passed');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
