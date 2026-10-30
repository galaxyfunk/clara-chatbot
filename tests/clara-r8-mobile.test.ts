import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

test('390x844 popup: visible thinking before tokens, accessible New chat cancels old replies, prefilled booking fits',async()=>{
 let release:(()=>void)|undefined;let started:(()=>void)|undefined;let count=0;
 const server=createServer((req,res)=>{
  if(req.url==='/widget.js'){res.setHeader('Content-Type','application/javascript');res.end(readFileSync('public/widget.js'));return}
  if(req.url?.startsWith('/api/workspace/public')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,settings:{widget_layout:'command_bar',display_name:'Clara',suggested_questions:[]}}));return}
  if(req.url==='/api/chat'){
   let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    const input=JSON.parse(body);assert.equal(input.surface,'popup');count++;
    res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': stream-start\n\n');
    const finish=()=>res.end('data: '+JSON.stringify({type:'token',content:'Thanks, Riley. I have your details for Proptest Ltd.'})+'\n\ndata: '+JSON.stringify({type:'done',email_captured:true,booking_url:'https://calendly.com/d/cyhw-bqg-t9h/discovery-call-cloud-employee?name=Riley%20Agent&email=jake%2Bagent%40noxcapital.ae'})+'\n\n');
    if(count%2===1){release=finish;started?.()}else finish();
   });return;
  }
  res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><script src="/widget.js" data-workspace-id="fixture"></script>');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const browser=await chromium.launch();
 try{for(const path of ['/','/book-a-call-thank-you']){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(`http://127.0.0.1:${address.port}${path}`);await page.locator('.cb-pill').click();
  const newChat=page.getByRole('button',{name:'New chat',exact:true});await newChat.waitFor();
  const startedPromise=new Promise<void>(resolve=>started=resolve);
  await page.locator('.cb-input').fill('Riley Agent, jake+agent@noxcapital.ae, Proptest Ltd');await page.locator('.cb-input').press('Enter');await startedPromise;
  await page.getByRole('status',{name:'Clara is thinking'}).waitFor();assert.equal(await page.locator('.cb-msg-text.assistant').count(),0,'no empty assistant bubble while awaiting tokens');
  const oldToken=await page.evaluate(()=>JSON.parse(localStorage.getItem('clara:conversation:v1:fixture')!).sessionToken);
  assert.equal(await newChat.evaluate(el=>{const r=el.getBoundingClientRect();return (el.getRootNode() as ShadowRoot).elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el}),true,'not overlapped by header or backdrop');
  // Wait for the opening transform to finish before measuring the tap target.
  await newChat.click({trial:true});
  const rect=await newChat.boundingBox();assert.ok(rect&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=390);
  await newChat.click();release?.();await page.waitForTimeout(100);assert.equal(await page.locator('.cb-msg-text').count(),0);
  assert.notEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('clara:conversation:v1:fixture')!).sessionToken),oldToken);
  await page.locator('.cb-input').fill('Riley Agent, jake+agent@noxcapital.ae, Proptest Ltd');await page.locator('.cb-input').press('Enter');await page.getByRole('link',{name:'Book a Call',exact:true}).waitFor();
  assert.equal(await page.getByRole('status',{name:'Clara is thinking'}).isVisible(),false);
  const modal=await page.locator('.cb-modal').boundingBox();assert.ok(modal&&modal.x>=0&&modal.y>=0&&modal.x+modal.width<=390&&modal.y+modal.height<=844);
  const booking=new URL((await page.getByRole('link',{name:'Book a Call',exact:true}).getAttribute('href'))!);assert.equal(booking.searchParams.get('name'),'Riley Agent');assert.equal(booking.searchParams.get('email'),'jake+agent@noxcapital.ae');
  await page.close();
 }}finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
