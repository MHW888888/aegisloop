'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function zh(...codes) {
  return String.fromCharCode(...codes);
}

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

async function main() {
  const chinesePath = zh(0x4e2d, 0x6587, 0x8def, 0x5f84);
  const projectCopy = zh(0x9879, 0x76ee, 0x526f, 0x672c);
  const sourceName = zh(0x6e90, 0x9879, 0x76ee);
  const runtimeName = zh(0x8fd0, 0x884c, 0x76ee, 0x5f55);
  const projectId = zh(0x6d4b, 0x8bd5, 0x9879, 0x76ee);
  const branchId = zh(0x4e3b, 0x7ebf, 0x2d, 0x6d4b, 0x8bd5);
  const runId = `run-${zh(0x4e2d, 0x6587)}-001`;
  const objective = `${chinesePath} smoke objective`;
  const token = 'test-token';
  const port = await freePort();

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-'));
  const tmp = path.join(parent, chinesePath);
  const repo = path.join(tmp, projectCopy);

  fs.mkdirSync(tmp, { recursive: true });
  copyDir(ROOT, repo);

  const sourceDir = path.join(tmp, sourceName);
  const runtimeRoot = path.join(tmp, runtimeName);
  fs.mkdirSync(sourceDir, { recursive: true });

  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({
    port,
    contractVersion: 'le-3.3',
    apiToken: token,
    corsAllowOrigin: 'https://chatgpt.com',
    runtimeRoot,
    briefingTemplateVersion: 'briefing-1',
    bindings: [{
      conversationId: 'test-conv',
      codexSessionId: 'test-session',
      workspaceDir: sourceDir,
      fullAuto: true,
      conversationMode: 'chat',
      capsule: {
        enabled: true,
        projectId,
        activeBranch: branchId,
        branchMeaning: 'unicode path smoke test',
        runId,
        mode: 'readonly',
        stageNamespaceRequired: true,
        forbiddenBranchContext: ['other-branch'],
      },
    }],
    codex: {
      bin: process.execPath,
      args: ['-e', 'process.stdin.resume(); process.stdin.on("end",()=>console.log("ok"))'],
      stdinFlag: '-',
      timeoutMs: 5000,
    },
    breaker: { maxConsecutiveFailures: 2 },
    minIntervalMs: 10,
    maxResultChars: 2000,
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
      await wait(200);
      if (stdout.includes('listening')) break;
      assert.strictEqual(child.exitCode, null, `server exited early: ${stderr}${stdout}`);
    }
    assert.ok(stdout.includes('listening'), `server did not start: ${stderr}${stdout}`);

    const base = `http://127.0.0.1:${port}`;
    const health = await fetchJson(`${base}/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.json.ok, true);

    const noAuth = await fetchJson(`${base}/api/conversations`);
    assert.strictEqual(noAuth.status, 401);

    const conversations = await fetchJson(`${base}/api/conversations`, {
      headers: { 'X-AegisLoop-Token': token },
    });
    assert.strictEqual(conversations.status, 200);
    assert.strictEqual(conversations.json.conversations.length, 1);

    const materialized = await fetchJson(`${base}/api/briefing/materialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AegisLoop-Token': token,
      },
      body: JSON.stringify({ conversationId: 'test-conv', objective }),
    });
    assert.strictEqual(materialized.status, 200);
    assert.strictEqual(materialized.json.ok, true);

    const expectedRoot = path.join(runtimeRoot, 'runs', projectId, branchId, runId);
    const gptBrief = path.join(expectedRoot, 'inbox', 'GPT_THREAD_BRIEF.md');
    assert.ok(fs.existsSync(gptBrief), `missing GPT brief at ${gptBrief}`);
    assert.ok(materialized.json.briefing.root.includes(projectId), 'projectId was not preserved');
    assert.ok(materialized.json.briefing.root.includes(branchId), 'activeBranch was not preserved');
    console.log('unicode runtime smoke test passed:', materialized.json.briefing.root);
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
