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

async function waitForResult(base, token, conversationId, clientId) {
  for (let i = 0; i < 30; i++) {
    const result = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(result.status, 200);
    if (result.json.hasResult) return result.json.result;
    await wait(100);
  }
  throw new Error('timed out waiting for pending result');
}

function dispatchBody(conversationId, clientId, arm, prompt, overrides = {}) {
  return JSON.stringify({
    conversationId,
    clientId,
    prompt,
    armId: arm && arm.armId,
    turnNonce: arm && arm.turnNonce,
    assistantMessageSig: 'assistant-sig-test',
    codeBlockHash: 'code-block-hash-test',
    ...overrides,
  });
}

async function main() {
  const port = await freePort();
  const token = 'api-flow-token';
  const clientId = 'client-api-flow-1';
  const otherClientId = 'client-api-flow-2';
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const unsafeConversationId = '22222222-2222-4222-8222-222222222222';
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-api-flow-'));
  const repo = path.join(parent, 'repo');
  const workspaceDir = path.join(parent, 'workspace');
  const runtimeRoot = path.join(parent, 'runtime');
  const invocationLog = path.join(parent, 'fake-codex-invocations.log');
  const branch = 'V8.4b-SW';
  fs.mkdirSync(workspaceDir, { recursive: true });
  copyDir(ROOT, repo);

  const fakeCodexScript = [
    'process.stdin.setEncoding("utf8");',
    'let input = "";',
    'process.stdin.on("data", chunk => { input += chunk; });',
    'process.stdin.on("end", () => {',
    '  require("fs").appendFileSync(' + JSON.stringify(invocationLog) + ', (input.includes("INFRA_FAIL") ? "INFRA_FAIL" : "OTHER") + "\\n");',
    '  if (input.includes("INFRA_FAIL")) {',
    '    console.error("ECONNRESET simulated after possible side effect");',
    '    process.exit(2);',
    '  }',
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
    }, {
      conversationId: unsafeConversationId,
      codexSessionId: 'unsafe-test-session',
      workspaceDir,
      fullAuto: true,
      conversationMode: 'chat',
      capsule: {
        enabled: true,
        projectId: 'UnsafeRootTest',
        activeBranch: 'UNSAFE-ROOT',
        branchMeaning: 'write-root boundary regression',
        runId: 'run-unsafe-root',
        mode: 'readonly',
        runtimeRoot,
        allowedWriteRoot: path.join(parent, 'outside-runtime'),
        stageNamespaceRequired: true,
        forbiddenBranchContext: [],
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

    const unsafeArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId: unsafeConversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(unsafeArm.status, 200);
    const unsafeDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(unsafeConversationId, clientId, unsafeArm.json, 'Execute UNSAFE-ROOT boundary test'),
    });
    assert.strictEqual(unsafeDispatch.status, 200);
    assert.strictEqual(unsafeDispatch.json.status, 'blocked');
    assert.strictEqual(unsafeDispatch.json.rule, 'capsule_write_root_outside_runtime');

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
    assert.ok(arm.json.armId);
    assert.ok(arm.json.turnNonce);
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
      body: JSON.stringify({ conversationId, clientId, prompt: `${branch} task ${arm.json.turnNonce}` }),
    });
    assert.strictEqual(promptOnlyNonce.status, 200);
    assert.strictEqual(promptOnlyNonce.json.status, 'blocked');
    assert.strictEqual(promptOnlyNonce.json.rule, 'arm_id_mismatch');

    const missingTurnNonce = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, arm.json, `${branch} task`, { turnNonce: undefined }),
    });
    assert.strictEqual(missingTurnNonce.status, 200);
    assert.strictEqual(missingTurnNonce.json.status, 'blocked');
    assert.strictEqual(missingTurnNonce.json.rule, 'missing_turn_nonce');

    const wrongArmId = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, arm.json, `${branch} task`, { armId: 'arm_wrong' }),
    });
    assert.strictEqual(wrongArmId.status, 200);
    assert.strictEqual(wrongArmId.json.status, 'blocked');
    assert.strictEqual(wrongArmId.json.rule, 'arm_id_mismatch');

    const staleNonce = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, arm.json, `${branch} task`, { turnNonce: 'old-nonce' }),
    });
    assert.strictEqual(staleNonce.status, 200);
    assert.strictEqual(staleNonce.json.status, 'blocked');
    assert.strictEqual(staleNonce.json.rule, 'turn_nonce_mismatch');

    const ambiguous = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, arm.json, 'Execute V8.4 path metric repair'),
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
    assert.ok(rearm.json.armId);
    assert.ok(rearm.json.turnNonce);
    assert.ok(rearm.json.armNonce);

    const accepted = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, rearm.json, `Execute ${branch} read-only smoke task`),
    });
    assert.strictEqual(accepted.status, 200);
    assert.strictEqual(accepted.json.status, 'accepted');

    const result = await waitForResult(base, token, conversationId, clientId);
    assert.strictEqual(result.ok, true);
    assert.match(result.resultId, /^res_[a-f0-9]{16}$/);
    assert.match(result.finalMessage, /FAKE_CODEX_OK/);
    assert.match(result.finalMessage, /HAS_BRANCH/);

    const nonLeaderResult = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(otherClientId)}`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(nonLeaderResult.status, 409);
    assert.strictEqual(nonLeaderResult.json.status, 'leader_conflict');

    const stillPending = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`, {
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
      body: dispatchBody(conversationId, clientId, pendingArm.json, `Execute ${branch} while previous result is pending`),
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

    const afterAck = await fetchJson(`${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(afterAck.status, 200);
    assert.strictEqual(afterAck.json.hasResult, false);

    const loopArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_loop', maxDispatches: 2 }),
    });
    assert.strictEqual(loopArm.status, 200);
    assert.ok(loopArm.json.armId);
    assert.ok(loopArm.json.turnNonce);
    const firstLoopTurnNonce = loopArm.json.turnNonce;
    const loopAccepted = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, loopArm.json, `Execute ${branch} loop rotation smoke task`),
    });
    assert.strictEqual(loopAccepted.status, 200);
    assert.strictEqual(loopAccepted.json.status, 'accepted');
    assert.ok(loopAccepted.json.turnNonce, 'arm_loop should rotate to the next turn token');
    assert.notStrictEqual(loopAccepted.json.turnNonce, firstLoopTurnNonce);
    const loopResult = await waitForResult(base, token, conversationId, clientId);
    assert.strictEqual(loopResult.ok, true);
    const loopAck = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: loopResult.jobId, resultId: loopResult.resultId }),
    });
    assert.strictEqual(loopAck.status, 200);
    assert.strictEqual(loopAck.json.ok, true);
    assert.strictEqual(loopAck.json.conversationMode, 'review');
    const replayOldTurn = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, {
        armId: loopArm.json.armId,
        turnNonce: firstLoopTurnNonce,
      }, `Execute ${branch} loop rotation smoke task again`),
    });
    assert.strictEqual(replayOldTurn.status, 200);
    assert.strictEqual(replayOldTurn.json.status, 'blocked');
    assert.strictEqual(replayOldTurn.json.rule, 'nonce_replay_blocked');

    const duplicateArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(duplicateArm.status, 200);
    const duplicateDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, duplicateArm.json, `Execute ${branch} read-only smoke task`),
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
      body: dispatchBody(conversationId, clientId, failArm.json, `Execute ${branch} FAIL_TASK`),
    });
    assert.strictEqual(failedDispatch.status, 200);
    assert.strictEqual(failedDispatch.json.status, 'accepted');
    const failedResult = await waitForResult(base, token, conversationId, clientId);
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
      body: dispatchBody(conversationId, clientId, retryArm.json, `Execute ${branch} FAIL_TASK`),
    });
    assert.strictEqual(retryFailedDispatch.status, 200);
    assert.strictEqual(retryFailedDispatch.json.status, 'accepted');
    const retryFailedResult = await waitForResult(base, token, conversationId, clientId);
    assert.strictEqual(retryFailedResult.ok, false);
    const retryFailedAck = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: retryFailedResult.jobId, resultId: retryFailedResult.resultId }),
    });
    assert.strictEqual(retryFailedAck.status, 200);
    assert.strictEqual(retryFailedAck.json.ok, true);

    const infraArm = await fetchJson(`${base}/api/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    assert.strictEqual(infraArm.status, 200);
    const infraDispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: dispatchBody(conversationId, clientId, infraArm.json, `Execute ${branch} INFRA_FAIL`),
    });
    assert.strictEqual(infraDispatch.status, 200);
    assert.strictEqual(infraDispatch.json.status, 'accepted');
    const infraResult = await waitForResult(base, token, conversationId, clientId);
    assert.strictEqual(infraResult.ok, false);
    const infraInvocations = fs.readFileSync(invocationLog, 'utf8')
      .split(/\r?\n/)
      .filter(line => line === 'INFRA_FAIL');
    assert.strictEqual(infraInvocations.length, 1, 'infra failures must not be retried blindly');
    const infraAck = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, jobId: infraResult.jobId, resultId: infraResult.resultId }),
    });
    assert.strictEqual(infraAck.status, 200);

    await wait(200);
    const auditPath = path.join(repo, 'logs', conversationId + '.jsonl');
    const auditText = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '';
    for (const rawToken of [
      arm.json.armId,
      arm.json.turnNonce,
      arm.json.armNonce,
      rearm.json.armId,
      rearm.json.turnNonce,
      loopArm.json.armId,
      loopArm.json.turnNonce,
      firstLoopTurnNonce,
      failArm.json.armId,
      failArm.json.turnNonce,
      retryArm.json.armId,
      retryArm.json.turnNonce,
    ]) {
      if (rawToken) assert(!auditText.includes(rawToken), 'audit log must not contain raw arm ids or turn tokens');
    }
    assert(auditText.includes('"redacted":true'), 'audit should retain redacted token metadata');

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
