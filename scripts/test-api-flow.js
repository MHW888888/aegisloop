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
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (['.git', 'logs', 'state.json', 'config.json'].includes(ent.name)) continue;
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: response.status, json };
}

async function waitForResult(base, token, conversationId) {
  for (let i = 0; i < 30; i++) {
    const result = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(result.status, 200);
    if (result.json.hasResult) return result.json.result;
    await wait(100);
  }
  throw new Error('timed out waiting for pending result');
}

async function main() {
  const port = await freePort();
  const token = 'api-flow-token';
  const clientId = 'client-api-flow-1';
  const otherClientId = 'client-api-flow-2';
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-api-flow-'));
  const repo = path.join(parent, 'repo');
  const workspaceDir = path.join(parent, 'workspace');
  const runtimeRoot = path.join(parent, 'runtime');
  const branch = 'V8.4b-SW';
  fs.mkdirSync(workspaceDir, { recursive: true });
  copyDir(ROOT, repo);

  const fakeCodexScript = [
    'process.stdin.setEncoding("utf8");',
    'let input = "";',
    'process.stdin.on("data", chunk => { input += chunk; });',
    'process.stdin.on("end", () => {',
    '  if (input.includes("FAIL_TASK")) {',
    '    console.error("FAKE_CODEX_FAIL");',
    '    process.exit(2);',
    '  }',
    '  console.log("FAKE_CODEX_OK");',
    '  console.log(input.includes("V8.4b-SW") ? "HAS_BRANCH" : "NO_BRANCH");',
    '});',
  ].join('');

  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({
    port,
    contractVersion: 'le-3.3',
    apiToken: token,
    corsAllowOrigin: 'https://chatgpt.com',
    armTtlMs: 600000,
    armLoopMaxDispatches: 2,
    runtimeRoot,
    briefingTemplateVersion: 'briefing-1',
    bindings: [{
      conversationId,
      codexSessionId: 'test-session',
      workspaceDir,
      fullAuto: true,
      conversationMode: 'chat',
      capsule: {
        enabled: true,
        projectId: 'MonsterLifecycle',
        activeBranch: branch,
        branchMeaning: 'api flow smoke test',
        runId: 'run-api-flow',
        mode: 'readonly',
        stageNamespaceRequired: true,
        forbiddenBranchContext: ['Ziwei V2.4F'],
      },
    }],
    codex: {
      bin: process.execPath,
      args: ['-e', fakeCodexScript],
      stdinFlag: '-',
      timeoutMs: 5000,
    },
    breaker: { maxConsecutiveFailures: 4 },
    minIntervalMs: 1,
    maxResultChars: 4000,
    feishuWebhook: '',
    autoApproveGateRules: [],
    denylist: [],
  }, null, 2), 'utf8');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });

  try {
    for (let i = 0; i < 30; i++) {
      await wait(100);
      if (stdout.includes('listening')) break;
      assert.strictEqual(child.exitCode, null, `server exited early: ${stderr}${stdout}`);
    }
    assert.ok(stdout.includes('listening'), `server did not start: ${stderr}${stdout}`);

    const base = `http://127.0.0.1:${port}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-AegisLoop-Token': token,
    };

    const health = await fetchJson(`${base}/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.json.ok, true);

    const noAuth = await fetchJson(`${base}/api/conversations`);
    assert.strictEqual(noAuth.status, 401);

    const largeBody = await fetchJson(`${base}/api/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, payload: 'x'.repeat(1024 * 1024 + 64) }),
    });
    assert.strictEqual(largeBody.status, 413);
    assert.strictEqual(largeBody.json.error, 'payload_too_large');

    const badOrigin = await fetchJson(`${base}/api/conversations`, {
      headers: {
        'X-AegisLoop-Token': token,
        Origin: 'https://example.com',
      },
    });
    assert.strictEqual(badOrigin.status, 403);
    assert.strictEqual(badOrigin.json.error, 'origin_not_allowed');

    const chatgptOrigin = await fetchJson(`${base}/api/conversations`, {
      headers: {
        'X-AegisLoop-Token': token,
        Origin: 'https://chatgpt.com',
      },
    });
    assert.strictEqual(chatgptOrigin.status, 200);

    const extensionOrigin = await fetchJson(`${base}/api/conversations`, {
      headers: {
        'X-AegisLoop-Token': token,
        Origin: 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef',
      },
    });
    assert.strictEqual(extensionOrigin.status, 200);

    const initialDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, prompt: `${branch} should not run from chat mode` }),
    });
    assert.strictEqual(initialDispatch.status, 200);
    assert.strictEqual(initialDispatch.json.status, 'blocked');
    assert.strictEqual(initialDispatch.json.rule, 'conversation_not_armed');

    const arm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(arm.status, 200);
    assert.strictEqual(arm.json.ok, true);
    assert.ok(arm.json.armNonce);

    const otherLeaderMode = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId: otherClientId, action: 'arm_once' }),
    });
    assert.strictEqual(otherLeaderMode.status, 409);
    assert.strictEqual(otherLeaderMode.json.status, 'leader_conflict');

    const promptOnlyNonce = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, prompt: `${branch} task ${arm.json.armNonce}` }),
    });
    assert.strictEqual(promptOnlyNonce.status, 200);
    assert.strictEqual(promptOnlyNonce.json.status, 'blocked');
    assert.strictEqual(promptOnlyNonce.json.rule, 'missing_or_stale_arm_nonce');

    const staleNonce = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, prompt: `${branch} task`, armNonce: 'old-nonce' }),
    });
    assert.strictEqual(staleNonce.status, 200);
    assert.strictEqual(staleNonce.json.status, 'blocked');
    assert.strictEqual(staleNonce.json.rule, 'missing_or_stale_arm_nonce');

    const ambiguous = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, prompt: 'Execute V8.4 path metric repair', armNonce: arm.json.armNonce }),
    });
    assert.strictEqual(ambiguous.status, 200);
    assert.strictEqual(ambiguous.json.status, 'blocked');
    assert.strictEqual(ambiguous.json.rule, 'ambiguous_stage_without_active_branch');

    const rearm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(rearm.status, 200);
    assert.ok(rearm.json.armNonce);

    const accepted = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId,
        clientId,
        prompt: `Execute ${branch} read-only smoke task`,
        armNonce: rearm.json.armNonce,
      }),
    });
    assert.strictEqual(accepted.status, 200);
    assert.strictEqual(accepted.json.status, 'accepted');

    const result = await waitForResult(base, token, conversationId);
    assert.strictEqual(result.ok, true);
    assert.match(result.resultId, /^res_[a-f0-9]{16}$/);
    assert.match(result.finalMessage, /FAKE_CODEX_OK/);
    assert.match(result.finalMessage, /HAS_BRANCH/);

    const stillPending = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(stillPending.status, 200);
    assert.strictEqual(stillPending.json.hasResult, true);

    const pendingArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(pendingArm.status, 200);
    const pendingDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId,
        clientId,
        prompt: `Execute ${branch} while previous result is pending`,
        armNonce: pendingArm.json.armNonce,
      }),
    });
    assert.strictEqual(pendingDispatch.status, 200);
    assert.strictEqual(pendingDispatch.json.status, 'pending_result_exists');
    assert.strictEqual(pendingDispatch.json.jobId, result.jobId);

    const ack = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: result.jobId, resultId: result.resultId }),
    });
    assert.strictEqual(ack.status, 200);
    assert.strictEqual(ack.json.ok, true);

    const ackAgain = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: result.jobId, resultId: result.resultId }),
    });
    assert.strictEqual(ackAgain.status, 200);
    assert.strictEqual(ackAgain.json.status, 'already_acked');

    const afterAck = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(afterAck.status, 200);
    assert.strictEqual(afterAck.json.hasResult, false);

    const duplicateArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(duplicateArm.status, 200);
    const duplicateDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId,
        clientId,
        prompt: `Execute ${branch} read-only smoke task`,
        armNonce: duplicateArm.json.armNonce,
      }),
    });
    assert.strictEqual(duplicateDispatch.status, 200);
    assert.strictEqual(duplicateDispatch.json.status, 'duplicate');

    const failArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(failArm.status, 200);
    const failedDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId,
        clientId,
        prompt: `Execute ${branch} FAIL_TASK`,
        armNonce: failArm.json.armNonce,
      }),
    });
    assert.strictEqual(failedDispatch.status, 200);
    assert.strictEqual(failedDispatch.json.status, 'accepted');
    const failedResult = await waitForResult(base, token, conversationId);
    assert.strictEqual(failedResult.ok, false);
    const failedAck = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: failedResult.jobId, resultId: failedResult.resultId }),
    });
    assert.strictEqual(failedAck.status, 200);
    assert.strictEqual(failedAck.json.ok, true);

    const retryArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(retryArm.status, 200);
    const retryFailedDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId,
        clientId,
        prompt: `Execute ${branch} FAIL_TASK`,
        armNonce: retryArm.json.armNonce,
      }),
    });
    assert.strictEqual(retryFailedDispatch.status, 200);
    assert.strictEqual(retryFailedDispatch.json.status, 'accepted');
    const retryFailedResult = await waitForResult(base, token, conversationId);
    assert.strictEqual(retryFailedResult.ok, false);
    const retryFailedAck = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: retryFailedResult.jobId, resultId: retryFailedResult.resultId }),
    });
    assert.strictEqual(retryFailedAck.status, 200);
    assert.strictEqual(retryFailedAck.json.ok, true);

    console.log('api flow smoke test passed');
  } finally {
    child.kill();
    await wait(100);
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
