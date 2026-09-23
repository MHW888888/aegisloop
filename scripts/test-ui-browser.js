'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  let result = { resultId: 'result-browser', jobId: 'job-browser', turn: 1, ok: true, finalMessage: 'Sample inspection complete.' };
  const conversation = {
    conversationId: 'conversation-browser', codexSessionId: 'session-browser',
    workspaceDir: '/sample/workspace', conversationMode: 'chat', loopState: 'paused',
    hasPendingResult: true, pendingResultId: result.resultId, leaderLease: null,
  };
  let authenticated = true;
  let ackCount = 0;
  let dispatchCount = 0;
  let resultReadFailures = 0;
  let holdForPause = false;
  const pauses = [];
  const secondConversation = { ...conversation, conversationId: 'second-route', hasPendingResult: false, pendingResultId: null };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const files = { '/ui/': 'index.html', '/ui/app.js': 'app.js', '/ui/styles.css': 'styles.css' };
    if (files[url.pathname]) {
      const type = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': type });
      res.end(fs.readFileSync(path.join(ROOT, 'ui', files[url.pathname])));
      return;
    }
    if (url.pathname === '/health') return json(200, { ok: true });
    if (!authenticated) return json(401, { error: 'auth_required' });
    if (url.pathname === '/api/conversations') return json(200, { conversations: [conversation, secondConversation] });
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : {};
    const clientId = payload.clientId || url.searchParams.get('clientId');
    const lease = conversation.leaderLease;
    if (lease && lease.expiresAt > Date.now() && lease.clientId !== clientId) {
      return json(409, { ok: false, status: 'leader_conflict' });
    }
    conversation.leaderLease = { clientId, expiresAt: Date.now() + 15000 };
    if (url.pathname === '/api/result') {
      if (resultReadFailures > 0) { resultReadFailures--; return json(503, { error: 'temporary_unavailable' }); }
      if (holdForPause && pauses.length === 0) return json(200, { hasResult: false });
      return json(200, { hasResult: conversation.hasPendingResult, result });
    }
    if (url.pathname === '/api/result/ack') {
      assert.equal(payload.resultId, result.resultId);
      ackCount += 1;
      conversation.hasPendingResult = false;
      conversation.conversationMode = 'chat';
      return json(200, { ok: true, hasPendingResult: false, armId: 'arm-ui', turnNonce: 'next-turn' });
    }
    if (url.pathname === '/api/mode') {
      if (payload.action === 'chat') pauses.push(payload.conversationId);
      conversation.conversationMode = payload.action === 'chat' ? 'chat' : 'armed';
      return json(200, { ok: true, armId: 'arm-ui', turnNonce: 'turn-ui' });
    }
    if (url.pathname === '/api/dispatch') {
      assert.equal(payload.conversationId, conversation.conversationId);
      assert.equal(payload.armId, 'arm-ui');
      assert.equal(payload.turnNonce, 'turn-ui');
      dispatchCount += 1;
      result = { ...result, resultId: `run-result-${dispatchCount}`, jobId: `run-job-${dispatchCount}` };
      conversation.pendingResultId = result.resultId;
      conversation.hasPendingResult = true;
      conversation.conversationMode = 'running';
      return json(200, { status: 'accepted', jobId: result.jobId });
    }
    return json(404, { error: 'unexpected_fixture_request' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.AEGISLOOP_TEST_BROWSER ? { channel: process.env.AEGISLOOP_TEST_BROWSER } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    await page.goto(`${base}/ui/`);
    await page.waitForFunction(() => document.getElementById('recoverBtn').disabled === false);
    const originalId = await page.evaluate(() => clientIdFor());
    await page.evaluate(id => sessionStorage.setItem('aegisloop-ui-client-id', id), originalId);
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => window.open('/ui/', '_blank'));
    const copied = await popupPromise;
    await copied.waitForFunction(() => document.getElementById('recoverBtn').disabled === false);
    assert.equal(await copied.evaluate(() => sessionStorage.getItem('aegisloop-ui-client-id')), originalId,
      'fixture must reproduce opener sessionStorage cloning');
    assert.notEqual(await copied.evaluate(() => clientIdFor()), originalId);

    await page.getByRole('button', { name: 'Recover', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('ackRecoveredBtn').disabled === false);
    await copied.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await copied.waitForFunction(() => document.getElementById('runStatus').textContent === 'In use elsewhere');
    assert.equal(await copied.locator('#recoverBtn').isDisabled(), true);
    assert.equal(await copied.locator('#runBtn').isDisabled(), true);

    // The lease can change after the page enables ACK but before its request arrives.
    conversation.leaderLease = { clientId: 'other-controller', expiresAt: Date.now() + 15000 };
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('activityLog').textContent.includes('leader_conflict'));
    assert.equal(ackCount, 0, 'rejected ACK must not consume the result');
    assert.equal(await page.evaluate(() => state.recoveredPending.result.resultId), result.resultId);
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('ackRecoveredBtn').disabled);
    assert.equal(await page.locator('#nackRecoveredBtn').isDisabled(), true);

    authenticated = false;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('runStatus').textContent === 'Session expired');
    assert.equal(await page.locator('#ackRecoveredBtn').isDisabled(), true);
    assert.equal(await page.locator('#nackRecoveredBtn').isDisabled(), true);
    authenticated = true;
    conversation.leaderLease = null;
    await page.reload();
    await page.waitForFunction(() => document.getElementById('recoverBtn').disabled === false);
    assert.notEqual(await page.evaluate(() => clientIdFor()), originalId);
    await page.getByRole('button', { name: 'Recover', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('ackRecoveredBtn').disabled === false);
    assert.match(await page.locator('#resultOutput').textContent(), /result-browser/);
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('pendingText').textContent === 'no');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('pendingText').textContent === 'no');
    assert.equal(ackCount, 1, 'reload must not acknowledge or deliver again');
    assert.equal(dispatchCount, 0, 'recovery must never re-execute a task');

    conversation.leaderLease = null;
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('runBtn').disabled);
    await page.locator('#promptInput').fill('   ');
    assert.equal(await page.locator('#runBtn').isDisabled(), true);
    await page.locator('#promptInput').fill('Inspect the sample workspace without changing files.');
    resultReadFailures = 1;
    await page.getByRole('button', { name: 'Run once', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('runStatus').textContent === 'Waiting result');
    assert.equal(await page.locator('#conversationSelect').isDisabled(), true);
    assert.equal(await page.locator('#promptInput').isDisabled(), true);
    await page.evaluate(() => {
      const select = document.getElementById('conversationSelect');
      select.value = 'second-route';
      select.dispatchEvent(new Event('change'));
    });
    assert.equal(await page.locator('#conversationSelect').inputValue(), conversation.conversationId);
    await page.waitForFunction(() => document.getElementById('activityLog').textContent.includes('Retrying without dispatching again'));
    await page.waitForFunction(() => !state.running && document.getElementById('runStatus').textContent === 'Ready');
    assert.equal(dispatchCount, 1, 'transient result read failure must not repeat dispatch');
    assert.equal(ackCount, 2);

    await page.locator('#loopCount').fill('2');
    holdForPause = true;
    await page.getByRole('button', { name: 'Run loop', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('runStatus').textContent === 'Waiting result');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForFunction(() => !state.running);
    assert.deepEqual(pauses, [conversation.conversationId]);
    assert.equal(dispatchCount, 2, 'Pause must stop the next iteration on the active route');
    assert.match(await page.locator('#resultSubhead').textContent(), /Paused after 1\/2/);

    // Validate real responsive layout and optionally retain sanitized fixture screenshots.
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page must not overflow horizontally');
      for (const id of ['runBtn', 'runLoopBtn', 'pauseBtn']) {
        assert.equal(await page.locator(`#${id}`).evaluate(el => el.scrollWidth <= el.clientWidth), true, `${id}: text must fit`);
      }
      if (process.env.AEGISLOOP_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.AEGISLOOP_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.AEGISLOOP_SCREENSHOT_DIR, `console-${viewport.width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    console.log(`UI browser recovery checks passed (${process.env.AEGISLOOP_TEST_BROWSER || 'chromium'} ${browser.version()})`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
