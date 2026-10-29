import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {summaryEnabled,summarizeConversation} from '../src/lib/chat/summarize';

for (const streaming of [true, false]) test(`uncertain mailbox is retained after natural chat; identity, booking and acknowledgement survive follow-ups (stream=${streaming})`,async()=>{
 const fixture={row:null as null|Record<string,unknown>,after:[] as Array<()=>Promise<void>>,prompts:[] as Array<Array<{role:string;content:string}>>,leadCalls:[] as Record<string,unknown>[]};
 const g=globalThis as typeof globalThis & {__r8?:typeof fixture};g.__r8=fixture;
 const mocks:Record<string,string>={
  'next/server':`export const NextResponse={json:(body,init)=>Response.json(body,init)};export const after=fn=>globalThis.__r8.after.push(fn);`,
  '@/lib/supabase/server':`export function createServerClient(){return {rpc:async()=>({data:[],error:null}),from(table){let patch=null,upsert=false;const f=globalThis.__r8;const value=()=>{if(table==='workspaces')return {data:{settings:{display_name:'Clara',personality_prompt:'Be helpful',confidence_threshold:.7,hubspot_enabled:true,escalation_enabled:true,booking_url:'https://calendly.com/d/cyhw-bqg-t9h/discovery-call-cloud-employee'}},error:null};if(table==='qa_pairs')return {count:1};if(table==='api_keys')return {data:{provider:'anthropic',model:'fixture',encrypted_key:'test'},error:null};if(table==='chat_sessions'){if(patch)f.row={id:'a229fd51-743a-468c-97b6-ea4764b30b01',metadata:{},...(f.row||{}),...patch};return {data:f.row,error:null}}return {data:[],error:null}};const q={select(){return q},eq(){return q},single:async()=>value(),maybeSingle:async()=>value(),upsert(p){patch=p;upsert=true;return q},update(p){patch=p;return q},insert(){return q},then(a,b){return Promise.resolve(value()).then(a,b)}};return q}}}`,
  '@/lib/encryption':`export const decrypt=()=> 'fixture-key';`,
  '@/lib/embed':`export const generateEmbedding=async()=>[0];`,
  '@/lib/chat/extract-brief':`export const isBriefExtractionEnabled=()=>false;export const shouldExtractBrief=()=>false;export const readBriefFromMetadata=()=>null;export const extractBrief=async()=>({changed:false});export const persistBrief=async()=>{};export const persistIntakeSnapshot=async()=>{};`,
  '@/lib/llm/provider':`export async function chatCompletionStream(provider,model,key,messages){globalThis.__r8.prompts.push(messages);const text='Thanks, Riley. I have your details for Proptest Ltd. You can book a call when convenient.';return {stream:new ReadableStream({start(c){c.enqueue(text);c.close()}}),getFullResponse:async()=>text}};export const chatCompletion=async(provider,model,key,messages)=>{globalThis.__r8.prompts.push(messages);return {content:JSON.stringify({answer:'Thanks, Riley. I have your details for Proptest Ltd.',escalation_offered:false})}};`,
 };
 const result=await build({entryPoints:['src/app/api/chat/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',tsconfig:'tsconfig.json',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]});
 const bundled={exports:{} as {POST:(request:Request)=>Promise<Response>}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),bundled,bundled.exports);
 const oldFetch=globalThis.fetch,oldUrl=process.env.CE_LEAD_URL,oldSummary=process.env.CLARA_SUMMARY_ENABLED;process.env.CE_LEAD_URL='https://fixture.example/api/lead';delete process.env.CLARA_SUMMARY_ENABLED;
 try{
  globalThis.fetch=async(url,init)=>{assert.equal(url,'https://fixture.example/api/lead','no blocking validation preflight');fixture.leadCalls.push(JSON.parse(String(init?.body)));return Response.json({ok:true,pendingReview:true,qualified:false,continueJourney:true,message:'Thank you. We have saved your submission for review.'},{status:202})};
  for(const [index,message] of ['Riley Agent, jake+agent@noxcapital.ae, Proptest Ltd','Please continue','I already gave my email, jake+agent@noxcapital.ae','What happens next?'].entries()){
   const response=await bundled.exports.POST(new Request('https://fixture.example/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace_id:'09aa62df-5af6-4cec-b565-c335e907327d',session_token:'7f554542-58de-4f57-8c40-e4150751347c',message_id:`message-${index}`,message,stream:streaming,surface:'popup',source_page:'/pricing'})}));
   assert.equal(response.status,200);const body=await response.text();assert.doesNotMatch(body,/saved your submission for review|check your email address/);
   const events=body.split('\n').filter(s=>s.startsWith('data:')).map(s=>JSON.parse(s.slice(5)));const done=streaming?events.find(e=>e.type==='done'):JSON.parse(body);const booking=new URL(done.booking_url);
   assert.equal(booking.searchParams.get('name'),'Riley Agent');assert.equal(booking.searchParams.get('email'),'jake+agent@noxcapital.ae');
   for(const after of fixture.after.splice(0))await after();
  }
  assert.equal(fixture.leadCalls.length,1);assert.equal(fixture.leadCalls[0].company,'Proptest Ltd');assert.equal(fixture.leadCalls[0].claraConversationId,'a229fd51-743a-468c-97b6-ea4764b30b01');
  assert.equal(fixture.row?.visitor_email,'jake+agent@noxcapital.ae');assert.equal((fixture.row?.messages as unknown[]).length,8);
  for(const fact of ['Riley Agent','jake+agent@noxcapital.ae','Proptest Ltd'])assert.ok(JSON.stringify(fixture.prompts[3]).includes(fact));
 }finally{globalThis.fetch=oldFetch;delete g.__r8;if(oldUrl===undefined)delete process.env.CE_LEAD_URL;else process.env.CE_LEAD_URL=oldUrl;if(oldSummary===undefined)delete process.env.CLARA_SUMMARY_ENABLED;else process.env.CLARA_SUMMARY_ENABLED=oldSummary}
});
test('optional summary is disabled without explicit enablement and never calls the obsolete model',async()=>{
 const prior=process.env.CLARA_SUMMARY_ENABLED;delete process.env.CLARA_SUMMARY_ENABLED;
 try{assert.equal(summaryEnabled(),false);assert.deepEqual(await summarizeConversation([]),{success:false,error:'Optional summary disabled'})}finally{if(prior!==undefined)process.env.CLARA_SUMMARY_ENABLED=prior}
});
