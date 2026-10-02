// Real browser and app page; synthetic auth/API fixtures. Blocks all external network.
// Start an isolated Next server with NEXT_PUBLIC_SUPABASE_URL=https://build-placeholder.invalid
// and placeholder keys. Does not contact Google, Supabase, analytics, or live accounts.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tools=path.resolve(process.env.YOUTUBE_TEST_TOOL_ROOT || path.join(root,'../youtube-validation-tools'));
const { chromium }=createRequire(path.join(tools,'package.json'))('playwright-core');
const base=process.env.YOUTUBE_TEST_BASE_URL || 'http://127.0.0.1:3187';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Browser tests require a loopback-only test server');
const attempt='11111111-1111-4111-8111-111111111111';
const channelId='UC'+'a'.repeat(22);
const user={id:'22222222-2222-4222-8222-222222222222',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid'};
const exp=Math.floor(Date.now()/1000)+3600;
const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp},'fixture'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
const session={access_token:token,refresh_token:'test-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user};
const browser=await chromium.launch({channel:'chrome',headless:true});
let passed=0;
async function scenario(name, options, work) {
  const context=await browser.newContext({ viewport:options.mobile?{width:390,height:844}:{width:1100,height:850},serviceWorkers:'block' });
  const calls=[], errors=[];
  if (!options.signedOut) await context.addCookies([{name:'sb-build-placeholder-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:base,sameSite:'Lax'}]);
  await context.route('**/*', async route=>{
    const req=route.request(), url=new URL(req.url());
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if (url.origin!==base) return route.fulfill({status:200,contentType:url.pathname.includes('/auth/v1/')?'application/json':'text/plain',body:url.pathname.includes('/auth/v1/')?JSON.stringify(user):''});
    if (url.pathname.startsWith('/api/auth/youtube/')) {
      const action=url.pathname.split('/').pop(); calls.push({action,body:req.postDataJSON(),authorization:req.headers().authorization});
      if (action==='pending') {
        if (options.expired) return json({ok:false,error:'This connection attempt expired. Please connect YouTube again.'},410);
        if (options.confirmed) return json({ok:true,status:'confirmed',redirectPath:'/settings?connected=youtube'});
        return json({ok:true,status:'awaiting_confirmation',identity:{channelId,title:options.title||'Current GTA channel',customUrl:options.noHandle?null:'@MateoOnGTA',avatarUrl:null},reconnect:options.reconnect||false,returnPath:options.onboarding?'/onboarding':'/settings',expiresAt:new Date(Date.now()+900000).toISOString()});
      }
      if (action==='confirm' && options.confirmError) return json({ok:false,error:'Connection changed. Please start again.'},409);
      if (action==='confirm') return json({ok:true,accountId:'confirmed-account',redirectPath:(options.onboarding?'/onboarding':'/settings')+'?connected=youtube'});
      if (action==='cancel') return json({ok:true,redirectPath:'/settings'});
      if (action==='start') return json({ok:true,url:base+'/fixture-google'});
    }
    if (['/settings','/onboarding','/fixture-google'].includes(url.pathname)) return route.fulfill({contentType:'text/html',body:'<html><body>Test destination</body></html>'});
    return route.continue();
  });
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(`${base}/youtube/confirm?attempt=${attempt}`,{waitUntil:'domcontentloaded'});
    await work(page,calls);
    assert.deepEqual(errors,[], 'No browser runtime errors'); passed++; console.log('PASS '+name);
  } finally { await context.close(); }
}
try {
  await scenario('preview shows canonical identity without activating a connection',{},async(page,calls)=>{
    const link=page.getByRole('link',{name:'@MateoOnGTA'}); await link.waitFor();
    assert.equal(await link.getAttribute('href'),`https://www.youtube.com/channel/${channelId}`);
    assert.equal(calls.filter(c=>c.action!=='pending').length,0);
    await page.getByText('Channel details').click(); assert.equal(await page.getByText(channelId,{exact:true}).isVisible(),true);
    await fs.mkdir(path.join(tools,'screenshots'),{recursive:true}); await page.screenshot({path:path.join(tools,'screenshots/youtube-confirm-desktop.png')});
    await page.getByRole('button',{name:'Connect this channel',exact:true}).click(); await page.waitForURL('**/settings?connected=youtube');
    const confirmations=calls.filter(c=>c.action==='confirm'); assert.equal(confirmations.length,1);
    assert.deepEqual(confirmations[0].body,{attemptId:attempt}); assert.ok(confirmations[0].authorization.startsWith('Bearer '));
  });
  await scenario('cancel does not confirm or publish',{},async(page,calls)=>{
    await page.getByRole('button',{name:'Cancel',exact:true}).click(); await page.waitForURL('**/settings');
    assert.equal(calls.filter(c=>c.action==='confirm').length,0); assert.equal(calls.filter(c=>c.action==='cancel').length,1);
  });
  await scenario('choose another account cancels first and restarts Google authorization',{},async(page,calls)=>{
    await page.getByRole('button',{name:'Choose another account',exact:true}).click(); await page.waitForURL('**/fixture-google');
    assert.deepEqual(calls.filter(c=>c.action!=='pending').map(c=>c.action),['cancel','start']);
  });
  await scenario('reconnect and onboarding return paths work',{reconnect:true,onboarding:true},async(page)=>{
    await page.getByRole('button',{name:'Reconnect this channel',exact:true}).click(); await page.waitForURL('**/onboarding?connected=youtube');
  });
  await scenario('expired attempt displays recovery and cannot be confirmed',{expired:true},async(page,calls)=>{
    await page.locator('main [role=alert]').waitFor(); assert.match(await page.locator('main [role=alert]').innerText(),/expired/);
    assert.equal(await page.getByRole('button',{name:'Connect this channel',exact:true}).count(),0);
    assert.equal(calls.filter(c=>c.action==='confirm').length,0);
  });
  await scenario('signed-out creator cannot fetch or confirm an attempt',{signedOut:true},async(page,calls)=>{
    await page.locator('main [role=alert]').waitFor(); assert.match(await page.locator('main [role=alert]').innerText(),/sign in/); assert.equal(calls.length,0);
  });
  await scenario('confirmation error keeps recovery controls usable',{confirmError:true},async(page)=>{
    await page.getByRole('button',{name:'Connect this channel',exact:true}).click(); await page.locator('main [role=alert]').waitFor();
    assert.match(await page.locator('main [role=alert]').innerText(),/Connection changed/);
    assert.equal(await page.getByRole('button',{name:'Choose another account',exact:true}).isEnabled(),true);
  });
  await scenario('mobile layout handles a missing handle and untrusted channel title',{mobile:true,noHandle:true,title:'<script>window.bad=true</script> A renamed channel'},async(page)=>{
    await page.getByRole('link',{name:'View channel'}).waitFor();
    assert.equal(await page.evaluate(()=>window.bad),undefined);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:path.join(tools,'screenshots/youtube-confirm-mobile.png')});
  });
  await scenario('already-confirmed reload redirects without resubmitting',{confirmed:true},async(page,calls)=>{
    await page.waitForURL('**/settings?connected=youtube'); assert.equal(calls.filter(c=>c.action==='confirm').length,0);
  });
  console.log(`PASS ${passed} real-browser scenarios`);
} finally { await browser.close(); }

