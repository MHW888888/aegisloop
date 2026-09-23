'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CONVERSATION = '00000000-1111-2222-3333-444444444444';

// Run the shipped content script, not a reimplementation of its panel or selectors.
const HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;font:16px system-ui;background:#f6f7f9;color:#15171c}main{padding:24px}
form{position:fixed;bottom:16px;left:8px;right:8px;display:flex;gap:8px}
form textarea{flex:1;min-width:0;height:48px}button{font:inherit;cursor:pointer}
#page-action{position:fixed;left:16px;top:16px}article{margin-top:80px}
</style></head><body><main>
<button id="page-action">Page action</button>
<article data-message-author-role="assistant">Sample conversation for panel testing.</article>
<form><textarea id="prompt-textarea" aria-label="Message"></textarea><button data-testid="send-button" type="submit">Send</button></form>
</main><script>
window.fixture = { requests: [], rejectControl: false, leader: true, pageClicks: 0, submits: 0, acks: 0,
  mode: 'chat', loopState: 'paused', armId: null, turnNonce: null };
document.querySelector('#page-action').onclick = () => fixture.pageClicks++;
document.querySelector('form').onsubmit = event => {
  event.preventDefault();
  fixture.submits++;
  const input = document.querySelector('#prompt-textarea');
  const node = document.createElement('article');
  node.dataset.messageAuthorRole = 'user'; node.textContent = input.value;
  if (fixture.replaceBubble) document.querySelectorAll('[data-message-author-role="user"]').forEach(el => el.remove());
  if (!fixture.hideBubble) document.querySelector('main').appendChild(node);
  if (fixture.completeLoop && !input.value.includes('[aegisloop_result_id:')) {
    const reply = document.createElement('article'); reply.dataset.messageAuthorRole = 'assistant';
    const code = document.createElement('pre');
    code.textContent = JSON.stringify({ aegisloop: true, arm_id: fixture.armId, turn_nonce: fixture.turnNonce,
      prompt: 'Inspect the sample workspace. research_only=true approved_for_scoring=false' });
    reply.appendChild(code); document.querySelector('main').appendChild(reply);
  }
  input.value = fixture.afterSendDraft || '';
};
const record = () => ({ conversationId: '${CONVERSATION}', codexSessionId: 'sample-session',
  workspaceDir: '/sample', conversationMode: fixture.mode, loopState: fixture.loopState,
  armId: fixture.armId, turnNonce: fixture.turnNonce, armNonce: fixture.turnNonce,
  armExpiresAt: Date.now() + 60000, armDispatches: 0, armMaxDispatches: 1,
  hasPendingResult: !!fixture.pending, leaderLease: { clientId: fixture.leader ? fixture.clientId : 'another-tab', expiresAt: Date.now() + 15000 } });
window.chrome = { storage: { local: {
  get(keys, callback) { const values = JSON.parse(localStorage.getItem('extension-storage') || '{}');
    setTimeout(() => callback(Object.fromEntries(keys.map(key => [key, values[key]]))), 0); },
  set(patch, callback) { const values = JSON.parse(localStorage.getItem('extension-storage') || '{}');
    localStorage.setItem('extension-storage', JSON.stringify({ ...values, ...patch }));
    if (callback) setTimeout(callback, 0); }
} }, runtime: { sendMessage(message, callback) {
  fixture.requests.push(message);
  let json; let status = 200;
  if (message.path === '/api/register') {
    fixture.clientId = message.body.clientId; json = { ok: true, ...record(), leader: fixture.leader };
  } else if (message.path === '/api/conversations') {
    json = { conversations: [record()] };
  } else if (message.path === '/api/mode') {
    if (fixture.rejectControl) json = { ok: false, status: 'control_rejected', conversationMode: 'frozen' };
    else if (fixture.delayControl) json = { ok: true, conversationMode: 'frozen', loopState: 'paused' };
    else {
      fixture.mode = message.body.action.startsWith('arm_') ? 'armed' : message.body.action === 'freeze' ? 'frozen' : 'chat';
      fixture.loopState = fixture.mode === 'armed' ? 'running' : 'paused';
      fixture.armId = 'sample-arm'; fixture.turnNonce = 'sample-turn';
      json = { ok: true, ...record() };
    }
  } else if (message.path === '/api/dispatch') {
    fixture.mode = 'running'; fixture.pending = true;
    json = { ok: true, status: 'accepted', jobId: 'sample-job' };
  } else if (message.path.startsWith('/api/result?')) {
    json = { ok: true, hasResult: fixture.pending, result: { resultId: 'sample-result', jobId: 'sample-job', ok: true, finalMessage: 'Sample inspection complete.' } };
  } else if (message.path === '/api/result/ack') {
    fixture.acks++; fixture.pending = false; fixture.mode = 'chat'; fixture.loopState = 'paused';
    json = { ok: true, ...record() };
  } else { status = 404; json = { ok: false, error: 'unexpected_request' }; }
  setTimeout(() => callback({ ok: true, status, json }), message.path === '/api/mode' ? fixture.delayControl || 0 : 0);
} } };
</script><script src="/content.js"></script></body></html>`;

async function insideViewport(page) {
  const geometry = await page.locator('#le-panel').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight,
      overflow: el.scrollWidth > el.clientWidth + 1 };
  });
  assert.ok(geometry.x >= 7 && geometry.y >= 7, JSON.stringify(geometry));
  assert.ok(geometry.right <= geometry.width - 7 && geometry.bottom <= geometry.height - 7, JSON.stringify(geometry));
  assert.equal(geometry.overflow, false, 'panel must not have horizontal overflow');
}

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/content.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(fs.readFileSync(path.join(ROOT, 'chrome-extension/content.js')));
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.AEGISLOOP_TEST_BROWSER ? { channel: process.env.AEGISLOOP_TEST_BROWSER } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    const ready = () => page.waitForFunction(() => !document.querySelector('#le-send').disabled);
    await page.goto(`http://127.0.0.1:${server.address().port}/c/${CONVERSATION}`);
    await ready();
    await insideViewport(page);
    assert.equal(await page.locator('#le-connection').getAttribute('open'), null);
    assert.equal(await page.locator('#le-panel').count(), 1);

    // Native page controls remain clickable; panel selectors must not select their own UI.
    await page.locator('#page-action').click();
    assert.equal(await page.evaluate(() => fixture.pageClicks), 1);
    await page.locator('form textarea').fill('A manual message');
    await page.locator('form button').click();
    assert.equal(await page.locator('[data-message-author-role="user"]').textContent(), 'A manual message');
    await page.evaluate(() => { fixture.afterSendDraft = 'My next manual draft'; fixture.replaceBubble = true; });
    await page.locator('#le-seed').fill('Inspect the sample project.');
    const armsBefore = await page.evaluate(() => fixture.requests.filter(r => r.path === '/api/mode').length);
    await page.locator('#le-send').evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => !document.querySelector('#le-send').disabled && !document.querySelector('#le-seed').value);
    assert.equal(await page.locator('#prompt-textarea').inputValue(), 'My next manual draft');
    assert.equal(await page.evaluate(() => fixture.submits), 2, 'one manual and one seed send, no duplicate');
    assert.equal(await page.evaluate(() => fixture.requests.filter(r => r.path === '/api/mode').length), armsBefore + 1);
    await page.locator('#le-chat').click();
    await page.waitForFunction(() => document.querySelector('#le-state').textContent === 'chat');
    await page.locator('#le-seed').fill('Must not overwrite the existing draft.');
    await page.locator('#le-send').click();
    await page.waitForFunction(() => document.querySelector('#le-reason').textContent.includes('composer_has_draft'));
    assert.equal(await page.locator('#prompt-textarea').inputValue(), 'My next manual draft');
    assert.equal(await page.evaluate(() => fixture.submits), 2);
    await page.locator('#le-chat').click();
    await ready();
    await page.locator('#prompt-textarea').fill('');
    await page.evaluate(() => { document.querySelector('form button').disabled = true; });
    await page.locator('#le-send').click();
    await page.waitForFunction(() => document.querySelector('#le-reason').textContent.includes('send_not_ready'));
    assert.equal(await page.evaluate(() => fixture.submits), 2, 'disabled send must not fall through to synthetic Enter');
    await page.locator('#le-chat').click();
    await ready();
    await page.locator('#le-seed').fill('');
    await page.evaluate(() => document.querySelector('form').remove());
    await page.waitForFunction(() => document.querySelector('#le-sel-controls').textContent === 'C:n S:n Stop:n');

    // Collapse/expand is a view operation, never a bridge control operation.
    await page.locator('#le-send').click();
    await page.waitForFunction(() => document.querySelector('#le-state').textContent === 'armed');
    const writesBefore = await page.evaluate(() => fixture.requests.filter(r => r.path === '/api/mode').length);
    await page.locator('#le-collapse').click();
    assert.equal(await page.locator('#le-panel-body').isVisible(), false);
    assert.equal(await page.locator('#le-compact-state').textContent(), 'armed');
    assert.ok((await page.locator('#le-panel').boundingBox()).height < 100);
    assert.equal(await page.evaluate(() => fixture.requests.filter(r => r.path === '/api/mode').length), writesBefore);
    await page.reload();
    await ready();
    assert.equal(await page.locator('#le-collapse').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#le-panel-body').isVisible(), false);
    // Fixture reload starts in Chat mode; re-arm then pause from the compact view.
    await page.locator('#le-collapse').click();
    await page.locator('#le-send').click();
    await page.waitForFunction(() => document.querySelector('#le-state').textContent === 'armed');
    await page.locator('#le-collapse').click();
    await page.locator('#le-compact-pause').click();
    await page.waitForFunction(() => document.querySelector('#le-compact-state').textContent === 'chat');
    assert.equal(await page.evaluate(() => fixture.requests.filter(r => r.path === '/api/mode' && r.body.action === 'chat').length), 1);
    await page.locator('#le-collapse').click();

    // An HTTP 200 with ok:false is still a failure: no fictitious frozen state.
    await page.evaluate(() => { fixture.rejectControl = true; });
    await page.locator('#le-freeze').click();
    await page.waitForFunction(() => document.querySelector('#le-reason').textContent.includes('control_rejected'));
    assert.equal(await page.locator('#le-state').textContent(), 'chat');
    await page.locator('#le-collapse').click();
    assert.equal(await page.locator('#le-compact-state').textContent(), 'Needs attention');
    await page.locator('#le-collapse').click();
    await page.evaluate(() => { fixture.rejectControl = false; });
    await page.locator('#le-chat').click();

    // Pointer capture and viewport clamping must keep the restore button reachable.
    let handle = await page.locator('#le-move').boundingBox();
    await page.mouse.move(handle.x + 25, handle.y + 15);
    await page.mouse.down();
    await page.mouse.move(-100, -100, { steps: 5 });
    await page.mouse.up();
    await insideViewport(page);
    let position = await page.locator('#le-panel').boundingBox();
    assert.equal(Math.round(position.x), 8);
    assert.equal(Math.round(position.y), 8);
    await page.locator('#le-move').focus();
    await page.keyboard.press('Shift+ArrowRight');
    position = await page.locator('#le-panel').boundingBox();
    assert.equal(Math.round(position.x), 48);
    await page.reload();
    await ready();
    assert.equal(Math.round((await page.locator('#le-panel').boundingBox()).x), 48);
    await page.locator('#le-position-reset').click();
    assert.ok((await page.locator('#le-panel').boundingBox()).x > 900);

    const screenshotDir = process.env.AEGISLOOP_SCREENSHOT_DIR;
    if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 600 }, { width: 320, height: 480 }, { width: 600, height: 260 }]) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const r = document.querySelector('#le-panel').getBoundingClientRect();
        return r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7;
      });
      await insideViewport(page);
      await page.locator('#le-stop').click();
      assert.equal(await page.locator('#le-confirm').isVisible(), true);
      await page.locator('#le-stop-no').click();
      await page.locator('summary').filter({ hasText: 'Diagnostics' }).click();
      await page.locator('#le-debug-snapshot').click();
      await insideViewport(page);
      await page.locator('summary').filter({ hasText: 'Diagnostics' }).click();
      const overflow = await page.locator('#le-panel button:visible').evaluateAll(buttons =>
        buttons.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.id));
      assert.deepEqual(overflow, [], 'button labels must fit');
      if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `extension-${viewport.width}x${viewport.height}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#le-collapse').click();
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, 'extension-collapsed.png') });
    await page.evaluate(() => { fixture.leader = false; });
    await page.waitForFunction(() => document.querySelector('#le-compact-pause').disabled && document.querySelector('#le-compact-state').textContent === 'Not leader');
    await page.locator('#le-collapse').click();
    assert.equal(await page.locator('#le-send').isDisabled(), true);
    assert.equal(await page.locator('#le-stop').isDisabled(), true);
    // Lost DOM confirmation must not replay a send. Virtual time avoids a 12-second test sleep.
    await page.reload();
    await ready();
    await page.clock.install();
    await page.evaluate(() => { fixture.hideBubble = true; });
    await page.locator('#le-seed').fill('A single unconfirmed seed.');
    await page.locator('#le-send').click();
    await page.waitForFunction(() => fixture.submits === 1);
    await page.clock.runFor(14000);
    assert.equal(await page.evaluate(() => fixture.submits), 1);
    await page.locator('#le-chat').click();
    await page.clock.runFor(1000);
    assert.equal(await page.locator('#le-state').textContent(), 'chat');
    assert.equal(await page.locator('#le-send').isDisabled(), false);
    await page.evaluate(() => { fixture.delayControl = 1500; });
    await page.locator('#le-freeze').click();
    await page.evaluate(() => history.pushState({}, '', '/'));
    await page.clock.runFor(2500);
    assert.equal(await page.locator('#le-state').textContent(), 'chat', 'old control reply must not set the new route frozen');
    assert.equal(await page.locator('#le-send').isDisabled(), true);
    await page.goto(`http://127.0.0.1:${server.address().port}/c/${CONVERSATION}`);
    await ready();
    await page.evaluate(() => { fixture.completeLoop = true; });
    await page.locator('#le-seed').fill('Inspect the sample workspace.');
    await page.locator('#le-send').click();
    await page.waitForFunction(() => fixture.acks === 1);
    assert.equal(await page.evaluate(() => fixture.requests.filter(r => r.path === '/api/dispatch').length), 1);
    assert.equal(await page.evaluate(() => fixture.submits), 2, 'one seed and one result insert');
    assert.equal(await page.locator('[data-message-author-role="user"]').filter({ hasText: '[aegisloop_result_id:sample-result]' }).count(), 1);
    assert.deepEqual(errors, []);
    console.log('[ok] real extension panel: selectors, minimize, drag, keyboard, persistence, viewport, strict controls, leader gates, draft protection, no resend, seed-to-ACK loop');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
