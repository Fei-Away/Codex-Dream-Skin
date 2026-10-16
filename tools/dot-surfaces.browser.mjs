import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cssPredicateManifest } from './css-predicate-cache.mjs';
// Optional browser regression: PLAYWRIGHT_MODULE points to an existing Playwright
// installation; this does not install dependencies or connect to the live app.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
const page=await browser.newPage();
const native=`:root {--ds-panel-rgb:32 32 32;--ds-upload-panel-alpha:.7;--ds-task-immersive-edge:#2228;--ds-task-immersive-mid:#2224;--ds-task-immersive-far:#2221} main[data-app-shell-main-surface],.messaging-root,.thread-pane {background:rgb(24,24,24)} article {background:#222b;border:1px solid #444;box-shadow:0 0 3px black;backdrop-filter:blur(3px)} .message-bubble {background:rgba(32,32,32,.7)} pre {background:rgb(10,10,10)} .composer-wrap {border-bottom:16px solid rgb(24,24,24)} ._floatingHeader_test,.bg-gradient-to-t {background-image:linear-gradient(black,transparent);height:54px} .composer-wrap {height:60px} body {margin:0;color:white;background:linear-gradient(120deg,#377b94,#775c99)}`;
const conversation=`<div class="messaging-root messaging-embedded"><div class="workspace"><main class="thread-pane"><div class="messaging-root messaging-embedded"><div class="thread-pane" id="pane"><div class="message-list"><article class="message-row" id="row"><div class="message-bubble-wrap"><div class="message-surface"><div class="message-bubble" id="outer"><div><div class="message-bubble" id="leaf">Synthetic text</div><pre id="code">const example = true;</pre><div class="message-bubble">Another text part</div></div></div></div></div></article></div></div></div></main></div></div><div class="_floatingHeader_test" id="fade"></div><div class="composer-wrap" id="composer"><div class="_composer_test"><div class="pointer-events-none"><div class="bg-gradient-to-t from-surface" id="bottomfade"></div></div></div></div>`;
let checks=0;
try {
for(const platform of ['windows','macos']) {
 let css=await fs.readFile(new URL('../'+platform+'/assets/dream-skin.css',import.meta.url),'utf8');
 // Exercise the exact runtime substitution without assigning any async markers.
 const manifest=cssPredicateManifest(css);
 for(const p of manifest) css=css.replaceAll(p.selector,p.replacement);
 for(const width of [1108,760]) for(const mode of ['ambient','full']) for(const marked of [false,true]) for(const scope of ['active','inactive','dialog','ordinary','disabled']) {
 await page.setViewportSize({width,height:800});
 const attrs=scope==='inactive'?'data-app-shell-active-page="false"':scope==='dialog'?'role="dialog"':'';
 await page.setContent(`<html data-dream-skin="${scope==='disabled'?'inactive':'active'}" data-dream-art-wide="true" data-dream-task-mode="${mode}"><head><style>${native}</style></head><body><main data-app-shell-main-surface ${marked?'data-ds-part="main"':''} ${attrs}>${scope==='ordinary'?conversation.replaceAll('messaging-root','other-root'):conversation}</main></body></html>`);
 const snapshot=()=>page.evaluate(()=>Object.fromEntries(['pane','row','outer','leaf','code','composer','fade','bottomfade'].map(id=>{const s=getComputedStyle(document.getElementById(id));return [id,{bg:s.backgroundColor,image:s.backgroundImage,border:s.borderBottomColor,width:s.borderBottomWidth,height:s.height,display:s.display}]})));
 await page.addStyleTag({content:css.slice(0,css.indexOf('/* Dot embedded conversations'))});
 const before=await snapshot();
 await page.addStyleTag({content:css.slice(css.indexOf('/* Dot embedded conversations'))});
 const after=await snapshot();
 const label=`${platform}/${width}/${mode}/${marked}/${scope}`;
 if(scope==='active') {
  for(const id of ['pane','row','outer']) assert.equal(after[id].bg,'rgba(0, 0, 0, 0)',label+'/'+id);
  assert.equal(after.composer.border,'rgba(0, 0, 0, 0)',label);
  assert.equal(after.composer.width,before.composer.width,label);
  assert.equal(after.composer.height,before.composer.height,label);
  for(const id of ['leaf','code']) assert.equal(after[id].bg,before[id].bg,label+'/'+id);
  for(const id of ['fade','bottomfade']) {
   assert.equal(after[id].image,mode==='full'?'none':before[id].image,label+'/'+id);
   assert.equal(after[id].height,before[id].height,label);
   assert.equal(after[id].display,before[id].display,label);
  }
  const main=page.locator('main[data-app-shell-main-surface]');
  const mounting=await main.evaluate(e=>getComputedStyle(e).backgroundImage);
  assert.notEqual(mounting,'none',label);
  await page.evaluate(manifest=>{
   for(const predicate of manifest) for(const element of document.querySelectorAll('*')) {
    if(element.matches(predicate.selector)) element.setAttribute(predicate.attribute,'');
   }
  },manifest);
  assert.equal(await main.evaluate(e=>getComputedStyle(e).backgroundImage),mounting,label+' stable scrim');
 } else assert.deepEqual(after,before,label+' must be unchanged');
 checks++;
 }
}
console.log(JSON.stringify({pass:true,scenarios:checks,platforms:['windows','macos'],liveApplicationTouched:false}));
} finally {await browser.close();}
