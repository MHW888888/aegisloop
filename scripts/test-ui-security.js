'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (['.git', 'jobs', 'logs', 'state.json', 'config.json'].includes(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForBridge(base, child, output) {
  for (let index = 0; index < 40; index++) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${output()}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`server did not start: ${output()}`);
}

async function waitForPendingResult(base, headers, conversationId, clientId) {
  for (let index = 0; index < 40; index++) {
    const response = await fetch(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`, { headers });
    assert.strictEqual(response.status, 200);
    const payload = await response.json();
    if (payload.hasResult && payload.result) return payload.result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for UI pending result');
}

async function main() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-ui-security-'));
  const repo = path.join(parent, 'repo');
  const workspace = path.join(parent, 'workspace');
  const port = await freePort();
  const token = 'configured-token-must-never-appear-in-ui-responses';
  const conversationId = '33333333-3333-4333-8333-333333333333';
  fs.mkdirSync(workspace, { recursive: true });
  copyDir(ROOT, repo);

  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({
    port,
    contractVersion: 'le-3.3',
    apiToken: token,
    armLoopMaxDispatches: 2,
    runtimeRoot: path.join(parent, 'runtime'),
    bindings: [{
      conversationId,
      codexSessionId: 'session-ui-security',
      workspaceDir: workspace,
      conversationMode: 'chat',
    }],
    codex: {
      bin: process.execPath,
      args: ['-e', 'process.stdin.resume()'],
      executorAdapter: 'legacy',
      stdinFlag: '-',
      timeoutMs: 5000,
    },
    breaker: { maxConsecutiveFailures: 4 },
    denylist: [],
  }, null, 2), 'utf8');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForBridge(base, child, () => output);

    const appSource = fs.readFileSync(path.join(repo, 'ui', 'app.js'), 'utf8');
    const initSource = fs.readFileSync(path.join(repo, 'scripts', 'init-local-config.js'), 'utf8');
    const openUiSource = fs.readFileSync(path.join(repo, 'scripts', 'open-ui.js'), 'utf8');
    assert(!appSource.includes('X-AegisLoop-Token'), 'UI JavaScript must not handle the configured apiToken');
    assert.match(initSource, /chmodSync\(file, 0o600\)/, 'local config initialization must restrict token-bearing config permissions on POSIX');
    assert.match(openUiSource, /Number\.isInteger\(port\)/, 'UI launcher must validate the configured port before spawning a browser command');
    assert.match(appSource, /sandbox\.valid === false/, 'UI must surface invalid sandbox policy values instead of calling them enforced');
    for (const contractField of ['armId', 'turnNonce', 'assistantMessageSig', 'codeBlockHash']) {
      assert(appSource.includes(contractField), `UI must preserve ${contractField} dispatch checks`);
    }
    assert.match(appSource, /action: maxRuns === 1 \? 'arm_once' : 'arm_loop'/);
    assert.match(appSource, /clientId=\$\{encodeURIComponent\(clientId\)\}/);
    assert(appSource.includes('/api/result/ack'), 'UI must expose pending-result ACK recovery');
    assert(appSource.includes('/api/result/nack'), 'UI must expose pending-result NACK recovery');
    assert(appSource.includes('pendingResultId'), 'UI recovery must compare the pending resultId');
    assert(appSource.includes('No edits requested (not sandbox-enforced)'), 'UI must not claim prompt guidance is an enforced sandbox');

    const uiFiles = fs.readdirSync(path.join(repo, 'ui'), { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => `/ui/${entry.name}`);
    const routes = ['/ui', '/ui/', '/ui/index.html', '/ui/config.js', ...uiFiles];
    let sessionCookie = '';

    for (const route of [...new Set(routes)]) {
      const response = await fetch(base + route);
      const body = await response.text();
      assert(!body.includes(token), `${route} exposed the configured apiToken`);
      assert(!JSON.stringify([...response.headers]).includes(token), `${route} exposed the configured apiToken in headers`);
      assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff');
      assert.strictEqual(response.headers.get('cross-origin-resource-policy'), 'same-origin');
      if (route === '/ui/') {
        const setCookie = response.headers.get('set-cookie') || '';
        assert.match(setCookie, /aegisloop_ui_session=/);
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite=Strict/i);
        assert(!setCookie.includes(token), 'UI session cookie must not reuse the configured apiToken');
        sessionCookie = setCookie.split(';', 1)[0];
      }
      if (route === '/ui/config.js') assert.strictEqual(response.status, 404);
      if (route.endsWith('index.html') || route === '/ui' || route === '/ui/') {
        assert(!body.includes('/ui/config.js'), `${route} still loads the removed token bootstrap`);
      }
    }

    assert(sessionCookie, 'UI navigation did not issue an HttpOnly session');

    const noSession = await fetch(`${base}/api/conversations`);
    assert.strictEqual(noSession.status, 401);

    const sameOrigin = await fetch(`${base}/api/conversations`, {
      headers: {
        Cookie: sessionCookie,
        Origin: base,
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    assert.strictEqual(sameOrigin.status, 200, 'same-origin HttpOnly UI session should authorize the API');
    const sameOriginBody = await sameOrigin.json();
    assert(!JSON.stringify(sameOriginBody).includes(token), 'authorized API response exposed the configured apiToken');
    assert.strictEqual(sameOriginBody.controlPolicy.armLoopMaxDispatches, 2);
    assert.strictEqual(sameOriginBody.controlPolicy.hardArmLoopMaxDispatches, 50);
    assert.strictEqual(sameOriginBody.conversations[0].executionPolicy.noEditRequestEnforced, false);
    assert.strictEqual(sameOriginBody.conversations[0].executionPolicy.codexSandbox.enforced, false);
    assert.strictEqual(sameOriginBody.conversations[0].executionPolicy.codexSandbox.valid, true);

    const sameOriginHeaders = {
      Cookie: sessionCookie,
      Origin: base,
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json',
    };
    const armed = await fetch(`${base}/api/mode`, {
      method: 'POST',
      headers: sameOriginHeaders,
      body: JSON.stringify({
        conversationId,
        clientId: 'client-ui-security',
        action: 'arm_loop',
        maxDispatches: 2,
      }),
    });
    assert.strictEqual(armed.status, 200, 'same-origin UI session should authorize control writes');
    const armedBody = await armed.json();
    assert(armedBody.armId, 'UI control flow must preserve armId');
    assert(armedBody.turnNonce, 'UI control flow must preserve exact turnNonce');

    const oversized = await fetch(`${base}/api/mode`, {
      method: 'POST',
      headers: sameOriginHeaders,
      body: JSON.stringify({
        conversationId,
        clientId: 'client-ui-security',
        action: 'arm_loop',
        maxDispatches: 3,
      }),
    });
    assert.strictEqual(oversized.status, 400, 'UI API must reject loop counts above the configured server limit');
    assert.strictEqual((await oversized.json()).error, 'invalid_max_dispatches');

    const dispatched = await fetch(`${base}/api/dispatch`, {
      method: 'POST',
      headers: sameOriginHeaders,
      body: JSON.stringify({
        conversationId,
        clientId: 'client-ui-security',
        prompt: 'Create a recoverable pending-result test response.',
        armId: armedBody.armId,
        turnNonce: armedBody.turnNonce,
        assistantMessageSig: 'ui-security-reload-test',
        codeBlockHash: 'ui-security-reload-test-hash',
      }),
    });
    assert.strictEqual(dispatched.status, 200);
    assert.strictEqual((await dispatched.json()).status, 'accepted');

    const fetchedBeforeReload = await waitForPendingResult(
      base,
      sameOriginHeaders,
      conversationId,
      'client-ui-security',
    );
    assert.match(fetchedBeforeReload.resultId, /^res_[a-f0-9]{16}$/);

    const reopened = await fetch(`${base}/ui/`);
    const reopenedSetCookie = reopened.headers.get('set-cookie') || '';
    assert.match(reopenedSetCookie, /aegisloop_ui_session=/);
    const reopenedCookie = reopenedSetCookie.split(';', 1)[0];
    assert.notStrictEqual(reopenedCookie, sessionCookie, 'reopening must rotate the UI session');
    const reopenedHeaders = {
      Cookie: reopenedCookie,
      Origin: base,
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json',
    };

    const statusAfterReload = await fetch(`${base}/api/conversations`, { headers: reopenedHeaders });
    assert.strictEqual(statusAfterReload.status, 200);
    const statusAfterReloadBody = await statusAfterReload.json();
    const pendingAfterReload = statusAfterReloadBody.conversations[0];
    assert.strictEqual(pendingAfterReload.hasPendingResult, true);
    assert.strictEqual(pendingAfterReload.pendingResultId, fetchedBeforeReload.resultId);

    const recoveredAfterReload = await fetch(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=client-ui-security`, {
      headers: reopenedHeaders,
    });
    assert.strictEqual(recoveredAfterReload.status, 200);
    const recoveredAfterReloadBody = await recoveredAfterReload.json();
    assert.strictEqual(recoveredAfterReloadBody.result.resultId, fetchedBeforeReload.resultId);

    const recoveredAck = await fetch(`${base}/api/result/ack`, {
      method: 'POST',
      headers: reopenedHeaders,
      body: JSON.stringify({
        conversationId,
        clientId: 'client-ui-security',
        jobId: recoveredAfterReloadBody.result.jobId,
        resultId: recoveredAfterReloadBody.result.resultId,
      }),
    });
    assert.strictEqual(recoveredAck.status, 200, 'a fresh UI session must ACK the exact recovered resultId');
    assert.strictEqual((await recoveredAck.json()).hasPendingResult, false);

    const missingOrigin = await fetch(`${base}/api/mode`, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId, clientId: 'client-ui-security', action: 'chat' }),
    });
    assert.notStrictEqual(missingOrigin.status, 200, 'UI session control writes require an exact same-origin Origin header');

    const crossOrigin = await fetch(`${base}/api/conversations`, {
      headers: {
        Cookie: sessionCookie,
        Origin: 'https://example.com',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    assert.notStrictEqual(crossOrigin.status, 200, 'cross-origin requests must not reuse the UI session');

    const rawToken = await fetch(`${base}/api/conversations`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(rawToken.status, 200, 'existing extension token authorization must remain supported');

    console.log('UI same-origin authorization and token non-disclosure test passed');
  } finally {
    child.kill();
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
