import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

test('live widget persists conversation and session across reload/pages, restores booking and resets safely',async()=>{
  const widget=readFileSync('public/widget.js','utf8')
  const browser=await chromium.launch({headless:true})
  const page=await browser.newPage()
  const tokens:string[]=[]
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/widget.js')return route.fulfill({contentType:'application/javascript',body:widget})
    if(path==='/api/workspace/public')return route.fulfill({json:{success:true,settings:{widget_layout:'command_bar',display_name:'Clara',suggested_questions:[]}}})
    if(path==='/api/chat'){
      tokens.push(route.request().postDataJSON().session_token)
      return route.fulfill({contentType:'text/event-stream',body:'data: {"type":"token","content":"Please book a time using the button below."}\n\ndata: {"type":"done"}\n\n'})
    }
    if(new URL(route.request().url()).hostname!=='localhost')return route.abort()
    return route.fulfill({contentType:'text/html',body:'<script src="/widget.js" data-workspace-id="fixture"></script>'})
  })
  try{
    await page.goto('http://localhost:4180/')
    await page.locator('.cb-pill').click()
    await page.locator('.cb-input').fill('Tom Test jake+test-r6@noxcapital.ae')
    await page.locator('.cb-input').press('Enter')
    await page.getByRole('link',{name:/Book/i}).waitFor()
    assert.match(await page.getByRole('link',{name:/Book/i}).getAttribute('href')||'',/\/book-a-call\?email=jake%2Btest-r6/)
    await page.reload()
    await page.locator('.cb-pill').click()
    assert.equal(await page.locator('.cb-msg-text.user').textContent(),'Tom Test jake+test-r6@noxcapital.ae')
    await page.getByRole('link',{name:/Book/i}).waitFor()
    await page.goto('http://localhost:4180/pricing')
    await page.locator('.cb-pill').click()
    await page.locator('.cb-input').fill('Thanks')
    await page.locator('.cb-input').press('Enter')
    await page.waitForFunction(()=>document.querySelector('#clara-shadow-host')?.shadowRoot?.querySelectorAll('.cb-msg-text.assistant').length===2)
    assert.equal(tokens.length,2);assert.equal(tokens[0],tokens[1]);assert.deepEqual(errors,[])
    await page.getByRole('button',{name:'New chat',exact:true}).click()
    assert.equal(await page.locator('.cb-msg-text.user').count(),0)
    await page.reload();await page.locator('.cb-pill').click()
    assert.equal(await page.locator('.cb-msg-text.user').count(),0)
    await page.evaluate(()=>localStorage.setItem('clara:conversation:v1:fixture','broken'))
    await page.reload();await page.locator('.cb-pill').click()
    assert.equal(await page.locator('.cb-msg-text.user').count(),0)
  } finally{await browser.close()}
})
