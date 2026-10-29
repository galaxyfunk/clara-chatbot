import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {contactDetails,shouldShowBooking} from '../src/lib/chat/contact-details';
test('real popup widget renders name/email-prefilled CTA after capture with no booking words in reply',async()=>{
 const browser=await chromium.launch();
 try{for(const path of ['/','/pricing','/book-a-call-thank-you']){
  const page=await browser.newPage();
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/widget.js')return route.fulfill({contentType:'application/javascript',body:readFileSync('public/widget.js','utf8')});
   if(url.pathname==='/api/workspace/public')return route.fulfill({json:{success:true,settings:{widget_layout:'command_bar',display_name:'Clara',suggested_questions:[]}}});
   if(url.pathname==='/api/chat'){
    const req=route.request().postDataJSON();assert.equal(req.surface,'popup');assert.equal(req.source_page,path);
    const contact=contactDetails([{role:'user',content:req.message}]);assert.equal(shouldShowBooking('popup',contact.email,false),true);
    const booking=new URL('https://calendly.com/d/cyhw-bqg-t9h/discovery-call-cloud-employee');booking.searchParams.set('name',contact.name!);booking.searchParams.set('email',contact.email!);
    return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'token',content:'Thanks, Sam. We can help your team.'})+'\n\ndata: '+JSON.stringify({type:'done',email_captured:true,booking_url:booking.toString()})+'\n\n'});
   }
   if(url.hostname!=='localhost')return route.abort();
   return route.fulfill({contentType:'text/html',body:'<script src="/widget.js" data-workspace-id="fixture"></script>'});
  });
  await page.goto('http://localhost:4180'+path);await page.locator('.cb-pill').click();await page.locator('.cb-input').fill('Sam Test / jake+test-r7@noxcapital.ae / Healthtest Ltd');await page.locator('.cb-input').press('Enter');
  const link=page.getByRole('link',{name:'Book a Call',exact:true});await link.waitFor();const href=new URL((await link.getAttribute('href'))!);
  assert.equal(href.searchParams.get('name'),'Sam Test');assert.equal(href.searchParams.get('email'),'jake+test-r7@noxcapital.ae');assert.equal(href.hostname,'calendly.com');
  await page.close();
 }}finally{await browser.close()}
});
