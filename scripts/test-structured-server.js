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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  return { status: response.status, json: await response.json() };
}

async function waitForResult(base, headers, conversationId, clientId) {
  for (let index = 0; index < 40; index++) {
    const response = await fetchJson(
      `${base}/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`,
      { headers },
    );
    if (response.json.hasResult) return response.json.result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('structured server result timeout');
}

async function main() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-structured-server-'));
  const repo = path.join(parent, 'repo');
  const workspace = path.join(parent, 'workspace');
  const fakeCli = path.join(parent, 'fake-codex.js');
  const invocationLog = path.join(parent, 'invocations.log');
  const port = await freePort();
  const token = 'structured-server-token';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const clientId = 'client-structured-server';
  fs.mkdirSync(workspace, { recursive: true });
  copyDir(ROOT, repo);

  fs.writeFileSync(fakeCli, [
    "'use strict';",
    'const fs = require("fs");',
    'const args = process.argv.slice(2);',
    'if (args.includes("--version")) { console.log("codex-cli 9.9.9-test"); process.exit(0); }',
    'if (args.includes("--help")) {',
    '  console.log(args.includes("app-server") ? "app-server" : "--json --output-schema resume");',
    '  process.exit(0);',
    '}',
    'let input = "";',
    'process.stdin.setEncoding("utf8");',
    'process.stdin.on("data", chunk => { input += chunk; });',
    'process.stdin.on("end", () => {',
    `  fs.appendFileSync(${JSON.stringify(invocationLog)}, JSON.stringify(args) + "\\n");`,
    '  if (input.includes("MALFORMED")) { console.log("{not-json}"); process.exit(0); }',
    '  const envelope = { status: "succeeded", summary: "structured ok", files_changed: ["server.js"], commands_run: ["npm run check"], tests: [{ command: "npm run check", status: "passed" }], risks: [], next_candidate: null };',
    '  console.log(JSON.stringify({ type: "thread.started", thread_id: "thread_fake" }));',
    '  console.log(JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "npm run check" } }));',
    '  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(envelope) } }));',
    '  console.log(JSON.stringify({ type: "turn.completed" }));',
    '});',
  ].join('\n'), 'utf8');

  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({
    port,
    contractVersion: 'le-3.3',
    apiToken: token,
    runtimeRoot: path.join(parent, 'runtime'),
    bindings: [{
      conversationId,
      codexSessionId: 'session-test',
      workspaceDir: workspace,
      conversationMode: 'chat',
    }],
    codex: {
      bin: process.execPath,
      args: [fakeCli, 'exec', 'resume'],
      executorAdapter: 'auto',
      stdinFlag: '-',
      timeoutMs: 5000,
    },
    breaker: { maxConsecutiveFailures: 4 },
    denylist: [],
  }, null, 2), 'utf8');

  const child = spawn(process.execPath, ['server.js'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    for (let index = 0; index < 40 && !output.includes('Codex executor:'); index++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(output, /AegisLoop listening/);
    assert.match(output, /Codex executor: cli-json/);
    const base = `http://127.0.0.1:${port}`;
    const headers = { 'Content-Type': 'application/json', 'X-AegisLoop-Token': token };
    const arm = await fetchJson(`${base}/api/mode`, {
      method: 'POST', headers, body: JSON.stringify({ conversationId, clientId, action: 'arm_once' }),
    });
    const dispatch = await fetchJson(`${base}/api/dispatch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversationId,
        clientId,
        prompt: 'Run structured smoke',
        armId: arm.json.armId,
        turnNonce: arm.json.turnNonce,
        assistantMessageSig: 'assistant-structured',
        codeBlockHash: 'block-structured',
      }),
    });
    assert.strictEqual(dispatch.json.status, 'accepted');
    const result = await waitForResult(base, headers, conversationId, clientId);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(JSON.parse(result.finalMessage).status, 'succeeded');
    const job = JSON.parse(fs.readFileSync(path.join(repo, 'jobs', `${result.jobId}.json`), 'utf8'));
    assert.strictEqual(job.status, 'result_pending');
    assert.strictEqual(job.sideEffectsObserved, true);
    const invocation = JSON.parse(fs.readFileSync(invocationLog, 'utf8').trim());
    assert(invocation.includes('--json'));
    assert(invocation.includes('--output-schema'));
    const ack = await fetchJson(`${base}/api/result/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, clientId, resultId: result.resultId, jobId: result.jobId }),
    });
    assert.strictEqual(ack.json.ok, true);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(repo, 'jobs', `${result.jobId}.json`), 'utf8')).status, 'acked');
    console.log('structured server integration test passed');
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
